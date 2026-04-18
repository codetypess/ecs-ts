import type { AnyComponentType } from "../component";
import type { ChangeDetectionRange, OptionalQueryRow, QueryRow } from "../query";
import { chooseSmallestStore } from "../query";
import { fillComponents, fillOptionalComponents, hasComponents } from "./query-components";
import { SparseSet } from "../sparse-set";
import type {
    OptionalQueryCountExecutor,
    OptionalQueryEachExecutor,
    OptionalQueryIterateExecutor,
    QueryCountExecutor,
    QueryEachExecutor,
    QueryEachVisitor,
    QueryFilterMode,
    QueryIterateExecutor,
    ResolvedOptionalQueryPlan,
    ResolvedQueryPlan,
} from "./query-plan";

export function compileRequiredQueryIterate(
    storeCount: number,
    filterMode: QueryFilterMode
): QueryIterateExecutor {
    const hasFilter = filterMode !== "unfiltered";

    switch (storeCount) {
        case 1:
            return hasFilter ? iterateRequired1Filtered : iterateRequired1;
        case 2:
            return hasFilter ? iterateRequired2Filtered : iterateRequired2;
        case 3:
            return hasFilter ? iterateRequired3Filtered : iterateRequired3;
        default:
            return hasFilter ? iterateRequiredGenericFiltered : iterateRequiredGeneric;
    }
}

export function compileRequiredQueryEach(
    storeCount: number,
    filterMode: QueryFilterMode
): QueryEachExecutor {
    const hasFilter = filterMode !== "unfiltered";

    switch (storeCount) {
        case 1:
            return hasFilter ? eachRequired1Filtered : eachRequired1;
        case 2:
            return hasFilter ? eachRequired2Filtered : eachRequired2;
        case 3:
            return hasFilter ? eachRequired3Filtered : eachRequired3;
        default:
            return hasFilter ? eachRequiredGenericFiltered : eachRequiredGeneric;
    }
}

export function compileRequiredQueryCount(filterMode: QueryFilterMode): QueryCountExecutor {
    return filterMode === "unfiltered"
        ? countRequiredQueryMatches
        : countRequiredQueryMatchesFiltered;
}

export function compileOptionalQueryIterate(
    requiredCount: number,
    optionalCount: number,
    filterMode: QueryFilterMode
): OptionalQueryIterateExecutor {
    const hasFilter = filterMode !== "unfiltered";

    if (requiredCount === 1 && optionalCount === 1) {
        return hasFilter ? iterateOptional1x1Filtered : iterateOptional1x1;
    }

    return hasFilter ? iterateOptionalGenericFiltered : iterateOptionalGeneric;
}

export function compileOptionalQueryEach(
    requiredCount: number,
    optionalCount: number,
    filterMode: QueryFilterMode
): OptionalQueryEachExecutor {
    const hasFilter = filterMode !== "unfiltered";

    if (requiredCount === 1 && optionalCount === 1) {
        return hasFilter ? eachOptional1x1Filtered : eachOptional1x1;
    }

    return hasFilter ? eachOptionalGenericFiltered : eachOptionalGeneric;
}

export function compileOptionalQueryCount(filterMode: QueryFilterMode): OptionalQueryCountExecutor {
    return filterMode === "unfiltered"
        ? countOptionalQueryMatches
        : countOptionalQueryMatchesFiltered;
}

function* iterateRequired1(
    plan: ResolvedQueryPlan,
    _changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<readonly AnyComponentType[]>> {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const baseIsStore0 = store0 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        yield [entity, value0] as unknown as QueryRow<readonly AnyComponentType[]>;
    }
}

function* iterateRequired1Filtered(
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<readonly AnyComponentType[]>> {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const baseIsStore0 = store0 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        yield [entity, value0] as unknown as QueryRow<readonly AnyComponentType[]>;
    }
}

function* iterateRequired2(
    plan: ResolvedQueryPlan,
    _changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<readonly AnyComponentType[]>> {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const store1 = plan.stores[1]!;
    const baseIsStore0 = store0 === baseStore;
    const baseIsStore1 = store1 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        const value1 = baseIsStore1 ? baseValues[index] : store1.get(entity);

        if (value1 === undefined) {
            continue;
        }

        yield [entity, value0, value1] as unknown as QueryRow<readonly AnyComponentType[]>;
    }
}

function* iterateRequired2Filtered(
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<readonly AnyComponentType[]>> {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const store1 = plan.stores[1]!;
    const baseIsStore0 = store0 === baseStore;
    const baseIsStore1 = store1 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        const value1 = baseIsStore1 ? baseValues[index] : store1.get(entity);

        if (value1 === undefined) {
            continue;
        }

        yield [entity, value0, value1] as unknown as QueryRow<readonly AnyComponentType[]>;
    }
}

function* iterateRequired3(
    plan: ResolvedQueryPlan,
    _changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<readonly AnyComponentType[]>> {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const store1 = plan.stores[1]!;
    const store2 = plan.stores[2]!;
    const baseIsStore0 = store0 === baseStore;
    const baseIsStore1 = store1 === baseStore;
    const baseIsStore2 = store2 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        const value1 = baseIsStore1 ? baseValues[index] : store1.get(entity);

        if (value1 === undefined) {
            continue;
        }

        const value2 = baseIsStore2 ? baseValues[index] : store2.get(entity);

        if (value2 === undefined) {
            continue;
        }

        yield [entity, value0, value1, value2] as unknown as QueryRow<readonly AnyComponentType[]>;
    }
}

function* iterateRequired3Filtered(
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<readonly AnyComponentType[]>> {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const store1 = plan.stores[1]!;
    const store2 = plan.stores[2]!;
    const baseIsStore0 = store0 === baseStore;
    const baseIsStore1 = store1 === baseStore;
    const baseIsStore2 = store2 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        const value1 = baseIsStore1 ? baseValues[index] : store1.get(entity);

        if (value1 === undefined) {
            continue;
        }

        const value2 = baseIsStore2 ? baseValues[index] : store2.get(entity);

        if (value2 === undefined) {
            continue;
        }

        yield [entity, value0, value1, value2] as unknown as QueryRow<readonly AnyComponentType[]>;
    }
}

function* iterateRequiredGeneric(
    plan: ResolvedQueryPlan,
    _changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<readonly AnyComponentType[]>> {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const components: unknown[] = plan.scratchpad;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!fillComponents(entity, plan.stores, components, baseStore, baseValues[index])) {
            continue;
        }

        yield [entity, ...components] as unknown as QueryRow<readonly AnyComponentType[]>;
    }
}

function* iterateRequiredGenericFiltered(
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<QueryRow<readonly AnyComponentType[]>> {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const components: unknown[] = plan.scratchpad;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        if (!fillComponents(entity, plan.stores, components, baseStore, baseValues[index])) {
            continue;
        }

        yield [entity, ...components] as unknown as QueryRow<readonly AnyComponentType[]>;
    }
}

function eachRequired1(
    plan: ResolvedQueryPlan,
    _changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const baseIsStore0 = store0 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        visitor(entity, value0);
    }
}

function eachRequired1Filtered(
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const baseIsStore0 = store0 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        visitor(entity, value0);
    }
}

function eachRequired2(
    plan: ResolvedQueryPlan,
    _changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const store1 = plan.stores[1]!;
    const baseIsStore0 = store0 === baseStore;
    const baseIsStore1 = store1 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        const value1 = baseIsStore1 ? baseValues[index] : store1.get(entity);

        if (value1 === undefined) {
            continue;
        }

        visitor(entity, value0, value1);
    }
}

function eachRequired2Filtered(
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const store1 = plan.stores[1]!;
    const baseIsStore0 = store0 === baseStore;
    const baseIsStore1 = store1 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        const value1 = baseIsStore1 ? baseValues[index] : store1.get(entity);

        if (value1 === undefined) {
            continue;
        }

        visitor(entity, value0, value1);
    }
}

function eachRequired3(
    plan: ResolvedQueryPlan,
    _changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const store1 = plan.stores[1]!;
    const store2 = plan.stores[2]!;
    const baseIsStore0 = store0 === baseStore;
    const baseIsStore1 = store1 === baseStore;
    const baseIsStore2 = store2 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        const value1 = baseIsStore1 ? baseValues[index] : store1.get(entity);

        if (value1 === undefined) {
            continue;
        }

        const value2 = baseIsStore2 ? baseValues[index] : store2.get(entity);

        if (value2 === undefined) {
            continue;
        }

        visitor(entity, value0, value1, value2);
    }
}

function eachRequired3Filtered(
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const store0 = plan.stores[0]!;
    const store1 = plan.stores[1]!;
    const store2 = plan.stores[2]!;
    const baseIsStore0 = store0 === baseStore;
    const baseIsStore1 = store1 === baseStore;
    const baseIsStore2 = store2 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        const value0 = baseIsStore0 ? baseValues[index] : store0.get(entity);

        if (value0 === undefined) {
            continue;
        }

        const value1 = baseIsStore1 ? baseValues[index] : store1.get(entity);

        if (value1 === undefined) {
            continue;
        }

        const value2 = baseIsStore2 ? baseValues[index] : store2.get(entity);

        if (value2 === undefined) {
            continue;
        }

        visitor(entity, value0, value1, value2);
    }
}

function eachRequiredGeneric(
    plan: ResolvedQueryPlan,
    _changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const components: unknown[] = plan.scratchpad;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!fillComponents(entity, plan.stores, components, baseStore, baseValues[index])) {
            continue;
        }

        visitor(entity, ...components);
    }
}

function eachRequiredGenericFiltered(
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentRequiredBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const components: unknown[] = plan.scratchpad;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        if (!fillComponents(entity, plan.stores, components, baseStore, baseValues[index])) {
            continue;
        }

        visitor(entity, ...components);
    }
}

function countRequiredQueryMatches(
    plan: ResolvedQueryPlan,
    _changeDetection: ChangeDetectionRange,
    limit: number
): number {
    let matches = 0;
    const baseStore = currentRequiredBaseStore(plan);

    for (const entity of baseStore.entities) {
        if (!hasComponents(entity, plan.stores, baseStore)) {
            continue;
        }

        matches++;

        if (matches >= limit) {
            return matches;
        }
    }

    return matches;
}

function countRequiredQueryMatchesFiltered(
    plan: ResolvedQueryPlan,
    changeDetection: ChangeDetectionRange,
    limit: number
): number {
    let matches = 0;
    const baseStore = currentRequiredBaseStore(plan);

    for (const entity of baseStore.entities) {
        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        if (!hasComponents(entity, plan.stores, baseStore)) {
            continue;
        }

        matches++;

        if (matches >= limit) {
            return matches;
        }
    }

    return matches;
}

function* iterateOptional1x1(
    plan: ResolvedOptionalQueryPlan,
    _changeDetection: ChangeDetectionRange
): IterableIterator<OptionalQueryRow<readonly AnyComponentType[], readonly AnyComponentType[]>> {
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const requiredStore0 = plan.requiredStores[0]!;
    const optionalStore0 = plan.optionalStores[0];
    const baseIsRequiredStore0 = requiredStore0 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        const requiredValue0 = baseIsRequiredStore0
            ? baseValues[index]
            : requiredStore0.get(entity);

        if (requiredValue0 === undefined) {
            continue;
        }

        yield [entity, requiredValue0, optionalStore0?.get(entity)] as unknown as OptionalQueryRow<
            readonly AnyComponentType[],
            readonly AnyComponentType[]
        >;
    }
}

function* iterateOptional1x1Filtered(
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<OptionalQueryRow<readonly AnyComponentType[], readonly AnyComponentType[]>> {
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const requiredStore0 = plan.requiredStores[0]!;
    const optionalStore0 = plan.optionalStores[0];
    const baseIsRequiredStore0 = requiredStore0 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        const requiredValue0 = baseIsRequiredStore0
            ? baseValues[index]
            : requiredStore0.get(entity);

        if (requiredValue0 === undefined) {
            continue;
        }

        yield [entity, requiredValue0, optionalStore0?.get(entity)] as unknown as OptionalQueryRow<
            readonly AnyComponentType[],
            readonly AnyComponentType[]
        >;
    }
}

function* iterateOptionalGeneric(
    plan: ResolvedOptionalQueryPlan,
    _changeDetection: ChangeDetectionRange
): IterableIterator<OptionalQueryRow<readonly AnyComponentType[], readonly AnyComponentType[]>> {
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const components: unknown[] = plan.scratchpad;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (
            !fillComponents(entity, plan.requiredStores, components, baseStore, baseValues[index])
        ) {
            continue;
        }

        fillOptionalComponents(entity, plan.optionalStores, components, plan.requiredStores.length);

        yield [entity, ...components] as unknown as OptionalQueryRow<
            readonly AnyComponentType[],
            readonly AnyComponentType[]
        >;
    }
}

function* iterateOptionalGenericFiltered(
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange
): IterableIterator<OptionalQueryRow<readonly AnyComponentType[], readonly AnyComponentType[]>> {
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const components: unknown[] = new Array(
        plan.requiredStores.length + plan.optionalStores.length
    );

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        if (
            !fillComponents(entity, plan.requiredStores, components, baseStore, baseValues[index])
        ) {
            continue;
        }

        fillOptionalComponents(entity, plan.optionalStores, components, plan.requiredStores.length);

        yield [entity, ...components] as unknown as OptionalQueryRow<
            readonly AnyComponentType[],
            readonly AnyComponentType[]
        >;
    }
}

function eachOptional1x1(
    plan: ResolvedOptionalQueryPlan,
    _changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const requiredStore0 = plan.requiredStores[0]!;
    const optionalStore0 = plan.optionalStores[0];
    const baseIsRequiredStore0 = requiredStore0 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        const requiredValue0 = baseIsRequiredStore0
            ? baseValues[index]
            : requiredStore0.get(entity);

        if (requiredValue0 === undefined) {
            continue;
        }

        visitor(entity, requiredValue0, optionalStore0?.get(entity));
    }
}

function eachOptional1x1Filtered(
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const requiredStore0 = plan.requiredStores[0]!;
    const optionalStore0 = plan.optionalStores[0];
    const baseIsRequiredStore0 = requiredStore0 === baseStore;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        const requiredValue0 = baseIsRequiredStore0
            ? baseValues[index]
            : requiredStore0.get(entity);

        if (requiredValue0 === undefined) {
            continue;
        }

        visitor(entity, requiredValue0, optionalStore0?.get(entity));
    }
}

function eachOptionalGeneric(
    plan: ResolvedOptionalQueryPlan,
    _changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const components: unknown[] = plan.scratchpad;

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (
            !fillComponents(entity, plan.requiredStores, components, baseStore, baseValues[index])
        ) {
            continue;
        }

        fillOptionalComponents(entity, plan.optionalStores, components, plan.requiredStores.length);
        visitor(entity, ...components);
    }
}

function eachOptionalGenericFiltered(
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange,
    visitor: QueryEachVisitor
): void {
    const baseStore = currentOptionalBaseStore(plan);
    const baseEntities = baseStore.entities;
    const baseValues = baseStore.values;
    const components: unknown[] = new Array(
        plan.requiredStores.length + plan.optionalStores.length
    );

    for (let index = 0; index < baseEntities.length; index++) {
        const entity = baseEntities[index]!;

        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        if (
            !fillComponents(entity, plan.requiredStores, components, baseStore, baseValues[index])
        ) {
            continue;
        }

        fillOptionalComponents(entity, plan.optionalStores, components, plan.requiredStores.length);
        visitor(entity, ...components);
    }
}

function countOptionalQueryMatches(
    plan: ResolvedOptionalQueryPlan,
    _changeDetection: ChangeDetectionRange,
    limit: number
): number {
    let matches = 0;
    const baseStore = currentOptionalBaseStore(plan);

    for (const entity of baseStore.entities) {
        if (!hasComponents(entity, plan.requiredStores, baseStore)) {
            continue;
        }

        matches++;

        if (matches >= limit) {
            return matches;
        }
    }

    return matches;
}

function countOptionalQueryMatchesFiltered(
    plan: ResolvedOptionalQueryPlan,
    changeDetection: ChangeDetectionRange,
    limit: number
): number {
    let matches = 0;
    const baseStore = currentOptionalBaseStore(plan);

    for (const entity of baseStore.entities) {
        if (!plan.matchesFilter(entity, plan, changeDetection, baseStore)) {
            continue;
        }

        if (!hasComponents(entity, plan.requiredStores, baseStore)) {
            continue;
        }

        matches++;

        if (matches >= limit) {
            return matches;
        }
    }

    return matches;
}

function currentRequiredBaseStore(plan: ResolvedQueryPlan): SparseSet<unknown> {
    return chooseSmallestStore(plan.stores, plan.filterStores.with);
}

function currentOptionalBaseStore(plan: ResolvedOptionalQueryPlan): SparseSet<unknown> {
    return chooseSmallestStore(plan.requiredStores, plan.filterStores.with);
}
