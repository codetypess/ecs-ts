import type { AnyComponentType } from "../component";
import type { Entity } from "../entity";
import type {
    ResolvedOptionalQueryPlan,
    ResolvedQueryPlan,
} from "./query-plan";
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
    fillComponents,
    fillOptionalComponents,
    hasComponents,
} from "./query-component-runtime";
import { matchesPlanFilter } from "./query-filter-runtime";
import type { QueryPlanRuntime } from "./query-plan-runtime";

interface QueryRuntimeOptions {
    readonly planRuntime: QueryPlanRuntime;
    readonly isAlive: (entity: Entity) => boolean;
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
        const plan = this.options.planRuntime.resolveQueryStateCache(state);

        if (plan === undefined) {
            return false;
        }

        return this.countResolvedQueryMatches(plan, changeDetection, 1) === 1;
    }

    matchesSingleWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>,
        changeDetection: ChangeDetectionRange
    ): boolean {
        const plan = this.options.planRuntime.resolveQueryStateCache(state);

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
        const plan = this.options.planRuntime.resolveOptionalQueryStateCache(state);

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
        const plan = this.options.planRuntime.resolveOptionalQueryStateCache(state);

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
        const plan = this.options.planRuntime.resolveQueryPlan(types, filter);

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
        const plan = this.options.planRuntime.resolveOptionalQueryPlan(required, optional, filter);

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
        const plan = this.options.planRuntime.resolveQueryPlan(types, filter);

        if (plan === undefined) {
            return;
        }

        yield* this.iterateResolvedQuery<TComponents>(plan, changeDetection);
    }

    private *iterateQueryState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>,
        changeDetection: ChangeDetectionRange
    ): IterableIterator<QueryRow<TComponents>> {
        const plan = this.options.planRuntime.resolveQueryStateCache(state);

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
                if (!this.options.isAlive(entity)) {
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
                if (!this.options.isAlive(entity)) {
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
            if (!this.options.isAlive(entity)) {
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

    private eachQueryState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>,
        changeDetection: ChangeDetectionRange,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        const plan = this.options.planRuntime.resolveQueryStateCache(state);

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
                if (!this.options.isAlive(entity)) {
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
                if (!this.options.isAlive(entity)) {
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
            if (!this.options.isAlive(entity)) {
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

    private *iterateOptionalQuery<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        required: TRequiredComponents,
        optional: TOptionalComponents,
        filter: QueryFilter,
        changeDetection: ChangeDetectionRange
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        const plan = this.options.planRuntime.resolveOptionalQueryPlan(required, optional, filter);

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
        const plan = this.options.planRuntime.resolveOptionalQueryStateCache(state);

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
            if (!this.options.isAlive(entity)) {
                continue;
            }

            if (!matchesPlanFilter(entity, plan, changeDetection)) {
                continue;
            }

            if (!fillComponents(entity, plan.requiredStores, components)) {
                continue;
            }

            fillOptionalComponents(
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
        const plan = this.options.planRuntime.resolveOptionalQueryStateCache(state);

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
            if (!this.options.isAlive(entity)) {
                continue;
            }

            if (!matchesPlanFilter(entity, plan, changeDetection)) {
                continue;
            }

            if (!fillComponents(entity, plan.requiredStores, components)) {
                continue;
            }

            fillOptionalComponents(
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

}
