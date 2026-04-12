import { World, defineResource } from "../src";

const Log = defineResource<string[]>("Log");
const FeatureEnabled = defineResource<{ value: boolean }>("FeatureEnabled");

class SetupSystem {
    onStartup(world: World): void {
        world.setResource(Log, []);
        world.setResource(FeatureEnabled, { value: true });
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
world.addSystem(new SetupSystem());
world.addSystem(new FixedStepSystem());
world.addSystem(new NamedUpdateSystem("A"), { label: "a" });
world.addSystem(new NamedUpdateSystem("B"), { label: "b", after: ["a"] });
world.addSystem(new NamedUpdateSystem("C"), { label: "c", before: ["b"] });
world.addSystem(new NamedUpdateSystem("runIf"), {
    after: ["b"],
    runIf: (currentWorld) => currentWorld.resource(FeatureEnabled).value,
});
world.addSystem(new NamedUpdateSystem("skipped"), {
    runIf: () => false,
});
world.addSystem(new PrintSystem());

world.update(1.2);
