import { DeferredCommands, World, createRegistry } from "../src";

const registry = createRegistry("example-state");
const GameState = registry.defineState("GameState", "menu" as "menu" | "playing" | "paused");

class MenuStateSystem {
    onEnter(): void {
        console.log("OnEnter(menu): create menu UI");
    }

    onExit(): void {
        console.log("OnExit(menu): despawn menu UI");
    }
}

class PlayingStateSystem {
    onEnter(): void {
        console.log("OnEnter(playing): create player and HUD");
    }
}

class PausedStateSystem {
    onEnter(): void {
        console.log("OnEnter(paused): pause gameplay systems");
    }
}

class GameTransitionSystem {
    onTransition(
        _world: World,
        _dt: number,
        _commands: DeferredCommands,
        from: "menu" | "playing" | "paused",
        to: "menu" | "playing" | "paused"
    ): void {
        console.log(`OnTransition(${from} -> ${to})`);
    }
}

class StateDriverSystem {
    private frame = 0;

    onUpdate(world: World, _dt: number, commands: DeferredCommands): void {
        console.log(`Update: state=${world.mustGetState(GameState)} frame=${this.frame}`);

        if (this.frame === 0) {
            commands.setState(GameState, "playing");
        } else if (this.frame === 2) {
            commands.setState(GameState, "paused");
        }

        this.frame++;
    }
}

const world = new World(registry);

world
    .initState(GameState)
    .addStateSystem(GameState, "menu", new MenuStateSystem())
    .addTransitionSystem(GameState, new GameTransitionSystem())
    .addStateSystem(GameState, "playing", new PlayingStateSystem())
    .addStateSystem(GameState, "paused", new PausedStateSystem())
    .addSystem(new StateDriverSystem());

world.update(0);
world.update(0);
world.update(0);
world.update(0);
