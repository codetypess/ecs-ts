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
import {
    resolveOptionalQueryPlan,
    resolveOptionalQueryStateCache,
    resolveQueryPlan,
    resolveQueryStateCache,
    type QueryExecutionContext,
    type QueryPlanContext,
    type ResolvedOptionalQueryPlan,
    type ResolvedQueryPlan,
} from "./query-plan";

/** Inputs needed to execute resolved query plans. */
export interface QueryExecutorContext extends QueryExecutionContext {
    readonly planContext: QueryPlanContext;
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

    return plan !== undefined && plan.countMatches(context, plan, changeDetection, 1) === 1;
}

/** Returns whether a cached query matches exactly one entity. */
export function matchesSingleWithState<const TComponents extends readonly AnyComponentType[]>(
    context: QueryExecutorContext,
    state: QueryState<TComponents>,
    changeDetection: ChangeDetectionRange
): boolean {
    const plan = resolveQueryStateCache(context.planContext, state);

    return plan !== undefined && plan.countMatches(context, plan, changeDetection, 2) === 1;
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

    return plan !== undefined && plan.countMatches(context, plan, changeDetection, 1) === 1;
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

    return plan !== undefined && plan.countMatches(context, plan, changeDetection, 2) === 1;
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

function iterateResolvedQuery<const TComponents extends readonly AnyComponentType[]>(
    context: QueryExecutorContext,
    plan: ResolvedQueryPlan | undefined,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<TComponents>> {
    return plan === undefined
        ? emptyQueryIterator<QueryRow<TComponents>>()
        : (plan.iterate(context, plan, changeDetection) as IterableIterator<QueryRow<TComponents>>);
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

    plan.each(
        context,
        plan,
        changeDetection,
        visitor as (entity: Entity, ...components: unknown[]) => void
    );
}

/** Iterates a resolved optional query, filling required values before optional trailing values. */
function iterateResolvedOptionalQuery<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    context: QueryExecutorContext,
    plan: ResolvedOptionalQueryPlan | undefined,
    changeDetection: ChangeDetectionRange
): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
    return plan === undefined
        ? emptyQueryIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>>()
        : (plan.iterate(
              context,
              plan,
              changeDetection
          ) as IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>>);
}

/** Visits a resolved optional query using the same compiled plan strategy as the iterator version. */
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

    plan.each(
        context,
        plan,
        changeDetection,
        visitor as (entity: Entity, ...components: unknown[]) => void
    );
}

function* emptyQueryIterator<TRow>(): IterableIterator<TRow> {}
