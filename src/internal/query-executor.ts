import type { AnyComponentType } from "../component";
import type { Entity } from "../entity";
import type {
    ChangeDetectionRange,
    ComponentTuple,
    OptionalComponentTuple,
    OptionalQueryRow,
    OptionalQueryState,
    QueryFilter,
    QueryRow,
    QueryState,
} from "../query";
import { chooseSmallestStore } from "../query";
import { fillComponents, fillOptionalComponents, hasComponents } from "./query-components";
import { matchesPlanFilter } from "./query-filter";
import {
    ResolvedOptionalQueryPlan,
    ResolvedQueryPlan,
    resolveOptionalQueryPlan,
    resolveOptionalQueryStateCache,
    resolveQueryPlan,
    resolveQueryStateCache,
    type QueryPlanContext,
} from "./query-plan";

/** Inputs needed to execute resolved query plans. */
export interface QueryExecutorContext {
    readonly planContext: QueryPlanContext;
    readonly isAlive: (entity: Entity) => boolean;
}

type QueryVisitor<TComponents extends readonly AnyComponentType[]> = (
    entity: Entity,
    ...components: ComponentTuple<TComponents>
) => void;

type OptionalQueryVisitor<
    TRequiredComponents extends readonly AnyComponentType[],
    TOptionalComponents extends readonly AnyComponentType[],
> = (
    entity: Entity,
    ...components: [
        ...ComponentTuple<TRequiredComponents>,
        ...OptionalComponentTuple<TOptionalComponents>,
    ]
) => void;

/** Iterates a direct required-component query. */
export function query<const TComponents extends readonly AnyComponentType[]>(
    context: QueryExecutorContext,
    types: TComponents,
    filter: QueryFilter,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<TComponents>> {
    return iterateResolvedQuery(
        context,
        resolveQueryPlan(context.planContext, types, filter),
        changeDetection
    );
}

/** Iterates a direct query with required and optional component sections. */
export function queryOptional<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryExecutorContext,
    required: TRequiredComponents,
    optional: TOptionalComponents,
    filter: QueryFilter,
    changeDetection: ChangeDetectionRange
): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
    return iterateResolvedOptionalQuery(
        context,
        resolveOptionalQueryPlan(context.planContext, required, optional, filter),
        changeDetection
    );
}

/** Iterates a cached required-component query. */
export function queryWithState<const TComponents extends readonly AnyComponentType[]>(
    context: QueryExecutorContext,
    state: QueryState<TComponents>,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<TComponents>> {
    return iterateResolvedQuery(
        context,
        resolveQueryStateCache(context.planContext, state),
        changeDetection
    );
}

/** Iterates a cached optional query. */
export function queryOptionalWithState<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryExecutorContext,
    state: OptionalQueryState<TRequiredComponents, TOptionalComponents>,
    changeDetection: ChangeDetectionRange
): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
    return iterateResolvedOptionalQuery(
        context,
        resolveOptionalQueryStateCache(context.planContext, state),
        changeDetection
    );
}

/** Returns whether a cached query matches at least one entity. */
export function matchesAnyWithState<const TComponents extends readonly AnyComponentType[]>(
    context: QueryExecutorContext,
    state: QueryState<TComponents>,
    changeDetection: ChangeDetectionRange
): boolean {
    const plan = resolveQueryStateCache(context.planContext, state);

    if (plan === undefined) {
        return false;
    }

    return countResolvedQueryMatches(context, plan, changeDetection, 1) === 1;
}

/** Returns whether a cached query matches exactly one entity. */
export function matchesSingleWithState<const TComponents extends readonly AnyComponentType[]>(
    context: QueryExecutorContext,
    state: QueryState<TComponents>,
    changeDetection: ChangeDetectionRange
): boolean {
    const plan = resolveQueryStateCache(context.planContext, state);

    if (plan === undefined) {
        return false;
    }

    return countResolvedQueryMatches(context, plan, changeDetection, 2) === 1;
}

/** Returns whether a cached optional query matches at least one entity. */
export function matchesAnyOptionalWithState<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryExecutorContext,
    state: OptionalQueryState<TRequiredComponents, TOptionalComponents>,
    changeDetection: ChangeDetectionRange
): boolean {
    const plan = resolveOptionalQueryStateCache(context.planContext, state);

    if (plan === undefined) {
        return false;
    }

    return countResolvedOptionalQueryMatches(context, plan, changeDetection, 1) === 1;
}

/** Returns whether a cached optional query matches exactly one entity. */
export function matchesSingleOptionalWithState<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryExecutorContext,
    state: OptionalQueryState<TRequiredComponents, TOptionalComponents>,
    changeDetection: ChangeDetectionRange
): boolean {
    const plan = resolveOptionalQueryStateCache(context.planContext, state);

    if (plan === undefined) {
        return false;
    }

    return countResolvedOptionalQueryMatches(context, plan, changeDetection, 2) === 1;
}

/** Visits every row of a direct required-component query. */
export function each<const TComponents extends readonly AnyComponentType[]>(
    context: QueryExecutorContext,
    types: TComponents,
    filter: QueryFilter,
    changeDetection: ChangeDetectionRange,
    visitor: QueryVisitor<TComponents>
): void {
    eachResolvedQuery(
        context,
        resolveQueryPlan(context.planContext, types, filter),
        changeDetection,
        visitor
    );
}

/** Visits every row of a direct optional query. */
export function eachOptional<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryExecutorContext,
    required: TRequiredComponents,
    optional: TOptionalComponents,
    filter: QueryFilter,
    changeDetection: ChangeDetectionRange,
    visitor: OptionalQueryVisitor<TRequiredComponents, TOptionalComponents>
): void {
    eachResolvedOptionalQuery(
        context,
        resolveOptionalQueryPlan(context.planContext, required, optional, filter),
        changeDetection,
        visitor
    );
}

/** Visits every row of a cached required-component query. */
export function eachWithState<const TComponents extends readonly AnyComponentType[]>(
    context: QueryExecutorContext,
    state: QueryState<TComponents>,
    changeDetection: ChangeDetectionRange,
    visitor: QueryVisitor<TComponents>
): void {
    eachResolvedQuery(
        context,
        resolveQueryStateCache(context.planContext, state),
        changeDetection,
        visitor
    );
}

/** Visits every row of a cached optional query. */
export function eachOptionalWithState<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryExecutorContext,
    state: OptionalQueryState<TRequiredComponents, TOptionalComponents>,
    changeDetection: ChangeDetectionRange,
    visitor: OptionalQueryVisitor<TRequiredComponents, TOptionalComponents>
): void {
    eachResolvedOptionalQuery(
        context,
        resolveOptionalQueryStateCache(context.planContext, state),
        changeDetection,
        visitor
    );
}

function* iterateResolvedQuery<const TComponents extends readonly AnyComponentType[]>(
    context: QueryExecutorContext,
    plan: ResolvedQueryPlan | undefined,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<TComponents>> {
    if (plan === undefined) {
        return;
    }

    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const hasFilter = plan.filterMode !== "unfiltered";

    // Keep common arities branchless for callers by yielding rows directly.
    // Specialize the hottest small-arity cases so iteration avoids temporary arrays/spreads.
    if (plan.stores.length === 1) {
        const store0 = plan.stores[0]!;
        const baseIsStore0 = store0 === baseStore;

        for (let index = 0; index < baseEntities.length; index++) {
            const entity = baseEntities[index]!;

            if (!context.isAlive(entity)) {
                continue;
            }

            if (hasFilter && !matchesPlanFilter(entity, plan, changeDetection, baseStore)) {
                continue;
            }

            const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

            if (value0 === undefined) {
                continue;
            }

            yield [entity, value0] as unknown as QueryRow<TComponents>;
        }

        return;
    }

    if (plan.stores.length === 2) {
        const store0 = plan.stores[0]!;
        const store1 = plan.stores[1]!;
        const baseIsStore0 = store0 === baseStore;
        const baseIsStore1 = store1 === baseStore;

        for (let index = 0; index < baseEntities.length; index++) {
            const entity = baseEntities[index]!;

            if (!context.isAlive(entity)) {
                continue;
            }

            if (hasFilter && !matchesPlanFilter(entity, plan, changeDetection, baseStore)) {
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

            yield [entity, value0, value1] as unknown as QueryRow<TComponents>;
        }

        return;
    }

    if (plan.stores.length === 3) {
        const store0 = plan.stores[0]!;
        const store1 = plan.stores[1]!;
        const store2 = plan.stores[2]!;
        const baseIsStore0 = store0 === baseStore;
        const baseIsStore1 = store1 === baseStore;
        const baseIsStore2 = store2 === baseStore;

        for (let index = 0; index < baseEntities.length; index++) {
            const entity = baseEntities[index]!;

            if (!context.isAlive(entity)) {
                continue;
            }

            if (hasFilter && !matchesPlanFilter(entity, plan, changeDetection, baseStore)) {
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

            yield [entity, value0, value1, value2] as unknown as QueryRow<TComponents>;
        }

        return;
    }

    const components: unknown[] = new Array(plan.stores.length);

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!context.isAlive(entity)) {
            continue;
        }

        if (hasFilter && !matchesPlanFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        if (!fillComponents(entity, plan.stores, components, baseStore, baseValues[index])) {
            continue;
        }

        yield [entity, ...components] as unknown as QueryRow<TComponents>;
    }
}

function eachResolvedQuery<const TComponents extends readonly AnyComponentType[]>(
    context: QueryExecutorContext,
    plan: ResolvedQueryPlan | undefined,
    changeDetection: ChangeDetectionRange,
    visitor: QueryVisitor<TComponents>
): void {
    if (plan === undefined) {
        return;
    }

    const callVisitor = visitor as (entity: Entity, ...components: unknown[]) => void;
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const hasFilter = plan.filterMode !== "unfiltered";

    // Match the iterator fast paths so `each()` stays allocation-free in common cases.
    // Mirror iterateResolvedQuery fast paths so each() can call the visitor directly.
    if (plan.stores.length === 1) {
        const store0 = plan.stores[0]!;
        const baseIsStore0 = store0 === baseStore;

        for (let index = 0; index < baseEntities.length; index++) {
            const entity = baseEntities[index]!;

            if (!context.isAlive(entity)) {
                continue;
            }

            if (hasFilter && !matchesPlanFilter(entity, plan, changeDetection, baseStore)) {
                continue;
            }

            const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

            if (value0 === undefined) {
                continue;
            }

            callVisitor(entity, value0);
        }

        return;
    }

    if (plan.stores.length === 2) {
        const store0 = plan.stores[0]!;
        const store1 = plan.stores[1]!;
        const baseIsStore0 = store0 === baseStore;
        const baseIsStore1 = store1 === baseStore;

        for (let index = 0; index < baseEntities.length; index++) {
            const entity = baseEntities[index]!;

            if (!context.isAlive(entity)) {
                continue;
            }

            if (hasFilter && !matchesPlanFilter(entity, plan, changeDetection, baseStore)) {
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

            callVisitor(entity, value0, value1);
        }

        return;
    }

    if (plan.stores.length === 3) {
        const store0 = plan.stores[0]!;
        const store1 = plan.stores[1]!;
        const store2 = plan.stores[2]!;
        const baseIsStore0 = store0 === baseStore;
        const baseIsStore1 = store1 === baseStore;
        const baseIsStore2 = store2 === baseStore;

        for (let index = 0; index < baseEntities.length; index++) {
            const entity = baseEntities[index]!;

            if (!context.isAlive(entity)) {
                continue;
            }

            if (hasFilter && !matchesPlanFilter(entity, plan, changeDetection, baseStore)) {
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

            callVisitor(entity, value0, value1, value2);
        }

        return;
    }

    const components: unknown[] = new Array(plan.stores.length);

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!context.isAlive(entity)) {
            continue;
        }

        if (hasFilter && !matchesPlanFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        if (!fillComponents(entity, plan.stores, components, baseStore, baseValues[index])) {
            continue;
        }

        visitor(entity, ...(components as ComponentTuple<TComponents>));
    }
}

function countResolvedQueryMatches(
    context: QueryExecutorContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    limit: number
): number {
    let matches = 0;
    const baseStore = currentRequiredBaseStore(plan);
    const hasFilter = plan.filterMode !== "unfiltered";

    for (const entity of baseStore.entities) {
        if (!context.isAlive(entity)) {
            continue;
        }

        if (hasFilter && !matchesPlanFilter(entity, plan, changeDetection, baseStore)) {
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

/** Iterates a resolved optional query, filling required values before optional trailing values. */
function* iterateResolvedOptionalQuery<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryExecutorContext,
    plan: ResolvedOptionalQueryPlan | undefined,
    changeDetection: ChangeDetectionRange
): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
    if (plan === undefined) {
        return;
    }

    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const hasFilter = plan.filterMode !== "unfiltered";

    if (plan.requiredStores.length === 1 && plan.optionalStores.length === 1) {
        const requiredStore0 = plan.requiredStores[0]!;
        const optionalStore0 = plan.optionalStores[0];
        const baseIsRequiredStore0 = requiredStore0 === baseStore;

        for (let index = 0; index < baseEntities.length; index++) {
            const entity = baseEntities[index]!;

            if (!context.isAlive(entity)) {
                continue;
            }

            if (hasFilter && !matchesPlanFilter(entity, plan, changeDetection, baseStore)) {
                continue;
            }

            const requiredValue0 = baseIsRequiredStore0
                ? baseValues[index]
                : requiredStore0.get(entity);

            if (requiredValue0 === undefined) {
                continue;
            }

            yield [
                entity,
                requiredValue0,
                optionalStore0?.get(entity),
            ] as unknown as OptionalQueryRow<TRequiredComponents, TOptionalComponents>;
        }

        return;
    }

    const components: unknown[] = new Array(
        plan.requiredStores.length + plan.optionalStores.length
    );

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!context.isAlive(entity)) {
            continue;
        }

        if (hasFilter && !matchesPlanFilter(entity, plan, changeDetection, baseStore)) {
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
            TRequiredComponents,
            TOptionalComponents
        >;
    }
}

/** Visits a resolved optional query using the same fast paths as the iterator version. */
function eachResolvedOptionalQuery<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryExecutorContext,
    plan: ResolvedOptionalQueryPlan | undefined,
    changeDetection: ChangeDetectionRange,
    visitor: OptionalQueryVisitor<TRequiredComponents, TOptionalComponents>
): void {
    if (plan === undefined) {
        return;
    }

    const callVisitor = visitor as (entity: Entity, ...components: unknown[]) => void;
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const hasFilter = plan.filterMode !== "unfiltered";

    if (plan.requiredStores.length === 1 && plan.optionalStores.length === 1) {
        const requiredStore0 = plan.requiredStores[0]!;
        const optionalStore0 = plan.optionalStores[0];
        const baseIsRequiredStore0 = requiredStore0 === baseStore;

        for (let index = 0; index < baseEntities.length; index++) {
            const entity = baseEntities[index]!;

            if (!context.isAlive(entity)) {
                continue;
            }

            if (hasFilter && !matchesPlanFilter(entity, plan, changeDetection, baseStore)) {
                continue;
            }

            const requiredValue0 = baseIsRequiredStore0
                ? baseValues[index]
                : requiredStore0.get(entity);

            if (requiredValue0 === undefined) {
                continue;
            }

            callVisitor(entity, requiredValue0, optionalStore0?.get(entity));
        }

        return;
    }

    const components: unknown[] = new Array(
        plan.requiredStores.length + plan.optionalStores.length
    );

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!context.isAlive(entity)) {
            continue;
        }

        if (hasFilter && !matchesPlanFilter(entity, plan, changeDetection, baseStore)) {
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

        visitor(
            entity,
            ...(components as [
                ...ComponentTuple<TRequiredComponents>,
                ...OptionalComponentTuple<TOptionalComponents>,
            ])
        );
    }
}

function countResolvedOptionalQueryMatches(
    context: QueryExecutorContext,
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange,
    limit: number
): number {
    let matches = 0;
    const baseStore = currentOptionalBaseStore(plan);
    const hasFilter = plan.filterMode !== "unfiltered";

    for (const entity of baseStore.entities) {
        if (!context.isAlive(entity)) {
            continue;
        }

        if (hasFilter && !matchesPlanFilter(entity, plan, changeDetection, baseStore)) {
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

function currentRequiredBaseStore(plan: ResolvedQueryPlan) {
    return chooseSmallestStore(plan.stores, plan.filterStores.with);
}

function currentOptionalBaseStore(plan: ResolvedOptionalQueryPlan) {
    return chooseSmallestStore(plan.requiredStores, plan.filterStores.with);
}
