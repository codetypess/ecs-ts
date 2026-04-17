import type { AnyComponentType } from "../component";
import type { Entity } from "../entity";
import type {
    ComponentTuple,
    OptionalComponentTuple,
    OptionalQueryRow,
    OptionalQueryState,
    QueryFilter,
    QueryRow,
    QueryState,
} from "../query";
import { currentChangeDetectionRange, type WorldRuntime } from "./world-runtime";
import {
    each as eachQuery,
    eachOptional as eachOptionalQuery,
    eachOptionalWithState as eachOptionalQueryWithState,
    eachWithState as eachQueryWithState,
    matchesAnyOptionalWithState as matchesAnyOptionalQueryWithState,
    matchesAnyWithState as matchesAnyQueryWithState,
    matchesSingleOptionalWithState as matchesSingleOptionalQueryWithState,
    matchesSingleWithState as matchesSingleQueryWithState,
    query as runQuery,
    queryOptional as runOptionalQuery,
    queryOptionalWithState as runOptionalQueryWithState,
    queryWithState as runQueryWithState,
} from "./query-executor";

/** Runs a direct required-component query. */
export function query<const TComponents extends readonly AnyComponentType[]>(
    runtime: WorldRuntime,
    types: TComponents
): IterableIterator<QueryRow<TComponents>> {
    return runQuery(runtime.queryContext, types, {}, currentChangeDetectionRange(runtime));
}

/** Runs a direct filtered required-component query. */
export function queryWhere<const TComponents extends readonly AnyComponentType[]>(
    runtime: WorldRuntime,
    types: TComponents,
    filter: QueryFilter
): IterableIterator<QueryRow<TComponents>> {
    return runQuery(runtime.queryContext, types, filter, currentChangeDetectionRange(runtime));
}

/** Runs a direct query filtered by component addition. */
export function queryAdded<const TComponents extends readonly AnyComponentType[]>(
    runtime: WorldRuntime,
    types: TComponents
): IterableIterator<QueryRow<TComponents>> {
    return runQuery(
        runtime.queryContext,
        types,
        { added: types },
        currentChangeDetectionRange(runtime)
    );
}

/** Runs a direct query filtered by component changes. */
export function queryChanged<const TComponents extends readonly AnyComponentType[]>(
    runtime: WorldRuntime,
    types: TComponents
): IterableIterator<QueryRow<TComponents>> {
    return runQuery(
        runtime.queryContext,
        types,
        { changed: types },
        currentChangeDetectionRange(runtime)
    );
}

/** Runs a direct query with required and optional component sections. */
export function queryOptional<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    runtime: WorldRuntime,
    required: TRequiredComponents,
    optional: TOptionalComponents,
    filter: QueryFilter = {}
): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
    return runOptionalQuery(
        runtime.queryContext,
        required,
        optional,
        filter,
        currentChangeDetectionRange(runtime)
    );
}

/** Runs a cached required-component query. */
export function queryWithState<const TComponents extends readonly AnyComponentType[]>(
    runtime: WorldRuntime,
    state: QueryState<TComponents>
): IterableIterator<QueryRow<TComponents>> {
    return runQueryWithState(runtime.queryContext, state, currentChangeDetectionRange(runtime));
}

/** Returns whether a cached required-component query matches at least one entity. */
export function matchesAnyWithState<const TComponents extends readonly AnyComponentType[]>(
    runtime: WorldRuntime,
    state: QueryState<TComponents>
): boolean {
    return matchesAnyQueryWithState(
        runtime.queryContext,
        state,
        currentChangeDetectionRange(runtime)
    );
}

/** Returns whether a cached required-component query matches exactly one entity. */
export function matchesSingleWithState<const TComponents extends readonly AnyComponentType[]>(
    runtime: WorldRuntime,
    state: QueryState<TComponents>
): boolean {
    return matchesSingleQueryWithState(
        runtime.queryContext,
        state,
        currentChangeDetectionRange(runtime)
    );
}

/** Runs a cached optional query. */
export function queryOptionalWithState<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    runtime: WorldRuntime,
    state: OptionalQueryState<TRequiredComponents, TOptionalComponents>
): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
    return runOptionalQueryWithState(
        runtime.queryContext,
        state,
        currentChangeDetectionRange(runtime)
    );
}

/** Returns whether a cached optional query matches at least one entity. */
export function matchesAnyOptionalWithState<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    runtime: WorldRuntime,
    state: OptionalQueryState<TRequiredComponents, TOptionalComponents>
): boolean {
    return matchesAnyOptionalQueryWithState(
        runtime.queryContext,
        state,
        currentChangeDetectionRange(runtime)
    );
}

/** Returns whether a cached optional query matches exactly one entity. */
export function matchesSingleOptionalWithState<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    runtime: WorldRuntime,
    state: OptionalQueryState<TRequiredComponents, TOptionalComponents>
): boolean {
    return matchesSingleOptionalQueryWithState(
        runtime.queryContext,
        state,
        currentChangeDetectionRange(runtime)
    );
}

/** Visits every row of a cached required-component query. */
export function eachWithState<const TComponents extends readonly AnyComponentType[]>(
    runtime: WorldRuntime,
    state: QueryState<TComponents>,
    visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
): void {
    eachQueryWithState(runtime.queryContext, state, currentChangeDetectionRange(runtime), visitor);
}

/** Visits every row of a cached optional query. */
export function eachOptionalWithState<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    runtime: WorldRuntime,
    state: OptionalQueryState<TRequiredComponents, TOptionalComponents>,
    visitor: (
        entity: Entity,
        ...components: [
            ...ComponentTuple<TRequiredComponents>,
            ...OptionalComponentTuple<TOptionalComponents>,
        ]
    ) => void
): void {
    eachOptionalQueryWithState(
        runtime.queryContext,
        state,
        currentChangeDetectionRange(runtime),
        visitor
    );
}

/** Returns the only matching direct query row, or `undefined` when there are no matches. */
export function trySingle<const TComponents extends readonly AnyComponentType[]>(
    runtime: WorldRuntime,
    types: TComponents,
    filter: QueryFilter = {}
): QueryRow<TComponents> | undefined {
    const iterator = queryWhere(runtime, types, filter);
    const first = iterator.next();

    if (first.done === true) {
        return undefined;
    }

    const second = iterator.next();

    if (second.done !== true) {
        throw new Error("Expected at most one query result");
    }

    return first.value;
}

/** Returns the only matching direct query row and throws unless there is exactly one. */
export function single<const TComponents extends readonly AnyComponentType[]>(
    runtime: WorldRuntime,
    types: TComponents,
    filter: QueryFilter = {}
): QueryRow<TComponents> {
    const row = trySingle(runtime, types, filter);

    if (row === undefined) {
        throw new Error("Expected exactly one query result");
    }

    return row;
}

/** Visits every entity that has all requested component types. */
export function each<const TComponents extends readonly AnyComponentType[]>(
    runtime: WorldRuntime,
    types: TComponents,
    visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
): void {
    eachQuery(runtime.queryContext, types, {}, currentChangeDetectionRange(runtime), visitor);
}

/** Visits every entity that matches the given components plus filter. */
export function eachWhere<const TComponents extends readonly AnyComponentType[]>(
    runtime: WorldRuntime,
    types: TComponents,
    filter: QueryFilter,
    visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
): void {
    eachQuery(runtime.queryContext, types, filter, currentChangeDetectionRange(runtime), visitor);
}

/** Visits entities where at least one requested component was added recently. */
export function eachAdded<const TComponents extends readonly AnyComponentType[]>(
    runtime: WorldRuntime,
    types: TComponents,
    visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
): void {
    eachQuery(
        runtime.queryContext,
        types,
        { added: types },
        currentChangeDetectionRange(runtime),
        visitor
    );
}

/** Visits entities where at least one requested component changed recently. */
export function eachChanged<const TComponents extends readonly AnyComponentType[]>(
    runtime: WorldRuntime,
    types: TComponents,
    visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
): void {
    eachQuery(
        runtime.queryContext,
        types,
        { changed: types },
        currentChangeDetectionRange(runtime),
        visitor
    );
}

/** Visits required-plus-optional query rows without allocating a query state object. */
export function eachOptional<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    runtime: WorldRuntime,
    required: TRequiredComponents,
    optional: TOptionalComponents,
    filter: QueryFilter,
    visitor: (
        entity: Entity,
        ...components: [
            ...ComponentTuple<TRequiredComponents>,
            ...OptionalComponentTuple<TOptionalComponents>,
        ]
    ) => void
): void {
    eachOptionalQuery(
        runtime.queryContext,
        required,
        optional,
        filter,
        currentChangeDetectionRange(runtime),
        visitor
    );
}
