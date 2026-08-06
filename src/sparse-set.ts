import { Entity, entityIndex } from "./entity.js";

const MISSING = -1;

/**
 * Dense/sparse storage used for component tables.
 *
 * Values are stored densely for iteration while the sparse index provides O(1)-ish
 * lookups by entity slot.
 *
 * The sparse array uses a regular `number[]` so V8 can keep it as an unboxed SMI
 * array.  Uninitialised slots return `undefined`, and deleted slots are written to
 * `MISSING = -1`.  Both are `< 0`, so the presence test collapses to a single
 * `!(denseIndex >= 0)` instead of the prior double `=== undefined || === MISSING`.
 */
export class SparseSet<T> {
    private readonly sparse: number[] = [];
    private readonly denseEntities: Entity[] = [];
    private readonly denseValues: (T | undefined)[] = [];
    private readonly addedTicks: number[] = [];
    private readonly changedTicks: number[] = [];
    private readonly deletedIndices: number[] = [];
    private liveSize = 0;

    /** Number of live values stored in the dense arrays. */
    get size(): number {
        return this.liveSize;
    }

    /** Dense entity array used as the main iteration source. */
    get entities(): readonly Entity[] {
        return this.denseEntities;
    }

    /** Dense value array kept in lockstep with {@link entities}. */
    get values(): readonly (T | undefined)[] {
        return this.denseValues;
    }

    /** Checks whether the entity currently has a value in this store. */
    has(entity: Entity): boolean {
        return this.denseIndexOf(entity) !== MISSING;
    }

    /** Returns the stored value for the entity, if present. */
    get(entity: Entity): T | undefined {
        const denseIndex = this.denseIndexOf(entity);

        return denseIndex === MISSING ? undefined : this.denseValues[denseIndex];
    }

    /** Returns the tick when the value was first inserted. */
    getAddedTick(entity: Entity): number | undefined {
        const denseIndex = this.denseIndexOf(entity);

        return denseIndex === MISSING ? undefined : this.addedTicks[denseIndex];
    }

    /** Returns the tick when the value was last changed. */
    getChangedTick(entity: Entity): number | undefined {
        const denseIndex = this.denseIndexOf(entity);

        return denseIndex === MISSING ? undefined : this.changedTicks[denseIndex];
    }

    /** Updates only the changed tick for an existing value. */
    markChanged(entity: Entity, tick: number): boolean {
        const denseIndex = this.denseIndexOf(entity);

        if (denseIndex === MISSING) {
            return false;
        }

        this.changedTicks[denseIndex] = tick;

        return true;
    }

    /** Inserts or replaces a value while keeping dense iteration packed. */
    set(entity: Entity, value: T, tick: number): T | undefined {
        const existingIndex = this.denseIndexOf(entity);

        if (existingIndex !== MISSING) {
            const previous = this.denseValues[existingIndex]!;
            this.denseValues[existingIndex] = value;
            this.changedTicks[existingIndex] = tick;

            return previous;
        }

        const denseIndex = this.denseEntities.length;
        this.sparse[entityIndex(entity)] = denseIndex;
        this.denseEntities.push(entity);
        this.denseValues.push(value);
        this.addedTicks.push(tick);
        this.changedTicks.push(tick);
        this.liveSize++;

        return undefined;
    }

    /** Logically removes a value and optionally defers physical compaction. */
    delete(entity: Entity, deferCompaction = false): boolean {
        const denseIndex = this.denseIndexOf(entity);

        if (denseIndex === MISSING) {
            return false;
        }

        if (!deferCompaction && this.deletedIndices.length === 0) {
            this.swapRemove(denseIndex, entity);
            return true;
        }

        this.sparse[entityIndex(entity)] = MISSING;
        this.denseValues[denseIndex] = undefined;
        this.deletedIndices.push(denseIndex);
        this.liveSize--;

        if (!deferCompaction) {
            this.compact();
        }

        return true;
    }

    /** Fills deleted dense slots from the live tail and truncates all aligned arrays. */
    compact(): void {
        if (this.deletedIndices.length === 0) {
            return;
        }

        const newLength = this.liveSize;
        let tail = this.denseValues.length - 1;

        for (const deletedIndex of this.deletedIndices) {
            if (deletedIndex >= newLength) {
                continue;
            }

            while (tail >= newLength && this.denseValues[tail] === undefined) {
                tail--;
            }

            const movedEntity = this.denseEntities[tail]!;

            this.denseEntities[deletedIndex] = movedEntity;
            this.denseValues[deletedIndex] = this.denseValues[tail]!;
            this.addedTicks[deletedIndex] = this.addedTicks[tail]!;
            this.changedTicks[deletedIndex] = this.changedTicks[tail]!;
            this.sparse[entityIndex(movedEntity)] = deletedIndex;
            tail--;
        }

        this.denseEntities.length = newLength;
        this.denseValues.length = newLength;
        this.addedTicks.length = newLength;
        this.changedTicks.length = newLength;
        this.deletedIndices.length = 0;
    }

    private swapRemove(denseIndex: number, entity: Entity): void {
        const lastIndex = this.denseEntities.length - 1;

        if (denseIndex !== lastIndex) {
            const lastEntity = this.denseEntities[lastIndex]!;

            this.denseEntities[denseIndex] = lastEntity;
            this.denseValues[denseIndex] = this.denseValues[lastIndex]!;
            this.addedTicks[denseIndex] = this.addedTicks[lastIndex]!;
            this.changedTicks[denseIndex] = this.changedTicks[lastIndex]!;
            this.sparse[entityIndex(lastEntity)] = denseIndex;
        }

        this.denseEntities.pop();
        this.denseValues.pop();
        this.addedTicks.pop();
        this.changedTicks.pop();
        this.sparse[entityIndex(entity)] = MISSING;
        this.liveSize--;
    }

    private denseIndexOf(entity: Entity): number {
        const denseIndex = this.sparse[entityIndex(entity)];

        // Both `undefined` (uninitialised slot) and `MISSING = -1` (deleted) are < 0.
        if (!(denseIndex >= 0)) {
            return MISSING;
        }

        return this.denseEntities[denseIndex] === entity ? denseIndex : MISSING;
    }
}
