import assert from "node:assert/strict";
import { test } from "node:test";
import {
    World,
    createRegistry,
    optionalQueryState,
    queryState,
    withComponent,
    withMarker,
} from "../src";
import { SparseSet } from "../src/sparse-set.js";

const registry = createRegistry("query-test");

test("advanced query filters support or and optional components", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("QueryPosition");
    const Velocity = registry.defineComponent<{ x: number; y: number }>("QueryVelocity");
    const Player = registry.defineComponent("QueryPlayer");
    const Npc = registry.defineComponent("QueryNpc");
    const Sleeping = registry.defineComponent("QuerySleeping");
    const Frozen = registry.defineComponent("QueryFrozen");
    const Name = registry.defineComponent<{ value: string }>("QueryName");
    const world = new World(registry);

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
    const Position = registry.defineComponent<{ x: number; y: number }>("SinglePosition");
    const Player = registry.defineComponent("SinglePlayer");
    const world = new World(registry);

    assert.equal(world.getSingle([Position]), undefined);
    assert.throws(() => world.mustGetSingle([Position]), /Expected exactly one query result/);

    const entity = world.spawn(withComponent(Position, { x: 1, y: 2 }), withMarker(Player));

    assert.equal(world.mustGetSingle([Position])[0], entity);

    world.spawn(withComponent(Position, { x: 3, y: 4 }));

    assert.throws(() => world.getSingle([Position]), /Expected at most one query result/);
    assert.equal(world.mustGetSingle([Position], { with: [Player] })[0], entity);
});

test("query state caches resolved stores and invalidates when stores are created", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("QueryStatePosition");
    const Velocity = registry.defineComponent<{ x: number; y: number }>("QueryStateVelocity");
    const Player = registry.defineComponent("QueryStatePlayer");
    const Sleeping = registry.defineComponent("QueryStateSleeping");
    const world = new World(registry);
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
    const Position = registry.defineComponent<{ x: number; y: number }>("OptionalStatePosition");
    const Name = registry.defineComponent<{ value: string }>("OptionalStateName");
    const world = new World(registry);
    const namedPositions = optionalQueryState([Position], [Name]);
    const entity = world.spawn(withComponent(Position, { x: 1, y: 2 }));

    const beforeName = Array.from(namedPositions.iter(world));

    assert.equal(beforeName.length, 1);
    assert.equal(beforeName[0]?.[0], entity);
    assert.deepEqual(beforeName[0]?.[1], { x: 1, y: 2 });
    assert.equal(beforeName[0]?.[2], undefined);

    world.addComponent(entity, Name, { value: "capital" });

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
    const Position = registry.defineComponent<{ x: number; y: number }>("SignatureStatePosition");
    const markers = Array.from({ length: 40 }, (_value, index) =>
        registry.defineComponent(`SignatureStateMarker${index}`)
    );
    const Required = markers[35]!;
    const OrMatch = markers[36]!;
    const Banned = markers[37]!;
    const Excluded = markers[38]!;
    const world = new World(registry);
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

    world.addComponent(active, Excluded, {});

    assert.deepEqual(matchedEntities(), []);
    assert.equal(filtered.matchesNone(world), true);

    world.removeComponent(active, Excluded);

    assert.deepEqual(matchedEntities(), [active]);

    world.removeComponent(active, OrMatch);

    assert.deepEqual(matchedEntities(), []);
    assert.equal(filtered.matchesNone(world), true);

    world.addComponent(active, Banned, {});

    assert.deepEqual(matchedEntities(), []);

    world.removeComponent(active, Banned);
    world.addComponent(active, OrMatch, {});

    assert.deepEqual(matchedEntities(), [active]);
    assert.equal(filtered.matchesSingle(world), true);

    world.despawn(active);

    assert.deepEqual(matchedEntities(), []);
    assert.equal(filtered.matchesNone(world), true);
});

test("query state refreshes the base store when store sizes skew after cache resolution", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("SkewedBasePosition");
    const Velocity = registry.defineComponent<{ x: number; y: number }>("SkewedBaseVelocity");
    const moving = queryState([Position, Velocity]);
    const world = new World(registry);

    for (let index = 0; index < 5; index++) {
        world.spawn(
            withComponent(Position, { x: index, y: index }),
            withComponent(Velocity, { x: 1, y: -1 })
        );
    }

    for (let index = 0; index < 50; index++) {
        world.spawn(withComponent(Velocity, { x: index, y: index }));
    }

    moving.each(world, () => {});

    for (let index = 0; index < 100; index++) {
        world.spawn(withComponent(Position, { x: index, y: index }));
    }

    const stores = (
        world as unknown as {
            readonly componentStoreContext: {
                readonly stores: readonly (SparseSet<unknown> | undefined)[];
            };
        }
    ).componentStoreContext.stores;
    const positionStore = stores[Position.id];
    const velocityStore = stores[Velocity.id];

    assert.ok(positionStore !== undefined);
    assert.ok(velocityStore !== undefined);

    const positionEntities = positionStore.entities;
    const velocityEntities = velocityStore.entities;
    let positionEntityReads = 0;
    let velocityEntityReads = 0;

    Object.defineProperty(positionStore, "entities", {
        configurable: true,
        get() {
            positionEntityReads++;
            return positionEntities;
        },
    });
    Object.defineProperty(velocityStore, "entities", {
        configurable: true,
        get() {
            velocityEntityReads++;
            return velocityEntities;
        },
    });

    try {
        let matches = 0;

        moving.each(world, () => {
            matches++;
        });

        assert.equal(matches, 5);
        assert.equal(positionEntityReads, 0);
        assert.equal(velocityEntityReads, 1);
    } finally {
        delete (positionStore as unknown as { entities?: unknown }).entities;
        delete (velocityStore as unknown as { entities?: unknown }).entities;
    }
});
