import type { Entity } from "./entity";
import type { World } from "./world";

let nextComponentId = 0;

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
    readonly lifecycle: Readonly<ComponentLifecycle<T>>;
    readonly required: readonly RequiredComponent<unknown>[];
}

export type AnyComponentType = ComponentType<unknown>;

export type ComponentData<TComponent extends AnyComponentType> =
    TComponent extends ComponentType<infer TData> ? TData : never;

/** A single component value prepared for spawn/insert/bundle calls. */
export interface ComponentEntry<T> {
    readonly type: ComponentType<T>;
    readonly value: T;
}

/** Immutable group of component entries that can be reused across entity operations. */
export interface Bundle {
    readonly entries: readonly ComponentEntry<unknown>[];
}

type DefineComponentArgs<T> = null extends T
    ? [name: never, options?: never]
    : undefined extends T
      ? [name: never, options?: never]
      : [name: string, options?: ComponentOptions<T>];

/**
 * Defines a marker component whose payload is always `{}`.
 */
export function defineComponent(
    name: string,
    options?: ComponentOptions<Record<string, never>>
): ComponentType<Record<string, never>>;
/**
 * Defines a component type and freezes its runtime metadata.
 */
export function defineComponent<T>(...args: DefineComponentArgs<T>): ComponentType<T>;
export function defineComponent<T>(
    name: string,
    options: ComponentOptions<T> = {} as ComponentOptions<T>
): ComponentType<T> {
    const { require = [], ...lifecycle } = options;

    return Object.freeze({
        id: nextComponentId++,
        name,
        lifecycle: Object.freeze({ ...lifecycle }),
        required: Object.freeze([...require]),
    });
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
    return Object.freeze({
        entries: Object.freeze([...entries]),
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
