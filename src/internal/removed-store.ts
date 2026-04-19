import type { AnyComponentType, ComponentData } from "../component";
import type { Entity } from "../entity";
import type { RemovedComponent, RemovedReader, RemovedReaderOptions } from "../removed";
import { RemovedComponents, RemovedReader as BoundRemovedReader } from "../removed";
import { ensureMapEntry } from "./collection-utils";

interface RemovedStoreOptions {
    readonly getChangeTick: () => number;
}

/** Removed-component storage grouped by component type id. */
export interface RemovedStoreContext extends RemovedStoreOptions {
    readonly removedComponents: Map<number, RemovedComponents<AnyComponentType>>;
}

/** Creates the removed-component context used by a world. */
export function createRemovedStoreContext(options: RemovedStoreOptions): RemovedStoreContext {
    return {
        removedComponents: new Map(),
        ...options,
    };
}

/** Creates a world-bound removed-component reader for the component type. */
export function createRemovedReader<TComponent extends AnyComponentType>(
    context: RemovedStoreContext,
    type: TComponent,
    options: RemovedReaderOptions = {}
): RemovedReader<TComponent> {
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
export function drainRemoved<TComponent extends AnyComponentType>(
    context: RemovedStoreContext,
    type: TComponent
): RemovedComponent<TComponent>[] {
    return getRemovedComponents(context, type)?.drain() ?? [];
}

/** Records a removed component together with the current change tick. */
export function recordRemoved<TComponent extends AnyComponentType>(
    context: RemovedStoreContext,
    type: TComponent,
    entity: Entity,
    component: ComponentData<TComponent>
): void {
    ensureRemovedComponents(context, type).push(entity, component, context.getChangeTick());
}

function ensureRemovedComponents<TComponent extends AnyComponentType>(
    context: RemovedStoreContext,
    type: TComponent
): RemovedComponents<TComponent> {
    return ensureMapEntry(
        context.removedComponents,
        type.id,
        () => new RemovedComponents<AnyComponentType>()
    ) as unknown as RemovedComponents<TComponent>;
}

function getRemovedComponents<TComponent extends AnyComponentType>(
    context: RemovedStoreContext,
    type: TComponent
): RemovedComponents<TComponent> | undefined {
    return context.removedComponents.get(type.id) as RemovedComponents<TComponent> | undefined;
}
