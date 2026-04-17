import assert from "node:assert/strict";
import { test } from "node:test";
import {
    App,
    Commands,
    Plugin,
    World,
    createRegistry,
    defineResource,
    defineState,
    withComponent,
} from "../src";

const registry = createRegistry("app-test");

test("app plugins can register systems, resources, states, and drive updates", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("AppPosition");
    const Log = defineResource<string[]>("AppLog");
    const Mode = defineState<"boot" | "running">("AppMode", "boot");

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

    class GameplayPlugin implements Plugin {
        build(app: App): void {
            app.setResource(Log, []);
            app.initState(Mode);
            app.configureSet("gameplay", { runIf: () => true });
            app.configureSetForStage("startup", "gameplay", { runIf: () => false });
            app.configureSetForStage("update", "gameplay", { runIf: () => true });
            app.addSystem(new BootstrapSystem());
            app.addSystem(new RunningSystem(), { set: "gameplay" });
            app.addStateSystem(Mode, "running", new RunningEnterSystem());
        }
    }

    const app = new App(registry);

    app.addPlugin(new GameplayPlugin());
    app.update(0);

    assert.deepEqual(app.world.resource(Log), ["startup", "enter:running", "update"]);
    assert.deepEqual(app.world.single([Position])[1], { x: 1, y: 0 });
    assert.equal(app.world.state(Mode), "running");
});

test("app only builds the same plugin instance once", () => {
    let builds = 0;
    const plugin: Plugin = {
        build() {
            builds++;
        },
    };
    const app = new App(registry);

    app.addPlugin(plugin);
    app.addPlugin(plugin);
    app.addPlugins(plugin);

    assert.equal(builds, 1);
});
