import type {
    AnyComponentType,
    Bundle,
    ComponentLifecycleStage,
    ComponentType,
} from "../component";
import { assertComponentValue } from "../component";
import { EntityManager, formatEntity } from "../entity";
import type { Entity } from "../entity";
import type { ChangeDetectionRange, ComponentTuple } from "../query";
import { isTickInRange } from "../query";
import { ComponentStoreRuntime } from "./component-store-runtime";

interface ComponentRuntimeOptions {
    readonly entities: EntityManager;
    readonly componentStores: ComponentStoreRuntime;
    readonly getChangeTick: () => number;
    readonly getChangeDetectionRange: () => ChangeDetectionRange;
    readonly runComponentHooks: <T>(
        type: ComponentType<T>,
        stage: ComponentLifecycleStage,
        entity: Entity,
        component: T
    ) => void;
    readonly recordRemoved: <T>(type: ComponentType<T>, entity: Entity, component: T) => void;
}

export class ComponentRuntime {
    constructor(private readonly options: ComponentRuntimeOptions) {}

    insertBundle(entity: Entity, bundle: Bundle): void {
        this.assertAlive(entity);

        for (const entry of bundle.entries) {
            this.add(entity, entry.type, entry.value);
        }
    }

    removeBundle(entity: Entity, bundle: Bundle): boolean {
        let removedAny = false;

        for (const entry of bundle.entries) {
            removedAny = this.remove(entity, entry.type) || removedAny;
        }

        return removedAny;
    }

    add<T>(entity: Entity, type: ComponentType<T>, value: T): void {
        this.assertAlive(entity);
        this.addWithRequired(entity, type, value, []);
    }

    markChanged<T>(entity: Entity, type: ComponentType<T>): boolean {
        if (!this.options.entities.isAlive(entity)) {
            return false;
        }

        return (
            this.options.componentStores
                .getStore(type)
                ?.markChanged(entity, this.options.getChangeTick()) ?? false
        );
    }

    has<T>(entity: Entity, type: ComponentType<T>): boolean {
        return (
            this.options.entities.isAlive(entity) &&
            (this.options.componentStores.getStore(type)?.has(entity) ?? false)
        );
    }

    hasAll(entity: Entity, types: readonly AnyComponentType[]): boolean {
        if (!this.options.entities.isAlive(entity)) {
            return false;
        }

        for (const type of types) {
            if (!this.options.componentStores.getStore(type)?.has(entity)) {
                return false;
            }
        }

        return true;
    }

    hasAny(entity: Entity, types: readonly AnyComponentType[]): boolean {
        if (!this.options.entities.isAlive(entity)) {
            return false;
        }

        for (const type of types) {
            if (this.options.componentStores.getStore(type)?.has(entity)) {
                return true;
            }
        }

        return false;
    }

    get<T>(entity: Entity, type: ComponentType<T>): T | undefined {
        if (!this.options.entities.isAlive(entity)) {
            return undefined;
        }

        return this.options.componentStores.getStore(type)?.get(entity);
    }

    mustGet<T>(entity: Entity, type: ComponentType<T>): T {
        const value = this.get(entity, type);

        if (value === undefined) {
            throw new Error(`Entity ${formatEntity(entity)} does not have ${type.name}`);
        }

        return value;
    }

    getMany<const TComponents extends readonly AnyComponentType[]>(
        entity: Entity,
        ...types: TComponents
    ): ComponentTuple<TComponents> | undefined {
        if (!this.options.entities.isAlive(entity)) {
            return undefined;
        }

        const components: unknown[] = new Array(types.length);

        for (let index = 0; index < types.length; index++) {
            const type = types[index]!;
            const store = this.options.componentStores.getStore(type);

            if (!store?.has(entity)) {
                return undefined;
            }

            components[index] = store.get(entity);
        }

        return components as ComponentTuple<TComponents>;
    }

    isAdded<T>(entity: Entity, type: ComponentType<T>): boolean {
        if (!this.options.entities.isAlive(entity)) {
            return false;
        }

        const tick = this.options.componentStores.getStore(type)?.getAddedTick(entity);

        return tick !== undefined && isTickInRange(tick, this.options.getChangeDetectionRange());
    }

    isChanged<T>(entity: Entity, type: ComponentType<T>): boolean {
        if (!this.options.entities.isAlive(entity)) {
            return false;
        }

        const tick = this.options.componentStores.getStore(type)?.getChangedTick(entity);

        return tick !== undefined && isTickInRange(tick, this.options.getChangeDetectionRange());
    }

    remove<T>(entity: Entity, type: ComponentType<T>): boolean {
        const store = this.options.componentStores.getStore(type);

        if (!this.options.entities.isAlive(entity) || !store?.has(entity)) {
            return false;
        }

        const component = store.get(entity) as T;
        this.options.runComponentHooks(type, "onReplace", entity, component);
        this.options.runComponentHooks(type, "onRemove", entity, component);
        this.options.recordRemoved(type, entity, component);
        store.delete(entity);

        return true;
    }

    despawn(entity: Entity): boolean {
        if (!this.options.entities.isAlive(entity)) {
            return false;
        }

        for (const [componentId, store] of this.options.componentStores.entries()) {
            if (!store.has(entity)) {
                continue;
            }

            const type = this.options.componentStores.getType(componentId);
            const component = store.get(entity);

            if (type !== undefined) {
                this.options.runComponentHooks(type, "onReplace", entity, component);
                this.options.runComponentHooks(type, "onRemove", entity, component);
                this.options.runComponentHooks(type, "onDespawn", entity, component);
                this.options.recordRemoved(type, entity, component);
            }

            store.delete(entity);
        }

        return this.options.entities.destroy(entity);
    }

    private addWithRequired<T>(
        entity: Entity,
        type: ComponentType<T>,
        value: T,
        resolving: readonly AnyComponentType[]
    ): void {
        assertComponentValue(type, value);
        this.addRequiredComponents(entity, type, resolving);
        this.insertComponentOnly(entity, type, value);
    }

    private addRequiredComponents(
        entity: Entity,
        type: AnyComponentType,
        resolving: readonly AnyComponentType[]
    ): void {
        if (type.required.length === 0) {
            return;
        }

        const cycleStart = resolving.findIndex((resolvedType) => resolvedType.id === type.id);

        if (cycleStart !== -1) {
            const cycle = [...resolving.slice(cycleStart), type]
                .map((resolvedType) => resolvedType.name)
                .join(" -> ");
            throw new Error(`Circular required component dependency: ${cycle}`);
        }

        const nextResolving = [...resolving, type];

        for (const required of type.required) {
            if (this.has(entity, required.type)) {
                continue;
            }

            this.addWithRequired(entity, required.type, required.create(), nextResolving);
        }
    }

    private insertComponentOnly<T>(entity: Entity, type: ComponentType<T>, value: T): void {
        assertComponentValue(type, value);
        const store = this.options.componentStores.ensureStore(type);
        const hadComponent = store.has(entity);

        if (hadComponent) {
            this.options.runComponentHooks(type, "onReplace", entity, store.get(entity) as T);
        }

        store.set(entity, value, this.options.getChangeTick());

        if (!hadComponent) {
            this.options.runComponentHooks(type, "onAdd", entity, value);
        }

        this.options.runComponentHooks(type, "onInsert", entity, value);
    }

    private assertAlive(entity: Entity): void {
        if (!this.options.entities.isAlive(entity)) {
            throw new Error(`Entity is not alive: ${formatEntity(entity)}`);
        }
    }
}
