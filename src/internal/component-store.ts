import type { AnyComponentType, ComponentType } from "../component";
import type { Registry } from "../registry";
import { SparseSet } from "../sparse-set";

export interface ComponentStoreContext {
    readonly registry: Registry;
    readonly stores: Map<AnyComponentType, SparseSet<unknown>>;
    storeVersion: number;
}

export function createComponentStoreContext(registry: Registry): ComponentStoreContext {
    return {
        registry,
        stores: new Map(),
        storeVersion: 0,
    } satisfies ComponentStoreContext;
}

export function ensureComponentStore<T extends object>(
    context: ComponentStoreContext,
    type: ComponentType<T>
): SparseSet<T> {
    const existing = context.stores.get(type);
    if (existing !== undefined) return existing as SparseSet<T>;

    if (!context.registry.isRegisteredComponent(type)) {
        throw new Error(`Component ${type.name} is not registered in ${context.registry.name}`);
    }

    const created = new SparseSet<unknown>();
    context.stores.set(type, created);
    context.storeVersion++;
    return created as SparseSet<T>;
}

export function getComponentStore<T extends object>(
    context: ComponentStoreContext,
    type: ComponentType<T>
): SparseSet<T> | undefined {
    const store = context.stores.get(type) as SparseSet<T> | undefined;
    if (store === undefined && !context.registry.isRegisteredComponent(type)) {
        throw new Error(`Component ${type.name} is not registered in ${context.registry.name}`);
    }
    return store;
}

/** Iterates every registered component store. */
export function* getComponentStoreEntries(
    context: ComponentStoreContext
): IterableIterator<[AnyComponentType, SparseSet<unknown>]> {
    yield* context.stores;
}
