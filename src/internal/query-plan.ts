import type { AnyComponentType, ComponentRegistry } from "../component";
import type { OptionalQueryState, QueryFilter, QueryState } from "../query";
import { SparseSet } from "../sparse-set";

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

/** Execution plan for a required-component query. */
export interface ResolvedQueryPlan {
    readonly stores: readonly SparseSet<unknown>[];
    readonly filterStores: ResolvedQueryFilter;
    readonly filterMode: QueryFilterMode;
}

/** Execution plan for a query with required and optional component sections. */
export interface ResolvedOptionalQueryPlan {
    readonly requiredStores: readonly SparseSet<unknown>[];
    readonly optionalStores: readonly (SparseSet<unknown> | undefined)[];
    readonly filterStores: ResolvedQueryFilter;
    readonly filterMode: QueryFilterMode;
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
    readonly registry: ComponentRegistry;
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

    const filterStores = resolveFilterStores(context, filter);

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

    const filterStores = resolveFilterStores(context, filter);

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
    filter: QueryFilter
): ResolvedQueryFilter | undefined {
    const withStores: SparseSet<unknown>[] = [];
    const withoutStores: SparseSet<unknown>[] = [];
    const orStores: SparseSet<unknown>[] = [];
    const addedStores: SparseSet<unknown>[] = [];
    const changedStores: SparseSet<unknown>[] = [];

    for (const type of filter.with ?? []) {
        assertRegisteredQueryComponent(context.registry, type);
        const store = context.stores[type.id];

        if (store === undefined) {
            return undefined;
        }

        withStores.push(store);
    }

    for (const type of filter.without ?? []) {
        assertRegisteredQueryComponent(context.registry, type);
        const store = context.stores[type.id];

        // Missing stores satisfy negative filters, so only track stores that actually exist.
        if (store !== undefined) {
            withoutStores.push(store);
        }
    }

    for (const type of filter.or ?? []) {
        assertRegisteredQueryComponent(context.registry, type);
        const store = context.stores[type.id];

        if (store !== undefined) {
            orStores.push(store);
        }
    }

    if (filter.or !== undefined && filter.or.length > 0 && orStores.length === 0) {
        return undefined;
    }

    for (const type of filter.added ?? []) {
        assertRegisteredQueryComponent(context.registry, type);
        const store = context.stores[type.id];

        if (store === undefined) {
            return undefined;
        }

        addedStores.push(store);
    }

    for (const type of filter.changed ?? []) {
        assertRegisteredQueryComponent(context.registry, type);
        const store = context.stores[type.id];

        if (store === undefined) {
            return undefined;
        }

        changedStores.push(store);
    }

    return {
        with: withStores,
        without: withoutStores,
        or: orStores,
        added: addedStores,
        changed: changedStores,
    };
}

/** Distinguishes fast structural filters from change-aware filters. */
function resolveFilterMode(filter: ResolvedQueryFilter): QueryFilterMode {
    if (filter.with.length === 0 && filter.without.length === 0 && filter.or.length === 0) {
        return filter.added.length === 0 && filter.changed.length === 0 ? "unfiltered" : "change";
    }

    return filter.added.length === 0 && filter.changed.length === 0 ? "structural" : "change";
}

/** Packages the resolved plan for required queries. */
function createQueryPlan(
    stores: readonly SparseSet<unknown>[],
    filterStores: ResolvedQueryFilter
): ResolvedQueryPlan {
    return {
        stores,
        filterStores,
        filterMode: resolveFilterMode(filterStores),
    };
}

/** Packages the resolved plan for optional queries. */
function createOptionalQueryPlan(
    requiredStores: readonly SparseSet<unknown>[],
    optionalStores: readonly (SparseSet<unknown> | undefined)[],
    filterStores: ResolvedQueryFilter
): ResolvedOptionalQueryPlan {
    return {
        requiredStores,
        optionalStores,
        filterStores,
        filterMode: resolveFilterMode(filterStores),
    };
}

function assertRegisteredQueryComponent(
    registry: ComponentRegistry,
    type: AnyComponentType
): void {
    if (type.registry === registry) {
        return;
    }

    throw new Error(
        `Cannot query component ${type.name}: it is registered in ${type.registry.name}, not ${registry.name}`
    );
}
