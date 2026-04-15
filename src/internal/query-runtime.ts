import type { AnyComponentType } from "../component";
import type { Entity } from "../entity";
import type {
    ChangeDetectionRange,
    ComponentTuple,
    OptionalComponentTuple,
    OptionalQueryRow,
    OptionalQueryState,
    OptionalQueryStateCache,
    QueryFilter,
    QueryFilterMode,
    QueryRow,
    QueryState,
    QueryStateCache,
    ResolvedOptionalQueryPlan,
    ResolvedQueryFilter,
    ResolvedQueryPlan,
} from "../query";
import { chooseSmallestStore, isTickInRange } from "../query";
import { SparseSet } from "../sparse-set";

interface QueryRuntimeOptions {
    readonly stores: ReadonlyMap<number, SparseSet<unknown>>;
    readonly queryStateCaches: WeakMap<QueryState<readonly AnyComponentType[]>, QueryStateCache>;
    readonly optionalQueryStateCaches: WeakMap<
        OptionalQueryState<readonly AnyComponentType[], readonly AnyComponentType[]>,
        OptionalQueryStateCache
    >;
    readonly isAlive: (entity: Entity) => boolean;
    readonly getStoreVersion: () => number;
}

export class QueryRuntime {
    constructor(private readonly options: QueryRuntimeOptions) {}

    query<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter,
        changeDetection: ChangeDetectionRange
    ): IterableIterator<QueryRow<TComponents>> {
        return this.iterateQuery(types, filter, changeDetection);
    }

    queryOptional<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        required: TRequiredComponents,
        optional: TOptionalComponents,
        filter: QueryFilter,
        changeDetection: ChangeDetectionRange
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        return this.iterateOptionalQuery(required, optional, filter, changeDetection);
    }

    queryWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>,
        changeDetection: ChangeDetectionRange
    ): IterableIterator<QueryRow<TComponents>> {
        return this.iterateQueryState(state, changeDetection);
    }

    queryOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        state: OptionalQueryState<TRequiredComponents, TOptionalComponents>,
        changeDetection: ChangeDetectionRange
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        return this.iterateOptionalQueryState(state, changeDetection);
    }

    matchesAnyWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>,
        changeDetection: ChangeDetectionRange
    ): boolean {
        const plan = this.resolveQueryStateCache(state);

        if (plan === undefined) {
            return false;
        }

        return this.countResolvedQueryMatches(plan, changeDetection, 1) === 1;
    }

    matchesSingleWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>,
        changeDetection: ChangeDetectionRange
    ): boolean {
        const plan = this.resolveQueryStateCache(state);

        if (plan === undefined) {
            return false;
        }

        return this.countResolvedQueryMatches(plan, changeDetection, 2) === 1;
    }

    matchesAnyOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        state: OptionalQueryState<TRequiredComponents, TOptionalComponents>,
        changeDetection: ChangeDetectionRange
    ): boolean {
        const plan = this.resolveOptionalQueryStateCache(state);

        if (plan === undefined) {
            return false;
        }

        return this.countResolvedOptionalQueryMatches(plan, changeDetection, 1) === 1;
    }

    matchesSingleOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        state: OptionalQueryState<TRequiredComponents, TOptionalComponents>,
        changeDetection: ChangeDetectionRange
    ): boolean {
        const plan = this.resolveOptionalQueryStateCache(state);

        if (plan === undefined) {
            return false;
        }

        return this.countResolvedOptionalQueryMatches(plan, changeDetection, 2) === 1;
    }

    each<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter,
        changeDetection: ChangeDetectionRange,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        const plan = this.resolveQueryPlan(types, filter);

        if (plan === undefined) {
            return;
        }

        this.eachResolvedQuery(plan, changeDetection, visitor);
    }

    eachOptional<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        required: TRequiredComponents,
        optional: TOptionalComponents,
        filter: QueryFilter,
        changeDetection: ChangeDetectionRange,
        visitor: (
            entity: Entity,
            ...components: [
                ...ComponentTuple<TRequiredComponents>,
                ...OptionalComponentTuple<TOptionalComponents>,
            ]
        ) => void
    ): void {
        const plan = this.resolveOptionalQueryPlan(required, optional, filter);

        if (plan === undefined) {
            return;
        }

        this.eachResolvedOptionalQuery(plan, changeDetection, visitor);
    }

    eachWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>,
        changeDetection: ChangeDetectionRange,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        this.eachQueryState(state, changeDetection, visitor);
    }

    eachOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        state: OptionalQueryState<TRequiredComponents, TOptionalComponents>,
        changeDetection: ChangeDetectionRange,
        visitor: (
            entity: Entity,
            ...components: [
                ...ComponentTuple<TRequiredComponents>,
                ...OptionalComponentTuple<TOptionalComponents>,
            ]
        ) => void
    ): void {
        this.eachOptionalQueryState(state, changeDetection, visitor);
    }

    private *iterateQuery<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter,
        changeDetection: ChangeDetectionRange
    ): IterableIterator<QueryRow<TComponents>> {
        const plan = this.resolveQueryPlan(types, filter);

        if (plan === undefined) {
            return;
        }

        yield* this.iterateResolvedQuery<TComponents>(plan, changeDetection);
    }

    private *iterateQueryState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>,
        changeDetection: ChangeDetectionRange
    ): IterableIterator<QueryRow<TComponents>> {
        const plan = this.resolveQueryStateCache(state);

        if (plan === undefined) {
            return;
        }

        yield* this.iterateResolvedQuery<TComponents>(plan, changeDetection);
    }

    private *iterateResolvedQuery<const TComponents extends readonly AnyComponentType[]>(
        plan: ResolvedQueryPlan,
        changeDetection: ChangeDetectionRange
    ): IterableIterator<QueryRow<TComponents>> {
        // Specialize the hottest small-arity cases so iteration avoids temporary arrays/spreads.
        if (plan.stores.length === 1) {
            const store0 = plan.stores[0]!;

            for (const entity of plan.baseStore.entities) {
                if (!this.options.isAlive(entity)) {
                    continue;
                }

                if (!this.matchesPlanFilter(entity, plan, changeDetection)) {
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
                if (!this.options.isAlive(entity)) {
                    continue;
                }

                if (!this.matchesPlanFilter(entity, plan, changeDetection)) {
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
                if (!this.options.isAlive(entity)) {
                    continue;
                }

                if (!this.matchesPlanFilter(entity, plan, changeDetection)) {
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
            if (!this.options.isAlive(entity)) {
                continue;
            }

            if (!this.matchesPlanFilter(entity, plan, changeDetection)) {
                continue;
            }

            if (!this.fillComponents(entity, plan.stores, components)) {
                continue;
            }

            yield [entity, ...components] as unknown as QueryRow<TComponents>;
        }
    }

    private eachQueryState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>,
        changeDetection: ChangeDetectionRange,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        const plan = this.resolveQueryStateCache(state);

        if (plan === undefined) {
            return;
        }

        this.eachResolvedQuery(plan, changeDetection, visitor);
    }

    private eachResolvedQuery<const TComponents extends readonly AnyComponentType[]>(
        plan: ResolvedQueryPlan,
        changeDetection: ChangeDetectionRange,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        const callVisitor = visitor as (entity: Entity, ...components: unknown[]) => void;

        // Mirror iterateResolvedQuery fast paths so each() can call the visitor directly.
        if (plan.stores.length === 1) {
            const store0 = plan.stores[0]!;

            for (const entity of plan.baseStore.entities) {
                if (!this.options.isAlive(entity)) {
                    continue;
                }

                if (!this.matchesPlanFilter(entity, plan, changeDetection)) {
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
                if (!this.options.isAlive(entity)) {
                    continue;
                }

                if (!this.matchesPlanFilter(entity, plan, changeDetection)) {
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
                if (!this.options.isAlive(entity)) {
                    continue;
                }

                if (!this.matchesPlanFilter(entity, plan, changeDetection)) {
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
            if (!this.options.isAlive(entity)) {
                continue;
            }

            if (!this.matchesPlanFilter(entity, plan, changeDetection)) {
                continue;
            }

            if (!this.fillComponents(entity, plan.stores, components)) {
                continue;
            }

            visitor(entity, ...(components as ComponentTuple<TComponents>));
        }
    }

    private countResolvedQueryMatches(
        plan: ResolvedQueryPlan,
        changeDetection: ChangeDetectionRange,
        limit: number
    ): number {
        let matches = 0;

        for (const entity of plan.baseStore.entities) {
            if (!this.options.isAlive(entity)) {
                continue;
            }

            if (!this.matchesPlanFilter(entity, plan, changeDetection)) {
                continue;
            }

            if (!this.hasComponents(entity, plan.stores)) {
                continue;
            }

            matches++;

            if (matches >= limit) {
                return matches;
            }
        }

        return matches;
    }

    private *iterateOptionalQuery<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        required: TRequiredComponents,
        optional: TOptionalComponents,
        filter: QueryFilter,
        changeDetection: ChangeDetectionRange
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        const plan = this.resolveOptionalQueryPlan(required, optional, filter);

        if (plan === undefined) {
            return;
        }

        yield* this.iterateResolvedOptionalQuery<TRequiredComponents, TOptionalComponents>(
            plan,
            changeDetection
        );
    }

    private *iterateOptionalQueryState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        state: OptionalQueryState<TRequiredComponents, TOptionalComponents>,
        changeDetection: ChangeDetectionRange
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        const plan = this.resolveOptionalQueryStateCache(state);

        if (plan === undefined) {
            return;
        }

        yield* this.iterateResolvedOptionalQuery<TRequiredComponents, TOptionalComponents>(
            plan,
            changeDetection
        );
    }

    private *iterateResolvedOptionalQuery<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        plan: ResolvedOptionalQueryPlan,
        changeDetection: ChangeDetectionRange
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        if (plan.requiredStores.length === 1 && plan.optionalStores.length === 1) {
            const requiredStore0 = plan.requiredStores[0]!;
            const optionalStore0 = plan.optionalStores[0];

            for (const entity of plan.baseStore.entities) {
                if (!this.options.isAlive(entity)) {
                    continue;
                }

                if (!this.matchesPlanFilter(entity, plan, changeDetection)) {
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
            if (!this.options.isAlive(entity)) {
                continue;
            }

            if (!this.matchesPlanFilter(entity, plan, changeDetection)) {
                continue;
            }

            if (!this.fillComponents(entity, plan.requiredStores, components)) {
                continue;
            }

            this.fillOptionalComponents(
                entity,
                plan.optionalStores,
                components,
                plan.requiredStores.length
            );

            yield [entity, ...components] as unknown as OptionalQueryRow<
                TRequiredComponents,
                TOptionalComponents
            >;
        }
    }

    private eachOptionalQueryState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        state: OptionalQueryState<TRequiredComponents, TOptionalComponents>,
        changeDetection: ChangeDetectionRange,
        visitor: (
            entity: Entity,
            ...components: [
                ...ComponentTuple<TRequiredComponents>,
                ...OptionalComponentTuple<TOptionalComponents>,
            ]
        ) => void
    ): void {
        const plan = this.resolveOptionalQueryStateCache(state);

        if (plan === undefined) {
            return;
        }

        this.eachResolvedOptionalQuery(plan, changeDetection, visitor);
    }

    private eachResolvedOptionalQuery<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        plan: ResolvedOptionalQueryPlan,
        changeDetection: ChangeDetectionRange,
        visitor: (
            entity: Entity,
            ...components: [
                ...ComponentTuple<TRequiredComponents>,
                ...OptionalComponentTuple<TOptionalComponents>,
            ]
        ) => void
    ): void {
        const callVisitor = visitor as (entity: Entity, ...components: unknown[]) => void;

        if (plan.requiredStores.length === 1 && plan.optionalStores.length === 1) {
            const requiredStore0 = plan.requiredStores[0]!;
            const optionalStore0 = plan.optionalStores[0];

            for (const entity of plan.baseStore.entities) {
                if (!this.options.isAlive(entity)) {
                    continue;
                }

                if (!this.matchesPlanFilter(entity, plan, changeDetection)) {
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
            if (!this.options.isAlive(entity)) {
                continue;
            }

            if (!this.matchesPlanFilter(entity, plan, changeDetection)) {
                continue;
            }

            if (!this.fillComponents(entity, plan.requiredStores, components)) {
                continue;
            }

            this.fillOptionalComponents(
                entity,
                plan.optionalStores,
                components,
                plan.requiredStores.length
            );

            visitor(
                entity,
                ...(components as [
                    ...ComponentTuple<TRequiredComponents>,
                    ...OptionalComponentTuple<TOptionalComponents>,
                ])
            );
        }
    }

    private countResolvedOptionalQueryMatches(
        plan: ResolvedOptionalQueryPlan,
        changeDetection: ChangeDetectionRange,
        limit: number
    ): number {
        let matches = 0;

        for (const entity of plan.baseStore.entities) {
            if (!this.options.isAlive(entity)) {
                continue;
            }

            if (!this.matchesPlanFilter(entity, plan, changeDetection)) {
                continue;
            }

            if (!this.hasComponents(entity, plan.requiredStores)) {
                continue;
            }

            matches++;

            if (matches >= limit) {
                return matches;
            }
        }

        return matches;
    }

    private matchesFilter(
        entity: Entity,
        filter: ResolvedQueryFilter,
        changeDetection: ChangeDetectionRange
    ): boolean {
        if (!this.matchesStructuralFilter(entity, filter)) {
            return false;
        }

        if (!this.matchesAddedStores(entity, filter.added, changeDetection)) {
            return false;
        }

        if (!this.matchesChangedStores(entity, filter.changed, changeDetection)) {
            return false;
        }

        return true;
    }

    private matchesPlanFilter(
        entity: Entity,
        plan: {
            readonly filterMode: QueryFilterMode;
            readonly filterStores: ResolvedQueryFilter;
        },
        changeDetection: ChangeDetectionRange
    ): boolean {
        if (plan.filterMode === "unfiltered") {
            return true;
        }

        // Structural-only filters can skip change-tick lookups entirely.
        if (plan.filterMode === "structural") {
            return this.matchesStructuralFilter(entity, plan.filterStores);
        }

        return this.matchesFilter(entity, plan.filterStores, changeDetection);
    }

    private matchesStructuralFilter(entity: Entity, filter: ResolvedQueryFilter): boolean {
        for (const store of filter.with) {
            if (!store.has(entity)) {
                return false;
            }
        }

        for (const store of filter.without) {
            if (store.has(entity)) {
                return false;
            }
        }

        if (filter.or.length === 0) {
            return true;
        }

        for (const store of filter.or) {
            if (store.has(entity)) {
                return true;
            }
        }

        return false;
    }

    private matchesAddedStores(
        entity: Entity,
        stores: readonly SparseSet<unknown>[],
        changeDetection: ChangeDetectionRange
    ): boolean {
        if (stores.length === 0) {
            return true;
        }

        for (const store of stores) {
            const tick = store.getAddedTick(entity);

            if (tick !== undefined && isTickInRange(tick, changeDetection)) {
                return true;
            }
        }

        return false;
    }

    private matchesChangedStores(
        entity: Entity,
        stores: readonly SparseSet<unknown>[],
        changeDetection: ChangeDetectionRange
    ): boolean {
        if (stores.length === 0) {
            return true;
        }

        for (const store of stores) {
            const tick = store.getChangedTick(entity);

            if (tick !== undefined && isTickInRange(tick, changeDetection)) {
                return true;
            }
        }

        return false;
    }

    private fillComponents(
        entity: Entity,
        stores: readonly SparseSet<unknown>[],
        output: unknown[]
    ): boolean {
        for (let index = 0; index < stores.length; index++) {
            const store = stores[index]!;
            const value = store.get(entity);

            // A single get() doubles as both presence check and value fetch on the hot path.
            if (value === undefined) {
                return false;
            }

            output[index] = value;
        }

        return true;
    }

    private hasComponents(entity: Entity, stores: readonly SparseSet<unknown>[]): boolean {
        for (const store of stores) {
            if (!store.has(entity)) {
                return false;
            }
        }

        return true;
    }

    private fillOptionalComponents(
        entity: Entity,
        stores: readonly (SparseSet<unknown> | undefined)[],
        output: unknown[],
        offset = 0
    ): void {
        for (let index = 0; index < stores.length; index++) {
            output[offset + index] = stores[index]?.get(entity);
        }
    }

    private resolveQueryStores(
        types: readonly AnyComponentType[]
    ): SparseSet<unknown>[] | undefined {
        if (types.length === 0) {
            throw new Error("Query requires at least one component type");
        }

        const stores: SparseSet<unknown>[] = new Array(types.length);

        for (let index = 0; index < types.length; index++) {
            const store = this.options.stores.get(types[index]!.id);

            if (store === undefined) {
                return undefined;
            }

            stores[index] = store;
        }

        return stores;
    }

    private resolveOptionalStores(
        types: readonly AnyComponentType[]
    ): (SparseSet<unknown> | undefined)[] {
        const stores: (SparseSet<unknown> | undefined)[] = new Array(types.length);

        for (let index = 0; index < types.length; index++) {
            stores[index] = this.options.stores.get(types[index]!.id);
        }

        return stores;
    }

    private resolveFilterStores(filter: QueryFilter): ResolvedQueryFilter | undefined {
        const withStores: SparseSet<unknown>[] = [];
        const withoutStores: SparseSet<unknown>[] = [];
        const orStores: SparseSet<unknown>[] = [];
        const addedStores: SparseSet<unknown>[] = [];
        const changedStores: SparseSet<unknown>[] = [];

        for (const type of filter.with ?? []) {
            const store = this.options.stores.get(type.id);

            if (store === undefined) {
                return undefined;
            }

            withStores.push(store);
        }

        for (const type of filter.without ?? []) {
            const store = this.options.stores.get(type.id);

            // Missing stores satisfy negative filters, so only track stores that actually exist.
            if (store !== undefined) {
                withoutStores.push(store);
            }
        }

        for (const type of filter.or ?? []) {
            const store = this.options.stores.get(type.id);

            if (store !== undefined) {
                orStores.push(store);
            }
        }

        if (filter.or !== undefined && filter.or.length > 0 && orStores.length === 0) {
            return undefined;
        }

        for (const type of filter.added ?? []) {
            const store = this.options.stores.get(type.id);

            if (store === undefined) {
                return undefined;
            }

            addedStores.push(store);
        }

        for (const type of filter.changed ?? []) {
            const store = this.options.stores.get(type.id);

            if (store === undefined) {
                return undefined;
            }

            changedStores.push(store);
        }

        return {
            with: withStores,
            without: withoutStores,
            or: orStores,
            added: addedStores,
            changed: changedStores,
        };
    }

    private resolveFilterMode(filter: ResolvedQueryFilter): QueryFilterMode {
        // Preclassifying the filter lets query execution skip branches inside the inner loop.
        if (
            filter.with.length === 0 &&
            filter.without.length === 0 &&
            filter.or.length === 0
        ) {
            return filter.added.length === 0 && filter.changed.length === 0
                ? "unfiltered"
                : "change";
        }

        return filter.added.length === 0 && filter.changed.length === 0 ? "structural" : "change";
    }

    private resolveQueryPlan(
        types: readonly AnyComponentType[],
        filter: QueryFilter
    ): ResolvedQueryPlan | undefined {
        const stores = this.resolveQueryStores(types);

        if (stores === undefined) {
            return undefined;
        }

        const filterStores = this.resolveFilterStores(filter);

        if (filterStores === undefined) {
            return undefined;
        }

        return this.createQueryPlan(stores, filterStores);
    }

    private createQueryPlan(
        stores: readonly SparseSet<unknown>[],
        filterStores: ResolvedQueryFilter
    ): ResolvedQueryPlan {
        return {
            stores,
            filterStores,
            baseStore: chooseSmallestStore(stores, filterStores.with),
            filterMode: this.resolveFilterMode(filterStores),
        };
    }

    private resolveOptionalQueryPlan(
        required: readonly AnyComponentType[],
        optional: readonly AnyComponentType[],
        filter: QueryFilter
    ): ResolvedOptionalQueryPlan | undefined {
        const requiredStores = this.resolveQueryStores(required);

        if (requiredStores === undefined) {
            return undefined;
        }

        const filterStores = this.resolveFilterStores(filter);

        if (filterStores === undefined) {
            return undefined;
        }

        return this.createOptionalQueryPlan(
            requiredStores,
            this.resolveOptionalStores(optional),
            filterStores
        );
    }

    private createOptionalQueryPlan(
        requiredStores: readonly SparseSet<unknown>[],
        optionalStores: readonly (SparseSet<unknown> | undefined)[],
        filterStores: ResolvedQueryFilter
    ): ResolvedOptionalQueryPlan {
        return {
            requiredStores,
            optionalStores,
            filterStores,
            baseStore: chooseSmallestStore(requiredStores, filterStores.with),
            filterMode: this.resolveFilterMode(filterStores),
        };
    }

    private resolveQueryStateCache<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): ResolvedQueryPlan | undefined {
        const key = state as QueryState<readonly AnyComponentType[]>;
        const existing = this.options.queryStateCaches.get(key);

        if (existing?.storeVersion === this.options.getStoreVersion()) {
            return existing.plan;
        }

        const plan = this.resolveQueryPlan(state.types, state.filter);
        const cache = {
            storeVersion: this.options.getStoreVersion(),
            plan,
        } satisfies QueryStateCache;

        this.options.queryStateCaches.set(key, cache);

        return cache.plan;
    }

    private resolveOptionalQueryStateCache<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        state: OptionalQueryState<TRequiredComponents, TOptionalComponents>
    ): ResolvedOptionalQueryPlan | undefined {
        const key = state as OptionalQueryState<
            readonly AnyComponentType[],
            readonly AnyComponentType[]
        >;
        const existing = this.options.optionalQueryStateCaches.get(key);

        if (existing?.storeVersion === this.options.getStoreVersion()) {
            return existing.plan;
        }

        const plan = this.resolveOptionalQueryPlan(
            state.required,
            state.optional,
            state.filter
        );
        const cache = {
            storeVersion: this.options.getStoreVersion(),
            plan,
        } satisfies OptionalQueryStateCache;

        this.options.optionalQueryStateCaches.set(key, cache);

        return cache.plan;
    }
}
