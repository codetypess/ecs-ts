import type {
    AnyComponentType,
    ComponentAddReason,
    ComponentLifecycleStage,
    ComponentRemoveReason,
    ComponentType,
} from "../component";
import { assertComponentValue } from "../component";
import type { Entity } from "../entity";
import { EntityManager, formatEntity } from "../entity";
import type { ChangeDetectionRange, ComponentTuple } from "../query";
import { sortComponentTypesByDependencies } from "./component-dependencies";
import {
    getManyComponents,
    hasAllComponents,
    hasAnyComponents,
    isComponentAdded,
    isComponentChanged,
} from "./component-read";
import {
    ensureComponentStore,
    getComponentStore,
    type ComponentStoreContext,
} from "./component-store";
import {
    takeEntityComponents,
    trackEntityComponent,
    untrackEntityComponent,
    type EntityComponentIndexContext,
} from "./entity-component-index";
import {
    assertStructuralWriteAllowed,
    recordStructuralChange,
    type QueryMutationContext,
} from "./query-mutation-control";

interface ComponentOpsContextOptions {
    readonly entities: EntityManager;
    readonly componentStores: ComponentStoreContext;
    readonly entityComponents: EntityComponentIndexContext;
    readonly queryMutations: QueryMutationContext;
    readonly getChangeTick: () => number;
    readonly getChangeDetectionRange: () => ChangeDetectionRange;
    readonly runComponentHooks: {
        <T extends object>(
            type: ComponentType<T>,
            stage: "onAdd",
            entity: Entity,
            component: T,
            reason: ComponentAddReason
        ): void;
        <T extends object>(
            type: ComponentType<T>,
            stage: "onRemove",
            entity: Entity,
            component: T,
            reason: ComponentRemoveReason
        ): void;
        <T extends object>(
            type: ComponentType<T>,
            stage: Exclude<ComponentLifecycleStage, "onAdd" | "onRemove" | "onReplace">,
            entity: Entity,
            component: T
        ): void;
        <T extends object>(
            type: ComponentType<T>,
            stage: "onReplace",
            entity: Entity,
            previous: T,
            next: T
        ): void;
    };
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
    value: T,
    reason: ComponentAddReason = "added"
): void {
    assertAlive(context, entity);
    assertComponentValue(type, value);
    insertComponentOnly(context, entity, type, value, reason);
}

/** Inserts or replaces a component after the caller has already validated liveness and payload. */
export function addValidated<T extends object>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>,
    value: T,
    reason: ComponentAddReason = "added"
): void {
    insertComponentOnly(context, entity, type, value, reason);
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
    return hasAllComponents(context.entities, context.componentStores, entity, types);
}

/** Returns whether the entity has at least one component in the provided list. */
export function hasAny(
    context: ComponentOpsContext,
    entity: Entity,
    types: readonly AnyComponentType[]
): boolean {
    return hasAnyComponents(context.entities, context.componentStores, entity, types);
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
    return getManyComponents(context.entities, context.componentStores, entity, types);
}

/** Returns whether the component was added inside the current change-detection window. */
export function isAdded<T extends object>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>
): boolean {
    return isComponentAdded(
        context.entities,
        context.componentStores,
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
        context.componentStores,
        entity,
        type,
        context.getChangeDetectionRange()
    );
}

/** Removes a component and runs unset/removal lifecycle hooks before deleting it. */
export function remove<T extends object>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>
): boolean {
    assertStructuralWriteAllowed(context.queryMutations, "remove components");
    const store = getComponentStore(context.componentStores, type);
    const component = store?.get(entity);

    if (!context.entities.isAlive(entity) || store === undefined || component === undefined) {
        return false;
    }

    context.runComponentHooks(type, "onUnset", entity, component);
    context.runComponentHooks(type, "onRemove", entity, component, "removed");
    untrackEntityComponent(context.entityComponents, entity, type);
    if (store.delete(entity)) {
        recordStructuralChange(context.queryMutations);
    }

    return true;
}

/** Removes every component on the entity and destroys the entity handle. */
export function despawn(context: ComponentOpsContext, entity: Entity): boolean {
    assertStructuralWriteAllowed(context.queryMutations, "despawn entities");
    if (!context.entities.isAlive(entity)) return false;

    const trackedTypes = takeEntityComponents(context.entityComponents, entity);
    const componentTypes = despawnNeedsDependencyOrder(trackedTypes)
        ? sortComponentTypesByDependencies(trackedTypes, "dependentsFirst")
        : trackedTypes;

    for (const type of componentTypes) {
        const store = getComponentStore(context.componentStores, type);
        const component = store?.get(entity) as object | undefined;

        if (component !== undefined) {
            context.runComponentHooks(type, "onUnset", entity, component);
            context.runComponentHooks(type, "onRemove", entity, component, "despawned");
        }

        if (store?.delete(entity) === true) {
            recordStructuralChange(context.queryMutations);
        }
    }

    const destroyed = context.entities.destroy(entity);

    if (destroyed) {
        recordStructuralChange(context.queryMutations);
    }

    return destroyed;
}

/** Writes exactly one component store and runs the appropriate lifecycle hooks around it. */
function insertComponentOnly<T extends object>(
    context: ComponentOpsContext,
    entity: Entity,
    type: ComponentType<T>,
    value: T,
    reason: ComponentAddReason
): void {
    assertStructuralWriteAllowed(context.queryMutations, "add components");
    const store = ensureComponentStore(context.componentStores, type);
    const previous = store.set(entity, value, context.getChangeTick());

    if (previous !== undefined) {
        context.runComponentHooks(type, "onUnset", entity, previous);
        context.runComponentHooks(type, "onReplace", entity, previous, value);
    } else {
        recordStructuralChange(context.queryMutations);
        trackEntityComponent(context.entityComponents, entity, type);
        context.runComponentHooks(type, "onAdd", entity, value, reason);
    }

    context.runComponentHooks(type, "onInsert", entity, value);
}

/** Guards every mutation path that expects a live entity handle. */
function assertAlive(context: ComponentOpsContext, entity: Entity): void {
    if (!context.entities.isAlive(entity)) {
        throw new Error(`Entity is not alive: ${formatEntity(entity)}`);
    }
}

function despawnNeedsDependencyOrder(componentTypes: readonly AnyComponentType[]): boolean {
    if (componentTypes.length < 2) return false;
    return componentTypes.some((type) => type.deps.length > 0);
}
