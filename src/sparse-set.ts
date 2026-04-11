import { Entity, entityIndex } from "./entity";

const MISSING = -1;

export class SparseSet<T> {
    private readonly sparse: number[] = [];
    private readonly denseEntities: Entity[] = [];
    private readonly denseValues: T[] = [];
    private readonly addedTicks: number[] = [];
    private readonly changedTicks: number[] = [];

    get size(): number {
        return this.denseEntities.length;
    }

    get entities(): readonly Entity[] {
        return this.denseEntities;
    }

    get values(): readonly T[] {
        return this.denseValues;
    }

    has(entity: Entity): boolean {
        return this.denseIndexOf(entity) !== MISSING;
    }

    get(entity: Entity): T | undefined {
        const denseIndex = this.denseIndexOf(entity);

        return denseIndex === MISSING ? undefined : this.denseValues[denseIndex];
    }

    getAddedTick(entity: Entity): number | undefined {
        const denseIndex = this.denseIndexOf(entity);

        return denseIndex === MISSING ? undefined : this.addedTicks[denseIndex];
    }

    getChangedTick(entity: Entity): number | undefined {
        const denseIndex = this.denseIndexOf(entity);

        return denseIndex === MISSING ? undefined : this.changedTicks[denseIndex];
    }

    markChanged(entity: Entity, tick: number): boolean {
        const denseIndex = this.denseIndexOf(entity);

        if (denseIndex === MISSING) {
            return false;
        }

        this.changedTicks[denseIndex] = tick;

        return true;
    }

    set(entity: Entity, value: T, tick: number): void {
        const existingIndex = this.denseIndexOf(entity);

        if (existingIndex !== MISSING) {
            this.denseValues[existingIndex] = value;
            this.changedTicks[existingIndex] = tick;
            return;
        }

        const denseIndex = this.denseEntities.length;
        this.sparse[entityIndex(entity)] = denseIndex;
        this.denseEntities.push(entity);
        this.denseValues.push(value);
        this.addedTicks.push(tick);
        this.changedTicks.push(tick);
    }

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
