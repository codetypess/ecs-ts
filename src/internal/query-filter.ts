import type { Entity } from "../entity";
import type { ChangeDetectionRange } from "../query";
import { isTickInRange } from "../query";
import type { SparseSet } from "../sparse-set";
import { QueryFilterMode, ResolvedQueryFilter } from "./query-plan";

interface FilteredQueryPlan {
    readonly filterMode: QueryFilterMode;
    readonly filterStores: ResolvedQueryFilter;
}

/** Applies the cheapest possible filter path for a resolved query plan. */
export function matchesPlanFilter(
    entity: Entity,
    plan: FilteredQueryPlan,
    changeDetection: ChangeDetectionRange,
    knownPresentStore?: SparseSet<unknown>
): boolean {
    if (plan.filterMode === "unfiltered") {
        return true;
    }

    // Structural-only filters can skip change-tick lookups entirely.
    if (plan.filterMode === "structural") {
        return matchesStructuralFilter(entity, plan.filterStores, knownPresentStore);
    }

    return matchesFilter(entity, plan.filterStores, changeDetection, knownPresentStore);
}

function matchesFilter(
    entity: Entity,
    filter: ResolvedQueryFilter,
    changeDetection: ChangeDetectionRange,
    knownPresentStore?: SparseSet<unknown>
): boolean {
    if (!matchesStructuralFilter(entity, filter, knownPresentStore)) {
        return false;
    }

    if (!matchesAddedStores(entity, filter.added, changeDetection)) {
        return false;
    }

    if (!matchesChangedStores(entity, filter.changed, changeDetection)) {
        return false;
    }

    return true;
}

/** Structural filters depend only on store membership, not change ticks. */
function matchesStructuralFilter(
    entity: Entity,
    filter: ResolvedQueryFilter,
    knownPresentStore?: SparseSet<unknown>
): boolean {
    for (const store of filter.with) {
        if (store === knownPresentStore) {
            continue;
        }

        if (!store.has(entity)) {
            return false;
        }
    }

    for (const store of filter.without) {
        if (store.has(entity)) {
            return false;
        }
    }

    if (filter.or.length === 0) {
        return true;
    }

    for (const store of filter.or) {
        if (store === knownPresentStore) {
            return true;
        }

        if (store.has(entity)) {
            return true;
        }
    }

    return false;
}

/** Added filters match when any watched store was inserted during the visible tick window. */
function matchesAddedStores(
    entity: Entity,
    stores: readonly SparseSet<unknown>[],
    changeDetection: ChangeDetectionRange
): boolean {
    if (stores.length === 0) {
        return true;
    }

    for (const store of stores) {
        const tick = store.getAddedTick(entity);

        if (tick !== undefined && isTickInRange(tick, changeDetection)) {
            return true;
        }
    }

    return false;
}

/** Changed filters match when any watched store changed during the visible tick window. */
function matchesChangedStores(
    entity: Entity,
    stores: readonly SparseSet<unknown>[],
    changeDetection: ChangeDetectionRange
): boolean {
    if (stores.length === 0) {
        return true;
    }

    for (const store of stores) {
        const tick = store.getChangedTick(entity);

        if (tick !== undefined && isTickInRange(tick, changeDetection)) {
            return true;
        }
    }

    return false;
}
