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
    readonly registry: Registry;
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
    readonly registry: Registry | undefined;
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
