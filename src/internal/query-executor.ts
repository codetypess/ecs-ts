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

export interface QueryRuntimeContext {
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

export function query<const TComponents extends readonly AnyComponentType[]>(
    context: QueryRuntimeContext,
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

export function queryOptional<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryRuntimeContext,
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

export function queryWithState<const TComponents extends readonly AnyComponentType[]>(
    context: QueryRuntimeContext,
    state: QueryState<TComponents>,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<TComponents>> {
    return iterateResolvedQuery(
        context,
        resolveQueryStateCache(context.planContext, state),
        changeDetection
    );
}

export function queryOptionalWithState<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryRuntimeContext,
    state: OptionalQueryState<TRequiredComponents, TOptionalComponents>,
    changeDetection: ChangeDetectionRange
): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
    return iterateResolvedOptionalQuery(
        context,
        resolveOptionalQueryStateCache(context.planContext, state),
        changeDetection
    );
}

export function matchesAnyWithState<const TComponents extends readonly AnyComponentType[]>(
    context: QueryRuntimeContext,
    state: QueryState<TComponents>,
    changeDetection: ChangeDetectionRange
): boolean {
    const plan = resolveQueryStateCache(context.planContext, state);

    if (plan === undefined) {
        return false;
    }

    return countResolvedQueryMatches(context, plan, changeDetection, 1) === 1;
}

export function matchesSingleWithState<const TComponents extends readonly AnyComponentType[]>(
    context: QueryRuntimeContext,
    state: QueryState<TComponents>,
    changeDetection: ChangeDetectionRange
): boolean {
    const plan = resolveQueryStateCache(context.planContext, state);

    if (plan === undefined) {
        return false;
    }

    return countResolvedQueryMatches(context, plan, changeDetection, 2) === 1;
}

export function matchesAnyOptionalWithState<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryRuntimeContext,
    state: OptionalQueryState<TRequiredComponents, TOptionalComponents>,
    changeDetection: ChangeDetectionRange
): boolean {
    const plan = resolveOptionalQueryStateCache(context.planContext, state);

    if (plan === undefined) {
        return false;
    }

    return countResolvedOptionalQueryMatches(context, plan, changeDetection, 1) === 1;
}

export function matchesSingleOptionalWithState<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryRuntimeContext,
    state: OptionalQueryState<TRequiredComponents, TOptionalComponents>,
    changeDetection: ChangeDetectionRange
): boolean {
    const plan = resolveOptionalQueryStateCache(context.planContext, state);

    if (plan === undefined) {
        return false;
    }

    return countResolvedOptionalQueryMatches(context, plan, changeDetection, 2) === 1;
}

export function each<const TComponents extends readonly AnyComponentType[]>(
    context: QueryRuntimeContext,
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

export function eachOptional<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryRuntimeContext,
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

export function eachWithState<const TComponents extends readonly AnyComponentType[]>(
    context: QueryRuntimeContext,
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

export function eachOptionalWithState<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryRuntimeContext,
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
    context: QueryRuntimeContext,
    plan: ResolvedQueryPlan | undefined,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<TComponents>> {
    if (plan === undefined) {
        return;
    }

    // Specialize the hottest small-arity cases so iteration avoids temporary arrays/spreads.
    if (plan.stores.length === 1) {
        const store0 = plan.stores[0]!;

        for (const entity of plan.baseStore.entities) {
            if (!context.isAlive(entity)) {
                continue;
            }

            if (!matchesPlanFilter(entity, plan, changeDetection)) {
                continue;
            }

            const value0 = store0.get(entity);

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

        for (const entity of plan.baseStore.entities) {
            if (!context.isAlive(entity)) {
                continue;
            }

            if (!matchesPlanFilter(entity, plan, changeDetection)) {
                continue;
            }

            const value0 = store0.get(entity);

            if (value0 === undefined) {
                continue;
            }

            const value1 = store1.get(entity);

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

        for (const entity of plan.baseStore.entities) {
            if (!context.isAlive(entity)) {
                continue;
            }

            if (!matchesPlanFilter(entity, plan, changeDetection)) {
                continue;
            }

            const value0 = store0.get(entity);

            if (value0 === undefined) {
                continue;
            }

            const value1 = store1.get(entity);

            if (value1 === undefined) {
                continue;
            }

            const value2 = store2.get(entity);

            if (value2 === undefined) {
                continue;
            }

            yield [entity, value0, value1, value2] as unknown as QueryRow<TComponents>;
        }

        return;
    }

    const components: unknown[] = new Array(plan.stores.length);

    for (const entity of plan.baseStore.entities) {
        if (!context.isAlive(entity)) {
            continue;
        }

        if (!matchesPlanFilter(entity, plan, changeDetection)) {
            continue;
        }

        if (!fillComponents(entity, plan.stores, components)) {
            continue;
        }

        yield [entity, ...components] as unknown as QueryRow<TComponents>;
    }
}

function eachResolvedQuery<const TComponents extends readonly AnyComponentType[]>(
    context: QueryRuntimeContext,
    plan: ResolvedQueryPlan | undefined,
    changeDetection: ChangeDetectionRange,
    visitor: QueryVisitor<TComponents>
): void {
    if (plan === undefined) {
        return;
    }

    const callVisitor = visitor as (entity: Entity, ...components: unknown[]) => void;

    // Mirror iterateResolvedQuery fast paths so each() can call the visitor directly.
    if (plan.stores.length === 1) {
        const store0 = plan.stores[0]!;

        for (const entity of plan.baseStore.entities) {
            if (!context.isAlive(entity)) {
                continue;
            }

            if (!matchesPlanFilter(entity, plan, changeDetection)) {
                continue;
            }

            const value0 = store0.get(entity);

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

        for (const entity of plan.baseStore.entities) {
            if (!context.isAlive(entity)) {
                continue;
            }

            if (!matchesPlanFilter(entity, plan, changeDetection)) {
                continue;
            }

            const value0 = store0.get(entity);

            if (value0 === undefined) {
                continue;
            }

            const value1 = store1.get(entity);

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

        for (const entity of plan.baseStore.entities) {
            if (!context.isAlive(entity)) {
                continue;
            }

            if (!matchesPlanFilter(entity, plan, changeDetection)) {
                continue;
            }

            const value0 = store0.get(entity);

            if (value0 === undefined) {
                continue;
            }

            const value1 = store1.get(entity);

            if (value1 === undefined) {
                continue;
            }

            const value2 = store2.get(entity);

            if (value2 === undefined) {
                continue;
            }

            callVisitor(entity, value0, value1, value2);
        }

        return;
    }

    const components: unknown[] = new Array(plan.stores.length);

    for (const entity of plan.baseStore.entities) {
        if (!context.isAlive(entity)) {
            continue;
        }

        if (!matchesPlanFilter(entity, plan, changeDetection)) {
            continue;
        }

        if (!fillComponents(entity, plan.stores, components)) {
            continue;
        }

        visitor(entity, ...(components as ComponentTuple<TComponents>));
    }
}

function countResolvedQueryMatches(
    context: QueryRuntimeContext,
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    limit: number
): number {
    let matches = 0;

    for (const entity of plan.baseStore.entities) {
        if (!context.isAlive(entity)) {
            continue;
        }

        if (!matchesPlanFilter(entity, plan, changeDetection)) {
            continue;
        }

        if (!hasComponents(entity, plan.stores)) {
            continue;
        }

        matches++;

        if (matches >= limit) {
            return matches;
        }
    }

    return matches;
}

function* iterateResolvedOptionalQuery<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryRuntimeContext,
    plan: ResolvedOptionalQueryPlan | undefined,
    changeDetection: ChangeDetectionRange
): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
    if (plan === undefined) {
        return;
    }

    if (plan.requiredStores.length === 1 && plan.optionalStores.length === 1) {
        const requiredStore0 = plan.requiredStores[0]!;
        const optionalStore0 = plan.optionalStores[0];

        for (const entity of plan.baseStore.entities) {
            if (!context.isAlive(entity)) {
                continue;
            }

            if (!matchesPlanFilter(entity, plan, changeDetection)) {
                continue;
            }

            const requiredValue0 = requiredStore0.get(entity);

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

    for (const entity of plan.baseStore.entities) {
        if (!context.isAlive(entity)) {
            continue;
        }

        if (!matchesPlanFilter(entity, plan, changeDetection)) {
            continue;
        }

        if (!fillComponents(entity, plan.requiredStores, components)) {
            continue;
        }

        fillOptionalComponents(entity, plan.optionalStores, components, plan.requiredStores.length);

        yield [entity, ...components] as unknown as OptionalQueryRow<
            TRequiredComponents,
            TOptionalComponents
        >;
    }
}

function eachResolvedOptionalQuery<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryRuntimeContext,
    plan: ResolvedOptionalQueryPlan | undefined,
    changeDetection: ChangeDetectionRange,
    visitor: OptionalQueryVisitor<TRequiredComponents, TOptionalComponents>
): void {
    if (plan === undefined) {
        return;
    }

    const callVisitor = visitor as (entity: Entity, ...components: unknown[]) => void;

    if (plan.requiredStores.length === 1 && plan.optionalStores.length === 1) {
        const requiredStore0 = plan.requiredStores[0]!;
        const optionalStore0 = plan.optionalStores[0];

        for (const entity of plan.baseStore.entities) {
            if (!context.isAlive(entity)) {
                continue;
            }

            if (!matchesPlanFilter(entity, plan, changeDetection)) {
                continue;
            }

            const requiredValue0 = requiredStore0.get(entity);

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

    for (const entity of plan.baseStore.entities) {
        if (!context.isAlive(entity)) {
            continue;
        }

        if (!matchesPlanFilter(entity, plan, changeDetection)) {
            continue;
        }

        if (!fillComponents(entity, plan.requiredStores, components)) {
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
    context: QueryRuntimeContext,
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange,
    limit: number
): number {
    let matches = 0;

    for (const entity of plan.baseStore.entities) {
        if (!context.isAlive(entity)) {
            continue;
        }

        if (!matchesPlanFilter(entity, plan, changeDetection)) {
            continue;
        }

        if (!hasComponents(entity, plan.requiredStores)) {
            continue;
        }

        matches++;

        if (matches >= limit) {
            return matches;
        }
    }

    return matches;
}
