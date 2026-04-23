import type { StateValue } from "./state.js";
import type { Commands } from "./commands.js";
import type { World } from "./world.js";

/** Object-style system whose lifecycle methods are attached to scheduler stages. */
export interface System {
    onPreStartup?(world: World, dt: number, commands: Commands): void;
    onStartup?(world: World, dt: number, commands: Commands): void;
    onPostStartup?(world: World, dt: number, commands: Commands): void;
    onFirst?(world: World, dt: number, commands: Commands): void;
    onPreUpdate?(world: World, dt: number, commands: Commands): void;
    onFixedUpdate?(world: World, dt: number, commands: Commands): void;
    onUpdate?(world: World, dt: number, commands: Commands): void;
    onPostUpdate?(world: World, dt: number, commands: Commands): void;
    onLast?(world: World, dt: number, commands: Commands): void;
    onShutdown?(world: World, dt: number, commands: Commands): void;
}

/** Optional enter/exit callbacks bound to a single concrete state value. */
export interface StateSystem<T extends StateValue> {
    onEnter?(world: World, dt: number, commands: Commands, value: T): void;
    onExit?(world: World, dt: number, commands: Commands, value: T): void;
}

/** Optional callback fired when a state transitions between two concrete values. */
export interface TransitionSystem<T extends StateValue> {
    onTransition?(world: World, dt: number, commands: Commands, from: T, to: T): void;
}
