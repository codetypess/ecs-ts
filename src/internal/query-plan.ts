import type { AnyComponentType } from "../component";
import type { OptionalQueryState, QueryFilter, QueryState } from "../query";
import { chooseSmallestStore } from "../query";
import { SparseSet } from "../sparse-set";

export type QueryFilterMode = "unfiltered" | "structural" | "change";

export interface ResolvedQueryFilter {
    readonly with: readonly SparseSet<unknown>[];
    readonly without: readonly SparseSet<unknown>[];
    readonly or: readonly SparseSet<unknown>[];
    readonly added: readonly SparseSet<unknown>[];
    readonly changed: readonly SparseSet<unknown>[];
}

export interface ResolvedQueryPlan {
    readonly stores: readonly SparseSet<unknown>[];
    readonly filterStores: ResolvedQueryFilter;
    readonly baseStore: SparseSet<unknown>;
    readonly filterMode: QueryFilterMode;
}

export interface ResolvedOptionalQueryPlan {
    readonly requiredStores: readonly SparseSet<unknown>[];
    readonly optionalStores: readonly (SparseSet<unknown> | undefined)[];
    readonly filterStores: ResolvedQueryFilter;
    readonly baseStore: SparseSet<unknown>;
    readonly filterMode: QueryFilterMode;
}

export interface QueryStateCache {
    readonly storeVersion: number;
    readonly plan?: ResolvedQueryPlan;
}

export interface OptionalQueryStateCache {
    readonly storeVersion: number;
    readonly plan?: ResolvedOptionalQueryPlan;
}

export interface QueryPlanContextOptions {
    readonly stores: ReadonlyMap<number, SparseSet<unknown>>;
    readonly getStoreVersion: () => number;
}

export interface QueryPlanContext extends QueryPlanContextOptions {
    readonly queryStateCaches: WeakMap<QueryState<readonly AnyComponentType[]>, QueryStateCache>;
    readonly optionalQueryStateCaches: WeakMap<
        OptionalQueryState<readonly AnyComponentType[], readonly AnyComponentType[]>,
        OptionalQueryStateCache
    >;
}

export function createQueryPlanContext(options: QueryPlanContextOptions): QueryPlanContext {
    return {
        queryStateCaches: new WeakMap(),
        optionalQueryStateCaches: new WeakMap(),
        ...options,
    };
}

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
        const store = context.stores.get(types[index]!.id);

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
        stores[index] = context.stores.get(types[index]!.id);
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
        const store = context.stores.get(type.id);

        if (store === undefined) {
            return undefined;
        }

        withStores.push(store);
    }

    for (const type of filter.without ?? []) {
        const store = context.stores.get(type.id);

        // Missing stores satisfy negative filters, so only track stores that actually exist.
        if (store !== undefined) {
            withoutStores.push(store);
        }
    }

    for (const type of filter.or ?? []) {
        const store = context.stores.get(type.id);

        if (store !== undefined) {
            orStores.push(store);
        }
    }

    if (filter.or !== undefined && filter.or.length > 0 && orStores.length === 0) {
        return undefined;
    }

    for (const type of filter.added ?? []) {
        const store = context.stores.get(type.id);

        if (store === undefined) {
            return undefined;
        }

        addedStores.push(store);
    }

    for (const type of filter.changed ?? []) {
        const store = context.stores.get(type.id);

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

function resolveFilterMode(filter: ResolvedQueryFilter): QueryFilterMode {
    if (filter.with.length === 0 && filter.without.length === 0 && filter.or.length === 0) {
        return filter.added.length === 0 && filter.changed.length === 0 ? "unfiltered" : "change";
    }

    return filter.added.length === 0 && filter.changed.length === 0 ? "structural" : "change";
}

function createQueryPlan(
    stores: readonly SparseSet<unknown>[],
    filterStores: ResolvedQueryFilter
): ResolvedQueryPlan {
    return {
        stores,
        filterStores,
        baseStore: chooseSmallestStore(stores, filterStores.with),
        filterMode: resolveFilterMode(filterStores),
    };
}

function createOptionalQueryPlan(
    requiredStores: readonly SparseSet<unknown>[],
    optionalStores: readonly (SparseSet<unknown> | undefined)[],
    filterStores: ResolvedQueryFilter
): ResolvedOptionalQueryPlan {
    return {
        requiredStores,
        optionalStores,
        filterStores,
        baseStore: chooseSmallestStore(requiredStores, filterStores.with),
        filterMode: resolveFilterMode(filterStores),
    };
}
