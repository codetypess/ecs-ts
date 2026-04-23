import type { ComponentHook, ComponentLifecycleStage, ComponentType } from "../component.js";
import type { Entity } from "../entity.js";
import type { World } from "../world.js";

/** Additional runtime hooks registered on top of component type metadata. */
export type ComponentHookRegistry = {
    [TStage in ComponentLifecycleStage]?: ComponentHook<unknown>[];
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
    stage: ComponentLifecycleStage,
    hook: ComponentHook<T>
): () => void {
    const registry = context.hooks.get(type.id) ?? {};
    const hooks = registry[stage] ?? [];

    hooks.push(hook);
    registry[stage] = hooks;
    context.hooks.set(type.id, registry);

    return () => {
        const index = hooks.indexOf(hook);

        if (index !== -1) {
            hooks.splice(index, 1);
        }
    };
}

/** Runs built-in lifecycle hooks first, then any hooks registered at runtime. */
export function runComponentHooks<T extends object>(
    context: ComponentHookContext,
    type: ComponentType<T>,
    stage: ComponentLifecycleStage,
    entity: Entity,
    component: T,
    world: World
): void {
    type.lifecycle[stage]?.(entity, component, world);

    const registeredHooks = context.hooks.get(type.id)?.[stage] ?? [];

    for (const hook of registeredHooks) {
        hook(entity, component, world);
    }
}
