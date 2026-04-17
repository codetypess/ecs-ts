import type { Entity } from "../entity";
import type { ChangeDetectionRange } from "../query";
import { isTickInRange } from "../query";
import type { SparseSet } from "../sparse-set";
import type { QueryFilterMode, ResolvedQueryFilter } from "./query-plan";

interface FilteredQueryPlan {
    readonly filterMode: QueryFilterMode;
    readonly filterStores: ResolvedQueryFilter;
}

export type QueryFilterMatcher<TPlan extends FilteredQueryPlan = FilteredQueryPlan> = (
    entity: Entity,
    plan: TPlan,
    changeDetection: ChangeDetectionRange,
    knownPresentStore?: SparseSet<unknown>
) => boolean;

/** Selects the cheapest filter matcher once per resolved query plan. */
export function compileQueryFilterMatcher(
    filterMode: QueryFilterMode
): QueryFilterMatcher<FilteredQueryPlan> {
    if (filterMode === "unfiltered") {
        return matchUnfilteredFilter;
    }

    return filterMode === "structural" ? matchStructuralPlanFilter : matchChangePlanFilter;
}

/** Applies the cheapest possible filter path for a resolved query plan. */
export function matchesPlanFilter(
    entity: Entity,
    plan: FilteredQueryPlan,
    changeDetection: ChangeDetectionRange,
    knownPresentStore?: SparseSet<unknown>
): boolean {
    return compileQueryFilterMatcher(plan.filterMode)(
        entity,
        plan,
        changeDetection,
        knownPresentStore
    );
}

function matchUnfilteredFilter(): boolean {
    return true;
}

function matchStructuralPlanFilter(
    entity: Entity,
    plan: FilteredQueryPlan,
    _changeDetection: ChangeDetectionRange,
    knownPresentStore?: SparseSet<unknown>
): boolean {
    return matchesStructuralFilter(entity, plan.filterStores, knownPresentStore);
}

function matchChangePlanFilter(
    entity: Entity,
    plan: FilteredQueryPlan,
    changeDetection: ChangeDetectionRange,
    knownPresentStore?: SparseSet<unknown>
): boolean {
    return matchesChangeFilter(entity, plan.filterStores, changeDetection, knownPresentStore);
}

function matchesChangeFilter(
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
