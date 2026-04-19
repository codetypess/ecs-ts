import type { AnyComponentType, ComponentData } from "./component";
import type { Entity } from "./entity";
import type { Registry } from "./registry";
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
export class QueryState<TComponents extends readonly AnyComponentType[]> {
    readonly registry: Registry;
    readonly types: TComponents;
    readonly filter: QueryFilter;

    constructor(types: TComponents, filter: QueryFilter = {}) {
        this.registry = resolveQueryRegistry(types, filter, "query state");
        this.types = cloneComponentTypes(types);
        this.filter = cloneQueryFilter(filter);
    }

    /** Iterates matching rows using the world's cached query plan. */
    iter(world: World): IterableIterator<QueryRow<TComponents>> {
        return world.queryWithState(this);
    }

    /** Visits each matching row without exposing the iterator protocol. */
    each(
        world: World,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        world.eachWithState(this, visitor);
    }

    /** Returns `true` when at least one row matches. */
    matchesAny(world: World): boolean {
        return world.matchesAnyWithState(this);
    }

    /** Returns `true` when no rows match. */
    matchesNone(world: World): boolean {
        return world.matchesNoneWithState(this);
    }

    /** Returns `true` when exactly one row matches. */
    matchesSingle(world: World): boolean {
        return world.matchesSingleWithState(this);
    }
}

/** Cached query definition for required components plus trailing optional components. */
export class OptionalQueryState<
    TRequiredComponents extends readonly AnyComponentType[],
    TOptionalComponents extends readonly AnyComponentType[],
> {
    readonly registry: Registry;
    readonly required: TRequiredComponents;
    readonly optional: TOptionalComponents;
    readonly filter: QueryFilter;

    constructor(
        required: TRequiredComponents,
        optional: TOptionalComponents,
        filter: QueryFilter = {}
    ) {
        this.registry = resolveOptionalQueryRegistry(required, optional, filter);
        this.required = cloneComponentTypes(required);
        this.optional = cloneComponentTypes(optional);
        this.filter = cloneQueryFilter(filter);
    }

    /** Iterates matching rows using the world's cached optional-query plan. */
    iter(
        world: World
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        return world.queryOptionalWithState(this);
    }

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
    ): void {
        world.eachOptionalWithState(this, visitor);
    }

    /** Returns `true` when at least one row matches. */
    matchesAny(world: World): boolean {
        return world.matchesAnyOptionalWithState(this);
    }

    /** Returns `true` when no rows match. */
    matchesNone(world: World): boolean {
        return world.matchesNoneOptionalWithState(this);
    }

    /** Returns `true` when exactly one row matches. */
    matchesSingle(world: World): boolean {
        return world.matchesSingleOptionalWithState(this);
    }
}

/** Creates a reusable query definition that can cache store resolution between runs. */
export function queryState<const TComponents extends readonly AnyComponentType[]>(
    types: TComponents,
    filter: QueryFilter = {}
): QueryState<TComponents> {
    return new QueryState(types, filter);
}

/** Creates a reusable query definition with required and optional component sections. */
export function optionalQueryState<
    const TRequiredComponents extends readonly AnyComponentType[],
    const TOptionalComponents extends readonly AnyComponentType[],
>(
    required: TRequiredComponents,
    optional: TOptionalComponents,
    filter: QueryFilter = {}
): OptionalQueryState<TRequiredComponents, TOptionalComponents> {
    return new OptionalQueryState(required, optional, filter);
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
    });
}

function cloneFilterTypes(
    types: readonly AnyComponentType[] | undefined
): readonly AnyComponentType[] | undefined {
    return types === undefined ? undefined : Object.freeze([...types]);
}

function resolveQueryRegistry(
    types: readonly AnyComponentType[],
    filter: QueryFilter,
    label: string
): Registry {
    if (types.length === 0) {
        throw new Error("Query requires at least one component type");
    }

    const registry = types[0]!.registry;

    assertAllSameRegistry(registry, types, label);
    assertAllSameRegistry(registry, allFilterTypes(filter), label);

    return registry;
}

function resolveOptionalQueryRegistry(
    required: readonly AnyComponentType[],
    optional: readonly AnyComponentType[],
    filter: QueryFilter
): Registry {
    if (required.length === 0) {
        throw new Error("Optional query requires at least one required component type");
    }

    const registry = required[0]!.registry;
    const label = "optional query state";

    assertAllSameRegistry(registry, required, label);
    assertAllSameRegistry(registry, optional, label);
    assertAllSameRegistry(registry, allFilterTypes(filter), label);

    return registry;
}

/** Returns a flat list of every component type referenced by a filter. */
function allFilterTypes(filter: QueryFilter): readonly AnyComponentType[] {
    return [
        ...(filter.with ?? []),
        ...(filter.without ?? []),
        ...(filter.or ?? []),
        ...(filter.added ?? []),
        ...(filter.changed ?? []),
    ];
}

/** Throws when any type in the list belongs to a different registry. */
function assertAllSameRegistry(
    registry: Registry,
    types: readonly AnyComponentType[],
    label: string
): void {
    for (const type of types) {
        if (type.registry !== registry) {
            throw new Error(
                `Cannot create ${label} with components from ${registry.name} and ${type.registry.name}`
            );
        }
    }
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
