import type {
    ComponentHook,
    ComponentLifecycleStage,
    ComponentReplaceHook,
    ComponentType,
} from "../component.js";
import type { Entity } from "../entity.js";
import type { World } from "../world.js";

/** Additional runtime hooks registered on top of component type metadata. */
export type ComponentHookRegistry = {
    onAdd?: ComponentHook<unknown>[];
    onInsert?: ComponentHook<unknown>[];
    onUnset?: ComponentHook<unknown>[];
    onReplace?: ComponentReplaceHook<unknown>[];
    onRemove?: ComponentHook<unknown>[];
    onDespawn?: ComponentHook<unknown>[];
};

/** Hook registry keyed by component type id. */
export interface ComponentHookContext {
    readonly hooks: Map<number, ComponentHookRegistry>;
}

/** Creates the component-hook context used by a world. */
export function createComponentHookContext(): ComponentHookContext {
    return {
        hooks: new Map(),
    };
}

/** Registers a runtime component hook and returns an unsubscribe callback. */
export function addComponentHook<T extends object>(
    context: ComponentHookContext,
    type: ComponentType<T>,
    stage: Exclude<ComponentLifecycleStage, "onReplace">,
    hook: ComponentHook<T>
): () => void;
export function addComponentHook<T extends object>(
    context: ComponentHookContext,
    type: ComponentType<T>,
    stage: "onReplace",
    hook: ComponentReplaceHook<T>
): () => void;
export function addComponentHook<T extends object>(
    context: ComponentHookContext,
    type: ComponentType<T>,
    stage: ComponentLifecycleStage,
    hook: ComponentHook<T> | ComponentReplaceHook<T>
): () => void {
    const registry = context.hooks.get(type.id) ?? {};

    if (stage === "onReplace") {
        const replaceHooks = (registry.onReplace ?? []) as ComponentReplaceHook<T>[];

        replaceHooks.push(hook as ComponentReplaceHook<T>);
        registry.onReplace = replaceHooks as ComponentReplaceHook<unknown>[];
        context.hooks.set(type.id, registry);

        return () => {
            const index = replaceHooks.indexOf(hook as ComponentReplaceHook<T>);

            if (index !== -1) {
                replaceHooks.splice(index, 1);
            }
        };
    }

    const hooks = (registry[stage] ?? []) as ComponentHook<T>[];

    hooks.push(hook as ComponentHook<T>);
    registry[stage] = hooks as ComponentHook<unknown>[];
    context.hooks.set(type.id, registry);

    return () => {
        const index = hooks.indexOf(hook as ComponentHook<T>);

        if (index !== -1) {
            hooks.splice(index, 1);
        }
    };
}

/** Runs built-in lifecycle hooks first, then any hooks registered at runtime. */
export function runComponentHooks<T extends object>(
    context: ComponentHookContext,
    type: ComponentType<T>,
    stage: Exclude<ComponentLifecycleStage, "onReplace">,
    entity: Entity,
    component: T,
    world: World
): void;
export function runComponentHooks<T extends object>(
    context: ComponentHookContext,
    type: ComponentType<T>,
    stage: "onReplace",
    entity: Entity,
    previous: T,
    next: T,
    world: World
): void;
export function runComponentHooks<T extends object>(
    context: ComponentHookContext,
    type: ComponentType<T>,
    stage: ComponentLifecycleStage,
    entity: Entity,
    componentOrPrevious: T,
    nextOrWorld: T | World,
    maybeWorld?: World
): void {
    if (stage === "onReplace") {
        const previous = componentOrPrevious;
        const next = nextOrWorld as T;
        const world = maybeWorld as World;

        type.lifecycle.onReplace?.(entity, previous, next, world);

        const registeredHooks = (context.hooks.get(type.id)?.onReplace ??
            []) as ComponentReplaceHook<T>[];

        for (const hook of registeredHooks) {
            hook(entity, previous, next, world);
        }

        return;
    }

    const component = componentOrPrevious;
    const world = nextOrWorld as World;

    type.lifecycle[stage]?.(entity, component, world);

    const registeredHooks = (context.hooks.get(type.id)?.[stage] ?? []) as ComponentHook<T>[];

    for (const hook of registeredHooks) {
        hook(entity, component, world);
    }
}
