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
    filterMode: QueryFilterMode,
    filter: ResolvedQueryFilter
): QueryFilterMatcher<FilteredQueryPlan> {
    if (filterMode === "unfiltered") {
        return matchUnfilteredFilter;
    }

    if (filterMode === "change") {
        return matchChangePlanFilter;
    }

    if (filter.or.length === 0) {
        if (filter.with.length === 1 && filter.without.length === 1) {
            return matchStructuralWith1Without1;
        }

        if (filter.with.length === 1 && filter.without.length === 0) {
            return matchStructuralWith1;
        }

        if (filter.with.length === 0 && filter.without.length === 1) {
            return matchStructuralWithout1;
        }
    }

    return matchStructuralPlanFilter;
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

function matchStructuralWith1(
    entity: Entity,
    plan: FilteredQueryPlan,
    _changeDetection: ChangeDetectionRange,
    knownPresentStore?: SparseSet<unknown>
): boolean {
    const store = plan.filterStores.with[0]!;

    return store === knownPresentStore || store.has(entity);
}

function matchStructuralWithout1(
    entity: Entity,
    plan: FilteredQueryPlan,
    _changeDetection: ChangeDetectionRange,
    _knownPresentStore?: SparseSet<unknown>
): boolean {
    return !plan.filterStores.without[0]!.has(entity);
}

function matchStructuralWith1Without1(
    entity: Entity,
    plan: FilteredQueryPlan,
    _changeDetection: ChangeDetectionRange,
    knownPresentStore?: SparseSet<unknown>
): boolean {
    const filter = plan.filterStores;
    const withStore = filter.with[0]!;

    return (
        (withStore === knownPresentStore || withStore.has(entity)) &&
        !filter.without[0]!.has(entity)
    );
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
    return (
        matchesStructuralFilter(entity, filter, knownPresentStore) &&
        matchesAddedStores(entity, filter.added, changeDetection) &&
        matchesChangedStores(entity, filter.changed, changeDetection)
    );
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
