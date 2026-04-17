import type { AnyComponentType, ComponentType } from "../component";
import type { Entity } from "../entity";
import { EntityManager } from "../entity";
import type { ChangeDetectionRange, ComponentTuple } from "../query";
import { isTickInRange } from "../query";
import type { SparseSet } from "../sparse-set";

type ComponentStores = readonly (SparseSet<unknown> | undefined)[];

/** Shared read helpers for non-hot component access paths. */
export function hasAllComponents(
    entities: EntityManager,
    stores: ComponentStores,
    entity: Entity,
    types: readonly AnyComponentType[]
): boolean {
    if (!entities.isAlive(entity)) {
        return false;
    }

    for (const type of types) {
        if (!stores[type.id]?.has(entity)) {
            return false;
        }
    }

    return true;
}

/** Shared read helpers for non-hot component access paths. */
export function hasAnyComponents(
    entities: EntityManager,
    stores: ComponentStores,
    entity: Entity,
    types: readonly AnyComponentType[]
): boolean {
    if (!entities.isAlive(entity)) {
        return false;
    }

    for (const type of types) {
        if (stores[type.id]?.has(entity)) {
            return true;
        }
    }

    return false;
}

/** Reads multiple components at once, aborting when any are missing. */
export function getManyComponents<const TComponents extends readonly AnyComponentType[]>(
    entities: EntityManager,
    stores: ComponentStores,
    entity: Entity,
    types: TComponents
): ComponentTuple<TComponents> | undefined {
    if (!entities.isAlive(entity)) {
        return undefined;
    }

    const components: unknown[] = new Array(types.length);

    for (let index = 0; index < types.length; index++) {
        const component = stores[types[index]!.id]?.get(entity);

        if (component === undefined) {
            return undefined;
        }

        components[index] = component;
    }

    return components as ComponentTuple<TComponents>;
}

/** Returns whether the component was added inside the visible change window. */
export function isComponentAdded<T>(
    entities: EntityManager,
    stores: ComponentStores,
    entity: Entity,
    type: ComponentType<T>,
    changeDetection: ChangeDetectionRange
): boolean {
    if (!entities.isAlive(entity)) {
        return false;
    }

    const tick = stores[type.id]?.getAddedTick(entity);

    return tick !== undefined && isTickInRange(tick, changeDetection);
}

/** Returns whether the component changed inside the visible change window. */
export function isComponentChanged<T>(
    entities: EntityManager,
    stores: ComponentStores,
    entity: Entity,
    type: ComponentType<T>,
    changeDetection: ChangeDetectionRange
): boolean {
    if (!entities.isAlive(entity)) {
        return false;
    }

    const tick = stores[type.id]?.getChangedTick(entity);

    return tick !== undefined && isTickInRange(tick, changeDetection);
}
