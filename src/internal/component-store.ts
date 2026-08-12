import type { AnyComponentType, ComponentType } from "../component";
import type { Registry } from "../registry";
import { SparseSet } from "../sparse-set";

export interface ComponentStoreContext {
    readonly registry: Registry;
    readonly stores: Map<AnyComponentType, SparseSet<unknown>>;
    readonly pendingCompaction: Set<SparseSet<unknown>>;
    storeVersion: number;
}

export function createComponentStoreContext(registry: Registry): ComponentStoreContext {
    return {
        registry,
        stores: new Map(),
        pendingCompaction: new Set(),
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

export function markComponentStoreForCompaction<T>(
    context: ComponentStoreContext,
    store: SparseSet<T>
): void {
    context.pendingCompaction.add(store as SparseSet<unknown>);
}

export function compactComponentStores(context: ComponentStoreContext): void {
    for (const store of context.pendingCompaction) store.compact();
    context.pendingCompaction.clear();
}

export function* getComponentStoreEntries(
    context: ComponentStoreContext
): IterableIterator<[AnyComponentType, SparseSet<unknown>]> {
    yield* context.stores;
}
