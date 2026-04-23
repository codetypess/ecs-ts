import type { ChangeDetectionRange } from "../query.js";
import { isTickInRange } from "../query.js";
import type { ResourceType } from "../resource.js";
import type { World } from "../world.js";

/** Stored resource value plus its change-detection metadata. */
export interface ResourceEntry<T> {
    value: T;
    readonly addedTick: number;
    changedTick: number;
}

interface ResourceContextOptions {
    readonly getChangeTick: () => number;
    readonly getChangeDetectionRange: () => ChangeDetectionRange;
}

/** Resource storage plus callbacks needed for change tracking. */
export interface ResourceContext extends ResourceContextOptions {
    readonly resources: Map<number, ResourceEntry<unknown>>;
}

/** Creates the resource context used by a world. */
export function createResourceContext(options: ResourceContextOptions): ResourceContext {
    return {
        resources: new Map(),
        ...options,
    };
}

/** Inserts or replaces a resource, updating change ticks in place on replacement. */
export function setResource<T>(context: ResourceContext, type: ResourceType<T>, value: T): void {
    const existing = getResourceEntry(context, type);

    if (existing !== undefined) {
        existing.value = value;
        existing.changedTick = context.getChangeTick();
        return;
    }

    const tick = context.getChangeTick();

    context.resources.set(type.id, {
        value,
        addedTick: tick,
        changedTick: tick,
    } satisfies ResourceEntry<T> as ResourceEntry<unknown>);
}

/** Returns whether the resource exists. */
export function hasResource<T>(context: ResourceContext, type: ResourceType<T>): boolean {
    return context.resources.has(type.id);
}

/** Returns the resource value, or `undefined` when missing. */
export function getResource<T>(context: ResourceContext, type: ResourceType<T>): T | undefined {
    return getResourceEntry(context, type)?.value;
}

/** Evaluates a predicate against the resource when it exists. */
export function matchesResource<T>(
    context: ResourceContext,
    type: ResourceType<T>,
    predicate: (value: T, world: World) => boolean,
    world: World
): boolean {
    const entry = getResourceEntry(context, type);

    return entry !== undefined && predicate(entry.value, world);
}

/** Removes a resource and returns the previous value, if any. */
export function removeResource<T>(context: ResourceContext, type: ResourceType<T>): T | undefined {
    const value = getResourceEntry(context, type)?.value;
    context.resources.delete(type.id);

    return value;
}

/** Updates the changed tick for an existing resource. */
export function markResourceChanged<T>(context: ResourceContext, type: ResourceType<T>): boolean {
    const entry = getResourceEntry(context, type);

    if (entry === undefined) {
        return false;
    }

    entry.changedTick = context.getChangeTick();

    return true;
}

/** Returns whether the resource was added inside the visible tick window. */
export function isResourceAdded<T>(context: ResourceContext, type: ResourceType<T>): boolean {
    const entry = getResourceEntry(context, type);

    return entry !== undefined && isTickInRange(entry.addedTick, context.getChangeDetectionRange());
}

/** Returns whether the resource changed inside the visible tick window. */
export function isResourceChanged<T>(context: ResourceContext, type: ResourceType<T>): boolean {
    const entry = getResourceEntry(context, type);

    return (
        entry !== undefined && isTickInRange(entry.changedTick, context.getChangeDetectionRange())
    );
}

function getResourceEntry<T>(
    context: ResourceContext,
    type: ResourceType<T>
): ResourceEntry<T> | undefined {
    return context.resources.get(type.id) as ResourceEntry<T> | undefined;
}
