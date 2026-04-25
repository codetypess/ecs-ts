import {
    type Commands,
    type Entity,
    World,
    createRegistry,
    matchesAny,
    queryState,
    resourceMatches,
    runIfAll,
    stateIs,
    withComponent,
    withMarker,
} from "../src";

const registry = createRegistry("example-scheduler-showcase");
const Log = registry.defineResource<string[]>("SchedulerShowcaseLog");
const Frame = registry.defineResource<{ value: number }>("SchedulerShowcaseFrame");
const FeatureFlags = registry.defineResource<{ physicsEnabled: boolean }>("SchedulerShowcaseFlags");
const ControlledEntity = registry.defineResource<{ value: Entity | undefined }>(
    "SchedulerShowcaseControlled"
);
const GameMode = registry.defineState<"running" | "paused">("SchedulerShowcaseMode", "running");

const Transform = registry.defineComponent<{ x: number; y: number }>("SchedulerShowcaseTransform");
const Velocity = registry.defineComponent<{ x: number; y: number }>("SchedulerShowcaseVelocity");
const RigidBody = registry.defineComponent("SchedulerShowcaseRigidBody");
const Sleeping = registry.defineComponent("SchedulerShowcaseSleeping");

const activeBodies = queryState([Transform, Velocity, RigidBody], {
    without: [Sleeping],
});

function appendLog(world: World, message: string): void {
    world.mustGetResource(Log).push(message);
}

class SetupSystem {
    onStartup(world: World): void {
        world.setResource(Log, []);
        world.setResource(Frame, { value: 0 });
        world.setResource(FeatureFlags, { physicsEnabled: true });
        world.setResource(ControlledEntity, { value: undefined });
        world.initState(GameMode);
        appendLog(world, "startup:setup");
    }
}

class SpawnSceneSystem {
    onStartup(world: World): void {
        const controlled = world.spawn(
            withComponent(Transform, { x: 0, y: 0 }),
            withComponent(Velocity, { x: 1, y: 0 }),
            withMarker(RigidBody)
        );

        world.spawn(
            withComponent(Transform, { x: 100, y: 0 }),
            withComponent(Velocity, { x: 0, y: 1 }),
            withMarker(RigidBody),
            withMarker(Sleeping)
        );

        world.mustGetResource(ControlledEntity).value = controlled;
        appendLog(world, "startup:spawn-scene");
    }
}

class FixedPrepareSystem {
    onFixedUpdate(world: World, dt: number): void {
        appendLog(
            world,
            `fixed:prepare:frame=${world.mustGetResource(Frame).value}:dt=${dt.toFixed(1)}`
        );
    }
}

class PhysicsSystem {
    onFixedUpdate(world: World): void {
        let bodies = 0;

        activeBodies.each(world, (_entity, transform, velocity) => {
            transform.x += velocity.x;
            transform.y += velocity.y;
            bodies++;
        });

        const controlled = world.mustGetResource(ControlledEntity).value;
        const position =
            controlled === undefined ? undefined : world.mustGetComponent(controlled, Transform).x;

        appendLog(
            world,
            `fixed:physics:frame=${world.mustGetResource(Frame).value}:bodies=${bodies}:player=${position}`
        );
    }
}

class FixedReportSystem {
    onFixedUpdate(world: World): void {
        appendLog(world, `fixed:report:frame=${world.mustGetResource(Frame).value}`);
    }
}

class InputSystem {
    onUpdate(world: World, _dt: number, commands: Commands): void {
        const frame = world.mustGetResource(Frame).value;
        const controlled = world.mustGetResource(ControlledEntity).value;

        if (controlled === undefined) {
            return;
        }

        if (frame === 0) {
            commands.addComponent(controlled, Sleeping, {});
            appendLog(world, "update:input:sleep-controlled");
        } else if (frame === 1) {
            commands.setState(GameMode, "paused");
            appendLog(world, "update:input:pause");
        } else if (frame === 2) {
            commands.removeComponent(controlled, Sleeping);
            commands.setState(GameMode, "running");
            commands.setResource(FeatureFlags, { physicsEnabled: false });
            appendLog(world, "update:input:wake-resume-disable-physics");
        } else if (frame === 3) {
            commands.setResource(FeatureFlags, { physicsEnabled: true });
            appendLog(world, "update:input:enable-physics");
        }
    }
}

class GameplaySystem {
    onUpdate(world: World): void {
        appendLog(world, `update:gameplay:frame=${world.mustGetResource(Frame).value}`);
    }
}

class RenderSystem {
    onUpdate(world: World): void {
        const controlled = world.mustGetResource(ControlledEntity).value;
        const position =
            controlled === undefined ? undefined : world.mustGetComponent(controlled, Transform).x;

        appendLog(
            world,
            `update:render:frame=${world.mustGetResource(Frame).value}:player=${position}`
        );
    }
}

class FrameEndSystem {
    onLast(world: World): void {
        const frame = world.mustGetResource(Frame);

        appendLog(world, `last:frame=${frame.value}`);
        frame.value++;
    }
}

class SaveSystem {
    onShutdown(world: World): void {
        appendLog(world, "shutdown:save");
    }
}

class CleanupSystem {
    onShutdown(world: World): void {
        appendLog(world, "shutdown:cleanup");
    }
}

const world = new World(registry);

world.setFixedTimeStep(0.5);
world.configureSet("gameplay", {
    before: ["render"],
    runIf: stateIs(GameMode, "running"),
});
world.configureSetForStage("startup", "gameplay", {
    after: ["setup"],
});
world.configureSetForStage("update", "gameplay", {
    after: ["input"],
});
world.configureSet("physics", {
    runIf: runIfAll(
        stateIs(GameMode, "running"),
        resourceMatches(FeatureFlags, (flags) => flags.physicsEnabled),
        matchesAny(activeBodies)
    ),
});
world.configureSetForStage("fixedUpdate", "physics", {
    after: ["physics-prepare"],
    before: ["fixed-report"],
});
world.configureSetForStage("shutdown", "cleanup", {
    after: ["save"],
});

world.addSystem(new SetupSystem(), { label: "setup" });
world.addSystem(new SpawnSceneSystem(), { set: "gameplay" });
world.addSystem(new FixedPrepareSystem(), { label: "physics-prepare" });
world.addSystem(new PhysicsSystem(), { set: "physics" });
world.addSystem(new FixedReportSystem(), { label: "fixed-report" });
world.addSystem(new InputSystem(), { label: "input" });
world.addSystem(new GameplaySystem(), { set: "gameplay" });
world.addSystem(new RenderSystem(), { label: "render" });
world.addSystem(new FrameEndSystem());
world.addSystem(new SaveSystem(), { label: "save" });
world.addSystem(new CleanupSystem(), { set: "cleanup" });

for (let frame = 0; frame < 5; frame++) {
    world.update(0.5);
}

world.shutdown();
console.log(world.mustGetResource(Log).join("\n"));
