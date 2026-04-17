import type { AnyComponentType, ComponentRegistry } from "../component";
import type { Entity } from "../entity";
import type {
    ChangeDetectionRange,
    OptionalQueryRow,
    OptionalQueryState,
    QueryFilter,
    QueryRow,
    QueryState,
} from "../query";
import { chooseSmallestStore } from "../query";
import { SparseSet } from "../sparse-set";
import { fillComponents, fillOptionalComponents, hasComponents } from "./query-components";
import {
    compileQueryFilterMatcher,
    type QueryFilterMatcher,
} from "./query-filter";

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

/** Inputs needed to execute resolved query plans. */
export type QueryExecutionContext = Record<never, never>;

type QueryEachVisitor = (entity: Entity, ...components: unknown[]) => void;

type QueryIterateExecutor = (
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange
) => IterableIterator<QueryRow<readonly AnyComponentType[]>>;

type QueryEachExecutor = (
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
) => void;

type QueryCountExecutor = (
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    limit: number
) => number;

type OptionalQueryIterateExecutor = (
    context: QueryExecutionContext,
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange
) => IterableIterator<OptionalQueryRow<readonly AnyComponentType[], readonly AnyComponentType[]>>;

type OptionalQueryEachExecutor = (
    context: QueryExecutionContext,
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
) => void;

type OptionalQueryCountExecutor = (
    context: QueryExecutionContext,
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
    const filterMode = resolveFilterMode(filterStores);

    return {
        stores,
        filterStores,
        filterMode,
        matchesFilter: compileQueryFilterMatcher(filterMode) as QueryFilterMatcher<ResolvedQueryPlan>,
        iterate: compileRequiredQueryIterate(stores.length, filterMode),
        each: compileRequiredQueryEach(stores.length, filterMode),
        countMatches: compileRequiredQueryCount(filterMode),
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
        iterate: compileOptionalQueryIterate(requiredStores.length, optionalStores.length, filterMode),
        each: compileOptionalQueryEach(requiredStores.length, optionalStores.length, filterMode),
        countMatches: compileOptionalQueryCount(filterMode),
    };
}

function compileRequiredQueryIterate(
    storeCount: number,
    filterMode: QueryFilterMode
): QueryIterateExecutor {
    const hasFilter = filterMode !== "unfiltered";

    switch (storeCount) {
        case 1:
            return hasFilter ? iterateRequired1Filtered : iterateRequired1;
        case 2:
            return hasFilter ? iterateRequired2Filtered : iterateRequired2;
        case 3:
            return hasFilter ? iterateRequired3Filtered : iterateRequired3;
        default:
            return hasFilter ? iterateRequiredGenericFiltered : iterateRequiredGeneric;
    }
}

function compileRequiredQueryEach(
    storeCount: number,
    filterMode: QueryFilterMode
): QueryEachExecutor {
    const hasFilter = filterMode !== "unfiltered";

    switch (storeCount) {
        case 1:
            return hasFilter ? eachRequired1Filtered : eachRequired1;
        case 2:
            return hasFilter ? eachRequired2Filtered : eachRequired2;
        case 3:
            return hasFilter ? eachRequired3Filtered : eachRequired3;
        default:
            return hasFilter ? eachRequiredGenericFiltered : eachRequiredGeneric;
    }
}

function compileRequiredQueryCount(filterMode: QueryFilterMode): QueryCountExecutor {
    return filterMode === "unfiltered"
        ? countRequiredQueryMatches
        : countRequiredQueryMatchesFiltered;
}

function compileOptionalQueryIterate(
    requiredCount: number,
    optionalCount: number,
    filterMode: QueryFilterMode
): OptionalQueryIterateExecutor {
    const hasFilter = filterMode !== "unfiltered";

    if (requiredCount === 1 && optionalCount === 1) {
        return hasFilter ? iterateOptional1x1Filtered : iterateOptional1x1;
    }

    return hasFilter ? iterateOptionalGenericFiltered : iterateOptionalGeneric;
}

function compileOptionalQueryEach(
    requiredCount: number,
    optionalCount: number,
    filterMode: QueryFilterMode
): OptionalQueryEachExecutor {
    const hasFilter = filterMode !== "unfiltered";

    if (requiredCount === 1 && optionalCount === 1) {
        return hasFilter ? eachOptional1x1Filtered : eachOptional1x1;
    }

    return hasFilter ? eachOptionalGenericFiltered : eachOptionalGeneric;
}

function compileOptionalQueryCount(filterMode: QueryFilterMode): OptionalQueryCountExecutor {
    return filterMode === "unfiltered"
        ? countOptionalQueryMatches
        : countOptionalQueryMatchesFiltered;
}

function* iterateRequired1(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<readonly AnyComponentType[]>> {
    void changeDetection;
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const baseIsStore0 = store0 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        yield [entity, value0] as unknown as QueryRow<readonly AnyComponentType[]>;
    }
}

function* iterateRequired1Filtered(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<readonly AnyComponentType[]>> {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const baseIsStore0 = store0 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        yield [entity, value0] as unknown as QueryRow<readonly AnyComponentType[]>;
    }
}

function* iterateRequired2(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<readonly AnyComponentType[]>> {
    void changeDetection;
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const store1 = plan.stores[1]!;
    const baseIsStore0 = store0 === baseStore;
    const baseIsStore1 = store1 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        const value1 = baseIsStore1 ? baseValues[index] : store1.get(entity);

        if (value1 === undefined) {
            continue;
        }

        yield [entity, value0, value1] as unknown as QueryRow<readonly AnyComponentType[]>;
    }
}

function* iterateRequired2Filtered(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<readonly AnyComponentType[]>> {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const store1 = plan.stores[1]!;
    const baseIsStore0 = store0 === baseStore;
    const baseIsStore1 = store1 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        const value1 = baseIsStore1 ? baseValues[index] : store1.get(entity);

        if (value1 === undefined) {
            continue;
        }

        yield [entity, value0, value1] as unknown as QueryRow<readonly AnyComponentType[]>;
    }
}

function* iterateRequired3(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<readonly AnyComponentType[]>> {
    void changeDetection;
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const store1 = plan.stores[1]!;
    const store2 = plan.stores[2]!;
    const baseIsStore0 = store0 === baseStore;
    const baseIsStore1 = store1 === baseStore;
    const baseIsStore2 = store2 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        const value1 = baseIsStore1 ? baseValues[index] : store1.get(entity);

        if (value1 === undefined) {
            continue;
        }

        const value2 = baseIsStore2 ? baseValues[index] : store2.get(entity);

        if (value2 === undefined) {
            continue;
        }

        yield [entity, value0, value1, value2] as unknown as QueryRow<readonly AnyComponentType[]>;
    }
}

function* iterateRequired3Filtered(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<readonly AnyComponentType[]>> {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const store1 = plan.stores[1]!;
    const store2 = plan.stores[2]!;
    const baseIsStore0 = store0 === baseStore;
    const baseIsStore1 = store1 === baseStore;
    const baseIsStore2 = store2 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        const value1 = baseIsStore1 ? baseValues[index] : store1.get(entity);

        if (value1 === undefined) {
            continue;
        }

        const value2 = baseIsStore2 ? baseValues[index] : store2.get(entity);

        if (value2 === undefined) {
            continue;
        }

        yield [entity, value0, value1, value2] as unknown as QueryRow<readonly AnyComponentType[]>;
    }
}

function* iterateRequiredGeneric(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<readonly AnyComponentType[]>> {
    void changeDetection;
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const components: unknown[] = new Array(plan.stores.length);

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!fillComponents(entity, plan.stores, components, baseStore, baseValues[index])) {
            continue;
        }

        yield [entity, ...components] as unknown as QueryRow<readonly AnyComponentType[]>;
    }
}

function* iterateRequiredGenericFiltered(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<readonly AnyComponentType[]>> {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const components: unknown[] = new Array(plan.stores.length);

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        if (!fillComponents(entity, plan.stores, components, baseStore, baseValues[index])) {
            continue;
        }

        yield [entity, ...components] as unknown as QueryRow<readonly AnyComponentType[]>;
    }
}

function eachRequired1(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    void changeDetection;
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const baseIsStore0 = store0 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        visitor(entity, value0);
    }
}

function eachRequired1Filtered(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const baseIsStore0 = store0 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        visitor(entity, value0);
    }
}

function eachRequired2(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    void changeDetection;
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const store1 = plan.stores[1]!;
    const baseIsStore0 = store0 === baseStore;
    const baseIsStore1 = store1 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        const value1 = baseIsStore1 ? baseValues[index] : store1.get(entity);

        if (value1 === undefined) {
            continue;
        }

        visitor(entity, value0, value1);
    }
}

function eachRequired2Filtered(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const store1 = plan.stores[1]!;
    const baseIsStore0 = store0 === baseStore;
    const baseIsStore1 = store1 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        const value1 = baseIsStore1 ? baseValues[index] : store1.get(entity);

        if (value1 === undefined) {
            continue;
        }

        visitor(entity, value0, value1);
    }
}

function eachRequired3(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    void changeDetection;
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const store1 = plan.stores[1]!;
    const store2 = plan.stores[2]!;
    const baseIsStore0 = store0 === baseStore;
    const baseIsStore1 = store1 === baseStore;
    const baseIsStore2 = store2 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        const value1 = baseIsStore1 ? baseValues[index] : store1.get(entity);

        if (value1 === undefined) {
            continue;
        }

        const value2 = baseIsStore2 ? baseValues[index] : store2.get(entity);

        if (value2 === undefined) {
            continue;
        }

        visitor(entity, value0, value1, value2);
    }
}

function eachRequired3Filtered(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const store1 = plan.stores[1]!;
    const store2 = plan.stores[2]!;
    const baseIsStore0 = store0 === baseStore;
    const baseIsStore1 = store1 === baseStore;
    const baseIsStore2 = store2 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        const value1 = baseIsStore1 ? baseValues[index] : store1.get(entity);

        if (value1 === undefined) {
            continue;
        }

        const value2 = baseIsStore2 ? baseValues[index] : store2.get(entity);

        if (value2 === undefined) {
            continue;
        }

        visitor(entity, value0, value1, value2);
    }
}

function eachRequiredGeneric(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    void changeDetection;
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const components: unknown[] = new Array(plan.stores.length);

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!fillComponents(entity, plan.stores, components, baseStore, baseValues[index])) {
            continue;
        }

        visitor(entity, ...components);
    }
}

function eachRequiredGenericFiltered(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const components: unknown[] = new Array(plan.stores.length);

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        if (!fillComponents(entity, plan.stores, components, baseStore, baseValues[index])) {
            continue;
        }

        visitor(entity, ...components);
    }
}

function countRequiredQueryMatches(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    limit: number
): number {
    void changeDetection;
    let matches = 0;
    const baseStore = currentRequiredBaseStore(plan);

    for (const entity of baseStore.entities) {
        if (!hasComponents(entity, plan.stores, baseStore)) {
            continue;
        }

        matches++;

        if (matches >= limit) {
            return matches;
        }
    }

    return matches;
}

function countRequiredQueryMatchesFiltered(
    context: QueryExecutionContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    limit: number
): number {
    let matches = 0;
    const baseStore = currentRequiredBaseStore(plan);

    for (const entity of baseStore.entities) {
        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        if (!hasComponents(entity, plan.stores, baseStore)) {
            continue;
        }

        matches++;

        if (matches >= limit) {
            return matches;
        }
    }

    return matches;
}

function* iterateOptional1x1(
    context: QueryExecutionContext,
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<OptionalQueryRow<readonly AnyComponentType[], readonly AnyComponentType[]>> {
    void changeDetection;
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const requiredStore0 = plan.requiredStores[0]!;
    const optionalStore0 = plan.optionalStores[0];
    const baseIsRequiredStore0 = requiredStore0 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        const requiredValue0 = baseIsRequiredStore0 ? baseValues[index] : requiredStore0.get(entity);

        if (requiredValue0 === undefined) {
            continue;
        }

        yield [
            entity,
            requiredValue0,
            optionalStore0?.get(entity),
        ] as unknown as OptionalQueryRow<readonly AnyComponentType[], readonly AnyComponentType[]>;
    }
}

function* iterateOptional1x1Filtered(
    context: QueryExecutionContext,
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<OptionalQueryRow<readonly AnyComponentType[], readonly AnyComponentType[]>> {
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const requiredStore0 = plan.requiredStores[0]!;
    const optionalStore0 = plan.optionalStores[0];
    const baseIsRequiredStore0 = requiredStore0 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        const requiredValue0 = baseIsRequiredStore0 ? baseValues[index] : requiredStore0.get(entity);

        if (requiredValue0 === undefined) {
            continue;
        }

        yield [
            entity,
            requiredValue0,
            optionalStore0?.get(entity),
        ] as unknown as OptionalQueryRow<readonly AnyComponentType[], readonly AnyComponentType[]>;
    }
}

function* iterateOptionalGeneric(
    context: QueryExecutionContext,
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<OptionalQueryRow<readonly AnyComponentType[], readonly AnyComponentType[]>> {
    void changeDetection;
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const components: unknown[] = new Array(plan.requiredStores.length + plan.optionalStores.length);

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (
            !fillComponents(
                entity,
                plan.requiredStores,
                components,
                baseStore,
                baseValues[index]
            )
        ) {
            continue;
        }

        fillOptionalComponents(entity, plan.optionalStores, components, plan.requiredStores.length);

        yield [entity, ...components] as unknown as OptionalQueryRow<
            readonly AnyComponentType[],
            readonly AnyComponentType[]
        >;
    }
}

function* iterateOptionalGenericFiltered(
    context: QueryExecutionContext,
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<OptionalQueryRow<readonly AnyComponentType[], readonly AnyComponentType[]>> {
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const components: unknown[] = new Array(plan.requiredStores.length + plan.optionalStores.length);

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        if (
            !fillComponents(
                entity,
                plan.requiredStores,
                components,
                baseStore,
                baseValues[index]
            )
        ) {
            continue;
        }

        fillOptionalComponents(entity, plan.optionalStores, components, plan.requiredStores.length);

        yield [entity, ...components] as unknown as OptionalQueryRow<
            readonly AnyComponentType[],
            readonly AnyComponentType[]
        >;
    }
}

function eachOptional1x1(
    context: QueryExecutionContext,
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    void changeDetection;
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const requiredStore0 = plan.requiredStores[0]!;
    const optionalStore0 = plan.optionalStores[0];
    const baseIsRequiredStore0 = requiredStore0 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        const requiredValue0 = baseIsRequiredStore0 ? baseValues[index] : requiredStore0.get(entity);

        if (requiredValue0 === undefined) {
            continue;
        }

        visitor(entity, requiredValue0, optionalStore0?.get(entity));
    }
}

function eachOptional1x1Filtered(
    context: QueryExecutionContext,
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const requiredStore0 = plan.requiredStores[0]!;
    const optionalStore0 = plan.optionalStores[0];
    const baseIsRequiredStore0 = requiredStore0 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        const requiredValue0 = baseIsRequiredStore0 ? baseValues[index] : requiredStore0.get(entity);

        if (requiredValue0 === undefined) {
            continue;
        }

        visitor(entity, requiredValue0, optionalStore0?.get(entity));
    }
}

function eachOptionalGeneric(
    context: QueryExecutionContext,
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    void changeDetection;
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const components: unknown[] = new Array(plan.requiredStores.length + plan.optionalStores.length);

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (
            !fillComponents(
                entity,
                plan.requiredStores,
                components,
                baseStore,
                baseValues[index]
            )
        ) {
            continue;
        }

        fillOptionalComponents(entity, plan.optionalStores, components, plan.requiredStores.length);
        visitor(entity, ...components);
    }
}

function eachOptionalGenericFiltered(
    context: QueryExecutionContext,
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const components: unknown[] = new Array(plan.requiredStores.length + plan.optionalStores.length);

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        if (
            !fillComponents(
                entity,
                plan.requiredStores,
                components,
                baseStore,
                baseValues[index]
            )
        ) {
            continue;
        }

        fillOptionalComponents(entity, plan.optionalStores, components, plan.requiredStores.length);
        visitor(entity, ...components);
    }
}

function countOptionalQueryMatches(
    context: QueryExecutionContext,
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange,
    limit: number
): number {
    void changeDetection;
    let matches = 0;
    const baseStore = currentOptionalBaseStore(plan);

    for (const entity of baseStore.entities) {
        if (!hasComponents(entity, plan.requiredStores, baseStore)) {
            continue;
        }

        matches++;

        if (matches >= limit) {
            return matches;
        }
    }

    return matches;
}

function countOptionalQueryMatchesFiltered(
    context: QueryExecutionContext,
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange,
    limit: number
): number {
    let matches = 0;
    const baseStore = currentOptionalBaseStore(plan);

    for (const entity of baseStore.entities) {
        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        if (!hasComponents(entity, plan.requiredStores, baseStore)) {
            continue;
        }

        matches++;

        if (matches >= limit) {
            return matches;
        }
    }

    return matches;
}

function currentRequiredBaseStore(plan: ResolvedQueryPlan): SparseSet<unknown> {
    return chooseSmallestStore(plan.stores, plan.filterStores.with);
}

function currentOptionalBaseStore(plan: ResolvedOptionalQueryPlan): SparseSet<unknown> {
    return chooseSmallestStore(plan.requiredStores, plan.filterStores.with);
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
