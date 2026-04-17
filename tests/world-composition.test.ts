import assert from "node:assert/strict";
import { test } from "node:test";
import {
    Commands,
    World,
    createRegistry,
    defineResource,
    defineState,
    withComponent,
} from "../src";

const registry = createRegistry("world-composition-test");

test("world can register systems, resources, states, and drive updates together", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("WorldCompositionPosition");
    const Log = defineResource<string[]>("WorldCompositionLog");
    const Mode = defineState<"boot" | "running">("WorldCompositionMode", "boot");

    class BootstrapSystem {
        onStartup(world: World, _dt: number, commands: Commands): void {
            world.resource(Log).push("startup");
            commands.spawn(withComponent(Position, { x: 0, y: 0 }));
            commands.setState(Mode, "running");
        }
    }

    class RunningSystem {
        onUpdate(world: World): void {
            world.each([Position], (_entity, position) => {
                position.x += 1;
            });
            world.resource(Log).push("update");
        }
    }

    class RunningEnterSystem {
        onEnter(world: World): void {
            world.resource(Log).push(`enter:${world.state(Mode)}`);
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

    assert.deepEqual(world.resource(Log), ["startup", "enter:running", "update"]);
    assert.deepEqual(world.single([Position])[1], { x: 1, y: 0 });
    assert.equal(world.state(Mode), "running");
});

test("state registration lazily initializes and initState becomes a no-op afterward", () => {
    const Mode = defineState<"boot" | "running">("WorldCompositionLazyMode", "boot");
    const log: string[] = [];
    const world = new World(registry);

    world.onEnter(Mode, "boot", () => {
        log.push("enter:boot");
    });
    world.initState(Mode, "running");
    world.update(0);

    assert.equal(world.state(Mode), "boot");
    assert.deepEqual(log, ["enter:boot"]);
});
