import type { ChangeDetectionRange } from "../query";
import { isTickInRange } from "../query";
import type { ResourceType } from "../resource";
import type { World } from "../world";

export interface ResourceEntry<T> {
    value: T;
    readonly addedTick: number;
    changedTick: number;
}

interface ResourceRuntimeOptions {
    readonly getChangeTick: () => number;
    readonly getChangeDetectionRange: () => ChangeDetectionRange;
}

export interface ResourceRuntimeContext extends ResourceRuntimeOptions {
    readonly resources: Map<number, ResourceEntry<unknown>>;
}

export function createResourceRuntimeContext(
    options: ResourceRuntimeOptions
): ResourceRuntimeContext {
    return {
        resources: new Map(),
        ...options,
    };
}

export function setResource<T>(
    context: ResourceRuntimeContext,
    type: ResourceType<T>,
    value: T
): void {
    const existing = getResourceEntry(context, type);

    if (existing !== undefined) {
        existing.value = value;
        existing.changedTick = context.getChangeTick();
        return;
    }

    context.resources.set(type.id, {
        value,
        addedTick: context.getChangeTick(),
        changedTick: context.getChangeTick(),
    } satisfies ResourceEntry<T> as ResourceEntry<unknown>);
}

export function hasResource<T>(
    context: ResourceRuntimeContext,
    type: ResourceType<T>
): boolean {
    return context.resources.has(type.id);
}

export function getResource<T>(
    context: ResourceRuntimeContext,
    type: ResourceType<T>
): T | undefined {
    return getResourceEntry(context, type)?.value;
}

export function matchesResource<T>(
    context: ResourceRuntimeContext,
    type: ResourceType<T>,
    predicate: (value: T, world: World) => boolean,
    world: World
): boolean {
    const entry = getResourceEntry(context, type);

    return entry !== undefined && predicate(entry.value, world);
}

export function removeResource<T>(
    context: ResourceRuntimeContext,
    type: ResourceType<T>
): T | undefined {
    const value = getResourceEntry(context, type)?.value;
    context.resources.delete(type.id);

    return value;
}

export function markResourceChanged<T>(
    context: ResourceRuntimeContext,
    type: ResourceType<T>
): boolean {
    const entry = getResourceEntry(context, type);

    if (entry === undefined) {
        return false;
    }

    entry.changedTick = context.getChangeTick();

    return true;
}

export function isResourceAdded<T>(
    context: ResourceRuntimeContext,
    type: ResourceType<T>
): boolean {
    const entry = getResourceEntry(context, type);

    return entry !== undefined && isTickInRange(entry.addedTick, context.getChangeDetectionRange());
}

export function isResourceChanged<T>(
    context: ResourceRuntimeContext,
    type: ResourceType<T>
): boolean {
    const entry = getResourceEntry(context, type);

    return (
        entry !== undefined && isTickInRange(entry.changedTick, context.getChangeDetectionRange())
    );
}

function getResourceEntry<T>(
    context: ResourceRuntimeContext,
    type: ResourceType<T>
): ResourceEntry<T> | undefined {
    return context.resources.get(type.id) as ResourceEntry<T> | undefined;
}
