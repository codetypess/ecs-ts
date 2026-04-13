import assert from "node:assert/strict";
import { test } from "node:test";
import {
    Entity,
    World,
    defineComponent,
    defineEvent,
    defineResource,
    defineState,
    resourceAdded,
    resourceChanged,
    resourceExists,
    resourceMatches,
    runIfAll,
    runIfAny,
    runIfNot,
    stateIs,
    stateMatches,
    withComponent,
} from "../src";

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

    const world = new World();

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

    const world = new World();

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

    const world = new World();

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

    const world = new World();

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

    const world = new World();

    world.configureSet("conditional", { runIf: () => true });
    world.configureSetForStage("startup", "conditional", { runIf: () => false });
    world.configureSetForStage("update", "conditional", { runIf: () => true });
    world.addSystem(new ConditionalSystem(), { set: "conditional" });

    world.update(0);

    assert.deepEqual(calls, ["update"]);
});

test("scheduler invalidates sort cache when ordered systems are added later", () => {
    const calls: string[] = [];

    class NamedSystem {
        constructor(private readonly name: string) {}

        onUpdate(): void {
            calls.push(this.name);
        }
    }

    const world = new World();

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

    const world = new World();

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
    const Flags = defineResource<{ enabled: boolean; paused: boolean }>("SchedulerFlags");
    const Mode = defineState<"boot" | "running" | "paused">("SchedulerMode", "boot");
    const calls: string[] = [];

    class NamedSystem {
        constructor(private readonly name: string) {}

        onUpdate(): void {
            calls.push(this.name);
        }
    }

    const world = new World();

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
    world.resource(Flags).paused = true;
    world.markResourceChanged(Flags);
    world.update(0);
    world.resource(Flags).paused = false;
    world.resource(Flags).enabled = false;
    world.markResourceChanged(Flags);
    world.update(0);

    assert.deepEqual(calls, ["gameplay", "overlay"]);
});

test("scheduler runIf resource helpers respect per-system change detection", () => {
    const Tick = defineResource<{ value: number }>("SchedulerTick");
    const calls: string[] = [];

    class SeedSystem {
        onUpdate(world: World): void {
            if (!world.hasResource(Tick)) {
                world.setResource(Tick, { value: 1 });
                calls.push("seed");
                return;
            }

            if (world.resource(Tick).value === 1) {
                world.resource(Tick).value = 2;
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

    const world = new World();

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

    const world = new World();

    world.addSystem(new NamedSystem(), { label: "gameplay" });
    world.addSystem(new NamedSystem(), { set: "gameplay", after: ["gameplay"] });

    assert.throws(() => {
        world.update(0);
    }, /Duplicate system\/set label/);
});

test("observers dispatch immediate events and can queue commands", () => {
    const Health = defineComponent<{ value: number }>("ObserverHealth");
    const Damage = defineEvent<{ target: Entity; amount: number }>("ObserverDamage");
    const Died = defineEvent<{ entity: Entity }>("ObserverDied");
    const world = new World();
    const enemy = world.spawn(withComponent(Health, { value: 10 }));
    const log: string[] = [];

    world.observe(Damage, (damage, currentWorld, commands) => {
        const health = currentWorld.mustGet(damage.target, Health);

        health.value -= damage.amount;
        commands.markChanged(damage.target, Health);
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
    const Ping = defineEvent<number>("ObserverPing");
    const world = new World();
    let count = 0;
    const unsubscribe = world.observe(Ping, (value) => {
        count += value;
    });

    world.trigger(Ping, 1);
    unsubscribe();
    world.trigger(Ping, 1);

    assert.equal(count, 1);
});
