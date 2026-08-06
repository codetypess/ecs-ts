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

const registry = createRegistry("each-query-test");

test("each visits every matching entity", () => {
    const Position = registry.defineComponent<{ x: number }>("EachPosition");
    const world = new World(registry);

    const a = world.spawn(withComponent(Position, { x: 1 }));
    const b = world.spawn(withComponent(Position, { x: 2 }));
    const c = world.spawn(withComponent(Position, { x: 3 }));
    const seen: number[] = [];

    world.each([Position], (_entity, pos) => {
        seen.push(pos.x);
    });

    assert.deepEqual(
        seen.sort((a, b) => a - b),
        [1, 2, 3]
    );

    world.despawn(a);
    world.despawn(b);
    world.despawn(c);
});
test("each keeps base-store iteration stable across logical deletion and nested queries", () => {
    const localRegistry = createRegistry("stable-each-removal-test");
    const Position = localRegistry.defineComponent<{ x: number }>("Position");
    const Velocity = localRegistry.defineComponent<{ x: number }>("Velocity");
    const moving = queryState([Position, Velocity]);
    const world = new World(localRegistry);
    const first = world.spawn(withComponent(Position, { x: 1 }), withComponent(Velocity, { x: 1 }));
    const second = world.spawn(
        withComponent(Position, { x: 2 }),
        withComponent(Velocity, { x: 2 })
    );
    const third = world.spawn(withComponent(Position, { x: 3 }), withComponent(Velocity, { x: 3 }));

    world.spawn(withComponent(Position, { x: 4 }));

    const seen: (typeof first)[] = [];
    let nestedSeen: (typeof first)[] = [];

    world.each([Position, Velocity], (entity) => {
        seen.push(entity);

        if (entity === second) {
            assert.equal(world.removeComponent(first, Velocity), true);
            nestedSeen = Array.from(moving.iter(world), ([nestedEntity]) => nestedEntity);
        }
    });

    assert.deepEqual(seen, [first, second, third]);
    assert.deepEqual(nestedSeen, [second, third]);
    assert.equal(world.hasComponent(first, Velocity), false);
    assert.deepEqual(
        new Set(Array.from(moving.iter(world), ([entity]) => entity)),
        new Set([second, third])
    );
});

test("each skips an unvisited entity when its base filter component is removed", () => {
    const localRegistry = createRegistry("stable-filter-base-removal-test");
    const Position = localRegistry.defineComponent<{ x: number }>("Position");
    const Active = localRegistry.defineComponent("Active");
    const world = new World(localRegistry);
    const first = world.spawn(withComponent(Position, { x: 1 }), withMarker(Active));
    const removed = world.spawn(withComponent(Position, { x: 2 }), withMarker(Active));
    const third = world.spawn(withComponent(Position, { x: 3 }), withMarker(Active));

    world.spawn(withComponent(Position, { x: 4 }));

    const seen: (typeof first)[] = [];

    world.each([Position], { with: [Active] }, (entity) => {
        seen.push(entity);

        if (entity === first) {
            assert.equal(world.removeComponent(removed, Active), true);
        }
    });

    assert.deepEqual(seen, [first, third]);
});

test("query iterators defer compaction until iteration completes", () => {
    const localRegistry = createRegistry("stable-query-iterator-removal-test");
    const Value = localRegistry.defineComponent<{ value: number }>("Value");
    const world = new World(localRegistry);
    const first = world.spawn(withComponent(Value, { value: 1 }));
    const second = world.spawn(withComponent(Value, { value: 2 }));
    const third = world.spawn(withComponent(Value, { value: 3 }));
    const iterator = world.query([Value]);
    const firstResult = iterator.next();

    assert.equal(firstResult.done, false);
    assert.equal(firstResult.value?.[0], first);
    assert.equal(world.removeComponent(first, Value), true);

    const remaining = Array.from(iterator, ([entity]) => entity);

    assert.deepEqual(remaining, [second, third]);
    assert.deepEqual(
        new Set(Array.from(world.query([Value]), ([entity]) => entity)),
        new Set([second, third])
    );
});
test("query iterator return releases tracking and compacts tombstones", () => {
    const localRegistry = createRegistry("stable-query-iterator-return-test");
    const Value = localRegistry.defineComponent<{ value: number }>("Value");
    const world = new World(localRegistry);
    const first = world.spawn(withComponent(Value, { value: 1 }));
    const second = world.spawn(withComponent(Value, { value: 2 }));
    const third = world.spawn(withComponent(Value, { value: 3 }));
    const iterator = world.query([Value]);

    assert.equal(iterator.next().value?.[0], first);
    assert.equal(world.removeComponent(first, Value), true);
    assert.deepEqual(iterator.return?.(), { done: true, value: undefined });
    assert.deepEqual(
        Array.from(world.query([Value]), ([entity]) => entity),
        [third, second]
    );
});

test("query iterator throw releases tracking and compacts tombstones", () => {
    const localRegistry = createRegistry("stable-query-iterator-throw-test");
    const Value = localRegistry.defineComponent<{ value: number }>("Value");
    const world = new World(localRegistry);
    const first = world.spawn(withComponent(Value, { value: 1 }));
    const second = world.spawn(withComponent(Value, { value: 2 }));
    const third = world.spawn(withComponent(Value, { value: 3 }));
    const iterator = world.query([Value]);
    const expected = new Error("stop iteration");

    assert.equal(iterator.next().value?.[0], first);
    assert.equal(world.removeComponent(first, Value), true);
    assert.throws(
        () => iterator.throw?.(expected),
        (error) => error === expected
    );
    assert.deepEqual(
        Array.from(world.query([Value]), ([entity]) => entity),
        [third, second]
    );
});

test("query counts ignore base-store tombstones during an outer iteration", () => {
    const localRegistry = createRegistry("stable-query-count-removal-test");
    const Outer = localRegistry.defineComponent("Outer");
    const Value = localRegistry.defineComponent<{ value: number }>("Value");
    const values = queryState([Value]);
    const world = new World(localRegistry);
    const outer = world.spawn(withMarker(Outer));
    const removed = world.spawn(withComponent(Value, { value: 1 }));
    const remaining = world.spawn(withComponent(Value, { value: 2 }));

    world.each([Outer], () => {
        assert.equal(world.removeComponent(removed, Value), true);
        assert.equal(values.matchesSingle(world), true);
        assert.deepEqual(
            Array.from(values.iter(world), ([entity]) => entity),
            [remaining]
        );
    });

    assert.equal(world.isAlive(outer), true);
});

test("each skips despawned entities", () => {
    const Marker = registry.defineComponent("EachSkipMarker");
    const world = new World(registry);

    const alive = world.spawn(withMarker(Marker));
    const dead = world.spawn(withMarker(Marker));

    world.despawn(dead);

    const seen: number[] = [];

    world.each([Marker], (entity) => {
        seen.push(entity);
    });

    assert.deepEqual(seen, [alive]);
});

test("each supports filter argument", () => {
    const Position = registry.defineComponent<{ x: number }>("EachWherePosition");
    const Active = registry.defineComponent("EachWhereActive");
    const world = new World(registry);

    const a = world.spawn(withComponent(Position, { x: 1 }), withMarker(Active));
    const _b = world.spawn(withComponent(Position, { x: 2 }));
    const seen: number[] = [];

    world.each([Position], { with: [Active] }, (_entity, pos) => {
        seen.push(pos.x);
    });

    assert.deepEqual(seen, [1]);

    world.despawn(a);
});

test("each with added filter only visits newly added components", () => {
    const Health = registry.defineComponent<{ value: number }>("EachAddedHealth");
    const world = new World(registry);

    const a = world.spawn(withComponent(Health, { value: 10 }));
    const b = world.spawn(withComponent(Health, { value: 20 }));
    const added: number[] = [];

    world.each([Health], { added: [Health] }, (_entity, hp) => {
        added.push(hp.value);
    });

    assert.deepEqual(
        added.sort((x, y) => x - y),
        [10, 20]
    );

    world.update(0);

    const addedAfterUpdate: number[] = [];

    world.each([Health], { added: [Health] }, (_entity, hp) => {
        addedAfterUpdate.push(hp.value);
    });

    assert.deepEqual(addedAfterUpdate, []);

    const c = world.spawn(withComponent(Health, { value: 30 }));
    const addedNew: number[] = [];

    world.each([Health], { added: [Health] }, (_entity, hp) => {
        addedNew.push(hp.value);
    });

    assert.deepEqual(addedNew, [30]);

    world.despawn(a);
    world.despawn(b);
    world.despawn(c);
});

test("each with changed filter only visits recently changed components", () => {
    const Score = registry.defineComponent<{ value: number }>("EachChangedScore");
    const world = new World(registry);

    const a = world.spawn(withComponent(Score, { value: 0 }));
    const b = world.spawn(withComponent(Score, { value: 0 }));

    world.update(0);

    world.mustGetComponent(a, Score).value = 5;
    world.markComponentChanged(a, Score);

    const changed: number[] = [];

    world.each([Score], { changed: [Score] }, (entity, score) => {
        changed.push(score.value);
        assert.equal(entity, a);
    });

    assert.deepEqual(changed, [5]);

    world.despawn(a);
    world.despawn(b);
});

test("eachOptional visits all required-matching entities and exposes optional", () => {
    const Position = registry.defineComponent<{ x: number }>("EachOptionalPosition");
    const Velocity = registry.defineComponent<{ vx: number }>("EachOptionalVelocity");
    const world = new World(registry);

    const moving = world.spawn(
        withComponent(Position, { x: 0 }),
        withComponent(Velocity, { vx: 1 })
    );
    const still = world.spawn(withComponent(Position, { x: 5 }));
    const rows: { x: number; vx: number | undefined }[] = [];

    world.eachOptional([Position], [Velocity], (entity, pos, vel) => {
        rows.push({ x: pos.x, vx: vel?.vx });
    });

    rows.sort((a, b) => a.x - b.x);
    assert.deepEqual(rows, [
        { x: 0, vx: 1 },
        { x: 5, vx: undefined },
    ]);

    world.despawn(moving);
    world.despawn(still);
});

test("queryState.each uses a cached query state", () => {
    const Tag = registry.defineComponent("EachWithStateTag");
    const Level = registry.defineComponent<{ n: number }>("EachWithStateLevel");
    const state = queryState([Level], { with: [Tag] });
    const world = new World(registry);

    const a = world.spawn(withComponent(Level, { n: 1 }), withMarker(Tag));
    const _b = world.spawn(withComponent(Level, { n: 2 }));
    const seen: number[] = [];

    state.each(world, (_entity, lvl) => {
        seen.push(lvl.n);
    });

    assert.deepEqual(seen, [1]);

    world.despawn(a);
});

test("queryState.each supports change-detection filters", () => {
    const Score = registry.defineComponent<{ value: number }>("EachStateChangedScore");
    const state = queryState([Score], { changed: [Score] });
    const world = new World(registry);

    const entity = world.spawn(withComponent(Score, { value: 0 }));

    world.update(0);

    world.mustGetComponent(entity, Score).value = 5;
    world.markComponentChanged(entity, Score);

    const changed: number[] = [];

    state.each(world, (_entity, score) => {
        changed.push(score.value);
    });

    assert.deepEqual(changed, [5]);

    world.despawn(entity);
});

test("optionalQueryState.each uses a cached optional query state", () => {
    const Base = registry.defineComponent<{ id: number }>("EachOptStateBase");
    const Extra = registry.defineComponent<{ bonus: number }>("EachOptStateExtra");
    const state = optionalQueryState([Base], [Extra]);
    const world = new World(registry);

    const withExtra = world.spawn(
        withComponent(Base, { id: 1 }),
        withComponent(Extra, { bonus: 10 })
    );
    const withoutExtra = world.spawn(withComponent(Base, { id: 2 }));
    const rows: { id: number; bonus: number | undefined }[] = [];

    state.each(world, (_entity, base, extra) => {
        rows.push({ id: base.id, bonus: extra?.bonus });
    });

    rows.sort((a, b) => a.id - b.id);
    assert.deepEqual(rows, [
        { id: 1, bonus: 10 },
        { id: 2, bonus: undefined },
    ]);

    world.despawn(withExtra);
    world.despawn(withoutExtra);
});

test("queryState.each produces same results as queryState.iter", () => {
    const Value = registry.defineComponent<{ n: number }>("EachVsQueryValue");
    const state = queryState([Value]);
    const world = new World(registry);

    const entities = [1, 2, 3, 4, 5].map((n) => world.spawn(withComponent(Value, { n })));

    const fromEach: number[] = [];
    state.each(world, (_e, v) => fromEach.push(v.n));

    const fromQuery: number[] = [];
    for (const [, v] of state.iter(world)) {
        fromQuery.push(v.n);
    }

    assert.deepEqual(
        fromEach.sort((a, b) => a - b),
        fromQuery.sort((a, b) => a - b)
    );

    for (const e of entities) {
        world.despawn(e);
    }
});
