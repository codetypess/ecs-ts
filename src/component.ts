import type { Entity } from "./entity";
import type { World } from "./world";

let nextComponentId = 0;

export type ComponentHook<T> = {
    bivarianceHack(entity: Entity, component: T, world: World): void;
}["bivarianceHack"];

export interface ComponentLifecycle<T> {
    readonly onAdd?: ComponentHook<T>;
    readonly onInsert?: ComponentHook<T>;
    readonly onReplace?: ComponentHook<T>;
    readonly onRemove?: ComponentHook<T>;
    readonly onDespawn?: ComponentHook<T>;
}

export interface RequiredComponent<T> {
    readonly type: ComponentType<T>;
    create(): T;
}

export interface ComponentOptions<T> extends ComponentLifecycle<T> {
    readonly require?: readonly RequiredComponent<unknown>[];
}

export type ComponentLifecycleStage = keyof ComponentLifecycle<unknown>;

export interface ComponentType<T> {
    readonly id: number;
    readonly name: string;
    readonly lifecycle: Readonly<ComponentLifecycle<T>>;
    readonly required: readonly RequiredComponent<unknown>[];
}

export type AnyComponentType = ComponentType<unknown>;

export type ComponentData<TComponent extends AnyComponentType> =
    TComponent extends ComponentType<infer TData> ? TData : never;

export interface ComponentEntry<T> {
    readonly type: ComponentType<T>;
    readonly value: T;
}

export function defineComponent<T>(
    name: string,
    options: ComponentOptions<T> = {}
): ComponentType<T> {
    const { require = [], ...lifecycle } = options;

    return Object.freeze({
        id: nextComponentId++,
        name,
        lifecycle: Object.freeze({ ...lifecycle }),
        required: Object.freeze([...require]),
    });
}

export function withComponent<T>(type: ComponentType<T>, value: T): ComponentEntry<T> {
    return { type, value };
}

export function requireComponent<T>(
    type: ComponentType<T>,
    create: () => T
): RequiredComponent<T> {
    return Object.freeze({ type, create });
}
