import type { ComponentHook, ComponentLifecycleStage, ComponentType } from "../component";
import type { Entity } from "../entity";
import type { World } from "../world";

export type ComponentHookRegistry = {
    [TStage in ComponentLifecycleStage]?: ComponentHook<unknown>[];
};

export class ComponentHookRuntime {
    private readonly hooks = new Map<number, ComponentHookRegistry>();

    add<T>(
        type: ComponentType<T>,
        stage: ComponentLifecycleStage,
        hook: ComponentHook<T>
    ): () => void {
        const registry = this.hooks.get(type.id) ?? {};
        const hooks = registry[stage] ?? [];

        hooks.push(hook);
        registry[stage] = hooks;
        this.hooks.set(type.id, registry);

        return () => {
            const index = hooks.indexOf(hook);

            if (index !== -1) {
                hooks.splice(index, 1);
            }
        };
    }

    run<T>(
        type: ComponentType<T>,
        stage: ComponentLifecycleStage,
        entity: Entity,
        component: T,
        world: World
    ): void {
        type.lifecycle[stage]?.(entity, component, world);

        const registeredHooks = this.hooks.get(type.id)?.[stage] ?? [];

        for (const hook of registeredHooks) {
            hook(entity, component, world);
        }
    }
}
