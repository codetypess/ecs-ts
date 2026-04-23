import type { AnyComponentType } from "../component.js";
import type { Entity } from "../entity.js";
import type {
    ChangeDetectionRange,
    ComponentTuple,
    OptionalComponentTuple,
    OptionalQueryRow,
    OptionalQueryState,
    QueryFilter,
    QueryRow,
    QueryState,
} from "../query.js";
import { optionalQueryState, queryState } from "../query.js";
import type { QueryExecutorContext } from "./query-executor.js";
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
} from "./query-executor.js";

/** Shared public query API for world instances. */
export abstract class WorldQueryMethods {
    protected abstract readonly queryContext: QueryExecutorContext;
    protected abstract changeDetectionRange(): ChangeDetectionRange;

    /** Iterates entities that contain all requested component types. */
    query<const TComponents extends readonly AnyComponentType[]>(
        ...types: TComponents
    ): IterableIterator<QueryRow<TComponents>> {
        return runQuery(this.queryContext, types, {}, this.changeDetectionRange());
    }

    /** Iterates entities that match the requested components plus an explicit filter. */
    queryWhere<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter
    ): IterableIterator<QueryRow<TComponents>> {
        return runQuery(this.queryContext, types, filter, this.changeDetectionRange());
    }

    /** Iterates entities where at least one requested component was newly added. */
    queryAdded<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents
    ): IterableIterator<QueryRow<TComponents>> {
        return runQuery(this.queryContext, types, { added: types }, this.changeDetectionRange());
    }

    /** Iterates entities where at least one requested component changed recently. */
    queryChanged<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents
    ): IterableIterator<QueryRow<TComponents>> {
        return runQuery(this.queryContext, types, { changed: types }, this.changeDetectionRange());
    }

    /** Iterates queries with required and optional component sections. */
    queryOptional<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        required: TRequiredComponents,
        optional: TOptionalComponents,
        filter: QueryFilter = {}
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        return runOptionalQuery(
            this.queryContext,
            required,
            optional,
            filter,
            this.changeDetectionRange()
        );
    }

    /** Creates a reusable query definition that can cache store resolution across runs. */
    queryState<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter = {}
    ): QueryState<TComponents> {
        return queryState(types, filter);
    }

    /** Creates a reusable optional-query definition with cached store resolution. */
    optionalQueryState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        required: TRequiredComponents,
        optional: TOptionalComponents,
        filter: QueryFilter = {}
    ): OptionalQueryState<TRequiredComponents, TOptionalComponents> {
        return optionalQueryState(required, optional, filter);
    }

    /** Executes a cached required-component query. */
    queryWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): IterableIterator<QueryRow<TComponents>> {
        return runQueryWithState(this.queryContext, state, this.changeDetectionRange());
    }

    /** Returns `true` when a cached query matches at least one entity. */
    matchesAnyWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): boolean {
        return matchesAnyQueryWithState(this.queryContext, state, this.changeDetectionRange());
    }

    /** Returns `true` when a cached query matches no entities. */
    matchesNoneWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): boolean {
        return !this.matchesAnyWithState(state);
    }

    /** Returns `true` when a cached query matches exactly one entity. */
    matchesSingleWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): boolean {
        return matchesSingleQueryWithState(this.queryContext, state, this.changeDetectionRange());
    }

    /** Executes a cached optional query. */
    queryOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        state: OptionalQueryState<TRequiredComponents, TOptionalComponents>
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        return runOptionalQueryWithState(this.queryContext, state, this.changeDetectionRange());
    }

    /** Returns `true` when a cached optional query matches at least one entity. */
    matchesAnyOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(state: OptionalQueryState<TRequiredComponents, TOptionalComponents>): boolean {
        return matchesAnyOptionalQueryWithState(
            this.queryContext,
            state,
            this.changeDetectionRange()
        );
    }

    /** Returns `true` when a cached optional query matches no entities. */
    matchesNoneOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(state: OptionalQueryState<TRequiredComponents, TOptionalComponents>): boolean {
        return !this.matchesAnyOptionalWithState(state);
    }

    /** Returns `true` when a cached optional query matches exactly one entity. */
    matchesSingleOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(state: OptionalQueryState<TRequiredComponents, TOptionalComponents>): boolean {
        return matchesSingleOptionalQueryWithState(
            this.queryContext,
            state,
            this.changeDetectionRange()
        );
    }

    /** Visits each row from a cached required-component query. */
    eachWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        eachQueryWithState(this.queryContext, state, this.changeDetectionRange(), visitor);
    }

    /** Visits each row from a cached optional query. */
    eachOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        state: OptionalQueryState<TRequiredComponents, TOptionalComponents>,
        visitor: (
            entity: Entity,
            ...components: [
                ...ComponentTuple<TRequiredComponents>,
                ...OptionalComponentTuple<TOptionalComponents>,
            ]
        ) => void
    ): void {
        eachOptionalQueryWithState(this.queryContext, state, this.changeDetectionRange(), visitor);
    }

    /** Returns the only matching row, or `undefined` when there are no matches. */
    trySingle<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter = {}
    ): QueryRow<TComponents> | undefined {
        const iterator = this.queryWhere(types, filter);
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

    /** Returns the only matching row and throws unless there is exactly one. */
    single<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter = {}
    ): QueryRow<TComponents> {
        const row = this.trySingle(types, filter);

        if (row === undefined) {
            throw new Error("Expected exactly one query result");
        }

        return row;
    }

    /** Visits every entity that has all requested component types. */
    each<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        eachQuery(this.queryContext, types, {}, this.changeDetectionRange(), visitor);
    }

    /** Visits every entity that matches the given components plus filter. */
    eachWhere<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        eachQuery(this.queryContext, types, filter, this.changeDetectionRange(), visitor);
    }

    /** Visits entities where at least one requested component was added recently. */
    eachAdded<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        eachQuery(this.queryContext, types, { added: types }, this.changeDetectionRange(), visitor);
    }

    /** Visits entities where at least one requested component changed recently. */
    eachChanged<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        eachQuery(
            this.queryContext,
            types,
            { changed: types },
            this.changeDetectionRange(),
            visitor
        );
    }

    /** Visits required-plus-optional query rows without allocating a query state object. */
    eachOptional<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
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
            this.queryContext,
            required,
            optional,
            filter,
            this.changeDetectionRange(),
            visitor
        );
    }
}
