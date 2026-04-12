import assert from "node:assert/strict";
import { test } from "node:test";
import {
    Entity,
    World,
    defineComponent,
    defineEvent,
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
