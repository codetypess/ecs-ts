import type { Entity } from "../entity";
import type { SparseSet } from "../sparse-set";

export function fillComponents(
    entity: Entity,
    stores: readonly SparseSet<unknown>[],
    output: unknown[]
): boolean {
    for (let index = 0; index < stores.length; index++) {
        const store = stores[index]!;
        const value = store.get(entity);

        // A single get() doubles as both presence check and value fetch on the hot path.
        if (value === undefined) {
            return false;
        }

        output[index] = value;
    }

    return true;
}

export function hasComponents(
    entity: Entity,
    stores: readonly SparseSet<unknown>[]
): boolean {
    for (const store of stores) {
        if (!store.has(entity)) {
            return false;
        }
    }

    return true;
}

export function fillOptionalComponents(
    entity: Entity,
    stores: readonly (SparseSet<unknown> | undefined)[],
    output: unknown[],
    offset = 0
): void {
    for (let index = 0; index < stores.length; index++) {
        output[offset + index] = stores[index]?.get(entity);
    }
}
