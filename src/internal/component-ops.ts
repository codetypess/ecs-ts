import type { AnyComponentType, ComponentLifecycleStage, ComponentType } from "../component.js";
import { assertComponentValue } from "../component.js";
import { EntityManager, formatEntity } from "../entity.js";
import type { Entity } from "../entity.js";
import type { ChangeDetectionRange, ComponentTuple } from "../query.js";
import {
    ensureComponentStore,
    getComponentStore,
    getComponentType,
    type ComponentStoreContext,
} from "./component-store.js";
import {
    getManyComponents,
    hasAllComponents,
    hasAnyComponents,
    isComponentAdded,
    isComponentChanged,
} from "./component-read.js";
import {
    takeEntityComponents,
    trackEntityComponent,
    untrackEntityComponent,
    type EntityComponentIndexContext,
} from "./entity-component-index.js";
import { sortComponentTypesByDependencies } from "./component-dependencies.js";

interface ComponentOpsContextOptions {
    readonly entities: EntityManager;
    readonly componentStores: ComponentStoreContext;
    readonly entityComponents: EntityComponentIndexContext;
    readonly getChangeTick: () => number;
    readonly getChangeDetectionRange: () => ChangeDetectionRange;
    readonly runComponentHooks: <T extends object>(
        type: ComponentType<T>,
        stage: ComponentLifecycleStage,
        entity: Entity,
        component: T
    ) => void;
    readonly recordRemoved: <T extends object>(
        type: ComponentType<T>,
        entity: Entity,
        component: T
    ) => void;
}

/** Shared dependencies for component mutation helpers. */
export type ComponentOpsContext = ComponentOpsContextOptions;

/** Creates the component-operations context used by `World`. */
export function createComponentOpsContext(
    options: ComponentOpsContextOptions
): ComponentOpsContext {
    return options;
}

/** Inserts or replaces a component, including required-component expansion. */
export function add<T extends object>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>,
    value: T
): void {
    assertAlive(context, entity);
    assertComponentValue(type, value);
    insertComponentOnly(context, entity, type, value);
}

/** Inserts or replaces a component after the caller has already validated liveness and payload. */
export function addValidated<T extends object>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>,
    value: T
): void {
    insertComponentOnly(context, entity, type, value);
}

/** Updates the changed tick for an existing component. */
export function markChanged<T extends object>(
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
export function has<T extends object>(
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
export function get<T extends object>(
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
export function mustGet<T extends object>(
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
export function isAdded<T extends object>(
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
export function isChanged<T extends object>(
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
export function remove<T extends object>(
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

    const componentIds = takeEntityComponents(context.entityComponents, entity);

    if (!despawnNeedsDependencyOrder(context, componentIds)) {
        componentIds.sort((left, right) => left - right);

        for (const componentId of componentIds) {
            const store = context.componentStores.stores[componentId];
            const type = getComponentType(context.componentStores, componentId);
            const component = store?.get(entity) as object | undefined;

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

    const componentTypes = sortComponentTypesByDependencies(
        componentIds
            .map((componentId) => getComponentType(context.componentStores, componentId))
            .filter((type): type is AnyComponentType => type !== undefined),
        "dependentsFirst"
    );

    for (const type of componentTypes) {
        const store = context.componentStores.stores[type.id];
        const component = store?.get(entity) as object | undefined;

        if (component !== undefined) {
            context.runComponentHooks(type, "onReplace", entity, component);
            context.runComponentHooks(type, "onRemove", entity, component);
            context.runComponentHooks(type, "onDespawn", entity, component);
            context.recordRemoved(type, entity, component);
        }

        store?.delete(entity);
    }

    return context.entities.destroy(entity);
}

/** Writes exactly one component store and runs the appropriate lifecycle hooks around it. */
function insertComponentOnly<T extends object>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>,
    value: T
): void {
    const store = ensureComponentStore(context.componentStores, type);
    const previous = store.set(entity, value, context.getChangeTick());

    if (previous !== undefined) {
        context.runComponentHooks(type, "onReplace", entity, previous);
    }

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

function despawnNeedsDependencyOrder(
    context: ComponentOpsContext,
    componentIds: readonly number[]
): boolean {
    if (componentIds.length < 2) {
        return false;
    }

    for (const componentId of componentIds) {
        const type = getComponentType(context.componentStores, componentId);

        if (type !== undefined && type.deps.length > 0) {
            return true;
        }
    }

    return false;
}
