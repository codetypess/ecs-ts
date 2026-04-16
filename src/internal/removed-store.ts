import type { ComponentType } from "../component";
import type { Entity } from "../entity";
import type { RemovedComponent, RemovedReader } from "../removed";
import { RemovedComponents } from "../removed";

interface RemovedRuntimeOptions {
    readonly getChangeTick: () => number;
}

export interface RemovedRuntimeContext extends RemovedRuntimeOptions {
    readonly removedComponents: Map<number, RemovedComponents<unknown>>;
}

export function createRemovedRuntimeContext(
    options: RemovedRuntimeOptions
): RemovedRuntimeContext {
    return {
        removedComponents: new Map(),
        ...options,
    };
}

export function readRemoved<T>(
    context: RemovedRuntimeContext,
    reader: RemovedReader<T>
): readonly RemovedComponent<T>[] {
    return getRemovedComponents(context, reader.type)?.read(reader) ?? [];
}

export function drainRemoved<T>(
    context: RemovedRuntimeContext,
    type: ComponentType<T>
): RemovedComponent<T>[] {
    return getRemovedComponents(context, type)?.drain() ?? [];
}

export function recordRemoved<T>(
    context: RemovedRuntimeContext,
    type: ComponentType<T>,
    entity: Entity,
    component: T
): void {
    ensureRemovedComponents(context, type).push(entity, component, context.getChangeTick());
}

function ensureRemovedComponents<T>(
    context: RemovedRuntimeContext,
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
    context: RemovedRuntimeContext,
    type: ComponentType<T>
): RemovedComponents<T> | undefined {
    return context.removedComponents.get(type.id) as RemovedComponents<T> | undefined;
}
