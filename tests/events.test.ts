import assert from "node:assert/strict";
import { test } from "node:test";
import { World, createRegistry, withComponent, withMarker, type Entity } from "../src";

const registry = createRegistry("event-test");

test("multiple observers for the same event all receive the value", () => {
    const Ping = registry.defineEvent<number>("MultiObserverPing");
    const world = new World(registry);
    const received: number[] = [];

    world.observe(Ping, (value) => received.push(value * 1));
    world.observe(Ping, (value) => received.push(value * 2));
    world.observe(Ping, (value) => received.push(value * 3));
    world.trigger(Ping, 4);

    assert.deepEqual(received, [4, 8, 12]);
});

test("observer commands are flushed after each observer returns", () => {
    const Health = registry.defineComponent<{ value: number }>("EventHealth");
    const Damage = registry.defineEvent<{ target: Entity; amount: number }>("EventDamage");
    const Died = registry.defineEvent<{ entity: Entity }>("EventDied");
    const world = new World(registry);
    const log: string[] = [];

    const target = world.spawn(withComponent(Health, { value: 50 }));

    world.observe(Damage, (dmg, currentWorld, commands) => {
        const hp = currentWorld.mustGetComponent(dmg.target, Health);
        hp.value -= dmg.amount;
        log.push(`damaged:${hp.value}`);

        if (hp.value <= 0) {
            commands.trigger(Died, { entity: dmg.target });
        }
    });

    world.observe(Died, (event, currentWorld) => {
        log.push(`died:alive=${currentWorld.isAlive(event.entity)}`);
    });

    world.trigger(Damage, { target, amount: 50 });

    assert.deepEqual(log, ["damaged:0", "died:alive=true"]);
});

test("observer triggered from within another observer executes after outer observer returns", () => {
    const Outer = registry.defineEvent<void>("NestedOuter");
    const Inner = registry.defineEvent<string>("NestedInner");
    const world = new World(registry);
    const log: string[] = [];

    world.observe(Outer, (_value, _w, commands) => {
        log.push("outer:before");
        commands.trigger(Inner, "hello");
        log.push("outer:after");
    });

    world.observe(Inner, (value) => {
        log.push(`inner:${value}`);
    });

    world.trigger(Outer, undefined);

    // commands.trigger is queued and flushed after the observer callback returns
    assert.deepEqual(log, ["outer:before", "outer:after", "inner:hello"]);
});

test("trigger with no observers is a no-op", () => {
    const Ghost = registry.defineEvent<number>("GhostEvent");
    const world = new World(registry);

    assert.doesNotThrow(() => world.trigger(Ghost, 42));
});

test("multiple unsubscribes do not throw", () => {
    const Tick = registry.defineEvent<number>("MultiUnsub");
    const world = new World(registry);
    const unsub = world.observe(Tick, () => undefined);

    unsub();
    assert.doesNotThrow(() => unsub());
});

test("observer can spawn entities via commands and they are visible after flush", () => {
    const SpawnCmd = registry.defineEvent<void>("SpawnCmdEvent");
    const Tag = registry.defineComponent("SpawnCmdTag");
    const world = new World(registry);

    world.observe(SpawnCmd, (_v, _w, commands) => {
        commands.spawn(withMarker(Tag));
    });

    assert.equal(world.getSingle([Tag]), undefined);

    world.trigger(SpawnCmd, undefined);

    assert.notEqual(world.getSingle([Tag]), undefined);
});

test("observer receives both the event value and a usable world reference", () => {
    const Resource = registry.defineResource<{ counter: number }>("EventResource");
    const Bump = registry.defineEvent<void>("BumpEvent");
    const world = new World(registry);

    world.setResource(Resource, { counter: 0 });

    world.observe(Bump, (_v, currentWorld) => {
        currentWorld.mustGetResource(Resource).counter++;
    });

    world.trigger(Bump, undefined);
    world.trigger(Bump, undefined);

    assert.equal(world.mustGetResource(Resource).counter, 2);
});
