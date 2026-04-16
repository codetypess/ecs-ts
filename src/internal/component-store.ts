import type { AnyComponentType, ComponentType } from "../component";
import { SparseSet } from "../sparse-set";

/** Registry of component stores keyed by component id. */
export interface ComponentStoreContext {
    readonly stores: Map<number, SparseSet<unknown>>;
    readonly componentTypes: Map<number, AnyComponentType>;
    storeVersion: number;
}

/** Creates the component-store registry used by a world. */
export function createComponentStoreContext(): ComponentStoreContext {
    return {
        stores: new Map(),
        componentTypes: new Map(),
        storeVersion: 0,
    };
}

/** Returns the store for a component type, creating it on first write. */
export function ensureComponentStore<T>(
    context: ComponentStoreContext,
    type: ComponentType<T>
): SparseSet<T> {
    context.componentTypes.set(type.id, type);

    const existing = context.stores.get(type.id);

    if (existing !== undefined) {
        return existing as SparseSet<T>;
    }

    const store = new SparseSet<T>();
    context.stores.set(type.id, store as SparseSet<unknown>);
    context.storeVersion++;

    return store;
}

/** Returns the existing store for a component type, if any. */
export function getComponentStore<T>(
    context: ComponentStoreContext,
    type: ComponentType<T>
): SparseSet<T> | undefined {
    return context.stores.get(type.id) as SparseSet<T> | undefined;
}

/** Looks up the runtime component metadata for a numeric component id. */
export function getComponentType(
    context: ComponentStoreContext,
    componentId: number
): AnyComponentType | undefined {
    return context.componentTypes.get(componentId);
}

/** Iterates every registered component store. */
export function getComponentStoreEntries(
    context: ComponentStoreContext
): IterableIterator<[number, SparseSet<unknown>]> {
    return context.stores.entries();
}
