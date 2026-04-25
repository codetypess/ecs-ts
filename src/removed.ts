import type { AnyComponentType, ComponentData } from "./component.js";
import type { Entity } from "./entity.js";

declare const RemovedComponentIdBrand: unique symbol;

/** Monotonic id assigned to each removed-component record. */
export type RemovedComponentId<TComponent extends AnyComponentType> = number & {
    readonly [RemovedComponentIdBrand]: TComponent;
};

/** Snapshot recorded when a component is removed or its entity despawns. */
export interface RemovedComponent<TComponent extends AnyComponentType> {
    readonly id: RemovedComponentId<TComponent>;
    readonly entity: Entity;
    readonly component: ComponentData<TComponent>;
    readonly tick: number;
}

/** Options for constructing a reader that starts from a custom cursor. */
export interface RemovedReaderOptions {
    readonly startAt?: number;
}

interface RemovedReaderBinding<TComponent extends AnyComponentType> {
    readonly read: (reader: RemovedReader<TComponent>) => readonly RemovedComponent<TComponent>[];
    readonly release: (reader: RemovedReader<TComponent>) => void;
}

// Deferred until at least this many logical entries have been skipped to amortise the
// cost of physically compacting (splice) the underlying array.
const REMOVED_PHYSICAL_COMPACTION_THRESHOLD = 64;

/** Cursor-based reader for removed-component streams. */
export class RemovedReader<TComponent extends AnyComponentType> {
    private nextRemovedId: number;
    private closed = false;
    /** @internal Reused output buffer; never hold a reference to the returned array across reads. */
    readonly _readBuffer: RemovedComponent<TComponent>[] = [];

    constructor(
        readonly type: TComponent,
        private readonly binding: RemovedReaderBinding<TComponent>,
        options: RemovedReaderOptions = {}
    ) {
        this.nextRemovedId = options.startAt ?? 0;
    }

    /** Next removed id that will be considered unread by this reader. */
    get cursor(): number {
        return this.nextRemovedId;
    }

    /** Reads unread removals into a reused output buffer and advances the cursor. */
    read(): readonly RemovedComponent<TComponent>[] {
        this.assertOpen();

        return this.binding.read(this);
    }

    /** Releases this reader so it no longer retains removed-component history. */
    close(): void {
        if (this.closed) {
            return;
        }

        this.closed = true;
        this.binding.release(this);
    }

    /** Manually rewinds or fast-forwards the reader cursor. */
    advanceTo(nextRemovedId: number): void {
        this.assertOpen();
        this.nextRemovedId = nextRemovedId;
    }

    private assertOpen(): void {
        if (this.closed) {
            throw new Error("RemovedReader is closed.");
        }
    }
}

/** Append-only storage for removed-component records. */
export class RemovedComponents<TComponent extends AnyComponentType> {
    private readonly removed: RemovedComponent<TComponent>[] = [];
    private readonly activeReaders = new Set<RemovedReader<TComponent>>();
    private startIndex = 0;
    private firstRemovedId = 0;
    private nextRemovedId = 0;

    /** Id that will be assigned to the next removal record. */
    get nextId(): number {
        return this.nextRemovedId;
    }

    /** Number of buffered removal records. */
    get length(): number {
        return this.removed.length - this.startIndex;
    }

    /** Starts tracking a reader so consumed prefixes can be compacted safely. */
    register(reader: RemovedReader<TComponent>): void {
        if (this.activeReaders.has(reader)) {
            return;
        }

        this.activeReaders.add(reader);
    }

    /** Records a removed component together with entity and tick metadata. */
    push(
        entity: Entity,
        component: ComponentData<TComponent>,
        tick: number
    ): RemovedComponentId<TComponent> {
        const id = this.nextRemovedId as RemovedComponentId<TComponent>;

        if (this.length === 0) {
            this.firstRemovedId = id;
        }

        this.nextRemovedId++;
        this.removed.push({ id, entity, component, tick });

        return id;
    }

    /** Reads unread removals and advances the reader cursor. */
    read(reader: RemovedReader<TComponent>): readonly RemovedComponent<TComponent>[] {
        const unread = reader._readBuffer;

        unread.length = 0;

        if (reader.cursor === this.nextRemovedId) {
            return unread;
        }

        // Removed ids are contiguous, so the unread slice can be computed directly
        // instead of scanning the entire append-only buffer every read.
        const startIndex = this.startIndex + Math.max(0, reader.cursor - this.firstRemovedId);

        for (let index = startIndex; index < this.removed.length; index++) {
            unread.push(this.removed[index]!);
        }

        reader.advanceTo(this.nextRemovedId);

        if (this.removed.length > 0) {
            this.compactAfterRead(reader);
        }

        return unread;
    }

    /** Stops tracking the reader and compacts any newly unpinned history. */
    release(reader: RemovedReader<TComponent>): void {
        if (!this.activeReaders.delete(reader)) {
            return;
        }

        this.compactToMinimumLiveCursor();
    }

    /** Returns all removal records and clears the internal buffer. */
    drain(): RemovedComponent<TComponent>[] {
        const drained =
            this.startIndex === 0 ? this.removed.splice(0) : this.removed.slice(this.startIndex);

        this.removed.length = 0;
        this.startIndex = 0;
        this.firstRemovedId = this.nextRemovedId;

        return drained;
    }

    private compactToMinimumLiveCursor(): void {
        const minimum = this.minimumLiveCursor();

        if (minimum === undefined) {
            return;
        }

        this.dropBufferedPrefix(minimum);
    }

    private compactAfterRead(reader: RemovedReader<TComponent>): void {
        if (this.activeReaders.size === 1 && this.activeReaders.has(reader)) {
            // The only reader consumed through nextRemovedId, so no buffered history is pinned.
            this.removed.length = 0;
            this.startIndex = 0;
            this.firstRemovedId = this.nextRemovedId;

            return;
        }

        this.compactToMinimumLiveCursor();
    }

    private minimumLiveCursor(): number | undefined {
        if (this.activeReaders.size === 0) {
            return undefined;
        }

        let minimum = this.nextRemovedId;

        for (const reader of this.activeReaders) {
            minimum = Math.min(minimum, reader.cursor);

            if (minimum === 0) {
                break;
            }
        }

        return minimum;
    }

    private dropBufferedPrefix(nextLiveId: number): void {
        if (this.length === 0 || nextLiveId <= this.firstRemovedId) {
            return;
        }

        const compacted = Math.min(this.length, nextLiveId - this.firstRemovedId);

        if (compacted <= 0) {
            return;
        }

        this.startIndex += compacted;
        this.firstRemovedId += compacted;
        // Logical compaction is cheap; physical splice is deferred until enough prefix accrues.
        this.compactPhysicalPrefix();
    }

    private compactPhysicalPrefix(): void {
        if (this.startIndex < REMOVED_PHYSICAL_COMPACTION_THRESHOLD) {
            return;
        }

        if (this.startIndex === this.removed.length) {
            this.removed.length = 0;
        } else {
            this.removed.splice(0, this.startIndex);
        }

        this.startIndex = 0;
    }
}
