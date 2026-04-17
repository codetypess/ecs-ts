import type { ComponentRegistry, ComponentType } from "../component";
import { SparseSet } from "../sparse-set";
import { ensureIndexedEntry } from "./collection-utils";

/** Registry of component stores keyed by registry-local component ids. */
export interface ComponentStoreContext {
    readonly registry: ComponentRegistry;
    readonly stores: (SparseSet<unknown> | undefined)[];
    storeVersion: number;
}

/** Creates the component-store registry used by a world. */
export function createComponentStoreContext(registry: ComponentRegistry): ComponentStoreContext {
    return {
        registry,
        stores: [],
        storeVersion: 0,
    };
}

/** Returns the store for a component type, creating it on first write. */
export function ensureComponentStore<T>(
    context: ComponentStoreContext,
    type: ComponentType<T>
): SparseSet<T> {
    return ensureIndexedEntry(context.stores, type.id, () => {
        context.storeVersion++;
        return new SparseSet<unknown>();
    }) as SparseSet<T>;
}

/** Returns the existing store for a component type, if any. */
export function getComponentStore<T>(
    context: ComponentStoreContext,
    type: ComponentType<T>
): SparseSet<T> | undefined {
    return context.stores[type.id] as SparseSet<T> | undefined;
}

/** Looks up the runtime component metadata for a numeric component id. */
export function getComponentType(context: ComponentStoreContext, componentId: number) {
    return context.registry.componentType(componentId);
}

/** Iterates every registered component store. */
export function* getComponentStoreEntries(
    context: ComponentStoreContext
): IterableIterator<[number, SparseSet<unknown>]> {
    for (let componentId = 0; componentId < context.stores.length; componentId++) {
        const store = context.stores[componentId];

        if (store !== undefined) {
            yield [componentId, store];
        }
    }
}
