import type { AnyComponentType, ComponentType } from "../component";
import { SparseSet } from "../sparse-set";

export class ComponentStoreRuntime {
    private readonly storesById = new Map<number, SparseSet<unknown>>();
    private readonly componentTypesById = new Map<number, AnyComponentType>();
    private storeVersion = 0;

    get stores(): ReadonlyMap<number, SparseSet<unknown>> {
        return this.storesById;
    }

    get version(): number {
        return this.storeVersion;
    }

    ensureStore<T>(type: ComponentType<T>): SparseSet<T> {
        this.componentTypesById.set(type.id, type);

        const existing = this.storesById.get(type.id);

        if (existing !== undefined) {
            return existing as SparseSet<T>;
        }

        const store = new SparseSet<T>();
        this.storesById.set(type.id, store as SparseSet<unknown>);
        this.storeVersion++;

        return store;
    }

    getStore<T>(type: ComponentType<T>): SparseSet<T> | undefined {
        return this.storesById.get(type.id) as SparseSet<T> | undefined;
    }

    getType(componentId: number): AnyComponentType | undefined {
        return this.componentTypesById.get(componentId);
    }

    entries(): IterableIterator<[number, SparseSet<unknown>]> {
        return this.storesById.entries();
    }
}
