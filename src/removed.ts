import type { ComponentType } from "./component";
import type { Entity } from "./entity";

declare const RemovedComponentIdBrand: unique symbol;

/** Monotonic id assigned to each removed-component record. */
export type RemovedComponentId<T> = number & { readonly [RemovedComponentIdBrand]: T };

/** Snapshot recorded when a component is removed or its entity despawns. */
export interface RemovedComponent<T> {
    readonly id: RemovedComponentId<T>;
    readonly entity: Entity;
    readonly component: T;
    readonly tick: number;
}

/** Options for constructing a reader that starts from a custom cursor. */
export interface RemovedReaderOptions {
    readonly startAt?: number;
}

interface RemovedReaderBinding<T> {
    readonly read: (reader: RemovedReader<T>) => readonly RemovedComponent<T>[];
    readonly release: (reader: RemovedReader<T>) => void;
}

/** Cursor-based reader for removed-component streams. */
export class RemovedReader<T> {
    private nextRemovedId: number;
    private closed = false;

    constructor(
        readonly type: ComponentType<T>,
        private readonly binding: RemovedReaderBinding<T>,
        options: RemovedReaderOptions = {}
    ) {
        this.nextRemovedId = options.startAt ?? 0;
    }

    /** Next removed id that will be considered unread by this reader. */
    get cursor(): number {
        return this.nextRemovedId;
    }

    /** Reads unread removals and advances the cursor. */
    read(): readonly RemovedComponent<T>[] {
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
export class RemovedComponents<T> {
    private readonly removed: RemovedComponent<T>[] = [];
    private readonly activeReaders = new Set<RemovedReader<T>>();
    private firstRemovedId = 0;
    private nextRemovedId = 0;

    /** Id that will be assigned to the next removal record. */
    get nextId(): number {
        return this.nextRemovedId;
    }

    /** Number of buffered removal records. */
    get length(): number {
        return this.removed.length;
    }

    /** Starts tracking a reader so consumed prefixes can be compacted safely. */
    register(reader: RemovedReader<T>): void {
        if (this.activeReaders.has(reader)) {
            return;
        }

        this.activeReaders.add(reader);
    }

    /** Records a removed component together with entity and tick metadata. */
    push(entity: Entity, component: T, tick: number): RemovedComponentId<T> {
        const id = this.nextRemovedId as RemovedComponentId<T>;

        if (this.removed.length === 0) {
            this.firstRemovedId = id;
        }

        this.nextRemovedId++;
        this.removed.push({ id, entity, component, tick });

        return id;
    }

    /** Reads unread removals and advances the reader cursor. */
    read(reader: RemovedReader<T>): readonly RemovedComponent<T>[] {
        if (reader.cursor === this.nextRemovedId) {
            return [];
        }

        // Removed ids are contiguous, so the unread slice can be computed directly
        // instead of scanning the entire append-only buffer every read.
        const startIndex = Math.max(0, reader.cursor - this.firstRemovedId);
        const unread =
            startIndex >= this.removed.length ? [] : this.removed.slice(startIndex);

        reader.advanceTo(this.nextRemovedId);

        if (this.removed.length > 0) {
            this.compactAfterRead(reader);
        }

        return unread;
    }

    /** Stops tracking the reader and compacts any newly unpinned history. */
    release(reader: RemovedReader<T>): void {
        if (!this.activeReaders.delete(reader)) {
            return;
        }

        this.compactToMinimumLiveCursor();
    }

    /** Returns all removal records and clears the internal buffer. */
    drain(): RemovedComponent<T>[] {
        const drained = this.removed.splice(0);
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

    private compactAfterRead(reader: RemovedReader<T>): void {
        if (this.activeReaders.size === 1 && this.activeReaders.has(reader)) {
            this.removed.length = 0;
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
        if (this.removed.length === 0 || nextLiveId <= this.firstRemovedId) {
            return;
        }

        const compacted = Math.min(this.removed.length, nextLiveId - this.firstRemovedId);

        if (compacted <= 0) {
            return;
        }

        this.removed.splice(0, compacted);
        this.firstRemovedId += compacted;
    }
}
