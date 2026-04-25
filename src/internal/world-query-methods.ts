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
    trySingle<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter = {}
    ): QueryRow<TComponents> | undefined {
        const iterator = this.query(types, filter);
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
