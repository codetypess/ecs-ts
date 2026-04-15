import type { Entity } from "../entity";
import type { ChangeDetectionRange } from "../query";
import { isTickInRange } from "../query";
import type { SparseSet } from "../sparse-set";
import type { QueryFilterMode, ResolvedQueryFilter } from "./query-plan";

interface FilteredQueryPlan {
    readonly filterMode: QueryFilterMode;
    readonly filterStores: ResolvedQueryFilter;
}

export function matchesPlanFilter(
    entity: Entity,
    plan: FilteredQueryPlan,
    changeDetection: ChangeDetectionRange
): boolean {
    if (plan.filterMode === "unfiltered") {
        return true;
    }

    // Structural-only filters can skip change-tick lookups entirely.
    if (plan.filterMode === "structural") {
        return matchesStructuralFilter(entity, plan.filterStores);
    }

    return matchesFilter(entity, plan.filterStores, changeDetection);
}

function matchesFilter(
    entity: Entity,
    filter: ResolvedQueryFilter,
    changeDetection: ChangeDetectionRange
): boolean {
    if (!matchesStructuralFilter(entity, filter)) {
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

function matchesStructuralFilter(entity: Entity, filter: ResolvedQueryFilter): boolean {
    for (const store of filter.with) {
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
        if (store.has(entity)) {
            return true;
        }
    }

    return false;
}

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
