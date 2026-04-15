import assert from "node:assert/strict";
import { test } from "node:test";
import {
    World,
    defineComponent,
    optionalQueryState,
    queryState,
    withComponent,
    withMarker,
} from "../src";

test("advanced query filters support or and optional components", () => {
    const Position = defineComponent<{ x: number; y: number }>("QueryPosition");
    const Velocity = defineComponent<{ x: number; y: number }>("QueryVelocity");
    const Player = defineComponent("QueryPlayer");
    const Npc = defineComponent("QueryNpc");
    const Sleeping = defineComponent("QuerySleeping");
    const Frozen = defineComponent("QueryFrozen");
    const Name = defineComponent<{ value: string }>("QueryName");
    const world = new World();

    world.spawn(
        withComponent(Position, { x: 0, y: 0 }),
        withComponent(Velocity, { x: 1, y: 0 }),
        withMarker(Player),
        withComponent(Name, { value: "player" })
    );

    world.spawn(
        withComponent(Position, { x: 10, y: 0 }),
        withMarker(Npc),
        withComponent(Name, { value: "idle-npc" })
    );

    world.spawn(
        withComponent(Position, { x: 20, y: 0 }),
        withComponent(Velocity, { x: 0, y: 1 }),
        withMarker(Npc),
        withMarker(Sleeping)
    );

    world.spawn(
        withComponent(Position, { x: 30, y: 0 }),
        withComponent(Velocity, { x: -1, y: 0 }),
        withMarker(Player),
        withMarker(Frozen)
    );

    const rows = Array.from(
        world.queryOptional([Position], [Velocity, Name], {
            or: [Player, Npc],
            without: [Sleeping, Frozen],
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
    const Player = defineComponent("SinglePlayer");
    const world = new World();

    assert.equal(world.trySingle([Position]), undefined);
    assert.throws(() => world.single([Position]), /Expected exactly one query result/);

    const entity = world.spawn(withComponent(Position, { x: 1, y: 2 }), withMarker(Player));

    assert.equal(world.single([Position])[0], entity);

    world.spawn(withComponent(Position, { x: 3, y: 4 }));

    assert.throws(() => world.trySingle([Position]), /Expected at most one query result/);
    assert.equal(world.single([Position], { with: [Player] })[0], entity);
});

test("query state caches resolved stores and invalidates when stores are created", () => {
    const Position = defineComponent<{ x: number; y: number }>("QueryStatePosition");
    const Velocity = defineComponent<{ x: number; y: number }>("QueryStateVelocity");
    const Player = defineComponent("QueryStatePlayer");
    const Sleeping = defineComponent("QueryStateSleeping");
    const world = new World();
    const movingPlayers = queryState([Position, Velocity], {
        or: [Player],
        without: [Sleeping],
    });

    assert.equal(Array.from(movingPlayers.iter(world)).length, 0);

    const active = world.spawn(
        withComponent(Position, { x: 0, y: 0 }),
        withComponent(Velocity, { x: 1, y: 0 }),
        withMarker(Player)
    );
    world.spawn(
        withComponent(Position, { x: 10, y: 0 }),
        withComponent(Velocity, { x: 1, y: 0 }),
        withMarker(Player),
        withMarker(Sleeping)
    );

    const matches: {
        readonly entity: typeof active;
        readonly position: { readonly x: number; readonly y: number };
        readonly velocity: { readonly x: number; readonly y: number };
    }[] = [];

    movingPlayers.each(world, (entity, position, velocity) => {
        matches.push({
            entity,
            position: { ...position },
            velocity: { ...velocity },
        });
    });

    assert.deepEqual(matches, [
        {
            entity: active,
            position: { x: 0, y: 0 },
            velocity: { x: 1, y: 0 },
        },
    ]);
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

    const afterName: {
        readonly entity: typeof entity;
        readonly name: { readonly value: string } | undefined;
    }[] = [];

    namedPositions.each(world, (currentEntity, _position, name) => {
        afterName.push({ entity: currentEntity, name });
    });

    assert.deepEqual(afterName, [{ entity, name: { value: "capital" } }]);
});

test("query state tracks structural filter changes through cached plans", () => {
    const Position = defineComponent<{ x: number; y: number }>("SignatureStatePosition");
    const markers = Array.from({ length: 40 }, (_value, index) =>
        defineComponent(`SignatureStateMarker${index}`)
    );
    const Required = markers[35]!;
    const OrMatch = markers[36]!;
    const Banned = markers[37]!;
    const Excluded = markers[38]!;
    const world = new World();
    const filtered = queryState([Position], {
        with: [Required],
        or: [OrMatch, Banned],
        without: [Banned, Excluded],
    });
    const active = world.spawn(
        withComponent(Position, { x: 1, y: 2 }),
        withMarker(Required),
        withMarker(OrMatch)
    );

    world.spawn(
        withComponent(Position, { x: 3, y: 4 }),
        withMarker(Required),
        withMarker(OrMatch),
        withMarker(Excluded)
    );

    world.spawn(withComponent(Position, { x: 5, y: 6 }), withMarker(Required), withMarker(Banned));

    const matchedEntities = (): (typeof active)[] =>
        Array.from(filtered.iter(world), ([entity]) => entity);

    assert.deepEqual(matchedEntities(), [active]);
    assert.equal(filtered.matchesAny(world), true);
    assert.equal(filtered.matchesSingle(world), true);

    world.add(active, Excluded, {});

    assert.deepEqual(matchedEntities(), []);
    assert.equal(filtered.matchesNone(world), true);

    world.remove(active, Excluded);

    assert.deepEqual(matchedEntities(), [active]);

    world.remove(active, OrMatch);

    assert.deepEqual(matchedEntities(), []);
    assert.equal(filtered.matchesNone(world), true);

    world.add(active, Banned, {});

    assert.deepEqual(matchedEntities(), []);

    world.remove(active, Banned);
    world.add(active, OrMatch, {});

    assert.deepEqual(matchedEntities(), [active]);
    assert.equal(filtered.matchesSingle(world), true);

    world.despawn(active);

    assert.deepEqual(matchedEntities(), []);
    assert.equal(filtered.matchesNone(world), true);
});
