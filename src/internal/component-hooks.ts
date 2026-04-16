import type { ComponentHook, ComponentLifecycleStage, ComponentType } from "../component";
import type { Entity } from "../entity";
import type { World } from "../world";

export type ComponentHookRegistry = {
    [TStage in ComponentLifecycleStage]?: ComponentHook<unknown>[];
};

export interface ComponentHookRuntimeContext {
    readonly hooks: Map<number, ComponentHookRegistry>;
}

export function createComponentHookRuntimeContext(): ComponentHookRuntimeContext {
    return {
        hooks: new Map(),
    };
}

export function addComponentHook<T>(
    context: ComponentHookRuntimeContext,
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

export function runComponentHooks<T>(
    context: ComponentHookRuntimeContext,
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
