import type { ComponentType } from "../component";
import type { Entity } from "../entity";
import type { RemovedComponent, RemovedReader, RemovedReaderOptions } from "../removed";
import { RemovedComponents, RemovedReader as BoundRemovedReader } from "../removed";
import { ensureMapEntry } from "./collection-utils";

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

/** Creates a world-bound removed-component reader for the component type. */
export function createRemovedReader<T>(
    context: RemovedStoreContext,
    type: ComponentType<T>,
    options: RemovedReaderOptions = {}
): RemovedReader<T> {
    const removed = ensureRemovedComponents(context, type);
    const reader = new BoundRemovedReader(
        type,
        {
            read: (current) => removed.read(current),
            release: (current) => removed.release(current),
        },
        options
    );

    removed.register(reader);

    return reader;
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
    return ensureMapEntry(
        context.removedComponents,
        type.id,
        () => new RemovedComponents<unknown>()
    ) as RemovedComponents<T>;
}

function getRemovedComponents<T>(
    context: RemovedStoreContext,
    type: ComponentType<T>
): RemovedComponents<T> | undefined {
    return context.removedComponents.get(type.id) as RemovedComponents<T> | undefined;
}
