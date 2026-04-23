import type { AnyComponentType } from "../component.js";
import type { Entity } from "../entity.js";
import type {
    ChangeDetectionRange,
    OptionalQueryRow,
    OptionalQueryState,
    QueryFilter,
    QueryRow,
    QueryState,
} from "../query.js";
import type { Registry } from "../registry.js";
import { SparseSet } from "../sparse-set.js";
import { compileQueryFilterMatcher, type QueryFilterMatcher } from "./query-filter.js";

import {
    compileOptionalQueryCount,
    compileOptionalQueryEach,
    compileOptionalQueryIterate,
    compileRequiredQueryCount,
    compileRequiredQueryEach,
    compileRequiredQueryIterate,
} from "./query-plan-executors.js";

/**
 * Query execution is compiled at plan-creation time into specialised functions for
 * the most common component-count cases (1 / 2 / 3 required components), with a
 * generic fallback for 4+.  Specialisation removes branching and array-unpacking
 * overhead from the hot iteration loop.  Each variant is further split into a
 * "filtered" and "unfiltered" form so filter checks are never paid when no filter
 * is present.  The compiled executors are stored directly on the resolved plan so
 * no dispatch indirection occurs at call time.
 */

/** Broad buckets that let query execution skip unnecessary filter work. */
export type QueryFilterMode = "unfiltered" | "structural" | "change";

/** Filter stores resolved from a user-facing query filter. */
export interface ResolvedQueryFilter {
    readonly with: readonly SparseSet<unknown>[];
    readonly without: readonly SparseSet<unknown>[];
    readonly or: readonly SparseSet<unknown>[];
    readonly added: readonly SparseSet<unknown>[];
    readonly changed: readonly SparseSet<unknown>[];
}

export type QueryEachVisitor = (entity: Entity, ...components: unknown[]) => void;

export type QueryIterateExecutor = (
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange
) => IterableIterator<QueryRow<readonly AnyComponentType[]>>;

export type QueryEachExecutor = (
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
) => void;

export type QueryCountExecutor = (
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    limit: number
) => number;

export type OptionalQueryIterateExecutor = (
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange
) => IterableIterator<OptionalQueryRow<readonly AnyComponentType[], readonly AnyComponentType[]>>;

export type OptionalQueryEachExecutor = (
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
) => void;

export type OptionalQueryCountExecutor = (
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange,
    limit: number
) => number;

/** Execution plan for a required-component query. */
export interface ResolvedQueryPlan {
    readonly stores: readonly SparseSet<unknown>[];
    readonly filterStores: ResolvedQueryFilter;
    readonly filterMode: QueryFilterMode;
    readonly matchesFilter: QueryFilterMatcher<ResolvedQueryPlan>;
    readonly iterate: QueryIterateExecutor;
    readonly each: QueryEachExecutor;
    readonly countMatches: QueryCountExecutor;
    readonly scratchpad: unknown[];
}

/** Execution plan for a query with required and optional component sections. */
export interface ResolvedOptionalQueryPlan {
    readonly requiredStores: readonly SparseSet<unknown>[];
    readonly optionalStores: readonly (SparseSet<unknown> | undefined)[];
    readonly filterStores: ResolvedQueryFilter;
    readonly filterMode: QueryFilterMode;
    readonly matchesFilter: QueryFilterMatcher<ResolvedOptionalQueryPlan>;
    readonly iterate: OptionalQueryIterateExecutor;
    readonly each: OptionalQueryEachExecutor;
    readonly countMatches: OptionalQueryCountExecutor;
    readonly scratchpad: unknown[];
}

/** Cache entry for `QueryState` plans keyed by component-store topology. */
export interface QueryStateCache {
    readonly storeVersion: number;
    readonly plan?: ResolvedQueryPlan;
}

/** Cache entry for `OptionalQueryState` plans keyed by component-store topology. */
export interface OptionalQueryStateCache {
    readonly storeVersion: number;
    readonly plan?: ResolvedOptionalQueryPlan;
}

/** Inputs needed to resolve component types into concrete stores. */
export interface QueryPlanContextOptions {
    readonly registry: Registry;
    readonly stores: readonly (SparseSet<unknown> | undefined)[];
    readonly getStoreVersion: () => number;
}

/** Shared cache and lookup context used by query planning. */
export interface QueryPlanContext extends QueryPlanContextOptions {
    readonly queryStateCaches: WeakMap<QueryState<readonly AnyComponentType[]>, QueryStateCache>;
    readonly optionalQueryStateCaches: WeakMap<
        OptionalQueryState<readonly AnyComponentType[], readonly AnyComponentType[]>,
        OptionalQueryStateCache
    >;
}

/** Creates the planner context that backs all world queries. */
export function createQueryPlanContext(options: QueryPlanContextOptions): QueryPlanContext {
    return {
        queryStateCaches: new WeakMap(),
        optionalQueryStateCaches: new WeakMap(),
        ...options,
    };
}

/** Resolves a direct query request into concrete stores and a scan strategy. */
export function resolveQueryPlan(
    context: QueryPlanContext,
    types: readonly AnyComponentType[],
    filter: QueryFilter
): ResolvedQueryPlan | undefined {
    const stores = resolveQueryStores(context, types);

    if (stores === undefined) {
        return undefined;
    }

    const filterStores = resolveFilterStores(context, filter, types, stores);

    if (filterStores === undefined) {
        return undefined;
    }

    return createQueryPlan(stores, filterStores);
}

/** Resolves an optional query request into concrete stores and a scan strategy. */
export function resolveOptionalQueryPlan(
    context: QueryPlanContext,
    required: readonly AnyComponentType[],
    optional: readonly AnyComponentType[],
    filter: QueryFilter
): ResolvedOptionalQueryPlan | undefined {
    const requiredStores = resolveQueryStores(context, required);

    if (requiredStores === undefined) {
        return undefined;
    }

    const filterStores = resolveFilterStores(context, filter, required, requiredStores);

    if (filterStores === undefined) {
        return undefined;
    }

    return createOptionalQueryPlan(
        requiredStores,
        resolveOptionalStores(context, optional),
        filterStores
    );
}

/** Resolves and caches a `QueryState` plan until the store topology changes. */
export function resolveQueryStateCache<const TComponents extends readonly AnyComponentType[]>(
    context: QueryPlanContext,
    state: QueryState<TComponents>
): ResolvedQueryPlan | undefined {
    const key = state as QueryState<readonly AnyComponentType[]>;
    const existing = context.queryStateCaches.get(key);

    // Store version tracks topology only; cached plans remain valid across value/tick changes.
    if (existing?.storeVersion === context.getStoreVersion()) {
        return existing.plan;
    }

    const plan = resolveQueryPlan(context, state.types, state.filter);
    const cache = {
        storeVersion: context.getStoreVersion(),
        plan,
    } satisfies QueryStateCache;

    context.queryStateCaches.set(key, cache);

    return cache.plan;
}

/** Resolves and caches an `OptionalQueryState` plan until the store topology changes. */
export function resolveOptionalQueryStateCache<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryPlanContext,
    state: OptionalQueryState<TRequiredComponents, TOptionalComponents>
): ResolvedOptionalQueryPlan | undefined {
    const key = state as OptionalQueryState<
        readonly AnyComponentType[],
        readonly AnyComponentType[]
    >;
    const existing = context.optionalQueryStateCaches.get(key);

    if (existing?.storeVersion === context.getStoreVersion()) {
        return existing.plan;
    }

    const plan = resolveOptionalQueryPlan(context, state.required, state.optional, state.filter);
    const cache = {
        storeVersion: context.getStoreVersion(),
        plan,
    } satisfies OptionalQueryStateCache;

    context.optionalQueryStateCaches.set(key, cache);

    return cache.plan;
}

function resolveQueryStores(
    context: QueryPlanContext,
    types: readonly AnyComponentType[]
): SparseSet<unknown>[] | undefined {
    if (types.length === 0) {
        throw new Error("Query requires at least one component type");
    }

    const stores: SparseSet<unknown>[] = new Array(types.length);

    for (let index = 0; index < types.length; index++) {
        const type = types[index]!;

        assertRegisteredQueryComponent(context.registry, type);
        const store = context.stores[type.id];

        if (store === undefined) {
            return undefined;
        }

        stores[index] = store;
    }

    return stores;
}

function resolveOptionalStores(
    context: QueryPlanContext,
    types: readonly AnyComponentType[]
): (SparseSet<unknown> | undefined)[] {
    const stores: (SparseSet<unknown> | undefined)[] = new Array(types.length);

    for (let index = 0; index < types.length; index++) {
        const type = types[index]!;

        assertRegisteredQueryComponent(context.registry, type);
        stores[index] = context.stores[type.id];
    }

    return stores;
}

function resolveFilterStores(
    context: QueryPlanContext,
    filter: QueryFilter,
    knownTypes?: readonly AnyComponentType[],
    knownStores?: SparseSet<unknown>[]
): ResolvedQueryFilter | undefined {
    const withStores = resolveRequiredFilterStores(context, filter.with, knownTypes, knownStores);
    if (withStores === undefined) return undefined;

    const addedStores = resolveRequiredFilterStores(context, filter.added, knownTypes, knownStores);
    if (addedStores === undefined) return undefined;

    const changedStores = resolveRequiredFilterStores(
        context,
        filter.changed,
        knownTypes,
        knownStores
    );
    if (changedStores === undefined) return undefined;

    const orStores = resolveOptionalFilterStores(context, filter.or, knownTypes, knownStores);

    // An `or` filter with no existing candidate stores can never match any entity.
    if (filter.or !== undefined && filter.or.length > 0 && orStores.length === 0) {
        return undefined;
    }

    return {
        with: withStores,
        without: resolveOptionalFilterStores(context, filter.without, knownTypes, knownStores),
        or: orStores,
        added: addedStores,
        changed: changedStores,
    };
}

/**
 * Resolves stores for filter arrays where a missing store means the filter can
 * never match — returns `undefined` to short-circuit plan creation.
 */
function resolveRequiredFilterStores(
    context: QueryPlanContext,
    types: readonly AnyComponentType[] | undefined,
    knownTypes?: readonly AnyComponentType[],
    knownStores?: SparseSet<unknown>[]
): SparseSet<unknown>[] | undefined {
    if (!types || types.length === 0) return [];
    if (knownTypes !== undefined && knownStores !== undefined && types === knownTypes) {
        return knownStores;
    }

    const stores: SparseSet<unknown>[] = [];

    for (const type of types) {
        assertRegisteredQueryComponent(context.registry, type);
        const store = context.stores[type.id];

        if (store === undefined) return undefined;

        stores.push(store);
    }

    return stores;
}

/**
 * Resolves stores for filter arrays where a missing store is simply omitted
 * (the filter condition is vacuously false/true for that component).
 */
function resolveOptionalFilterStores(
    context: QueryPlanContext,
    types: readonly AnyComponentType[] | undefined,
    knownTypes?: readonly AnyComponentType[],
    knownStores?: SparseSet<unknown>[]
): SparseSet<unknown>[] {
    if (!types || types.length === 0) return [];
    if (knownTypes !== undefined && knownStores !== undefined && types === knownTypes) {
        return knownStores;
    }

    const stores: SparseSet<unknown>[] = [];

    for (const type of types) {
        assertRegisteredQueryComponent(context.registry, type);
        const store = context.stores[type.id];

        if (store !== undefined) {
            stores.push(store);
        }
    }

    return stores;
}

/** Distinguishes fast structural filters from change-aware filters. */
function resolveFilterMode(filter: ResolvedQueryFilter): QueryFilterMode {
    const hasStructural =
        filter.with.length > 0 || filter.without.length > 0 || filter.or.length > 0;
    const hasChange = filter.added.length > 0 || filter.changed.length > 0;

    if (!hasStructural && !hasChange) return "unfiltered";
    if (!hasChange) return "structural";
    return "change";
}

/** Packages the resolved plan for required queries. */
function createQueryPlan(
    stores: readonly SparseSet<unknown>[],
    filterStores: ResolvedQueryFilter
): ResolvedQueryPlan {
    const filterMode = resolveFilterMode(filterStores);

    return {
        stores,
        filterStores,
        filterMode,
        matchesFilter: compileQueryFilterMatcher(
            filterMode
        ) as QueryFilterMatcher<ResolvedQueryPlan>,
        iterate: compileRequiredQueryIterate(stores.length, filterMode),
        each: compileRequiredQueryEach(stores.length, filterMode),
        countMatches: compileRequiredQueryCount(filterMode),
        scratchpad: new Array(stores.length),
    };
}

/** Packages the resolved plan for optional queries. */
function createOptionalQueryPlan(
    requiredStores: readonly SparseSet<unknown>[],
    optionalStores: readonly (SparseSet<unknown> | undefined)[],
    filterStores: ResolvedQueryFilter
): ResolvedOptionalQueryPlan {
    const filterMode = resolveFilterMode(filterStores);

    return {
        requiredStores,
        optionalStores,
        filterStores,
        filterMode,
        matchesFilter: compileQueryFilterMatcher(
            filterMode
        ) as QueryFilterMatcher<ResolvedOptionalQueryPlan>,
        iterate: compileOptionalQueryIterate(
            requiredStores.length,
            optionalStores.length,
            filterMode
        ),
        each: compileOptionalQueryEach(requiredStores.length, optionalStores.length, filterMode),
        countMatches: compileOptionalQueryCount(filterMode),
        scratchpad: new Array(requiredStores.length + optionalStores.length),
    };
}
function assertRegisteredQueryComponent(registry: Registry, type: AnyComponentType): void {
    if (type.registry === registry) {
        return;
    }

    throw new Error(
        `Cannot query component ${type.name}: it is registered in ${type.registry.name}, not ${registry.name}`
    );
}
