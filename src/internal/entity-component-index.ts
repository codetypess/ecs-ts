import type { AnyComponentType } from "../component.js";
import { entityIndex } from "../entity.js";
import type { Entity } from "../entity.js";

export interface EntityComponentIndexContext {
    readonly componentTypesByEntity: (AnyComponentType[] | undefined)[];
}

export function createEntityComponentIndexContext(): EntityComponentIndexContext {
    return { componentTypesByEntity: [] };
}

export function trackEntityComponent(
    context: EntityComponentIndexContext,
    entity: Entity,
    componentType: AnyComponentType
): void {
    const slot = entityIndex(entity);
    let types = context.componentTypesByEntity[slot];

    if (types === undefined) {
        types = [];
        context.componentTypesByEntity[slot] = types;
    }

    types.push(componentType);
}

export function untrackEntityComponent(
    context: EntityComponentIndexContext,
    entity: Entity,
    componentType: AnyComponentType
): void {
    const slot = entityIndex(entity);
    const types = context.componentTypesByEntity[slot];
    if (types === undefined) return;

    const index = types.indexOf(componentType);
    if (index === -1) return;

    const last = types.length - 1;
    if (index !== last) types[index] = types[last]!;
    types.pop();

    if (types.length === 0) context.componentTypesByEntity[slot] = undefined;
}

export function takeEntityComponents(
    context: EntityComponentIndexContext,
    entity: Entity
): AnyComponentType[] {
    const slot = entityIndex(entity);
    const types = context.componentTypesByEntity[slot];
    if (types === undefined) return [];

    context.componentTypesByEntity[slot] = undefined;
    return types;
}

export function getEntityComponents(
    context: EntityComponentIndexContext,
    entity: Entity
): readonly AnyComponentType[] {
    return context.componentTypesByEntity[entityIndex(entity)] ?? [];
}
