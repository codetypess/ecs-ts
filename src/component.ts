import type { Entity } from "./entity";
import type { World } from "./world";

export { createRegistry, Registry } from "./registry";
export type { AnyRegistryType } from "./registry";

/** Callback used by component lifecycle hooks. */
export type ComponentHook<T> = {
    bivarianceHack(entity: Entity, component: T, world: World): void;
}["bivarianceHack"];

export type ComponentAddReason = "added" | "spawned";
export type ComponentRemoveReason = "removed" | "despawned";

/** Callback used when a component first becomes visible on an entity. */
export type ComponentAddHook<T> = {
    bivarianceHack(entity: Entity, component: T, world: World, reason: ComponentAddReason): void;
}["bivarianceHack"];

/** Callback used by component replacement hooks. */
export type ComponentReplaceHook<T> = {
    bivarianceHack(entity: Entity, previous: T, next: T, world: World): void;
}["bivarianceHack"];

/** Callback used when a component is removed explicitly or with its entity. */
export type ComponentRemoveHook<T> = {
    bivarianceHack(entity: Entity, component: T, world: World, reason: ComponentRemoveReason): void;
}["bivarianceHack"];

/** Lifecycle callbacks that run around component insertion, unsetting, replacement, and removal. */
export interface ComponentLifecycle<T> {
    readonly onAdd?: ComponentAddHook<T>;
    readonly onInsert?: ComponentHook<T>;
    // Runs with the previous value before replacement, removal, or despawn.
    readonly onUnset?: ComponentHook<T>;
    // Runs with the previous and next values during replacement only.
    readonly onReplace?: ComponentReplaceHook<T>;
    readonly onRemove?: ComponentRemoveHook<T>;
}

/** Extra metadata and lifecycle hooks accepted by {@link defineComponent}. */
export type ComponentOptions<T extends object> = ComponentLifecycle<T> & {
    readonly deps?: readonly ComponentType<object>[];
};

export type ComponentLifecycleStage = keyof ComponentLifecycle<unknown>;

/** Runtime handle used to identify a component store and its lifecycle behavior. */
export interface ComponentType<T extends object> {
    readonly key: string;
    readonly name: string;
    readonly deps: readonly ComponentType<object>[];
    readonly lifecycle: Readonly<ComponentLifecycle<T>>;
}

export type AnyComponentType = ComponentType<object>;

export function defineComponent(
    name: string,
    options?: ComponentOptions<Record<string, never>>
): ComponentType<Record<string, never>>;
export function defineComponent<TOwn extends object, TTemplate extends ComponentType<object>>(
    name: string,
    options?: ComponentOptions<ComponentDataWithTemplate<TOwn, TTemplate>>
): ComponentType<ComponentDataWithTemplate<TOwn, TTemplate>>;
export function defineComponent<T extends object>(
    name: string,
    options?: ComponentOptions<T>
): ComponentType<T>;
export function defineComponent<T extends object>(
    name: string,
    options: ComponentOptions<T> = {}
): ComponentType<T> {
    if (name.trim().length === 0) {
        throw new Error("Cannot define component: name must be a non-empty string");
    }

    const deps = normalizeComponentDeps(name, options.deps);
    const lifecycle = Object.freeze({
        onAdd: options.onAdd,
        onInsert: options.onInsert,
        onUnset: options.onUnset,
        onReplace: options.onReplace,
        onRemove: options.onRemove,
    } satisfies ComponentLifecycle<T>);

    return Object.freeze({
        key: `component/${name}`,
        name,
        deps,
        lifecycle,
    } satisfies ComponentType<T>);
}

function normalizeComponentDeps(
    componentName: string,
    deps: readonly AnyComponentType[] | undefined
): readonly AnyComponentType[] {
    if (deps === undefined || deps.length === 0) return Object.freeze([]);

    const seen = new Set<AnyComponentType>();
    const normalized: AnyComponentType[] = [];

    for (let index = 0; index < deps.length; index++) {
        const dep = deps[index];

        if (dep === undefined || dep === null) {
            throw new Error(
                `Cannot define component ${componentName}: dependency at index ${index} is ${String(dep)}`
            );
        }

        if (seen.has(dep)) {
            throw new Error(
                `Cannot define component ${componentName}: dependency ${dep.name} is duplicated`
            );
        }

        seen.add(dep);
        normalized.push(dep);
    }

    return Object.freeze(normalized);
}

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
    return { type, value } satisfies ComponentEntry<ComponentData<TComponent>>;
}

/** Creates a marker-component entry using the default `{}` payload. */
export function withMarker<TComponent extends AnyComponentType>(
    type: ComponentData<TComponent> extends Record<string, never> ? TComponent : never
): ComponentEntry<ComponentData<TComponent>> {
    return withComponent(type, {} as ComponentData<TComponent>);
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
    registry: { readonly name: string; isRegisteredComponent(type: AnyComponentType): boolean },
    type: AnyComponentType,
    action: string
): void {
    if (registry.isRegisteredComponent(type)) {
        return;
    }

    throw new Error(
        `Cannot ${action} component ${type.name}: it is not registered in ${registry.name}`
    );
}

/** Throws unless every component belongs to the expected registry. */
export function assertRegisteredComponents(
    registry: { readonly name: string; isRegisteredComponent(type: AnyComponentType): boolean },
    types: readonly AnyComponentType[],
    action: string
): void {
    for (const type of types) {
        assertRegisteredComponent(registry, type, action);
    }
}
