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

export interface Bundle {
    readonly entries: readonly ComponentEntry<unknown>[];
}

type DefineComponentArgs<T> = null extends T
    ? [name: never, options?: never]
    : undefined extends T
    ? [name: never, options?: never]
    : [name: string, options?: ComponentOptions<T>];

export function defineComponent(
    name: string,
    options?: ComponentOptions<Record<string, never>>
): ComponentType<Record<string, never>>;
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

export function withComponent<TComponent extends AnyComponentType>(
    type: TComponent,
    value: ComponentData<TComponent>
): ComponentEntry<ComponentData<TComponent>> {
    return { type, value };
}

export function withMarker<TComponent extends AnyComponentType>(
    type: ComponentData<TComponent> extends Record<string, never> ? TComponent : never
): ComponentEntry<ComponentData<TComponent>> {
    return withComponent(type, {} as ComponentData<TComponent>);
}

export function bundle(...entries: ComponentEntry<unknown>[]): Bundle {
    return Object.freeze({
        entries: Object.freeze([...entries]),
    });
}

export function requireComponent<T>(type: ComponentType<T>, create: () => T): RequiredComponent<T> {
    return Object.freeze({ type, create });
}
