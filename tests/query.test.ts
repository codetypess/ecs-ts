import assert from "node:assert/strict";
import { test } from "node:test";
import { World, defineComponent, withComponent } from "../src";

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
