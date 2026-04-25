import assert from "node:assert/strict";
import { test } from "node:test";
import { Commands, World, createRegistry, withComponent } from "../src";

const registry = createRegistry("world-composition-test");

test("world can register systems, resources, states, and drive updates together", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("WorldCompositionPosition");
    const Log = registry.defineResource<string[]>("WorldCompositionLog");
    const Mode = registry.defineState<"boot" | "running">("WorldCompositionMode", "boot");

    class BootstrapSystem {
        onStartup(world: World, _dt: number, commands: Commands): void {
            world.mustGetResource(Log).push("startup");
            commands.spawn(withComponent(Position, { x: 0, y: 0 }));
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
        onEnter(world: World): void {
            world.mustGetResource(Log).push(`enter:${world.mustGetState(Mode)}`);
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
    world.addStateSystem(Mode, "running", new RunningEnterSystem());
    world.update(0);

    assert.deepEqual(world.mustGetResource(Log), ["startup", "enter:running", "update"]);
    assert.deepEqual(world.mustGetSingle([Position])[1], { x: 1, y: 0 });
    assert.equal(world.mustGetState(Mode), "running");
});

test("state registration lazily initializes and initState becomes a no-op afterward", () => {
    const Mode = registry.defineState<"boot" | "running">("WorldCompositionLazyMode", "boot");
    const log: string[] = [];
    const world = new World(registry);

    world.onEnter(Mode, "boot", () => {
        log.push("enter:boot");
    });
    world.initState(Mode, "running");
    world.update(0);

    assert.equal(world.mustGetState(Mode), "boot");
    assert.deepEqual(log, ["enter:boot"]);
});
