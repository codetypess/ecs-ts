import type { AnyComponentType, ComponentType } from "../component";
import { SparseSet } from "../sparse-set";

export interface ComponentStoreContext {
    readonly stores: Map<number, SparseSet<unknown>>;
    readonly componentTypes: Map<number, AnyComponentType>;
    storeVersion: number;
}

export function createComponentStoreContext(): ComponentStoreContext {
    return {
        stores: new Map(),
        componentTypes: new Map(),
        storeVersion: 0,
    };
}

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

export function getComponentStore<T>(
    context: ComponentStoreContext,
    type: ComponentType<T>
): SparseSet<T> | undefined {
    return context.stores.get(type.id) as SparseSet<T> | undefined;
}

export function getComponentType(
    context: ComponentStoreContext,
    componentId: number
): AnyComponentType | undefined {
    return context.componentTypes.get(componentId);
}

export function getComponentStoreEntries(
    context: ComponentStoreContext
): IterableIterator<[number, SparseSet<unknown>]> {
    return context.stores.entries();
}
