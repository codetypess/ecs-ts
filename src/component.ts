import type { Entity } from "./entity";
import type { Registry } from "./registry";
import type { World } from "./world";

export { createRegistry, Registry, Registry as ComponentRegistry } from "./registry";
export type { AnyRegistryType } from "./registry";

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
export interface RequiredComponent<T extends object> {
    readonly type: ComponentType<T>;
    create(): T;
}

/** Extra metadata and lifecycle hooks accepted by {@link defineComponent}. */
export interface ComponentOptions<T extends object> extends ComponentLifecycle<T> {
    readonly require?: readonly RequiredComponent<object>[];
}

export type ComponentLifecycleStage = keyof ComponentLifecycle<unknown>;

/** Runtime handle used to identify a component store and its lifecycle behavior. */
export interface ComponentType<T extends object> {
    readonly id: number;
    readonly key: string;
    readonly name: string;
    readonly registry: Registry;
    readonly lifecycle: Readonly<ComponentLifecycle<T>>;
    readonly required: readonly RequiredComponent<object>[];
}

export type AnyComponentType = ComponentType<object>;

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

/** A single component value prepared for spawn calls. */
export interface ComponentEntry<T extends object> {
    readonly type: ComponentType<T>;
    readonly value: T;
}

export type AnyComponentEntry = ComponentEntry<object>;

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

/** Declares a component dependency that is inserted automatically when missing. */
export function requireComponent<T extends object>(
    type: ComponentType<T>,
    create: () => T
): RequiredComponent<T> {
    return Object.freeze({ type, create });
}

/** Guards component payloads, which must be non-null objects. */
export function assertComponentValue<T extends object>(type: ComponentType<T>, value: T): void {
    if (value === null || value === undefined) {
        throw new TypeError(`Component ${type.name} value cannot be ${String(value)}`);
    }

    if (typeof value !== "object") {
        throw new TypeError(`Component ${type.name} value must be an object`);
    }
}

/** Throws unless the component belongs to the expected registry. */
export function assertRegisteredComponent(
    registry: Registry,
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
    registry: Registry,
    types: readonly AnyComponentType[],
    action: string
): void {
    for (const type of types) {
        assertRegisteredComponent(registry, type, action);
    }
}
