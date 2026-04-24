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

test("eachAdded only visits newly added components", () => {
    const Health = registry.defineComponent<{ value: number }>("EachAddedHealth");
    const world = new World(registry);

    const a = world.spawn(withComponent(Health, { value: 10 }));
    const b = world.spawn(withComponent(Health, { value: 20 }));
    const added: number[] = [];

    world.eachAdded([Health], (_entity, hp) => {
        added.push(hp.value);
    });

    assert.deepEqual(
        added.sort((x, y) => x - y),
        [10, 20]
    );

    world.update(0);

    const addedAfterUpdate: number[] = [];

    world.eachAdded([Health], (_entity, hp) => {
        addedAfterUpdate.push(hp.value);
    });

    assert.deepEqual(addedAfterUpdate, []);

    const c = world.spawn(withComponent(Health, { value: 30 }));
    const addedNew: number[] = [];

    world.eachAdded([Health], (_entity, hp) => {
        addedNew.push(hp.value);
    });

    assert.deepEqual(addedNew, [30]);

    world.despawn(a);
    world.despawn(b);
    world.despawn(c);
});

test("eachChanged only visits recently changed components", () => {
    const Score = registry.defineComponent<{ value: number }>("EachChangedScore");
    const world = new World(registry);

    const a = world.spawn(withComponent(Score, { value: 0 }));
    const b = world.spawn(withComponent(Score, { value: 0 }));

    world.update(0);

    world.mustGetComponent(a, Score).value = 5;
    world.markComponentChanged(a, Score);

    const changed: number[] = [];

    world.eachChanged([Score], (entity, score) => {
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

    world.eachOptional([Position], [Velocity], {}, (entity, pos, vel) => {
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

test("eachWithState uses a cached query state", () => {
    const Tag = registry.defineComponent("EachWithStateTag");
    const Level = registry.defineComponent<{ n: number }>("EachWithStateLevel");
    const state = queryState([Level], { with: [Tag] });
    const world = new World(registry);

    const a = world.spawn(withComponent(Level, { n: 1 }), withMarker(Tag));
    const _b = world.spawn(withComponent(Level, { n: 2 }));
    const seen: number[] = [];

    world.eachWithState(state, (_entity, lvl) => {
        seen.push(lvl.n);
    });

    assert.deepEqual(seen, [1]);

    world.despawn(a);
});

test("eachOptionalWithState uses a cached optional query state", () => {
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

    world.eachOptionalWithState(state, (_entity, base, extra) => {
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

test("eachWithState produces same results as equivalent queryWithState iteration", () => {
    const Value = registry.defineComponent<{ n: number }>("EachVsQueryValue");
    const state = queryState([Value]);
    const world = new World(registry);

    const entities = [1, 2, 3, 4, 5].map((n) => world.spawn(withComponent(Value, { n })));

    const fromEach: number[] = [];
    world.eachWithState(state, (_e, v) => fromEach.push(v.n));

    const fromQuery: number[] = [];
    for (const [, v] of world.queryWithState(state)) {
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
