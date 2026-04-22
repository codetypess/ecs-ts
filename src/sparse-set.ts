import { Entity, entityIndex } from "./entity";

const MISSING = -1;

/**
 * Dense/sparse storage used for component tables.
 *
 * Values are stored densely for iteration while the sparse index provides O(1)-ish
 * lookups by entity slot.
 */
export class SparseSet<T> {
    private readonly sparse: number[] = [];
    private readonly denseEntities: Entity[] = [];
    private readonly denseValues: T[] = [];
    private readonly addedTicks: number[] = [];
    private readonly changedTicks: number[] = [];

    /** Number of live values stored in the dense arrays. */
    get size(): number {
        return this.denseEntities.length;
    }

    /** Dense entity array used as the main iteration source. */
    get entities(): readonly Entity[] {
        return this.denseEntities;
    }

    /** Dense value array kept in lockstep with {@link entities}. */
    get values(): readonly T[] {
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
            const previous = this.denseValues[existingIndex];
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

        return undefined;
    }

    /** Removes a value with swap-remove to keep dense iteration compact. */
    delete(entity: Entity): boolean {
        const denseIndex = this.denseIndexOf(entity);

        if (denseIndex === MISSING) {
            return false;
        }

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

        return true;
    }

    private denseIndexOf(entity: Entity): number {
        const denseIndex = this.sparse[entityIndex(entity)];

        if (denseIndex === undefined || denseIndex === MISSING) {
            return MISSING;
        }

        return this.denseEntities[denseIndex] === entity ? denseIndex : MISSING;
    }
}
