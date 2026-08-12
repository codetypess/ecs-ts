import type { AnyComponentType, ComponentType } from "../component";
import type { Entity } from "../entity";
import { EntityManager } from "../entity";
import type { ChangeDetectionRange, ComponentTuple } from "../query";
import { isTickInRange } from "../query";
import { getComponentStore, type ComponentStoreContext } from "./component-store";

export function hasAllComponents(
    entities: EntityManager,
    context: ComponentStoreContext,
    entity: Entity,
    types: readonly AnyComponentType[]
): boolean {
    if (!entities.isAlive(entity)) return false;
    for (const type of types) {
        if (!getComponentStore(context, type)?.has(entity)) return false;
    }
    return true;
}

export function hasAnyComponents(
    entities: EntityManager,
    context: ComponentStoreContext,
    entity: Entity,
    types: readonly AnyComponentType[]
): boolean {
    if (!entities.isAlive(entity)) return false;
    for (const type of types) {
        if (getComponentStore(context, type)?.has(entity)) return true;
    }
    return false;
}

export function getManyComponents<const TComponents extends readonly AnyComponentType[]>(
    entities: EntityManager,
    context: ComponentStoreContext,
    entity: Entity,
    types: TComponents
): ComponentTuple<TComponents> | undefined {
    if (!entities.isAlive(entity)) return undefined;
    const components: unknown[] = new Array(types.length);

    for (let index = 0; index < types.length; index++) {
        const component = getComponentStore(context, types[index]!)?.get(entity);
        if (component === undefined) return undefined;
        components[index] = component;
    }

    return components as ComponentTuple<TComponents>;
}

export function isComponentAdded<T extends object>(
    entities: EntityManager,
    context: ComponentStoreContext,
    entity: Entity,
    type: ComponentType<T>,
    changeDetection: ChangeDetectionRange
): boolean {
    if (!entities.isAlive(entity)) return false;
    const tick = getComponentStore(context, type)?.getAddedTick(entity);
    return tick !== undefined && isTickInRange(tick, changeDetection);
}

export function isComponentChanged<T extends object>(
    entities: EntityManager,
    context: ComponentStoreContext,
    entity: Entity,
    type: ComponentType<T>,
    changeDetection: ChangeDetectionRange
): boolean {
    if (!entities.isAlive(entity)) return false;
    const tick = getComponentStore(context, type)?.getChangedTick(entity);
    return tick !== undefined && isTickInRange(tick, changeDetection);
}
