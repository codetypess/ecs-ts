import {
    World,
    defineResource,
    defineState,
    resourceMatches,
    runIfAll,
    runIfNot,
    stateIs,
} from "../src";

const Log = defineResource<string[]>("Log");
const FeatureEnabled = defineResource<{ value: boolean }>("FeatureEnabled");
const GameMode = defineState<"running" | "paused">("GameMode", "running");

class SetupSystem {
    onStartup(world: World): void {
        world.setResource(Log, []);
        world.setResource(FeatureEnabled, { value: true });
        world.initState(GameMode);
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
        world.resource(Log).push(this.name);
    }
}

class PrintSystem {
    onLast(world: World): void {
        console.log(world.resource(Log).join(" -> "));
    }
}

const world = new World();

world.setFixedTimeStep(0.5);
world.configureSet("gameplay", {
    after: ["input"],
    before: ["render"],
    runIf: runIfAll(
        stateIs(GameMode, "running"),
        resourceMatches(FeatureEnabled, (feature) => feature.value)
    ),
});
world.configureSet("paused", {
    runIf: runIfNot(stateIs(GameMode, "running")),
});
world.addSystem(new SetupSystem());
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
