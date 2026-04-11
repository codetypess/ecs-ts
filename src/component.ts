import type { Entity } from "./entity";
import type { World } from "./world";

let nextComponentId = 0;

export type ComponentHook<T> = (entity: Entity, component: T, world: World) => void;

export interface ComponentLifecycle<T> {
    readonly onAdd?: ComponentHook<T>;
    readonly onInsert?: ComponentHook<T>;
    readonly onReplace?: ComponentHook<T>;
    readonly onRemove?: ComponentHook<T>;
    readonly onDespawn?: ComponentHook<T>;
}

export type ComponentLifecycleStage = keyof ComponentLifecycle<unknown>;

export interface ComponentType<T> {
    readonly id: number;
    readonly name: string;
    readonly lifecycle: Readonly<ComponentLifecycle<T>>;
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
    lifecycle: ComponentLifecycle<T> = {}
): ComponentType<T> {
    return Object.freeze({
        id: nextComponentId++,
        name,
        lifecycle: Object.freeze({ ...lifecycle }),
    });
}

export function withComponent<T>(type: ComponentType<T>, value: T): ComponentEntry<T> {
    return { type, value };
}
