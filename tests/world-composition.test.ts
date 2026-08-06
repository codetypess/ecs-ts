import assert from "node:assert/strict";
import { test } from "node:test";
import { DeferredCommands, World, createRegistry, withComponent } from "../src";

const registry = createRegistry("world-composition-test");

test("world can register systems, resources, states, and drive updates together", () => {
    type Position = { x: number; y: number };
    const Position = registry.defineComponent<Position>("WorldCompositionPosition");
    const Log = registry.defineResource<string[]>("WorldCompositionLog");
    const Mode = registry.defineState<"boot" | "running">("WorldCompositionMode", "boot");

    class BootstrapSystem {
        onStartup(world: World, _dt: number, commands: DeferredCommands): void {
            world.mustGetResource(Log).push("startup");
            commands.spawn(0, withComponent(Position, { x: 0, y: 0 }));
            commands.setState(Mode, "running");
        }
    }

    class RunningSystem {
        onUpdate(world: World): void {
            world.each([Position], (_entity, position) => {
                position.x += 1;
            });
            world.mustGetResource(Log).push("update");
        }
    }

    class RunningEnterSystem {
        private readonly prefix = "enter";

        onEnter(
            world: World,
            _dt: number,
            _commands: DeferredCommands,
            value: "boot" | "running"
        ): void {
            world.mustGetResource(Log).push(`${this.prefix}:${value}`);
        }
    }

    class BootExitSystem {
        private readonly prefix = "exit";

        onExit(
            world: World,
            _dt: number,
            _commands: DeferredCommands,
            value: "boot" | "running"
        ): void {
            world.mustGetResource(Log).push(`${this.prefix}:${value}`);
        }
    }

    class ModeTransitionSystem {
        private readonly prefix = "transition";

        onTransition(
            world: World,
            _dt: number,
            _commands: DeferredCommands,
            from: "boot" | "running",
            to: "boot" | "running"
        ): void {
            world.mustGetResource(Log).push(`${this.prefix}:${from}->${to}`);
        }
    }

    const world = new World(registry);

    world.setResource(Log, []);
    world.initState(Mode);
    world.configureSet("gameplay", { runIf: () => true });
    world.configureSetForStage("startup", "gameplay", { runIf: () => false });
    world.configureSetForStage("update", "gameplay", { runIf: () => true });
    world.addSystem(new BootstrapSystem());
    world.addSystem(new RunningSystem(), { set: "gameplay" });
    world.addStateSystem(Mode, "boot", new BootExitSystem());
    world.addStateSystem(Mode, "running", new RunningEnterSystem());
    world.addTransitionSystem(Mode, new ModeTransitionSystem());
    world.update(0);

    assert.deepEqual(world.mustGetResource(Log), [
        "startup",
        "exit:boot",
        "transition:boot->running",
        "enter:running",
        "update",
    ]);
    assert.deepEqual(world.mustGetSingle([Position])[1], { x: 1, y: 0 });
    assert.equal(world.mustGetState(Mode), "running");
});

test("state registration lazily initializes and initState becomes a no-op afterward", () => {
    const Mode = registry.defineState<"boot" | "running">("WorldCompositionLazyMode", "boot");
    const log: string[] = [];
    const world = new World(registry);

    world.addStateSystem(Mode, "boot", {
        onEnter() {
            log.push("enter:boot");
        },
    });
    world.initState(Mode, "running");
    world.update(0);

    assert.equal(world.mustGetState(Mode), "boot");
    assert.deepEqual(log, ["enter:boot"]);
});

test("transition systems observe every state change", () => {
    const transitionRegistry = createRegistry("world-transition-system-test");
    const Mode = transitionRegistry.defineState<"a" | "b" | "c">("Mode", "a");
    const transitions: string[] = [];
    const world = new World(transitionRegistry);

    world.initState(Mode);
    world.addTransitionSystem(Mode, {
        onTransition(_world, _dt, _commands, from, to) {
            transitions.push(`${from}->${to}`);
        },
    });

    world.update(0);
    world.setState(Mode, "b");
    world.update(0);
    world.setState(Mode, "c");
    world.update(0);

    assert.deepEqual(transitions, ["a->b", "b->c"]);
});
