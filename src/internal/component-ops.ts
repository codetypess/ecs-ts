import type {
    AnyComponentType,
    Bundle,
    ComponentLifecycleStage,
    ComponentType,
} from "../component";
import { assertComponentValue } from "../component";
import { EntityManager, formatEntity } from "../entity";
import type { Entity } from "../entity";
import type { ChangeDetectionRange, ComponentTuple } from "../query";
import {
    ensureComponentStore,
    getComponentStore,
    getComponentType,
    type ComponentStoreContext,
} from "./component-store";
import {
    getManyComponents,
    hasAllComponents,
    hasAnyComponents,
    isComponentAdded,
    isComponentChanged,
} from "./component-read";
import {
    takeEntityComponents,
    trackEntityComponent,
    untrackEntityComponent,
    type EntityComponentIndexContext,
} from "./entity-component-index";

interface ComponentOpsContextOptions {
    readonly entities: EntityManager;
    readonly componentStores: ComponentStoreContext;
    readonly entityComponents: EntityComponentIndexContext;
    readonly getChangeTick: () => number;
    readonly getChangeDetectionRange: () => ChangeDetectionRange;
    readonly runComponentHooks: <T>(
        type: ComponentType<T>,
        stage: ComponentLifecycleStage,
        entity: Entity,
        component: T
    ) => void;
    readonly recordRemoved: <T>(type: ComponentType<T>, entity: Entity, component: T) => void;
}

/** Shared dependencies for component mutation helpers. */
export type ComponentOpsContext = ComponentOpsContextOptions;

/** Creates the component-operations context used by `World`. */
export function createComponentOpsContext(
    options: ComponentOpsContextOptions
): ComponentOpsContext {
    return options;
}

/** Inserts every entry in a bundle, validating that the entity is alive first. */
export function insertBundle(context: ComponentOpsContext, entity: Entity, bundle: Bundle): void {
    assertAlive(context, entity);

    for (const entry of bundle.entries) {
        add(context, entity, entry.type, entry.value);
    }
}

/** Removes every entry listed by a bundle and reports whether anything changed. */
export function removeBundle(
    context: ComponentOpsContext,
    entity: Entity,
    bundle: Bundle
): boolean {
    let removedAny = false;

    for (const entry of bundle.entries) {
        removedAny = remove(context, entity, entry.type) || removedAny;
    }

    return removedAny;
}

/** Inserts or replaces a component, including required-component expansion. */
export function add<T>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>,
    value: T
): void {
    assertAlive(context, entity);
    addWithRequired(context, entity, type, value, []);
}

/** Updates the changed tick for an existing component. */
export function markChanged<T>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>
): boolean {
    if (!context.entities.isAlive(entity)) {
        return false;
    }

    return (
        getComponentStore(context.componentStores, type)?.markChanged(
            entity,
            context.getChangeTick()
        ) ?? false
    );
}

/** Returns whether the entity currently has the requested component. */
export function has<T>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>
): boolean {
    return (
        context.entities.isAlive(entity) &&
        (getComponentStore(context.componentStores, type)?.has(entity) ?? false)
    );
}

/** Returns whether the entity has every component in the provided list. */
export function hasAll(
    context: ComponentOpsContext,
    entity: Entity,
    types: readonly AnyComponentType[]
): boolean {
    return hasAllComponents(context.entities, context.componentStores.stores, entity, types);
}

/** Returns whether the entity has at least one component in the provided list. */
export function hasAny(
    context: ComponentOpsContext,
    entity: Entity,
    types: readonly AnyComponentType[]
): boolean {
    return hasAnyComponents(context.entities, context.componentStores.stores, entity, types);
}

/** Returns the component value when the entity is alive and the component exists. */
export function get<T>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>
): T | undefined {
    if (!context.entities.isAlive(entity)) {
        return undefined;
    }

    return getComponentStore(context.componentStores, type)?.get(entity);
}

/** Returns the component value or throws when it is missing. */
export function mustGet<T>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>
): T {
    const value = get(context, entity, type);

    if (value === undefined) {
        throw new Error(`Entity ${formatEntity(entity)} does not have ${type.name}`);
    }

    return value;
}

/** Returns multiple component values at once, aborting when any are missing. */
export function getMany<const TComponents extends readonly AnyComponentType[]>(
    context: ComponentOpsContext,
    entity: Entity,
    ...types: TComponents
): ComponentTuple<TComponents> | undefined {
    return getManyComponents(context.entities, context.componentStores.stores, entity, types);
}

/** Returns whether the component was added inside the current change-detection window. */
export function isAdded<T>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>
): boolean {
    return isComponentAdded(
        context.entities,
        context.componentStores.stores,
        entity,
        type,
        context.getChangeDetectionRange()
    );
}

/** Returns whether the component changed inside the current change-detection window. */
export function isChanged<T>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>
): boolean {
    return isComponentChanged(
        context.entities,
        context.componentStores.stores,
        entity,
        type,
        context.getChangeDetectionRange()
    );
}

/** Removes a component and runs replacement/removal lifecycle hooks before deleting it. */
export function remove<T>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>
): boolean {
    const store = getComponentStore(context.componentStores, type);
    const component = store?.get(entity);

    if (!context.entities.isAlive(entity) || store === undefined || component === undefined) {
        return false;
    }

    context.runComponentHooks(type, "onReplace", entity, component);
    context.runComponentHooks(type, "onRemove", entity, component);
    context.recordRemoved(type, entity, component);
    untrackEntityComponent(context.entityComponents, entity, type.id);
    store.delete(entity);

    return true;
}

/** Removes every component on the entity, records removals, and destroys the entity handle. */
export function despawn(context: ComponentOpsContext, entity: Entity): boolean {
    if (!context.entities.isAlive(entity)) {
        return false;
    }

    const componentIds = takeEntityComponents(context.entityComponents, entity).sort(
        (left, right) => left - right
    );

    for (const componentId of componentIds) {
        const store = context.componentStores.stores[componentId];
        const type = getComponentType(context.componentStores, componentId);
        const component = store?.get(entity);

        if (type !== undefined && component !== undefined) {
            context.runComponentHooks(type, "onReplace", entity, component);
            context.runComponentHooks(type, "onRemove", entity, component);
            context.runComponentHooks(type, "onDespawn", entity, component);
            context.recordRemoved(type, entity, component);
        }

        store?.delete(entity);
    }

    return context.entities.destroy(entity);
}

/** Expands required components recursively before inserting the requested component. */
function addWithRequired<T>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>,
    value: T,
    resolving: readonly AnyComponentType[]
): void {
    assertComponentValue(type, value);
    addRequiredComponents(context, entity, type, resolving);
    insertComponentOnly(context, entity, type, value);
}

/** Resolves required-component chains and detects dependency cycles eagerly. */
function addRequiredComponents(
    context: ComponentOpsContext,
    entity: Entity,
    type: AnyComponentType,
    resolving: readonly AnyComponentType[]
): void {
    if (type.required.length === 0) {
        return;
    }

    const cycleStart = resolving.findIndex((resolvedType) => resolvedType.id === type.id);

    if (cycleStart !== -1) {
        const cycle = [...resolving.slice(cycleStart), type]
            .map((resolvedType) => resolvedType.name)
            .join(" -> ");
        throw new Error(`Circular required component dependency: ${cycle}`);
    }

    const nextResolving = [...resolving, type];

    for (const required of type.required) {
        if (has(context, entity, required.type)) {
            continue;
        }

        addWithRequired(context, entity, required.type, required.create(), nextResolving);
    }
}

/** Writes exactly one component store and runs the appropriate lifecycle hooks around it. */
function insertComponentOnly<T>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>,
    value: T
): void {
    assertComponentValue(type, value);
    const store = ensureComponentStore(context.componentStores, type);
    const previous = store.get(entity);

    if (previous !== undefined) {
        context.runComponentHooks(type, "onReplace", entity, previous);
    }

    store.set(entity, value, context.getChangeTick());

    if (previous === undefined) {
        trackEntityComponent(context.entityComponents, entity, type.id);
        context.runComponentHooks(type, "onAdd", entity, value);
    }

    context.runComponentHooks(type, "onInsert", entity, value);
}

/** Guards every mutation path that expects a live entity handle. */
function assertAlive(context: ComponentOpsContext, entity: Entity): void {
    if (!context.entities.isAlive(entity)) {
        throw new Error(`Entity is not alive: ${formatEntity(entity)}`);
    }
}
