import assert from "node:assert/strict";
import { test } from "node:test";
import {
    World,
    createRegistry,
    entityIndex,
    formatEntity,
    withComponent,
    withMarker,
} from "../src";

const registry = createRegistry("world-test");

test("entity generation prevents stale handles from reading recycled entities", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("TestPosition");
    const world = new World(registry);

    const first = world.spawn(11, withComponent(Position, { x: 1, y: 2 }));

    assert.equal(formatEntity(first), "0v1");
    assert.equal(world.entityType(first), 11);
    assert.equal(world.despawn(first), true);

    const reused = world.spawn(12, withComponent(Position, { x: 3, y: 4 }));

    assert.equal(formatEntity(reused), "0v2");
    assert.equal(world.isAlive(first), false);
    assert.equal(world.entityType(first), undefined);
    assert.equal(world.entityType(reused), 12);
    assert.equal(world.getComponent(first, Position), undefined);
    assert.deepEqual(world.mustGetComponent(reused, Position), { x: 3, y: 4 });
});

test("read helpers keep getMany and change detection aligned with entity liveness", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("ReadHelperPosition");
    const Velocity = registry.defineComponent<{ x: number; y: number }>("ReadHelperVelocity");
    const world = new World(registry);
    const entity = world.spawn(
        withComponent(Position, { x: 1, y: 2 }),
        withComponent(Velocity, { x: 3, y: 4 })
    );

    assert.deepEqual(world.getManyComponents(entity, Position, Velocity), [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
    ]);
    assert.equal(world.isComponentAdded(entity, Position), true);
    assert.equal(world.isComponentChanged(entity, Velocity), true);

    world.update(0);

    assert.equal(world.isComponentAdded(entity, Position), false);
    assert.equal(world.isComponentChanged(entity, Velocity), false);

    world.markComponentChanged(entity, Position);

    assert.equal(world.isComponentChanged(entity, Position), true);

    world.despawn(entity);

    assert.equal(world.getManyComponents(entity, Position, Velocity), undefined);
    assert.equal(world.isComponentAdded(entity, Position), false);
    assert.equal(world.isComponentChanged(entity, Position), false);
});

test("spawn inserts multiple component entries", () => {
    const Player = registry.defineComponent("TestPlayer");
    const Health = registry.defineComponent<{ value: number }>("TestHealth");
    const world = new World(registry);

    const entity = world.spawn(withMarker(Player), withComponent(Health, { value: 100 }));

    assert.equal(world.hasAllComponents(entity, [Player, Health]), true);
    assert.equal(world.removeComponent(entity, Player), true);
    assert.equal(world.removeComponent(entity, Health), true);
    assert.equal(world.hasAnyComponents(entity, [Player, Health]), false);
});

test("entities() iterates only currently live entities in storage-index order", () => {
    const Marker = registry.defineComponent("WorldEntitiesMarker");
    const world = new World(registry);
    const first = world.spawn(withMarker(Marker));
    const second = world.spawn(withMarker(Marker));
    const third = world.spawn(withMarker(Marker));

    world.despawn(second);

    assert.deepEqual(Array.from(world.entities()), [first, third]);

    const reused = world.spawn(withMarker(Marker));

    assert.deepEqual(Array.from(world.entities()), [first, reused, third]);
});

test("commands flush queued structural edits in order", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("CommandPosition");
    const Velocity = registry.defineComponent<{ x: number; y: number }>("CommandVelocity");
    const world = new World(registry);
    const commands = world.commands();
    const entity = commands.spawn(2, withComponent(Position, { x: 1, y: 2 }));

    commands.addComponent(entity, Velocity, { x: 3, y: 4 });
    commands.removeComponent(entity, Position);

    assert.equal(commands.pending, 3);
    assert.equal(world.isAlive(entity), false);
    assert.equal(world.entityType(entity), undefined);
    assert.equal(world.hasAnyComponents(entity, [Position, Velocity]), false);

    commands.flush();

    assert.equal(commands.pending, 0);
    assert.equal(world.hasComponent(entity, Position), false);
    assert.deepEqual(world.mustGetComponent(entity, Velocity), { x: 3, y: 4 });
});

test("commands spawn does not publish an empty entity when the spawn fails", () => {
    const commandRegistry = createRegistry("world-command-failed-spawn-test");
    const Transform = commandRegistry.defineComponent<{ x: number; y: number }>("Transform");
    const Element = commandRegistry.defineComponent<{ name: string }>("Element", {
        deps: [Transform],
    });
    const world = new World(commandRegistry);
    const commands = world.commands();
    const entity = commands.spawn(withComponent(Element, { name: "broken" }));

    assert.equal(world.isAlive(entity), false);
    assert.equal(world.entityType(entity), undefined);
    assert.throws(() => commands.flush(), /missing dependency Transform/);

    const next = world.spawn();

    assert.equal(world.isAlive(entity), false);
    assert.equal(entityIndex(next), 0);
});

test("commands queued during flush wait for the next flush", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("DeferredCommandPosition");
    const world = new World(registry);
    const commands = world.commands();
    const entity = world.spawn();
    let ranOuterCommand = false;

    commands.run(() => {
        ranOuterCommand = true;
        commands.addComponent(entity, Position, { x: 5, y: 6 });
    });

    commands.flush();

    assert.equal(ranOuterCommand, true);
    assert.equal(commands.pending, 1);
    assert.equal(world.hasComponent(entity, Position), false);

    commands.flush();

    assert.equal(commands.pending, 0);
    assert.deepEqual(world.mustGetComponent(entity, Position), { x: 5, y: 6 });
});

test("commands flush keeps only unexecuted commands queued after a failure", () => {
    const commandRegistry = createRegistry("world-command-flush-failure-test");
    const Ready = commandRegistry.defineComponent("Ready");
    const NeedsReady = commandRegistry.defineComponent("NeedsReady", {
        deps: [Ready],
    });
    const world = new World(commandRegistry);
    const commands = world.commands();
    const first = world.spawn();
    const second = world.spawn();
    const third = world.spawn();

    commands.addComponent(first, Ready, {});
    commands.addComponent(second, NeedsReady, {});
    commands.addComponent(third, Ready, {});

    assert.throws(() => commands.flush(), /missing dependency Ready/);
    assert.equal(world.hasComponent(first, Ready), true);
    assert.equal(world.hasComponent(second, NeedsReady), false);
    assert.equal(world.hasComponent(third, Ready), false);
    assert.equal(commands.pending, 1);

    commands.flush();

    assert.equal(commands.pending, 0);
    assert.equal(world.hasComponent(third, Ready), true);
});

test("shutdown is terminal and later updates stay inert", () => {
    const world = new World(createRegistry("world-shutdown-terminal-test"));
    const trace: string[] = [];

    world.addSystem({
        onStartup(): void {
            trace.push("startup");
        },
        onUpdate(): void {
            trace.push("update");
        },
        onShutdown(): void {
            trace.push("shutdown");
        },
    });

    world.shutdown();
    world.update(0);
    world.shutdown();

    assert.deepEqual(trace, ["shutdown"]);
});

test("component lifecycle hooks fire in order and can be unsubscribed", () => {
    const events: string[] = [];
    const Position = registry.defineComponent<{ x: number }>("LifecycleHookPosition", {
        onAdd: (_entity, position) => events.push(`type:add:${position.x}`),
        onInsert: (_entity, position) => events.push(`type:insert:${position.x}`),
        onReplace: (_entity, position) => events.push(`type:replace:${position.x}`),
        onRemove: (_entity, position) => events.push(`type:remove:${position.x}`),
        onDespawn: (_entity, position) => events.push(`type:despawn:${position.x}`),
    });
    const world = new World(registry);
    const offAdd = world.onAdd(Position, (_entity, position) =>
        events.push(`world:add:${position.x}`)
    );
    const offInsert = world.onInsert(Position, (_entity, position) =>
        events.push(`world:insert:${position.x}`)
    );
    const offReplace = world.onReplace(Position, (_entity, position) =>
        events.push(`world:replace:${position.x}`)
    );
    const offRemove = world.onRemove(Position, (_entity, position) =>
        events.push(`world:remove:${position.x}`)
    );
    const offDespawn = world.onDespawn(Position, (_entity, position) =>
        events.push(`world:despawn:${position.x}`)
    );

    const entity = world.spawn(withComponent(Position, { x: 1 }));

    world.addComponent(entity, Position, { x: 2 });
    world.removeComponent(entity, Position);

    offAdd();
    offInsert();
    offReplace();
    offRemove();
    offDespawn();

    world.addComponent(entity, Position, { x: 3 });
    world.despawn(entity);

    assert.deepEqual(events, [
        "type:add:1",
        "world:add:1",
        "type:insert:1",
        "world:insert:1",
        "type:replace:1",
        "world:replace:1",
        "type:insert:2",
        "world:insert:2",
        "type:replace:2",
        "world:replace:2",
        "type:remove:2",
        "world:remove:2",
        "type:add:3",
        "type:insert:3",
        "type:replace:3",
        "type:remove:3",
        "type:despawn:3",
    ]);
});

test("entity type rejects invalid runtime values", () => {
    const world = new World(registry);

    assert.throws(
        () => world.spawn(undefined as unknown as number),
        /Entity etype must be a finite number, got undefined/
    );
    assert.throws(() => world.spawn(Number.NaN), /Entity etype must be a finite number, got NaN/);
    assert.throws(
        () => world.spawn(Number.POSITIVE_INFINITY),
        /Entity etype must be a finite number, got Infinity/
    );
});

test("component values reject invalid runtime payloads", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("InvalidValuePosition");
    const world = new World(registry);
    const entity = world.spawn();

    assert.throws(
        () => withComponent(Position, null as unknown as { x: number; y: number }),
        /Component InvalidValuePosition value cannot be null/
    );
    assert.throws(
        () =>
            world.addComponent(entity, Position, undefined as unknown as { x: number; y: number }),
        /Component InvalidValuePosition value cannot be undefined/
    );
    assert.throws(
        () => withComponent(Position, 1 as unknown as { x: number; y: number }),
        /Component InvalidValuePosition value must be an object/
    );

    assert.equal(world.hasComponent(entity, Position), false);
});

test("world rejects components from a different registry", () => {
    const local = registry.defineComponent("LocalRegistryOnly");
    const otherRegistry = createRegistry("other-world-test");
    const foreign = otherRegistry.defineComponent("ForeignRegistryOnly");
    const world = new World(registry);
    const entity = world.spawn(withMarker(local));

    assert.throws(
        () => world.addComponent(entity, foreign, {}),
        /other-world-test, not world-test/
    );
    assert.throws(() => world.hasComponent(entity, foreign), /other-world-test, not world-test/);
    assert.throws(() => Array.from(world.query([foreign])), /other-world-test, not world-test/);
});

test("world rejects registry-owned non-component types from a different registry", () => {
    const otherRegistry = createRegistry("other-world-owned-types-test");
    const foreignResource = otherRegistry.defineResource<{ value: number }>("ForeignResource");
    const foreignState = otherRegistry.defineState("ForeignState", "idle" as "idle" | "running");
    const foreignMessage = otherRegistry.defineMessage<{ value: number }>("ForeignMessage");
    const foreignEvent = otherRegistry.defineEvent<{ value: number }>("ForeignEvent");
    const world = new World(registry);

    assert.throws(
        () => world.setResource(foreignResource, { value: 1 }),
        /ForeignResource.*other-world-owned-types-test, not world-test/
    );
    assert.throws(
        () => world.initState(foreignState),
        /ForeignState.*other-world-owned-types-test, not world-test/
    );
    assert.throws(
        () => world.writeMessage(foreignMessage, { value: 1 }),
        /ForeignMessage.*other-world-owned-types-test, not world-test/
    );
    assert.throws(
        () => world.observe(foreignEvent, () => undefined),
        /ForeignEvent.*other-world-owned-types-test, not world-test/
    );
});
