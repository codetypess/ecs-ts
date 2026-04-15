import type { AnyComponentType } from "../component";
import type { OptionalQueryState, QueryFilter, QueryState } from "../query";
import { chooseSmallestStore } from "../query";
import { SparseSet } from "../sparse-set";
import type {
    OptionalQueryStateCache,
    QueryFilterMode,
    QueryStateCache,
    ResolvedOptionalQueryPlan,
    ResolvedQueryFilter,
    ResolvedQueryPlan,
} from "./query-plan";

export interface QueryPlanRuntimeOptions {
    readonly stores: ReadonlyMap<number, SparseSet<unknown>>;
    readonly getStoreVersion: () => number;
}

export class QueryPlanRuntime {
    private readonly queryStateCaches = new WeakMap<
        QueryState<readonly AnyComponentType[]>,
        QueryStateCache
    >();
    private readonly optionalQueryStateCaches = new WeakMap<
        OptionalQueryState<readonly AnyComponentType[], readonly AnyComponentType[]>,
        OptionalQueryStateCache
    >();

    constructor(private readonly options: QueryPlanRuntimeOptions) {}

    resolveQueryPlan(
        types: readonly AnyComponentType[],
        filter: QueryFilter
    ): ResolvedQueryPlan | undefined {
        const stores = this.resolveQueryStores(types);

        if (stores === undefined) {
            return undefined;
        }

        const filterStores = this.resolveFilterStores(filter);

        if (filterStores === undefined) {
            return undefined;
        }

        return this.createQueryPlan(stores, filterStores);
    }

    resolveOptionalQueryPlan(
        required: readonly AnyComponentType[],
        optional: readonly AnyComponentType[],
        filter: QueryFilter
    ): ResolvedOptionalQueryPlan | undefined {
        const requiredStores = this.resolveQueryStores(required);

        if (requiredStores === undefined) {
            return undefined;
        }

        const filterStores = this.resolveFilterStores(filter);

        if (filterStores === undefined) {
            return undefined;
        }

        return this.createOptionalQueryPlan(
            requiredStores,
            this.resolveOptionalStores(optional),
            filterStores
        );
    }

    resolveQueryStateCache<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): ResolvedQueryPlan | undefined {
        const key = state as QueryState<readonly AnyComponentType[]>;
        const existing = this.queryStateCaches.get(key);

        if (existing?.storeVersion === this.options.getStoreVersion()) {
            return existing.plan;
        }

        const plan = this.resolveQueryPlan(state.types, state.filter);
        const cache = {
            storeVersion: this.options.getStoreVersion(),
            plan,
        } satisfies QueryStateCache;

        this.queryStateCaches.set(key, cache);

        return cache.plan;
    }

    resolveOptionalQueryStateCache<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        state: OptionalQueryState<TRequiredComponents, TOptionalComponents>
    ): ResolvedOptionalQueryPlan | undefined {
        const key = state as OptionalQueryState<
            readonly AnyComponentType[],
            readonly AnyComponentType[]
        >;
        const existing = this.optionalQueryStateCaches.get(key);

        if (existing?.storeVersion === this.options.getStoreVersion()) {
            return existing.plan;
        }

        const plan = this.resolveOptionalQueryPlan(state.required, state.optional, state.filter);
        const cache = {
            storeVersion: this.options.getStoreVersion(),
            plan,
        } satisfies OptionalQueryStateCache;

        this.optionalQueryStateCaches.set(key, cache);

        return cache.plan;
    }

    private resolveQueryStores(
        types: readonly AnyComponentType[]
    ): SparseSet<unknown>[] | undefined {
        if (types.length === 0) {
            throw new Error("Query requires at least one component type");
        }

        const stores: SparseSet<unknown>[] = new Array(types.length);

        for (let index = 0; index < types.length; index++) {
            const store = this.options.stores.get(types[index]!.id);

            if (store === undefined) {
                return undefined;
            }

            stores[index] = store;
        }

        return stores;
    }

    private resolveOptionalStores(
        types: readonly AnyComponentType[]
    ): (SparseSet<unknown> | undefined)[] {
        const stores: (SparseSet<unknown> | undefined)[] = new Array(types.length);

        for (let index = 0; index < types.length; index++) {
            stores[index] = this.options.stores.get(types[index]!.id);
        }

        return stores;
    }

    private resolveFilterStores(filter: QueryFilter): ResolvedQueryFilter | undefined {
        const withStores: SparseSet<unknown>[] = [];
        const withoutStores: SparseSet<unknown>[] = [];
        const orStores: SparseSet<unknown>[] = [];
        const addedStores: SparseSet<unknown>[] = [];
        const changedStores: SparseSet<unknown>[] = [];

        for (const type of filter.with ?? []) {
            const store = this.options.stores.get(type.id);

            if (store === undefined) {
                return undefined;
            }

            withStores.push(store);
        }

        for (const type of filter.without ?? []) {
            const store = this.options.stores.get(type.id);

            // Missing stores satisfy negative filters, so only track stores that actually exist.
            if (store !== undefined) {
                withoutStores.push(store);
            }
        }

        for (const type of filter.or ?? []) {
            const store = this.options.stores.get(type.id);

            if (store !== undefined) {
                orStores.push(store);
            }
        }

        if (filter.or !== undefined && filter.or.length > 0 && orStores.length === 0) {
            return undefined;
        }

        for (const type of filter.added ?? []) {
            const store = this.options.stores.get(type.id);

            if (store === undefined) {
                return undefined;
            }

            addedStores.push(store);
        }

        for (const type of filter.changed ?? []) {
            const store = this.options.stores.get(type.id);

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

    private resolveFilterMode(filter: ResolvedQueryFilter): QueryFilterMode {
        if (filter.with.length === 0 && filter.without.length === 0 && filter.or.length === 0) {
            return filter.added.length === 0 && filter.changed.length === 0
                ? "unfiltered"
                : "change";
        }

        return filter.added.length === 0 && filter.changed.length === 0 ? "structural" : "change";
    }

    private createQueryPlan(
        stores: readonly SparseSet<unknown>[],
        filterStores: ResolvedQueryFilter
    ): ResolvedQueryPlan {
        return {
            stores,
            filterStores,
            baseStore: chooseSmallestStore(stores, filterStores.with),
            filterMode: this.resolveFilterMode(filterStores),
        };
    }

    private createOptionalQueryPlan(
        requiredStores: readonly SparseSet<unknown>[],
        optionalStores: readonly (SparseSet<unknown> | undefined)[],
        filterStores: ResolvedQueryFilter
    ): ResolvedOptionalQueryPlan {
        return {
            requiredStores,
            optionalStores,
            filterStores,
            baseStore: chooseSmallestStore(requiredStores, filterStores.with),
            filterMode: this.resolveFilterMode(filterStores),
        };
    }
}
