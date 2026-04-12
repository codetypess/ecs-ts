import assert from "node:assert/strict";
import { test } from "node:test";
import { World, defineComponent, optionalQueryState, queryState, withComponent } from "../src";

test("advanced query filters support or, none, and optional components", () => {
    const Position = defineComponent<{ x: number; y: number }>("QueryPosition");
    const Velocity = defineComponent<{ x: number; y: number }>("QueryVelocity");
    const Player = defineComponent<null>("QueryPlayer");
    const Npc = defineComponent<null>("QueryNpc");
    const Sleeping = defineComponent<null>("QuerySleeping");
    const Frozen = defineComponent<null>("QueryFrozen");
    const Name = defineComponent<{ value: string }>("QueryName");
    const world = new World();

    world.spawn(
        withComponent(Position, { x: 0, y: 0 }),
        withComponent(Velocity, { x: 1, y: 0 }),
        withComponent(Player, null),
        withComponent(Name, { value: "player" })
    );

    world.spawn(
        withComponent(Position, { x: 10, y: 0 }),
        withComponent(Npc, null),
        withComponent(Name, { value: "idle-npc" })
    );

    world.spawn(
        withComponent(Position, { x: 20, y: 0 }),
        withComponent(Velocity, { x: 0, y: 1 }),
        withComponent(Npc, null),
        withComponent(Sleeping, null)
    );

    world.spawn(
        withComponent(Position, { x: 30, y: 0 }),
        withComponent(Velocity, { x: -1, y: 0 }),
        withComponent(Player, null),
        withComponent(Frozen, null)
    );

    const rows = Array.from(
        world.queryOptional([Position], [Velocity, Name], {
            or: [Player, Npc],
            none: [Sleeping, Frozen],
        })
    );

    assert.deepEqual(
        rows.map(([, position, velocity, name]) => ({
            name: name?.value,
            position: { ...position },
            velocity: velocity === undefined ? undefined : { ...velocity },
        })),
        [
            {
                name: "player",
                position: { x: 0, y: 0 },
                velocity: { x: 1, y: 0 },
            },
            {
                name: "idle-npc",
                position: { x: 10, y: 0 },
                velocity: undefined,
            },
        ]
    );
});

test("single query helpers report none, one, and multiple matches", () => {
    const Position = defineComponent<{ x: number; y: number }>("SinglePosition");
    const Player = defineComponent<null>("SinglePlayer");
    const world = new World();

    assert.equal(world.trySingle([Position]), undefined);
    assert.throws(() => world.single([Position]), /Expected exactly one query result/);

    const entity = world.spawn(
        withComponent(Position, { x: 1, y: 2 }),
        withComponent(Player, null)
    );

    assert.equal(world.single([Position])[0], entity);

    world.spawn(withComponent(Position, { x: 3, y: 4 }));

    assert.throws(() => world.trySingle([Position]), /Expected at most one query result/);
    assert.equal(world.single([Position], { with: [Player] })[0], entity);
});

test("query state caches resolved stores and invalidates when stores are created", () => {
    const Position = defineComponent<{ x: number; y: number }>("QueryStatePosition");
    const Velocity = defineComponent<{ x: number; y: number }>("QueryStateVelocity");
    const Player = defineComponent<null>("QueryStatePlayer");
    const Sleeping = defineComponent<null>("QueryStateSleeping");
    const world = new World();
    const movingPlayers = queryState([Position, Velocity], {
        or: [Player],
        none: [Sleeping],
    });

    assert.equal(Array.from(movingPlayers.iter(world)).length, 0);

    const active = world.spawn(
        withComponent(Position, { x: 0, y: 0 }),
        withComponent(Velocity, { x: 1, y: 0 }),
        withComponent(Player, null)
    );
    world.spawn(
        withComponent(Position, { x: 10, y: 0 }),
        withComponent(Velocity, { x: 1, y: 0 }),
        withComponent(Player, null),
        withComponent(Sleeping, null)
    );

    assert.deepEqual(
        Array.from(movingPlayers.iter(world)).map(([entity, position, velocity]) => ({
            entity,
            position: { ...position },
            velocity: { ...velocity },
        })),
        [
            {
                entity: active,
                position: { x: 0, y: 0 },
                velocity: { x: 1, y: 0 },
            },
        ]
    );
});

test("optional query state sees optional stores created after the cache was resolved", () => {
    const Position = defineComponent<{ x: number; y: number }>("OptionalStatePosition");
    const Name = defineComponent<{ value: string }>("OptionalStateName");
    const world = new World();
    const namedPositions = optionalQueryState([Position], [Name]);
    const entity = world.spawn(withComponent(Position, { x: 1, y: 2 }));

    const beforeName = Array.from(namedPositions.iter(world));

    assert.equal(beforeName.length, 1);
    assert.equal(beforeName[0]?.[0], entity);
    assert.deepEqual(beforeName[0]?.[1], { x: 1, y: 2 });
    assert.equal(beforeName[0]?.[2], undefined);

    world.add(entity, Name, { value: "capital" });

    const afterName = Array.from(namedPositions.iter(world));

    assert.equal(afterName.length, 1);
    assert.equal(afterName[0]?.[0], entity);
    assert.deepEqual(afterName[0]?.[2], { value: "capital" });
});
