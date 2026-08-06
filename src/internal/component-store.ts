import type { ComponentType } from "../component.js";
import type { Registry } from "../registry.js";
import { SparseSet } from "../sparse-set.js";

/** Registry of component stores keyed by registry-local component ids. */
export interface ComponentStoreContext {
    readonly registry: Registry;
    readonly stores: (SparseSet<unknown> | undefined)[];
    readonly pendingCompaction: Set<SparseSet<unknown>>;
    storeVersion: number;
}

/** Creates the component-store registry used by a world. */
export function createComponentStoreContext(registry: Registry): ComponentStoreContext {
    return {
        registry,
        stores: [],
        pendingCompaction: new Set(),
        storeVersion: 0,
    };
}

/** Returns the store for a component type, creating it on first write. */
export function ensureComponentStore<T extends object>(
    context: ComponentStoreContext,
    type: ComponentType<T>
): SparseSet<T> {
    const existing = context.stores[type.id];

    if (existing !== undefined) {
        return existing as SparseSet<T>;
    }

    const created = new SparseSet<unknown>();
    context.stores[type.id] = created;
    context.storeVersion++;

    return created as SparseSet<T>;
}

/** Returns the existing store for a component type, if any. */
export function getComponentStore<T extends object>(
    context: ComponentStoreContext,
    type: ComponentType<T>
): SparseSet<T> | undefined {
    return context.stores[type.id] as SparseSet<T> | undefined;
}

/** Marks a store whose tombstones must be compacted after active queries finish. */
export function markComponentStoreForCompaction<T>(
    context: ComponentStoreContext,
    store: SparseSet<T>
): void {
    context.pendingCompaction.add(store as SparseSet<unknown>);
}

/** Compacts every store dirtied by logical deletion since the last query boundary. */
export function compactComponentStores(context: ComponentStoreContext): void {
    for (const store of context.pendingCompaction) {
        store.compact();
    }

    context.pendingCompaction.clear();
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
