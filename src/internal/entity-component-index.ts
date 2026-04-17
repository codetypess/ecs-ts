import { entityIndex } from "../entity";
import type { Entity } from "../entity";

/** Tracks which component ids are currently attached to each live entity slot. */
export interface EntityComponentIndexContext {
    readonly componentIdsByEntity: (number[] | undefined)[];
}

/** Creates the reverse index used to despawn entities without scanning every store. */
export function createEntityComponentIndexContext(): EntityComponentIndexContext {
    return {
        componentIdsByEntity: [],
    };
}

/** Records that an entity gained a component id for the first time. */
export function trackEntityComponent(
    context: EntityComponentIndexContext,
    entity: Entity,
    componentId: number
): void {
    const slot = entityIndex(entity);
    let componentIds = context.componentIdsByEntity[slot];

    if (componentIds === undefined) {
        componentIds = [];
        context.componentIdsByEntity[slot] = componentIds;
    }

    componentIds.push(componentId);
}

/** Removes one tracked component id from the entity's reverse index. */
export function untrackEntityComponent(
    context: EntityComponentIndexContext,
    entity: Entity,
    componentId: number
): void {
    const slot = entityIndex(entity);
    const componentIds = context.componentIdsByEntity[slot];

    if (componentIds === undefined) {
        return;
    }

    const trackedIndex = componentIds.indexOf(componentId);

    if (trackedIndex === -1) {
        return;
    }

    const lastIndex = componentIds.length - 1;

    if (trackedIndex !== lastIndex) {
        componentIds[trackedIndex] = componentIds[lastIndex]!;
    }

    componentIds.pop();

    if (componentIds.length === 0) {
        context.componentIdsByEntity[slot] = undefined;
    }
}

/** Transfers all tracked component ids for an entity to the caller and clears the slot. */
export function takeEntityComponents(
    context: EntityComponentIndexContext,
    entity: Entity
): number[] {
    const slot = entityIndex(entity);
    const componentIds = context.componentIdsByEntity[slot];

    if (componentIds === undefined) {
        return [];
    }

    context.componentIdsByEntity[slot] = undefined;

    return componentIds;
}
