import assert from "node:assert/strict";
import { test } from "node:test";
import {
    World,
    createRegistry,
    defineComponent,
    entityIndex,
    formatEntity,
    withComponent,
    withMarker,
} from "../src";

const registry = createRegistry("world-test");

test("shared component definitions use independent World stores", () => {
    const Position = defineComponent<{ x: number }>("SharedWorldPosition");
    const firstRegistry = createRegistry("shared-world-first");
    const secondRegistry = createRegistry("shared-world-second");
    firstRegistry.registerComponent(Position);
    secondRegistry.registerComponent(Position);

    const firstWorld = new World(firstRegistry);
    const secondWorld = new World(secondRegistry);
    const firstEntity = firstWorld.spawn(0, withComponent(Position, { x: 1 }));
    const secondEntity = secondWorld.spawn(0, withComponent(Position, { x: 2 }));

    assert.deepEqual(firstWorld.getComponent(firstEntity, Position), { x: 1 });
    assert.deepEqual(secondWorld.getComponent(secondEntity, Position), { x: 2 });
});

test("entity generation prevents stale handles from reading recycled entities", () => {
    type Position = { x: number; y: number };
    const Position = registry.defineComponent<Position>("TestPosition");
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
    type Position = { x: number; y: number };
    const Position = registry.defineComponent<Position>("ReadHelperPosition");
    type Velocity = { x: number; y: number };
    const Velocity = registry.defineComponent<Velocity>("ReadHelperVelocity");
    const world = new World(registry);
    const entity = world.spawn(
        0,
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
    type Health = { value: number };
    const Health = registry.defineComponent<Health>("TestHealth");
    const world = new World(registry);

    const entity = world.spawn(0, withMarker(Player), withComponent(Health, { value: 100 }));

    assert.equal(world.hasAllComponents(entity, [Player, Health]), true);
    assert.equal(world.removeComponent(entity, Player), true);
    assert.equal(world.removeComponent(entity, Health), true);
    assert.equal(world.hasAnyComponents(entity, [Player, Health]), false);
});

test("entities() iterates only currently live entities in storage-index order", () => {
    const Marker = registry.defineComponent("WorldEntitiesMarker");
    const world = new World(registry);
    const first = world.spawn(0, withMarker(Marker));
    const second = world.spawn(0, withMarker(Marker));
    const third = world.spawn(0, withMarker(Marker));

    world.despawn(second);

    assert.deepEqual(Array.from(world.entities()), [first, third]);

    const reused = world.spawn(0, withMarker(Marker));

    assert.deepEqual(Array.from(world.entities()), [first, reused, third]);
});

test("commands flush queued structural edits in order", () => {
    type Position = { x: number; y: number };
    const Position = registry.defineComponent<Position>("CommandPosition");
    type Velocity = { x: number; y: number };
    const Velocity = registry.defineComponent<Velocity>("CommandVelocity");
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
    type Transform = { x: number; y: number };
    const Transform = commandRegistry.defineComponent<Transform>("Transform");
    type Element = { name: string };
    const Element = commandRegistry.defineComponent<Element>("Element", {
        deps: [Transform],
    });
    const world = new World(commandRegistry);
    const commands = world.commands();
    const entity = commands.spawn(0, withComponent(Element, { name: "broken" }));

    assert.equal(world.isAlive(entity), false);
    assert.equal(world.entityType(entity), undefined);
    assert.throws(() => commands.flush(), /missing dependency Transform/);

    const next = world.spawn(0);

    assert.equal(world.isAlive(entity), false);
    assert.equal(entityIndex(next), 0);
});

test("commands queued during flush wait for the next flush", () => {
    type Position = { x: number; y: number };
    const Position = registry.defineComponent<Position>("DeferredCommandPosition");
    const world = new World(registry);
    const commands = world.commands();
    const entity = world.spawn(0);
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
    const first = world.spawn(0);
    const second = world.spawn(0);
    const third = world.spawn(0);

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

test("addSystem accepts stage callbacks with scheduling options", () => {
    const CallbackMarker = registry.defineComponent("CallbackSystemMarker");
    const world = new World(registry);
    const trace: string[] = [];

    world.addSystem(
        "update",
        () => {
            trace.push("late");
        },
        { label: "late" }
    );
    world.addSystem(
        "update",
        (_world, _dt, commands) => {
            trace.push("early");
            commands.spawn(0, withMarker(CallbackMarker));
        },
        { label: "early", before: ["late"] }
    );

    world.update(0);

    assert.deepEqual(trace, ["early", "late"]);
    assert.equal(world.hasAnyComponents(Array.from(world.entities())[0]!, [CallbackMarker]), true);
});

test("component lifecycle hooks report operation order and reasons", () => {
    const events: string[] = [];
    type Position = { x: number };
    const Position = registry.defineComponent<Position>("LifecycleHookPosition", {
        onAdd: (_entity, position, _world, reason) =>
            events.push(`type:add:${reason}:${position.x}`),
        onInsert: (_entity, position) => events.push(`type:insert:${position.x}`),
        onUnset: (_entity, position) => events.push(`type:unset:${position.x}`),
        onReplace: (_entity, previous, next) =>
            events.push(`type:replace:${previous.x}->${next.x}`),
        onRemove: (_entity, position, _world, reason) =>
            events.push(`type:remove:${reason}:${position.x}`),
    });
    const world = new World(registry);

    const entity = world.spawn(0, withComponent(Position, { x: 1 }));

    world.addComponent(entity, Position, { x: 2 });
    world.removeComponent(entity, Position);

    world.addComponent(entity, Position, { x: 3 });
    world.despawn(entity);

    assert.deepEqual(events, [
        "type:add:spawned:1",
        "type:insert:1",
        "type:unset:1",
        "type:replace:1->2",
        "type:insert:2",
        "type:unset:2",
        "type:remove:removed:2",
        "type:add:added:3",
        "type:insert:3",
        "type:unset:3",
        "type:remove:despawned:3",
    ]);
});

test("component lifecycle reasons cover command and batch writes", () => {
    const reasonRegistry = createRegistry("component-lifecycle-reason-test");
    const events: string[] = [];
    const Marker = reasonRegistry.defineComponent("ReasonMarker", {
        onAdd(_entity, _marker, _world, reason) {
            events.push(`add:${reason}`);
        },
        onRemove(_entity, _marker, _world, reason) {
            events.push(`remove:${reason}`);
        },
    });
    const world = new World(reasonRegistry);
    const commands = world.commands();
    const commandEntity = commands.spawn(0, withMarker(Marker));

    commands.flush();
    commands.despawn(commandEntity);
    commands.flush();

    const batchEntity = world.batch((batch) => batch.spawn(0, withMarker(Marker)));

    world.batch((batch) => {
        batch.despawn(batchEntity);
    });

    const existingEntity = world.spawn(0);

    world.batch((batch) => {
        batch.addComponent(existingEntity, Marker, {});
    });
    world.batch((batch) => {
        batch.removeComponent(existingEntity, Marker);
    });

    assert.deepEqual(events, [
        "add:spawned",
        "remove:despawned",
        "add:spawned",
        "remove:despawned",
        "add:added",
        "remove:removed",
    ]);
});

test("resource and state getters expose optional and required variants", () => {
    const Settings = registry.defineResource<{ volume: number }>("GetterSettings");
    const Mode = registry.defineState<"boot" | "running">("GetterMode", "boot");
    const world = new World(registry);

    assert.equal(world.getResource(Settings), undefined);
    assert.throws(() => world.mustGetResource(Settings), /Resource not found: GetterSettings/);
    assert.equal(world.getState(Mode), undefined);
    assert.throws(() => world.mustGetState(Mode), /State is not initialized: GetterMode/);

    world.setResource(Settings, { volume: 1 });
    world.initState(Mode);

    assert.deepEqual(world.mustGetResource(Settings), { volume: 1 });
    assert.equal(world.getState(Mode), "boot");
    assert.equal(world.mustGetState(Mode), "boot");
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
    type Position = { x: number; y: number };
    const Position = registry.defineComponent<Position>("InvalidValuePosition");
    const world = new World(registry);
    const entity = world.spawn(0);

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
    const entity = world.spawn(0, withMarker(local));

    assert.throws(() => world.addComponent(entity, foreign, {}), /not registered in world-test/);
    assert.throws(() => world.hasComponent(entity, foreign), /not registered in world-test/);
    assert.throws(() => Array.from(world.query([foreign])), /not registered in world-test/);
});

test("world rejects forged types with the same registry reference", () => {
    type Position = { x: number; y: number };
    const Position = registry.defineComponent<Position>("ForgedPosition");
    const Settings = registry.defineResource<{ value: number }>("ForgedSettings");
    const Mode = registry.defineState("ForgedMode", "idle" as "idle" | "running");
    const Notice = registry.defineMessage<{ value: number }>("ForgedNotice");
    const Ping = registry.defineEvent<{ value: number }>("ForgedPing");
    const forgedPosition = { ...Position } as typeof Position;
    const forgedSettings = { ...Settings } as typeof Settings;
    const forgedMode = { ...Mode } as typeof Mode;
    const forgedNotice = { ...Notice } as typeof Notice;
    const forgedPing = { ...Ping } as typeof Ping;
    const world = new World(registry);
    const entity = world.spawn(0, withComponent(Position, { x: 1, y: 2 }));

    assert.throws(
        () => world.hasComponent(entity, forgedPosition),
        /ForgedPosition.*not registered in world-test/
    );
    assert.throws(
        () => Array.from(world.query([forgedPosition])),
        /ForgedPosition.*not registered in world-test/
    );
    assert.throws(
        () => world.setResource(forgedSettings, { value: 1 }),
        /ForgedSettings.*not registered in world-test/
    );
    assert.throws(() => world.initState(forgedMode), /ForgedMode.*not registered in world-test/);
    assert.throws(
        () => world.writeMessage(forgedNotice, { value: 1 }),
        /ForgedNotice.*not registered in world-test/
    );
    assert.throws(
        () => world.observe(forgedPing, () => undefined),
        /ForgedPing.*not registered in world-test/
    );
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
