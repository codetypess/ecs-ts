import assert from "node:assert/strict";
import { test } from "node:test";
import {
    Entity,
    World,
    anyMatch,
    createRegistry,
    noMatch,
    queryState,
    resourceAdded,
    resourceChanged,
    resourceExists,
    resourceMatches,
    runIfAll,
    runIfAny,
    runIfNot,
    singleMatch,
    stateIs,
    stateMatches,
    withComponent,
    withMarker,
} from "../src";

const registry = createRegistry("scheduler-observer-test");

test("scheduler runs fixed update, ordering, and runIf", () => {
    const calls: string[] = [];

    class FixedStepSystem {
        onFixedUpdate(_world: World, dt: number): void {
            calls.push(`fixed:${dt.toFixed(1)}`);
        }
    }

    class NamedSystem {
        constructor(private readonly name: string) {}

        onUpdate(): void {
            calls.push(this.name);
        }
    }

    const world = new World(registry);

    world.setFixedTimeStep(0.5);
    world.addSystem(new FixedStepSystem());
    world.addSystem(new NamedSystem("A"), { label: "a" });
    world.addSystem(new NamedSystem("B"), { label: "b", after: ["a"] });
    world.addSystem(new NamedSystem("C"), { label: "c", before: ["b"] });
    world.addSystem(new NamedSystem("runIf"), {
        after: ["b"],
        runIf: () => true,
    });
    world.addSystem(new NamedSystem("skipped"), {
        runIf: () => false,
    });

    world.update(1.2);

    assert.deepEqual(calls, ["fixed:0.5", "fixed:0.5", "A", "C", "B", "runIf"]);
});

test("scheduler rejects cyclic ordering inside a stage", () => {
    class NamedSystem {
        onUpdate(): void {}
    }

    const world = new World(registry);

    world.addSystem(new NamedSystem(), { label: "a", after: ["b"] });
    world.addSystem(new NamedSystem(), { label: "b", after: ["a"] });

    assert.throws(() => {
        world.update(0);
    }, /System ordering cycle detected/);
});

test("scheduler supports set run conditions and ordering", () => {
    const calls: string[] = [];

    class NamedSystem {
        constructor(private readonly name: string) {}

        onUpdate(): void {
            calls.push(this.name);
        }
    }

    const world = new World(registry);

    world.configureSet("gameplay", {
        after: ["input"],
        before: ["render"],
        runIf: () => true,
    });
    world.configureSet("paused", {
        runIf: () => false,
    });
    world.addSystem(new NamedSystem("render"), { label: "render" });
    world.addSystem(new NamedSystem("movement"), { label: "movement", set: "gameplay" });
    world.addSystem(new NamedSystem("combat"), {
        label: "combat",
        set: "gameplay",
        after: ["movement"],
    });
    world.addSystem(new NamedSystem("input"), { label: "input" });
    world.addSystem(new NamedSystem("paused"), { set: "paused" });
    world.addSystem(new NamedSystem("cleanup"), { after: ["gameplay", "render"] });

    world.update(0);

    assert.deepEqual(calls, ["input", "movement", "combat", "render", "cleanup"]);
});

test("scheduler supports stage-specific set ordering", () => {
    const calls: string[] = [];

    class BootSystem {
        onStartup(): void {
            calls.push("startup:boot");
        }
    }

    class InputSystem {
        onUpdate(): void {
            calls.push("update:input");
        }
    }

    class LateSystem {
        onStartup(): void {
            calls.push("startup:late");
        }

        onUpdate(): void {
            calls.push("update:late");
        }
    }

    class GameplaySystem {
        onStartup(): void {
            calls.push("startup:gameplay");
        }

        onUpdate(): void {
            calls.push("update:gameplay");
        }
    }

    const world = new World(registry);

    world.configureSet("gameplay", { before: ["late"] });
    world.configureSetForStage("startup", "gameplay", { after: ["boot"] });
    world.configureSetForStage("update", "gameplay", { after: ["input"] });
    world.addSystem(new BootSystem(), { label: "boot" });
    world.addSystem(new InputSystem(), { label: "input" });
    world.addSystem(new GameplaySystem(), { set: "gameplay" });
    world.addSystem(new LateSystem(), { label: "late" });

    world.update(0);

    assert.deepEqual(calls, [
        "startup:boot",
        "startup:gameplay",
        "startup:late",
        "update:input",
        "update:gameplay",
        "update:late",
    ]);
});

test("scheduler snapshots ordering inputs when systems are registered", () => {
    const calls: string[] = [];

    class NamedSystem {
        constructor(private readonly name: string) {}

        onUpdate(): void {
            calls.push(this.name);
        }
    }

    const world = new World(registry);
    const after: string[] = [];

    world.addSystem(new NamedSystem("late"), { label: "late", after });
    world.addSystem(new NamedSystem("early"), { label: "early" });

    world.update(0);

    assert.deepEqual(calls, ["late", "early"]);

    after.push("early");
    world.addSystem(new NamedSystem("tail"), { label: "tail" });
    calls.length = 0;

    world.update(0);

    assert.deepEqual(calls, ["late", "early", "tail"]);
});

test("scheduler stage-specific set runIf only affects that stage", () => {
    const calls: string[] = [];

    class ConditionalSystem {
        onStartup(): void {
            calls.push("startup");
        }

        onUpdate(): void {
            calls.push("update");
        }
    }

    const world = new World(registry);

    world.configureSet("conditional", { runIf: () => true });
    world.configureSetForStage("startup", "conditional", { runIf: () => false });
    world.configureSetForStage("update", "conditional", { runIf: () => true });
    world.addSystem(new ConditionalSystem(), { set: "conditional" });

    world.update(0);

    assert.deepEqual(calls, ["update"]);
});

test("scheduler applies stage-specific set ordering in fixedUpdate", () => {
    const calls: string[] = [];

    class NamedSystem {
        constructor(private readonly name: string) {}

        onFixedUpdate(_world: World, dt: number): void {
            calls.push(`${this.name}:${dt.toFixed(1)}`);
        }
    }

    const world = new World(registry);

    world.setFixedTimeStep(0.5);
    world.configureSetForStage("fixedUpdate", "physics", {
        after: ["prepare"],
        before: ["render"],
    });
    world.addSystem(new NamedSystem("prepare"), { label: "prepare" });
    world.addSystem(new NamedSystem("physics"), { set: "physics" });
    world.addSystem(new NamedSystem("render"), { label: "render" });

    world.update(1.2);

    assert.deepEqual(calls, [
        "prepare:0.5",
        "physics:0.5",
        "render:0.5",
        "prepare:0.5",
        "physics:0.5",
        "render:0.5",
    ]);
});

test("scheduler applies stage-specific set ordering in shutdown", () => {
    const calls: string[] = [];

    class NamedSystem {
        constructor(private readonly name: string) {}

        onShutdown(): void {
            calls.push(this.name);
        }
    }

    const world = new World(registry);

    world.configureSetForStage("shutdown", "cleanup", { after: ["save"] });
    world.addSystem(new NamedSystem("cleanup"), { set: "cleanup" });
    world.addSystem(new NamedSystem("save"), { label: "save" });

    world.shutdown();

    assert.deepEqual(calls, ["save", "cleanup"]);
});

test("scheduler combines multiple sets for ordering and runIf", () => {
    const Gate = registry.defineResource<{ enabled: boolean }>("SchedulerGate");
    const calls: string[] = [];

    class NamedSystem {
        constructor(private readonly name: string) {}

        onUpdate(): void {
            calls.push(this.name);
        }
    }

    const world = new World(registry);

    world.setResource(Gate, { enabled: false });
    world.configureSet("gameplay", { after: ["input"] });
    world.configureSet("network", {
        before: ["render"],
        runIf: (currentWorld) => currentWorld.mustGetResource(Gate).enabled,
    });
    world.addSystem(new NamedSystem("input"), { label: "input" });
    world.addSystem(new NamedSystem("sync"), {
        set: ["gameplay", "network"],
    });
    world.addSystem(new NamedSystem("render"), { label: "render" });

    world.update(0);
    assert.deepEqual(calls, ["input", "render"]);

    calls.length = 0;
    world.mustGetResource(Gate).enabled = true;
    world.update(0);

    assert.deepEqual(calls, ["input", "sync", "render"]);
});

test("scheduler supports query-backed runIf helpers", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("RunIfQueryPosition");
    const Velocity = registry.defineComponent<{ x: number; y: number }>("RunIfQueryVelocity");
    const Player = registry.defineComponent("RunIfQueryPlayer");
    const Sleeping = registry.defineComponent("RunIfQuerySleeping");
    const moving = queryState([Position, Velocity], { without: [Sleeping] });
    const players = queryState([Player]);
    const calls: string[] = [];

    class NamedSystem {
        constructor(private readonly name: string) {}

        onUpdate(): void {
            calls.push(this.name);
        }
    }

    const world = new World(registry);

    world.addSystem(new NamedSystem("move"), {
        runIf: anyMatch(moving),
    });
    world.addSystem(new NamedSystem("idle"), {
        runIf: noMatch(moving),
    });
    world.addSystem(new NamedSystem("single-player"), {
        runIf: singleMatch(players),
    });

    world.update(0);
    assert.deepEqual(calls, ["idle"]);

    calls.length = 0;
    world.spawn(
        withComponent(Position, { x: 0, y: 0 }),
        withComponent(Velocity, { x: 1, y: 0 }),
        withMarker(Player)
    );
    world.update(0);
    assert.deepEqual(calls, ["move", "single-player"]);

    calls.length = 0;
    world.spawn(withMarker(Player));
    world.update(0);
    assert.deepEqual(calls, ["move"]);

    calls.length = 0;
    world.spawn(
        withComponent(Position, { x: 10, y: 0 }),
        withComponent(Velocity, { x: 0, y: 1 }),
        withMarker(Sleeping)
    );
    world.update(0);
    assert.deepEqual(calls, ["move"]);
});

test("scheduler invalidates sort cache when ordered systems are added later", () => {
    const calls: string[] = [];

    class NamedSystem {
        constructor(private readonly name: string) {}

        onUpdate(): void {
            calls.push(this.name);
        }
    }

    const world = new World(registry);

    world.addSystem(new NamedSystem("A"), { label: "a" });
    world.addSystem(new NamedSystem("C"), { label: "c", before: ["a"] });

    world.update(0);
    assert.deepEqual(calls, ["C", "A"]);

    calls.length = 0;
    world.addSystem(new NamedSystem("B"), { label: "b", after: ["a"] });
    world.update(0);

    assert.deepEqual(calls, ["C", "A", "B"]);
});

test("scheduler invalidates stage-specific set ordering cache when reconfigured", () => {
    const calls: string[] = [];

    class NamedSystem {
        constructor(private readonly name: string) {}

        onUpdate(): void {
            calls.push(this.name);
        }
    }

    const world = new World(registry);

    world.addSystem(new NamedSystem("input"), { label: "input" });
    world.addSystem(new NamedSystem("gameplay"), { set: "gameplay" });
    world.addSystem(new NamedSystem("render"), { label: "render" });

    world.update(0);
    assert.deepEqual(calls, ["input", "gameplay", "render"]);

    calls.length = 0;
    world.configureSetForStage("update", "gameplay", { after: ["render"] });
    world.update(0);

    assert.deepEqual(calls, ["input", "render", "gameplay"]);
});

test("scheduler composes runIf helpers for resources and state", () => {
    const Flags = registry.defineResource<{ enabled: boolean; paused: boolean }>("SchedulerFlags");
    const Mode = registry.defineState<"boot" | "running" | "paused">("SchedulerMode", "boot");
    const calls: string[] = [];

    class NamedSystem {
        constructor(private readonly name: string) {}

        onUpdate(): void {
            calls.push(this.name);
        }
    }

    const world = new World(registry);

    world.setResource(Flags, { enabled: true, paused: false });
    world.initState(Mode);
    world.addSystem(new NamedSystem("gameplay"), {
        runIf: runIfAll(
            resourceExists(Flags),
            stateIs(Mode, "running"),
            resourceMatches(Flags, (flags) => flags.enabled),
            runIfNot(resourceMatches(Flags, (flags) => flags.paused))
        ),
    });
    world.addSystem(new NamedSystem("overlay"), {
        runIf: runIfAny(
            stateMatches(Mode, (mode) => mode === "paused"),
            resourceMatches(Flags, (flags) => flags.paused)
        ),
    });

    world.update(0);
    world.setState(Mode, "running");
    world.update(0);
    world.mustGetResource(Flags).paused = true;
    world.markResourceChanged(Flags);
    world.update(0);
    world.mustGetResource(Flags).paused = false;
    world.mustGetResource(Flags).enabled = false;
    world.markResourceChanged(Flags);
    world.update(0);

    assert.deepEqual(calls, ["gameplay", "overlay"]);
});

test("scheduler runIf resource helpers respect per-system change detection", () => {
    const Tick = registry.defineResource<{ value: number }>("SchedulerTick");
    const calls: string[] = [];

    class SeedSystem {
        onUpdate(world: World): void {
            if (!world.hasResource(Tick)) {
                world.setResource(Tick, { value: 1 });
                calls.push("seed");
                return;
            }

            if (world.mustGetResource(Tick).value === 1) {
                world.mustGetResource(Tick).value = 2;
                world.markResourceChanged(Tick);
                calls.push("mutate");
            }
        }
    }

    class NamedSystem {
        constructor(private readonly name: string) {}

        onUpdate(): void {
            calls.push(this.name);
        }
    }

    const world = new World(registry);

    world.addSystem(new SeedSystem(), { label: "seed" });
    world.addSystem(new NamedSystem("added"), {
        after: ["seed"],
        runIf: resourceAdded(Tick),
    });
    world.addSystem(new NamedSystem("changed"), {
        after: ["added"],
        runIf: resourceChanged(Tick),
    });

    world.update(0);
    world.update(0);
    world.update(0);

    assert.deepEqual(calls, ["seed", "added", "changed", "mutate", "changed"]);
});

test("scheduler rejects ambiguous system and set labels inside a stage", () => {
    class NamedSystem {
        onUpdate(): void {}
    }

    const world = new World(registry);

    world.addSystem(new NamedSystem(), { label: "gameplay" });
    world.addSystem(new NamedSystem(), { set: "gameplay", after: ["gameplay"] });

    assert.throws(() => {
        world.update(0);
    }, /Duplicate system\/set label/);
});

test("observers dispatch immediate events and can queue commands", () => {
    const Health = registry.defineComponent<{ value: number }>("ObserverHealth");
    const Damage = registry.defineEvent<{ target: Entity; amount: number }>("ObserverDamage");
    const Died = registry.defineEvent<{ entity: Entity }>("ObserverDied");
    const world = new World(registry);
    const enemy = world.spawn(withComponent(Health, { value: 10 }));
    const log: string[] = [];

    world.observe(Damage, (damage, currentWorld, commands) => {
        const health = currentWorld.mustGetComponent(damage.target, Health);

        health.value -= damage.amount;
        commands.markComponentChanged(damage.target, Health);
        log.push(`damage:${health.value}`);

        if (health.value <= 0) {
            commands.trigger(Died, { entity: damage.target });
        }
    });

    world.observe(Died, (event, _currentWorld, commands) => {
        log.push("died");
        commands.despawn(event.entity);
    });

    world.trigger(Damage, { target: enemy, amount: 15 });

    assert.deepEqual(log, ["damage:-5", "died"]);
    assert.equal(world.isAlive(enemy), false);
});

test("observer unsubscribe removes the registered callback", () => {
    const Ping = registry.defineEvent<number>("ObserverPing");
    const world = new World(registry);
    let count = 0;
    const unsubscribe = world.observe(Ping, (value) => {
        count += value;
    });

    world.trigger(Ping, 1);
    unsubscribe();
    world.trigger(Ping, 1);

    assert.equal(count, 1);
});
