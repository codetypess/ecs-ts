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
import { isTickInRange } from "../query";
import {
    ensureComponentStore,
    getComponentStore,
    getComponentStoreEntries,
    getComponentType,
    type ComponentStoreRuntimeContext,
} from "./component-store-runtime";

interface ComponentRuntimeOptions {
    readonly entities: EntityManager;
    readonly componentStores: ComponentStoreRuntimeContext;
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

export type ComponentRuntimeContext = ComponentRuntimeOptions;

export function createComponentRuntimeContext(
    options: ComponentRuntimeOptions
): ComponentRuntimeContext {
    return options;
}

export function insertBundle(
    context: ComponentRuntimeContext,
    entity: Entity,
    bundle: Bundle
): void {
    assertAlive(context, entity);

    for (const entry of bundle.entries) {
        add(context, entity, entry.type, entry.value);
    }
}

export function removeBundle(
    context: ComponentRuntimeContext,
    entity: Entity,
    bundle: Bundle
): boolean {
    let removedAny = false;

    for (const entry of bundle.entries) {
        removedAny = remove(context, entity, entry.type) || removedAny;
    }

    return removedAny;
}

export function add<T>(
    context: ComponentRuntimeContext,
    entity: Entity,
    type: ComponentType<T>,
    value: T
): void {
    assertAlive(context, entity);
    addWithRequired(context, entity, type, value, []);
}

export function markChanged<T>(
    context: ComponentRuntimeContext,
    entity: Entity,
    type: ComponentType<T>
): boolean {
    if (!context.entities.isAlive(entity)) {
        return false;
    }

    return getComponentStore(context.componentStores, type)?.markChanged(
        entity,
        context.getChangeTick()
    ) ?? false;
}

export function has<T>(
    context: ComponentRuntimeContext,
    entity: Entity,
    type: ComponentType<T>
): boolean {
    return context.entities.isAlive(entity) && (getComponentStore(context.componentStores, type)?.has(entity) ?? false);
}

export function hasAll(
    context: ComponentRuntimeContext,
    entity: Entity,
    types: readonly AnyComponentType[]
): boolean {
    if (!context.entities.isAlive(entity)) {
        return false;
    }

    for (const type of types) {
        if (!getComponentStore(context.componentStores, type)?.has(entity)) {
            return false;
        }
    }

    return true;
}

export function hasAny(
    context: ComponentRuntimeContext,
    entity: Entity,
    types: readonly AnyComponentType[]
): boolean {
    if (!context.entities.isAlive(entity)) {
        return false;
    }

    for (const type of types) {
        if (getComponentStore(context.componentStores, type)?.has(entity)) {
            return true;
        }
    }

    return false;
}

export function get<T>(
    context: ComponentRuntimeContext,
    entity: Entity,
    type: ComponentType<T>
): T | undefined {
    if (!context.entities.isAlive(entity)) {
        return undefined;
    }

    return getComponentStore(context.componentStores, type)?.get(entity);
}

export function mustGet<T>(
    context: ComponentRuntimeContext,
    entity: Entity,
    type: ComponentType<T>
): T {
    const value = get(context, entity, type);

    if (value === undefined) {
        throw new Error(`Entity ${formatEntity(entity)} does not have ${type.name}`);
    }

    return value;
}

export function getMany<const TComponents extends readonly AnyComponentType[]>(
    context: ComponentRuntimeContext,
    entity: Entity,
    ...types: TComponents
): ComponentTuple<TComponents> | undefined {
    if (!context.entities.isAlive(entity)) {
        return undefined;
    }

    const components: unknown[] = new Array(types.length);

    for (let index = 0; index < types.length; index++) {
        const type = types[index]!;
        const store = getComponentStore(context.componentStores, type);

        if (!store?.has(entity)) {
            return undefined;
        }

        components[index] = store.get(entity);
    }

    return components as ComponentTuple<TComponents>;
}

export function isAdded<T>(
    context: ComponentRuntimeContext,
    entity: Entity,
    type: ComponentType<T>
): boolean {
    if (!context.entities.isAlive(entity)) {
        return false;
    }

    const tick = getComponentStore(context.componentStores, type)?.getAddedTick(entity);

    return tick !== undefined && isTickInRange(tick, context.getChangeDetectionRange());
}

export function isChanged<T>(
    context: ComponentRuntimeContext,
    entity: Entity,
    type: ComponentType<T>
): boolean {
    if (!context.entities.isAlive(entity)) {
        return false;
    }

    const tick = getComponentStore(context.componentStores, type)?.getChangedTick(entity);

    return tick !== undefined && isTickInRange(tick, context.getChangeDetectionRange());
}

export function remove<T>(
    context: ComponentRuntimeContext,
    entity: Entity,
    type: ComponentType<T>
): boolean {
    const store = getComponentStore(context.componentStores, type);

    if (!context.entities.isAlive(entity) || !store?.has(entity)) {
        return false;
    }

    const component = store.get(entity) as T;
    context.runComponentHooks(type, "onReplace", entity, component);
    context.runComponentHooks(type, "onRemove", entity, component);
    context.recordRemoved(type, entity, component);
    store.delete(entity);

    return true;
}

export function despawn(context: ComponentRuntimeContext, entity: Entity): boolean {
    if (!context.entities.isAlive(entity)) {
        return false;
    }

    for (const [componentId, store] of getComponentStoreEntries(context.componentStores)) {
        if (!store.has(entity)) {
            continue;
        }

        const type = getComponentType(context.componentStores, componentId);
        const component = store.get(entity);

        if (type !== undefined) {
            context.runComponentHooks(type, "onReplace", entity, component);
            context.runComponentHooks(type, "onRemove", entity, component);
            context.runComponentHooks(type, "onDespawn", entity, component);
            context.recordRemoved(type, entity, component);
        }

        store.delete(entity);
    }

    return context.entities.destroy(entity);
}

function addWithRequired<T>(
    context: ComponentRuntimeContext,
    entity: Entity,
    type: ComponentType<T>,
    value: T,
    resolving: readonly AnyComponentType[]
): void {
    assertComponentValue(type, value);
    addRequiredComponents(context, entity, type, resolving);
    insertComponentOnly(context, entity, type, value);
}

function addRequiredComponents(
    context: ComponentRuntimeContext,
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

function insertComponentOnly<T>(
    context: ComponentRuntimeContext,
    entity: Entity,
    type: ComponentType<T>,
    value: T
): void {
    assertComponentValue(type, value);
    const store = ensureComponentStore(context.componentStores, type);
    const hadComponent = store.has(entity);

    if (hadComponent) {
        context.runComponentHooks(type, "onReplace", entity, store.get(entity) as T);
    }

    store.set(entity, value, context.getChangeTick());

    if (!hadComponent) {
        context.runComponentHooks(type, "onAdd", entity, value);
    }

    context.runComponentHooks(type, "onInsert", entity, value);
}

function assertAlive(context: ComponentRuntimeContext, entity: Entity): void {
    if (!context.entities.isAlive(entity)) {
        throw new Error(`Entity is not alive: ${formatEntity(entity)}`);
    }
}
