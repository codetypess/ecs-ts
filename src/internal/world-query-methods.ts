import type { AnyComponentType } from "../component.js";
import type { Entity } from "../entity.js";
import type {
    ChangeDetectionRange,
    ComponentTuple,
    OptionalComponentTuple,
    OptionalQueryRow,
    QueryFilter,
    QueryRow,
} from "../query.js";
import type { QueryExecutorContext } from "./query-executor.js";
import { getSingleResult, mustGetSingleResult } from "./query-single.js";
import {
    eachOptional as eachOptionalQuery,
    each as eachQuery,
    queryOptional as runOptionalQuery,
    query as runQuery,
} from "./query-executor.js";

/** Shared public query API for world instances. */
export abstract class WorldQueryMethods {
    protected abstract readonly queryContext: QueryExecutorContext;
    protected abstract changeDetectionRange(): ChangeDetectionRange;

    /** Iterates entities from an explicit component tuple with an optional filter. */
    query<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter = {}
    ): IterableIterator<QueryRow<TComponents>> {
        return runQuery(this.queryContext, types, filter, this.changeDetectionRange());
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

    /** Returns the only matching row, or `undefined` when there are no matches. */
    getSingle<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter = {}
    ): QueryRow<TComponents> | undefined {
        return getSingleResult(this.query(types, filter));
    }

    /** Returns the only matching row and throws unless there is exactly one. */
    mustGetSingle<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter = {}
    ): QueryRow<TComponents> {
        return mustGetSingleResult(this.getSingle(types, filter));
    }

    /** Visits every entity for explicit component tuples with optional filter. */
    each<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void;
    each<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void;
    each<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filterOrVisitor:
            | QueryFilter
            | ((entity: Entity, ...components: ComponentTuple<TComponents>) => void),
        maybeVisitor?: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        const [filter, visitor] =
            typeof filterOrVisitor === "function"
                ? [{}, filterOrVisitor]
                : [filterOrVisitor, maybeVisitor];

        eachQuery(this.queryContext, types, filter, this.changeDetectionRange(), visitor!);
    }

    /** Visits required-plus-optional query rows without allocating a query state object. */
    eachOptional<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        required: TRequiredComponents,
        optional: TOptionalComponents,
        visitor: (
            entity: Entity,
            ...components: [
                ...ComponentTuple<TRequiredComponents>,
                ...OptionalComponentTuple<TOptionalComponents>,
            ]
        ) => void
    ): void;
    eachOptional<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        required: TRequiredComponents,
        optional: TOptionalComponents,
        filterOrVisitor:
            | QueryFilter
            | ((
                  entity: Entity,
                  ...components: [
                      ...ComponentTuple<TRequiredComponents>,
                      ...OptionalComponentTuple<TOptionalComponents>,
                  ]
              ) => void),
        maybeVisitor?: (
            entity: Entity,
            ...components: [
                ...ComponentTuple<TRequiredComponents>,
                ...OptionalComponentTuple<TOptionalComponents>,
            ]
        ) => void
    ): void {
        const [filter, visitor] =
            typeof filterOrVisitor === "function"
                ? [{}, filterOrVisitor]
                : [filterOrVisitor, maybeVisitor];

        eachOptionalQuery(
            this.queryContext,
            required,
            optional,
            filter,
            this.changeDetectionRange(),
            visitor!
        );
    }
}
