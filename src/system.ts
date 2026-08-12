import type { DeferredCommands } from "./deferred-commands";
import type { StateValue } from "./state";
import type { World } from "./world";

/** Object-style system whose lifecycle methods are attached to scheduler stages. */
export interface System {
    onPreStartup?(world: World, dt: number, commands: DeferredCommands): void;
    onStartup?(world: World, dt: number, commands: DeferredCommands): void;
    onPostStartup?(world: World, dt: number, commands: DeferredCommands): void;
    onFirst?(world: World, dt: number, commands: DeferredCommands): void;
    onPreUpdate?(world: World, dt: number, commands: DeferredCommands): void;
    onFixedUpdate?(world: World, dt: number, commands: DeferredCommands): void;
    onUpdate?(world: World, dt: number, commands: DeferredCommands): void;
    onPostUpdate?(world: World, dt: number, commands: DeferredCommands): void;
    onLast?(world: World, dt: number, commands: DeferredCommands): void;
    onShutdown?(world: World, dt: number, commands: DeferredCommands): void;
}

/** Optional enter/exit callbacks bound to a single concrete state value. */
export interface StateSystem<T extends StateValue> {
    onEnter?(world: World, dt: number, commands: DeferredCommands, value: T): void;
    onExit?(world: World, dt: number, commands: DeferredCommands, value: T): void;
}

/** Optional callback fired for every change of one state type. */
export interface TransitionSystem<T extends StateValue> {
    onTransition?(world: World, dt: number, commands: DeferredCommands, from: T, to: T): void;
}
