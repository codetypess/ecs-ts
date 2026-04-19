import { World, createRegistry, resourceMatches, runIfAll, runIfNot, stateIs } from "../src";

const registry = createRegistry("example-scheduler");
const Log = registry.defineResource<string[]>("Log");
const FeatureEnabled = registry.defineResource<{ value: boolean }>("FeatureEnabled");
const GameMode = registry.defineState<"running" | "paused">("GameMode", "running");

class SetupSystem {
    onStartup(world: World): void {
        world.setResource(Log, []);
        world.setResource(FeatureEnabled, { value: true });
        world.initState(GameMode);
        world.resource(Log).push("startup:setup");
    }
}

class GameplayStartupSystem {
    onStartup(world: World): void {
        world.resource(Log).push("startup:gameplay");
    }
}

class FixedStepSystem {
    onFixedUpdate(world: World, dt: number): void {
        world.resource(Log).push(`fixed:${dt.toFixed(2)}`);
    }
}

class NamedUpdateSystem {
    constructor(private readonly name: string) {}

    onUpdate(world: World): void {
        world.resource(Log).push(`update:${this.name}`);
    }
}

class PrintSystem {
    onLast(world: World): void {
        console.log(world.resource(Log).join(" -> "));
    }
}

const world = new World(registry);

world.setFixedTimeStep(0.5);
world.configureSet("gameplay", {
    before: ["render"],
    runIf: runIfAll(
        stateIs(GameMode, "running"),
        resourceMatches(FeatureEnabled, (feature) => feature.value)
    ),
});
world.configureSetForStage("startup", "gameplay", {
    after: ["setup"],
});
world.configureSetForStage("update", "gameplay", {
    after: ["input"],
});
world.configureSet("paused", {
    runIf: runIfNot(stateIs(GameMode, "running")),
});
world.addSystem(new SetupSystem(), { label: "setup" });
world.addSystem(new GameplayStartupSystem(), { set: "gameplay" });
world.addSystem(new FixedStepSystem());
world.addSystem(new NamedUpdateSystem("render"), { label: "render" });
world.addSystem(new NamedUpdateSystem("movement"), {
    label: "movement",
    set: "gameplay",
});
world.addSystem(new NamedUpdateSystem("combat"), {
    label: "combat",
    set: "gameplay",
    after: ["movement"],
});
world.addSystem(new NamedUpdateSystem("skipped"), {
    set: "paused",
});
world.addSystem(new NamedUpdateSystem("input"), { label: "input" });
world.addSystem(new NamedUpdateSystem("cleanup"), { after: ["gameplay", "render"] });
world.addSystem(new PrintSystem());

world.update(1.2);
