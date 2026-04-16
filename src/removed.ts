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

/** Minimal world surface needed by removed-component readers. */
export interface RemovedWorld {
    readRemoved<T>(reader: RemovedReader<T>): readonly RemovedComponent<T>[];
}

/** Options for constructing a reader that starts from a custom cursor. */
export interface RemovedReaderOptions {
    readonly startAt?: number;
}

/** Cursor-based reader for removed-component streams. */
export class RemovedReader<T> {
    private nextRemovedId: number;

    constructor(
        readonly type: ComponentType<T>,
        options: RemovedReaderOptions = {}
    ) {
        this.nextRemovedId = options.startAt ?? 0;
    }

    /** Next removed id that will be considered unread by this reader. */
    get cursor(): number {
        return this.nextRemovedId;
    }

    /** Reads unread removals and advances the cursor. */
    read(world: RemovedWorld): readonly RemovedComponent<T>[] {
        return world.readRemoved(this);
    }

    /** Manually rewinds or fast-forwards the reader cursor. */
    advanceTo(nextRemovedId: number): void {
        this.nextRemovedId = nextRemovedId;
    }
}

/** Append-only storage for removed-component records. */
export class RemovedComponents<T> {
    private readonly removed: RemovedComponent<T>[] = [];
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
        // Removed ids are contiguous, so the unread slice can be computed directly
        // instead of scanning the entire append-only buffer every read.
        const startIndex = Math.max(0, reader.cursor - this.firstRemovedId);
        reader.advanceTo(this.nextRemovedId);

        return startIndex >= this.removed.length ? [] : this.removed.slice(startIndex);
    }

    /** Returns all removal records and clears the internal buffer. */
    drain(): RemovedComponent<T>[] {
        const drained = this.removed.splice(0);
        this.firstRemovedId = this.nextRemovedId;

        return drained;
    }
}

/** Creates a removed-component reader for the given component type. */
export function removedReader<T>(type: ComponentType<T>): RemovedReader<T> {
    return new RemovedReader(type);
}
