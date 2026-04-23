import type { Entity } from "../entity.js";
import type { SparseSet } from "../sparse-set.js";

/** Fills an output array with required component values, aborting on the first miss. */
export function fillComponents(
    entity: Entity,
    stores: readonly SparseSet<unknown>[],
    output: unknown[],
    knownPresentStore?: SparseSet<unknown>,
    knownPresentValue?: unknown
): boolean {
    for (let index = 0; index < stores.length; index++) {
        const store = stores[index]!;

        if (store === knownPresentStore) {
            output[index] = knownPresentValue;
            continue;
        }

        const value = store.get(entity);

        // A single get() doubles as both presence check and value fetch on the hot path.
        if (value === undefined) {
            return false;
        }

        output[index] = value;
    }

    return true;
}

/** Checks presence only, without materializing component values. */
export function hasComponents(
    entity: Entity,
    stores: readonly SparseSet<unknown>[],
    knownPresentStore?: SparseSet<unknown>
): boolean {
    for (const store of stores) {
        if (store === knownPresentStore) {
            continue;
        }

        if (!store.has(entity)) {
            return false;
        }
    }

    return true;
}

/** Fills optional component slots, leaving `undefined` where a store or value is missing. */
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
