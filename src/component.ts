import type { Entity } from "./entity";
import type { World } from "./world";

/** Callback used by component lifecycle hooks. */
export type ComponentHook<T> = {
    bivarianceHack(entity: Entity, component: T, world: World): void;
}["bivarianceHack"];

/** Lifecycle callbacks that run around component insertion, replacement, and removal. */
export interface ComponentLifecycle<T> {
    readonly onAdd?: ComponentHook<T>;
    readonly onInsert?: ComponentHook<T>;
    // Runs with the previous value before replacement, removal, or despawn.
    readonly onReplace?: ComponentHook<T>;
    readonly onRemove?: ComponentHook<T>;
    readonly onDespawn?: ComponentHook<T>;
}

/** Describes a component that should be auto-inserted when another component is added. */
export interface RequiredComponent<T> {
    readonly type: ComponentType<T>;
    create(): T;
}

/** Extra metadata and lifecycle hooks accepted by {@link defineComponent}. */
export interface ComponentOptions<T> extends ComponentLifecycle<T> {
    readonly require?: readonly RequiredComponent<unknown>[];
}

export type ComponentLifecycleStage = keyof ComponentLifecycle<unknown>;

/** Runtime handle used to identify a component store and its lifecycle behavior. */
export interface ComponentType<T> {
    readonly id: number;
    readonly name: string;
    readonly registry: ComponentRegistry;
    readonly lifecycle: Readonly<ComponentLifecycle<T>>;
    readonly required: readonly RequiredComponent<unknown>[];
}

export type AnyComponentType = ComponentType<unknown>;

export type ComponentData<TComponent extends AnyComponentType> =
    TComponent extends ComponentType<infer TData> ? TData : never;

type Expand<T> = {
    [TKey in keyof T]: T[TKey];
};

/** Merges an object component's payload type with extra fields for type-only reuse. */
export type ComponentDataWithTemplate<
    TOwn extends object,
    TTemplate extends ComponentType<object>,
> = Expand<ComponentData<TTemplate> & TOwn>;

/** A single component value prepared for spawn/insert/bundle calls. */
export interface ComponentEntry<T> {
    readonly type: ComponentType<T>;
    readonly value: T;
}

/** Immutable group of component entries that can be reused across entity operations. */
export interface Bundle {
    readonly entries: readonly ComponentEntry<unknown>[];
    readonly registry: ComponentRegistry | undefined;
}

type DefineComponentArgs<T> = null extends T
    ? [name: never, options?: never]
    : undefined extends T
      ? [name: never, options?: never]
      : [name: string, options?: ComponentOptions<T>];

/**
 * Registry that owns a set of component definitions for one ECS domain.
 */
export class ComponentRegistry {
    private nextComponentId = 0;
    private readonly componentTypes: AnyComponentType[] = [];

    constructor(readonly name: string) {}

    /** Defines a marker component whose payload is always `{}`. */
    defineComponent(
        name: string,
        options?: ComponentOptions<Record<string, never>>
    ): ComponentType<Record<string, never>>;

    /** Defines a component whose payload type reuses another object component's payload. */
    defineComponent<TOwn extends object, TTemplate extends ComponentType<object>>(
        ...args: DefineComponentArgs<ComponentDataWithTemplate<TOwn, TTemplate>>
    ): ComponentType<ComponentDataWithTemplate<TOwn, TTemplate>>;

    /** Defines a component type and freezes its runtime metadata. */
    defineComponent<T>(...args: DefineComponentArgs<T>): ComponentType<T>;
    defineComponent<T>(
        name: string,
        options: ComponentOptions<T> = {} as ComponentOptions<T>
    ): ComponentType<T> {
        const { require = [], ...lifecycle } = options;
        const normalizedRequired = Object.freeze([...require]);

        for (const dependency of normalizedRequired) {
            if (!this.isRegistered(dependency.type)) {
                throw new Error(
                    `Component ${dependency.type.name} is not registered in ${this.name}`
                );
            }
        }

        const component = Object.freeze({
            id: this.nextComponentId++,
            name,
            registry: this,
            lifecycle: Object.freeze({ ...lifecycle }),
            required: normalizedRequired,
        }) satisfies ComponentType<T>;

        this.componentTypes[component.id] = component;

        return component;
    }

    /** Returns whether the component belongs to this registry. */
    isRegistered(type: AnyComponentType): boolean {
        return type.registry === this && this.componentTypes[type.id] === type;
    }

    /** Looks up the component registered for the numeric id. */
    componentType(id: number): AnyComponentType | undefined {
        return this.componentTypes[id];
    }
}

/** Creates a component registry for one ECS domain. */
export function createRegistry(name: string): ComponentRegistry {
    return new ComponentRegistry(name);
}

/** Creates a component entry with runtime validation for spawn/insert helpers. */
export function withComponent<TComponent extends AnyComponentType>(
    type: TComponent,
    value: ComponentData<TComponent>
): ComponentEntry<ComponentData<TComponent>> {
    assertComponentValue(type, value);
    return { type, value };
}

/** Creates a marker-component entry using the default `{}` payload. */
export function withMarker<TComponent extends AnyComponentType>(
    type: ComponentData<TComponent> extends Record<string, never> ? TComponent : never
): ComponentEntry<ComponentData<TComponent>> {
    return withComponent(type, {} as ComponentData<TComponent>);
}

/** Freezes a reusable bundle so callers can safely share it across spawn/insert calls. */
export function bundle(...entries: ComponentEntry<unknown>[]): Bundle {
    const registry = entries[0]?.type.registry;

    if (registry !== undefined) {
        for (const entry of entries) {
            if (entry.type.registry !== registry) {
                throw new Error(
                    `Bundle entries must belong to one registry, got ${entry.type.registry.name} and ${registry.name}`
                );
            }
        }
    }

    return Object.freeze({
        entries: Object.freeze([...entries]),
        registry,
    });
}

/** Declares a component dependency that is inserted automatically when missing. */
export function requireComponent<T>(type: ComponentType<T>, create: () => T): RequiredComponent<T> {
    return Object.freeze({ type, create });
}

/** Guards against nullable payloads, which this ECS reserves to mean "missing component". */
export function assertComponentValue<T>(type: ComponentType<T>, value: T): void {
    if (value === null || value === undefined) {
        throw new TypeError(`Component ${type.name} value cannot be ${String(value)}`);
    }
}

/** Throws unless the component belongs to the expected registry. */
export function assertRegisteredComponent(
    registry: ComponentRegistry,
    type: AnyComponentType,
    action: string
): void {
    if (type.registry === registry) {
        return;
    }

    throw new Error(
        `Cannot ${action} component ${type.name}: it is registered in ${type.registry.name}, not ${registry.name}`
    );
}

/** Throws unless every component belongs to the expected registry. */
export function assertRegisteredComponents(
    registry: ComponentRegistry,
    types: readonly AnyComponentType[],
    action: string
): void {
    for (const type of types) {
        assertRegisteredComponent(registry, type, action);
    }
}
