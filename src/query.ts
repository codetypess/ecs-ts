import type { AnyComponentType, ComponentData } from "./component";
import type { Entity } from "./entity";
import type { SparseSet } from "./sparse-set";
import type { World } from "./world";

export type ComponentTuple<TComponents extends readonly AnyComponentType[]> = {
    [TIndex in keyof TComponents]: ComponentData<TComponents[TIndex]>;
};

export type OptionalComponentTuple<TComponents extends readonly AnyComponentType[]> = {
    [TIndex in keyof TComponents]: ComponentData<TComponents[TIndex]> | undefined;
};

export type QueryRow<TComponents extends readonly AnyComponentType[]> = [
    Entity,
    ...ComponentTuple<TComponents>,
];

export type OptionalQueryRow<
    TRequiredComponents extends readonly AnyComponentType[],
    TOptionalComponents extends readonly AnyComponentType[],
> = [
    Entity,
    ...ComponentTuple<TRequiredComponents>,
    ...OptionalComponentTuple<TOptionalComponents>,
];

export interface QueryFilter {
    readonly with?: readonly AnyComponentType[];
    readonly without?: readonly AnyComponentType[];
    readonly or?: readonly AnyComponentType[];
    readonly added?: readonly AnyComponentType[];
    readonly changed?: readonly AnyComponentType[];
}

export interface ChangeDetectionRange {
    readonly lastRunTick: number;
    readonly thisRunTick: number;
}

export type QueryFilterMode = "unfiltered" | "structural" | "change";

export interface ResolvedQueryFilter {
    readonly with: readonly SparseSet<unknown>[];
    readonly without: readonly SparseSet<unknown>[];
    readonly or: readonly SparseSet<unknown>[];
    readonly added: readonly SparseSet<unknown>[];
    readonly changed: readonly SparseSet<unknown>[];
}

export interface ResolvedQueryPlan {
    readonly stores: readonly SparseSet<unknown>[];
    readonly filterStores: ResolvedQueryFilter;
    readonly baseStore: SparseSet<unknown>;
    readonly filterMode: QueryFilterMode;
}

export interface ResolvedOptionalQueryPlan {
    readonly requiredStores: readonly SparseSet<unknown>[];
    readonly optionalStores: readonly (SparseSet<unknown> | undefined)[];
    readonly filterStores: ResolvedQueryFilter;
    readonly baseStore: SparseSet<unknown>;
    readonly filterMode: QueryFilterMode;
}

export interface QueryStateCache {
    readonly storeVersion: number;
    readonly plan?: ResolvedQueryPlan;
}

export interface OptionalQueryStateCache {
    readonly storeVersion: number;
    readonly plan?: ResolvedOptionalQueryPlan;
}

export class QueryState<TComponents extends readonly AnyComponentType[]> {
    readonly types: TComponents;
    readonly filter: QueryFilter;

    constructor(types: TComponents, filter: QueryFilter = {}) {
        this.types = cloneComponentTypes(types);
        this.filter = cloneQueryFilter(filter);
    }

    iter(world: World): IterableIterator<QueryRow<TComponents>> {
        return world.queryWithState(this);
    }

    each(
        world: World,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        world.eachWithState(this, visitor);
    }

    matchesAny(world: World): boolean {
        return world.matchesAnyWithState(this);
    }

    matchesNone(world: World): boolean {
        return world.matchesNoneWithState(this);
    }

    matchesSingle(world: World): boolean {
        return world.matchesSingleWithState(this);
    }
}

export class OptionalQueryState<
    TRequiredComponents extends readonly AnyComponentType[],
    TOptionalComponents extends readonly AnyComponentType[],
> {
    readonly required: TRequiredComponents;
    readonly optional: TOptionalComponents;
    readonly filter: QueryFilter;

    constructor(
        required: TRequiredComponents,
        optional: TOptionalComponents,
        filter: QueryFilter = {}
    ) {
        this.required = cloneComponentTypes(required);
        this.optional = cloneComponentTypes(optional);
        this.filter = cloneQueryFilter(filter);
    }

    iter(
        world: World
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        return world.queryOptionalWithState(this);
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
        world.eachOptionalWithState(this, visitor);
    }

    matchesAny(world: World): boolean {
        return world.matchesAnyOptionalWithState(this);
    }

    matchesNone(world: World): boolean {
        return world.matchesNoneOptionalWithState(this);
    }

    matchesSingle(world: World): boolean {
        return world.matchesSingleOptionalWithState(this);
    }
}

export function queryState<const TComponents extends readonly AnyComponentType[]>(
    types: TComponents,
    filter: QueryFilter = {}
): QueryState<TComponents> {
    return new QueryState(types, filter);
}

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

export function isTickInRange(tick: number, changeDetection: ChangeDetectionRange): boolean {
    return tick > changeDetection.lastRunTick && tick <= changeDetection.thisRunTick;
}

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
