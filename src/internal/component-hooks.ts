import type {
    ComponentAddHook,
    ComponentAddReason,
    ComponentHook,
    ComponentLifecycleStage,
    ComponentRemoveHook,
    ComponentRemoveReason,
    ComponentReplaceHook,
    ComponentType,
} from "../component.js";
import type { Entity } from "../entity.js";
import type { World } from "../world.js";

/** Additional runtime hooks registered on top of component type metadata. */
export type ComponentHookRegistry = {
    onAdd?: ComponentAddHook<unknown>[];
    onInsert?: ComponentHook<unknown>[];
    onUnset?: ComponentHook<unknown>[];
    onReplace?: ComponentReplaceHook<unknown>[];
    onRemove?: ComponentRemoveHook<unknown>[];
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
    stage: "onAdd",
    hook: ComponentAddHook<T>
): () => void;
export function addComponentHook<T extends object>(
    context: ComponentHookContext,
    type: ComponentType<T>,
    stage: "onRemove",
    hook: ComponentRemoveHook<T>
): () => void;
export function addComponentHook<T extends object>(
    context: ComponentHookContext,
    type: ComponentType<T>,
    stage: Exclude<ComponentLifecycleStage, "onAdd" | "onRemove" | "onReplace">,
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
    hook: ComponentAddHook<T> | ComponentHook<T> | ComponentRemoveHook<T> | ComponentReplaceHook<T>
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

    if (stage === "onAdd") {
        const addHooks = (registry.onAdd ?? []) as ComponentAddHook<T>[];

        addHooks.push(hook as ComponentAddHook<T>);
        registry.onAdd = addHooks as ComponentAddHook<unknown>[];
        context.hooks.set(type.id, registry);

        return () => {
            const index = addHooks.indexOf(hook as ComponentAddHook<T>);

            if (index !== -1) {
                addHooks.splice(index, 1);
            }
        };
    }

    if (stage === "onRemove") {
        const removeHooks = (registry.onRemove ?? []) as ComponentRemoveHook<T>[];

        removeHooks.push(hook as ComponentRemoveHook<T>);
        registry.onRemove = removeHooks as ComponentRemoveHook<unknown>[];
        context.hooks.set(type.id, registry);

        return () => {
            const index = removeHooks.indexOf(hook as ComponentRemoveHook<T>);

            if (index !== -1) {
                removeHooks.splice(index, 1);
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
    stage: "onAdd",
    entity: Entity,
    component: T,
    world: World,
    reason: ComponentAddReason
): void;
export function runComponentHooks<T extends object>(
    context: ComponentHookContext,
    type: ComponentType<T>,
    stage: "onRemove",
    entity: Entity,
    component: T,
    world: World,
    reason: ComponentRemoveReason
): void;
export function runComponentHooks<T extends object>(
    context: ComponentHookContext,
    type: ComponentType<T>,
    stage: Exclude<ComponentLifecycleStage, "onAdd" | "onRemove" | "onReplace">,
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
    worldOrReason?: World | ComponentAddReason | ComponentRemoveReason
): void {
    if (stage === "onReplace") {
        const previous = componentOrPrevious;
        const next = nextOrWorld as T;
        const world = worldOrReason as World;

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

    if (stage === "onAdd") {
        const reason = worldOrReason as ComponentAddReason;

        type.lifecycle.onAdd?.(entity, component, world, reason);

        const registeredHooks = (context.hooks.get(type.id)?.onAdd ?? []) as ComponentAddHook<T>[];

        for (const hook of registeredHooks) {
            hook(entity, component, world, reason);
        }

        return;
    }

    if (stage === "onRemove") {
        const reason = worldOrReason as ComponentRemoveReason;

        type.lifecycle.onRemove?.(entity, component, world, reason);

        const registeredHooks = (context.hooks.get(type.id)?.onRemove ??
            []) as ComponentRemoveHook<T>[];

        for (const hook of registeredHooks) {
            hook(entity, component, world, reason);
        }

        return;
    }

    type.lifecycle[stage]?.(entity, component, world);

    const registeredHooks = (context.hooks.get(type.id)?.[stage] ?? []) as ComponentHook<T>[];

    for (const hook of registeredHooks) {
        hook(entity, component, world);
    }
}
