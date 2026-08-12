import type { AnyComponentType, ComponentData } from "./component";
import type { Entity } from "./entity";
import type { EcsContext } from "./internal/ecs-context";
import {
    eachOptionalWithState as eachOptionalQueryWithState,
    eachWithState as eachQueryWithState,
    matchesAnyOptionalWithState as matchesAnyOptionalQueryWithState,
    matchesAnyWithState as matchesAnyQueryWithState,
    matchesSingleOptionalWithState as matchesSingleOptionalQueryWithState,
    matchesSingleWithState as matchesSingleQueryWithState,
    queryOptionalWithState as runOptionalQueryWithState,
    queryWithState as runQueryWithState,
} from "./internal/query-executor";
import { getSingleResult, mustGetSingleResult } from "./internal/query-single";
import type { SparseSet } from "./sparse-set";
import type { World } from "./world";

/** Maps a component-type tuple to the tuple of resolved component payload types. */
export type ComponentTuple<TComponents extends readonly AnyComponentType[]> = {
    [TIndex in keyof TComponents]: ComponentData<TComponents[TIndex]>;
};

/** Maps a component-type tuple to payloads that may be absent. */
export type OptionalComponentTuple<TComponents extends readonly AnyComponentType[]> = {
    [TIndex in keyof TComponents]: ComponentData<TComponents[TIndex]> | undefined;
};

/** Standard query row format: entity first, then the requested component values. */
export type QueryRow<TComponents extends readonly AnyComponentType[]> = [
    Entity,
    ...ComponentTuple<TComponents>,
];

/** Query row format for optional queries with required values followed by optional values. */
export type OptionalQueryRow<
    TRequiredComponents extends readonly AnyComponentType[],
    TOptionalComponents extends readonly AnyComponentType[],
> = [
    Entity,
    ...ComponentTuple<TRequiredComponents>,
    ...OptionalComponentTuple<TOptionalComponents>,
];

/** Structural and change-detection filters supported by world queries. */
export interface QueryFilter {
    readonly with?: readonly AnyComponentType[];
    readonly without?: readonly AnyComponentType[];
    readonly or?: readonly AnyComponentType[];
    readonly added?: readonly AnyComponentType[];
    readonly changed?: readonly AnyComponentType[];
}

/** Tick window used for per-system added/changed detection. */
export interface ChangeDetectionRange {
    readonly lastRunTick: number;
    readonly thisRunTick: number;
}

/** Cached query definition for repeated required-component queries. */
export interface QueryState<TComponents extends readonly AnyComponentType[]> {
    readonly types: TComponents;
    readonly filter: QueryFilter;
    /** Iterates matching rows using the world's cached query plan. */
    iter(world: World): IterableIterator<QueryRow<TComponents>>;
    /** Visits each matching row without exposing the iterator protocol. */
    each(
        world: World,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void;
    /** Returns `true` when at least one row matches. */
    matchesAny(world: World): boolean;
    /** Returns `true` when no rows match. */
    matchesNone(world: World): boolean;
    /** Returns `true` when exactly one row matches. */
    matchesSingle(world: World): boolean;
    /** Returns the only matching row, or `undefined` when there are no matches. */
    getSingle(world: World): QueryRow<TComponents> | undefined;
    /** Returns the only matching row and throws unless there is exactly one. */
    mustGetSingle(world: World): QueryRow<TComponents>;
}

/** Cached query definition for required components plus trailing optional components. */
export interface OptionalQueryState<
    TRequiredComponents extends readonly AnyComponentType[],
    TOptionalComponents extends readonly AnyComponentType[],
> {
    readonly required: TRequiredComponents;
    readonly optional: TOptionalComponents;
    readonly filter: QueryFilter;
    /** Iterates matching rows using the world's cached optional-query plan. */
    iter(
        world: World
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>>;
    /** Visits each optional-query row without exposing the iterator protocol. */
    each(
        world: World,
        visitor: (
            entity: Entity,
            ...components: [
                ...ComponentTuple<TRequiredComponents>,
                ...OptionalComponentTuple<TOptionalComponents>,
            ]
        ) => void
    ): void;
    /** Returns `true` when at least one row matches. */
    matchesAny(world: World): boolean;
    /** Returns `true` when no rows match. */
    matchesNone(world: World): boolean;
    /** Returns `true` when exactly one row matches. */
    matchesSingle(world: World): boolean;
    /** Returns the only matching row, or `undefined` when there are no matches. */
    getSingle(world: World): OptionalQueryRow<TRequiredComponents, TOptionalComponents> | undefined;
    /** Returns the only matching row and throws unless there is exactly one. */
    mustGetSingle(world: World): OptionalQueryRow<TRequiredComponents, TOptionalComponents>;
}

/** Preferred public constructor for reusable required-component query definitions. */
export function queryState<const TComponents extends readonly AnyComponentType[]>(
    types: TComponents,
    filter: QueryFilter = {}
): QueryState<TComponents> {
    return new CachedQueryState(types, filter);
}

/** Preferred public constructor for reusable optional-query definitions. */
export function optionalQueryState<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    required: TRequiredComponents,
    optional: TOptionalComponents,
    filter: QueryFilter = {}
): OptionalQueryState<TRequiredComponents, TOptionalComponents> {
    return new CachedOptionalQueryState(required, optional, filter);
}

class CachedQueryState<
    TComponents extends readonly AnyComponentType[],
> implements QueryState<TComponents> {
    readonly types: TComponents;
    readonly filter: QueryFilter;

    constructor(types: TComponents, filter: QueryFilter = {}) {
        if (types.length === 0) {
            throw new Error("Query requires at least one component type");
        }
        this.types = cloneComponentTypes(types);
        this.filter = cloneQueryFilter(filter);
    }

    iter(world: World): IterableIterator<QueryRow<TComponents>> {
        const runtime = worldQueryRuntime(world);

        return runQueryWithState(runtime.ecsContext.queries, this, runtime.changeDetectionRange());
    }

    each(
        world: World,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        const runtime = worldQueryRuntime(world);

        eachQueryWithState(
            runtime.ecsContext.queries,
            this,
            runtime.changeDetectionRange(),
            visitor
        );
    }

    matchesAny(world: World): boolean {
        const runtime = worldQueryRuntime(world);

        return matchesAnyQueryWithState(
            runtime.ecsContext.queries,
            this,
            runtime.changeDetectionRange()
        );
    }

    matchesNone(world: World): boolean {
        return !this.matchesAny(world);
    }

    matchesSingle(world: World): boolean {
        const runtime = worldQueryRuntime(world);

        return matchesSingleQueryWithState(
            runtime.ecsContext.queries,
            this,
            runtime.changeDetectionRange()
        );
    }

    getSingle(world: World): QueryRow<TComponents> | undefined {
        return getSingleResult(this.iter(world));
    }

    mustGetSingle(world: World): QueryRow<TComponents> {
        return mustGetSingleResult(this.getSingle(world));
    }
}

class CachedOptionalQueryState<
    TRequiredComponents extends readonly AnyComponentType[],
    TOptionalComponents extends readonly AnyComponentType[],
> implements OptionalQueryState<TRequiredComponents, TOptionalComponents> {
    readonly required: TRequiredComponents;
    readonly optional: TOptionalComponents;
    readonly filter: QueryFilter;

    constructor(
        required: TRequiredComponents,
        optional: TOptionalComponents,
        filter: QueryFilter = {}
    ) {
        if (required.length === 0) {
            throw new Error("Optional query requires at least one required component type");
        }
        this.required = cloneComponentTypes(required);
        this.optional = cloneComponentTypes(optional);
        this.filter = cloneQueryFilter(filter);
    }

    iter(
        world: World
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        const runtime = worldQueryRuntime(world);

        return runOptionalQueryWithState(
            runtime.ecsContext.queries,
            this,
            runtime.changeDetectionRange()
        );
    }

    each(
        world: World,
        visitor: (
            entity: Entity,
            ...components: [
                ...ComponentTuple<TRequiredComponents>,
                ...OptionalComponentTuple<TOptionalComponents>,
            ]
        ) => void
    ): void {
        const runtime = worldQueryRuntime(world);

        eachOptionalQueryWithState(
            runtime.ecsContext.queries,
            this,
            runtime.changeDetectionRange(),
            visitor
        );
    }

    matchesAny(world: World): boolean {
        const runtime = worldQueryRuntime(world);

        return matchesAnyOptionalQueryWithState(
            runtime.ecsContext.queries,
            this,
            runtime.changeDetectionRange()
        );
    }

    matchesNone(world: World): boolean {
        return !this.matchesAny(world);
    }

    matchesSingle(world: World): boolean {
        const runtime = worldQueryRuntime(world);

        return matchesSingleOptionalQueryWithState(
            runtime.ecsContext.queries,
            this,
            runtime.changeDetectionRange()
        );
    }

    getSingle(
        world: World
    ): OptionalQueryRow<TRequiredComponents, TOptionalComponents> | undefined {
        return getSingleResult(this.iter(world));
    }

    mustGetSingle(world: World): OptionalQueryRow<TRequiredComponents, TOptionalComponents> {
        return mustGetSingleResult(this.getSingle(world));
    }
}

function cloneComponentTypes<TComponents extends readonly AnyComponentType[]>(
    types: TComponents
): TComponents {
    return Object.freeze([...types]) as unknown as TComponents;
}

function cloneQueryFilter(filter: QueryFilter): QueryFilter {
    return Object.freeze({
        with: cloneFilterTypes(filter.with),
        without: cloneFilterTypes(filter.without),
        or: cloneFilterTypes(filter.or),
        added: cloneFilterTypes(filter.added),
        changed: cloneFilterTypes(filter.changed),
    } satisfies QueryFilter);
}

function cloneFilterTypes(
    types: readonly AnyComponentType[] | undefined
): readonly AnyComponentType[] | undefined {
    return types === undefined ? undefined : Object.freeze([...types]);
}

interface QueryStateWorldRuntime {
    readonly ecsContext: EcsContext;
    readonly changeDetectionRange: () => ChangeDetectionRange;
}

function worldQueryRuntime(world: World): QueryStateWorldRuntime {
    return world as unknown as QueryStateWorldRuntime;
}

/** Checks whether a change tick falls inside the current system's visible window. */
export function isTickInRange(tick: number, changeDetection: ChangeDetectionRange): boolean {
    return tick > changeDetection.lastRunTick && tick <= changeDetection.thisRunTick;
}

/** Picks the smallest candidate store so queries scan the cheapest dense set first. */
export function chooseSmallestStore(
    stores: readonly SparseSet<unknown>[],
    additionalStores: readonly SparseSet<unknown>[] = []
): SparseSet<unknown> {
    // Use the smallest candidate as the scan source to minimize per-entity filter checks.
    let smallest = stores[0]!;

    for (let index = 1; index < stores.length; index++) {
        const store = stores[index]!;

        if (store.size < smallest.size) {
            smallest = store;
        }
    }

    for (const store of additionalStores) {
        if (store.size < smallest.size) {
            smallest = store;
        }
    }

    return smallest;
}
