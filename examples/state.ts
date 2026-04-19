import { Commands, World, createRegistry } from "../src";

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

class StartGameTransitionSystem {
    onTransition(): void {
        console.log("OnTransition(menu -> playing): start new game");
    }
}

class StateDriverSystem {
    private frame = 0;

    onUpdate(world: World, _dt: number, commands: Commands): void {
        console.log(`Update: state=${world.state(GameState)} frame=${this.frame}`);

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
    .addTransitionSystem(GameState, "menu", "playing", new StartGameTransitionSystem())
    .addStateSystem(GameState, "playing", new PlayingStateSystem())
    .addStateSystem(GameState, "paused", new PausedStateSystem())
    .addSystem(new StateDriverSystem());

world.update(0);
world.update(0);
world.update(0);
world.update(0);
