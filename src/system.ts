import type { StateValue } from "./state";
import type { Commands } from "./commands";
import type { World } from "./world";

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

export interface StateSystem<T extends StateValue> {
    onEnter?(world: World, dt: number, commands: Commands, value: T): void;
    onExit?(world: World, dt: number, commands: Commands, value: T): void;
}

export interface TransitionSystem<T extends StateValue> {
    onTransition?(world: World, dt: number, commands: Commands, from: T, to: T): void;
}
