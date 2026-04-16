import type { ComponentType } from "../component";
import type { Entity } from "../entity";
import type { RemovedComponent, RemovedReader } from "../removed";
import { RemovedComponents } from "../removed";

interface RemovedStoreOptions {
    readonly getChangeTick: () => number;
}

/** Removed-component storage grouped by component type id. */
export interface RemovedStoreContext extends RemovedStoreOptions {
    readonly removedComponents: Map<number, RemovedComponents<unknown>>;
}

/** Creates the removed-component context used by a world. */
export function createRemovedStoreContext(options: RemovedStoreOptions): RemovedStoreContext {
    return {
        removedComponents: new Map(),
        ...options,
    };
}

/** Reads unread removed-component records for the provided reader. */
export function readRemoved<T>(
    context: RemovedStoreContext,
    reader: RemovedReader<T>
): readonly RemovedComponent<T>[] {
    return getRemovedComponents(context, reader.type)?.read(reader) ?? [];
}

/** Returns and clears all removed-component records for the component type. */
export function drainRemoved<T>(
    context: RemovedStoreContext,
    type: ComponentType<T>
): RemovedComponent<T>[] {
    return getRemovedComponents(context, type)?.drain() ?? [];
}

/** Records a removed component together with the current change tick. */
export function recordRemoved<T>(
    context: RemovedStoreContext,
    type: ComponentType<T>,
    entity: Entity,
    component: T
): void {
    ensureRemovedComponents(context, type).push(entity, component, context.getChangeTick());
}

function ensureRemovedComponents<T>(
    context: RemovedStoreContext,
    type: ComponentType<T>
): RemovedComponents<T> {
    const existing = context.removedComponents.get(type.id);

    if (existing !== undefined) {
        return existing as RemovedComponents<T>;
    }

    const removed = new RemovedComponents<T>();
    context.removedComponents.set(type.id, removed as RemovedComponents<unknown>);

    return removed;
}

function getRemovedComponents<T>(
    context: RemovedStoreContext,
    type: ComponentType<T>
): RemovedComponents<T> | undefined {
    return context.removedComponents.get(type.id) as RemovedComponents<T> | undefined;
}
