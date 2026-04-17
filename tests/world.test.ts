import assert from "node:assert/strict";
import { test } from "node:test";
import {
    World,
    bundle,
    createRegistry,
    formatEntity,
    requireComponent,
    withComponent,
    withMarker,
} from "../src";

const registry = createRegistry("world-test");

test("entity generation prevents stale handles from reading recycled entities", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("TestPosition");
    const world = new World(registry);

    const first = world.spawn(withComponent(Position, { x: 1, y: 2 }));

    assert.equal(formatEntity(first), "0v1");
    assert.equal(world.despawn(first), true);

    const reused = world.spawn(withComponent(Position, { x: 3, y: 4 }));

    assert.equal(formatEntity(reused), "0v2");
    assert.equal(world.isAlive(first), false);
    assert.equal(world.get(first, Position), undefined);
    assert.deepEqual(world.mustGet(reused, Position), { x: 3, y: 4 });
});

test("read helpers keep getMany and change detection aligned with entity liveness", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("ReadHelperPosition");
    const Velocity = registry.defineComponent<{ x: number; y: number }>("ReadHelperVelocity");
    const world = new World(registry);
    const entity = world.spawn(
        withComponent(Position, { x: 1, y: 2 }),
        withComponent(Velocity, { x: 3, y: 4 })
    );

    assert.deepEqual(world.getMany(entity, Position, Velocity), [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
    ]);
    assert.equal(world.isAdded(entity, Position), true);
    assert.equal(world.isChanged(entity, Velocity), true);

    world.update(0);

    assert.equal(world.isAdded(entity, Position), false);
    assert.equal(world.isChanged(entity, Velocity), false);

    world.markChanged(entity, Position);

    assert.equal(world.isChanged(entity, Position), true);

    world.despawn(entity);

    assert.equal(world.getMany(entity, Position, Velocity), undefined);
    assert.equal(world.isAdded(entity, Position), false);
    assert.equal(world.isChanged(entity, Position), false);
});

test("bundles insert and remove reusable component groups", () => {
    const Player = registry.defineComponent("TestPlayer");
    const Health = registry.defineComponent<{ value: number }>("TestHealth");
    const PlayerBundle = bundle(withMarker(Player), withComponent(Health, { value: 100 }));
    const world = new World(registry);

    const entity = world.spawnBundle(PlayerBundle);

    assert.equal(world.hasAll(entity, [Player, Health]), true);
    assert.equal(world.removeBundle(entity, PlayerBundle), true);
    assert.equal(world.hasAny(entity, [Player, Health]), false);
});

test("commands flush queued structural edits in order", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("CommandPosition");
    const Velocity = registry.defineComponent<{ x: number; y: number }>("CommandVelocity");
    const world = new World(registry);
    const commands = world.commands();
    const entity = commands.spawn(withComponent(Position, { x: 1, y: 2 }));

    commands.add(entity, Velocity, { x: 3, y: 4 });
    commands.remove(entity, Position);

    assert.equal(commands.pending, 3);
    assert.equal(world.isAlive(entity), true);
    assert.equal(world.hasAny(entity, [Position, Velocity]), false);

    commands.flush();

    assert.equal(commands.pending, 0);
    assert.equal(world.has(entity, Position), false);
    assert.deepEqual(world.mustGet(entity, Velocity), { x: 3, y: 4 });
});

test("commands queued during flush wait for the next flush", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("DeferredCommandPosition");
    const world = new World(registry);
    const commands = world.commands();
    const entity = world.spawn();
    let ranOuterCommand = false;

    commands.run(() => {
        ranOuterCommand = true;
        commands.add(entity, Position, { x: 5, y: 6 });
    });

    commands.flush();

    assert.equal(ranOuterCommand, true);
    assert.equal(commands.pending, 1);
    assert.equal(world.has(entity, Position), false);

    commands.flush();

    assert.equal(commands.pending, 0);
    assert.deepEqual(world.mustGet(entity, Position), { x: 5, y: 6 });
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

    world.add(entity, Position, { x: 2 });
    world.remove(entity, Position);

    offAdd();
    offInsert();
    offReplace();
    offRemove();
    offDespawn();

    world.add(entity, Position, { x: 3 });
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

test("component values reject null and undefined at runtime", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("InvalidValuePosition");
    const RequiredPosition = registry.defineComponent("InvalidValueRequiredPosition", {
        require: [requireComponent(Position, () => null as unknown as { x: number; y: number })],
    });
    const world = new World(registry);
    const entity = world.spawn();

    assert.throws(
        () => withComponent(Position, null as unknown as { x: number; y: number }),
        /Component InvalidValuePosition value cannot be null/
    );
    assert.throws(
        () => world.add(entity, Position, undefined as unknown as { x: number; y: number }),
        /Component InvalidValuePosition value cannot be undefined/
    );
    assert.throws(
        () => world.add(entity, RequiredPosition, {}),
        /Component InvalidValuePosition value cannot be null/
    );

    assert.equal(world.has(entity, Position), false);
    assert.equal(world.has(entity, RequiredPosition), false);
});

test("required components are inserted transitively without overwriting existing data", () => {
    const Transform = registry.defineComponent<{ x: number; y: number }>("TestTransform");
    const Velocity = registry.defineComponent<{ x: number; y: number }>("TestVelocity", {
        require: [requireComponent(Transform, () => ({ x: 0, y: 0 }))],
    });
    const Mass = registry.defineComponent<number>("TestMass");
    const RigidBody = registry.defineComponent("TestRigidBody", {
        require: [
            requireComponent(Mass, () => 1),
            requireComponent(Velocity, () => ({ x: 0, y: 0 })),
        ],
    });
    const world = new World(registry);
    const entity = world.spawn(withComponent(Transform, { x: 5, y: 6 }));

    world.add(entity, RigidBody, {});

    assert.equal(world.hasAll(entity, [RigidBody, Mass, Velocity, Transform]), true);
    assert.deepEqual(world.mustGet(entity, Transform), { x: 5, y: 6 });
    assert.equal(world.mustGet(entity, Mass), 1);
});

test("world rejects components from a different registry", () => {
    const local = registry.defineComponent("LocalRegistryOnly");
    const otherRegistry = createRegistry("other-world-test");
    const foreign = otherRegistry.defineComponent("ForeignRegistryOnly");
    const world = new World(registry);
    const entity = world.spawn(withMarker(local));

    assert.throws(() => world.add(entity, foreign, {}), /other-world-test, not world-test/);
    assert.throws(() => world.has(entity, foreign), /other-world-test, not world-test/);
    assert.throws(() => Array.from(world.query(foreign)), /other-world-test, not world-test/);
});

test("component definitions reject required dependencies from another registry", () => {
    const otherRegistry = createRegistry("other-required-test");
    const foreign = otherRegistry.defineComponent<{ value: number }>("ForeignRequired");

    assert.throws(
        () =>
            registry.defineComponent("InvalidCrossRegistryRequired", {
                require: [requireComponent(foreign, () => ({ value: 1 }))],
            }),
        /ForeignRequired is not registered in world-test/
    );
});
