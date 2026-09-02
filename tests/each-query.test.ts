import assert from "node:assert/strict";
import { test } from "node:test";
import {
    defineComponent,
    World,
    createRegistry,
    optionalQueryState,
    queryState,
    withComponent,
    withMarker,
} from "../src";

const registry = createRegistry("each-query-test");

test("each visits every matching entity", () => {
    type Position = { x: number };
    const Position = registry.registerComponent(defineComponent<Position>("EachPosition"));
    const world = new World(registry);

    const a = world.spawn(0, withComponent(Position, { x: 1 }));
    const b = world.spawn(0, withComponent(Position, { x: 2 }));
    const c = world.spawn(0, withComponent(Position, { x: 3 }));
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
    const Marker = registry.registerComponent(defineComponent("EachSkipMarker"));
    const world = new World(registry);

    const alive = world.spawn(0, withMarker(Marker));
    const dead = world.spawn(0, withMarker(Marker));

    world.despawn(dead);

    const seen: number[] = [];

    world.each([Marker], (entity) => {
        seen.push(entity);
    });

    assert.deepEqual(seen, [alive]);
});

test("each supports filter argument", () => {
    type Position = { x: number };
    const Position = registry.registerComponent(defineComponent<Position>("EachWherePosition"));
    const Active = registry.registerComponent(defineComponent("EachWhereActive"));
    const world = new World(registry);

    const a = world.spawn(0, withComponent(Position, { x: 1 }), withMarker(Active));
    const _b = world.spawn(0, withComponent(Position, { x: 2 }));
    const seen: number[] = [];

    world.each([Position], { with: [Active] }, (_entity, pos) => {
        seen.push(pos.x);
    });

    assert.deepEqual(seen, [1]);

    world.despawn(a);
});

test("each with added filter only visits newly added components", () => {
    type Health = { value: number };
    const Health = registry.registerComponent(defineComponent<Health>("EachAddedHealth"));
    const world = new World(registry);

    const a = world.spawn(0, withComponent(Health, { value: 10 }));
    const b = world.spawn(0, withComponent(Health, { value: 20 }));
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

    const c = world.spawn(0, withComponent(Health, { value: 30 }));
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
    type Score = { value: number };
    const Score = registry.registerComponent(defineComponent<Score>("EachChangedScore"));
    const world = new World(registry);

    const a = world.spawn(0, withComponent(Score, { value: 0 }));
    const b = world.spawn(0, withComponent(Score, { value: 0 }));

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
    type Position = { x: number };
    const Position = registry.registerComponent(defineComponent<Position>("EachOptionalPosition"));
    type Velocity = { vx: number };
    const Velocity = registry.registerComponent(defineComponent<Velocity>("EachOptionalVelocity"));
    const world = new World(registry);

    const moving = world.spawn(
        0,
        withComponent(Position, { x: 0 }),
        withComponent(Velocity, { vx: 1 })
    );
    const still = world.spawn(0, withComponent(Position, { x: 5 }));
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
    const Tag = registry.registerComponent(defineComponent("EachWithStateTag"));
    type Level = { n: number };
    const Level = registry.registerComponent(defineComponent<Level>("EachWithStateLevel"));
    const state = queryState([Level], { with: [Tag] });
    const world = new World(registry);

    const a = world.spawn(0, withComponent(Level, { n: 1 }), withMarker(Tag));
    const _b = world.spawn(0, withComponent(Level, { n: 2 }));
    const seen: number[] = [];

    state.each(world, (_entity, lvl) => {
        seen.push(lvl.n);
    });

    assert.deepEqual(seen, [1]);

    world.despawn(a);
});

test("queryState.each supports change-detection filters", () => {
    type Score = { value: number };
    const Score = registry.registerComponent(defineComponent<Score>("EachStateChangedScore"));
    const state = queryState([Score], { changed: [Score] });
    const world = new World(registry);

    const entity = world.spawn(0, withComponent(Score, { value: 0 }));

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
    type Base = { id: number };
    const Base = registry.registerComponent(defineComponent<Base>("EachOptStateBase"));
    type Extra = { bonus: number };
    const Extra = registry.registerComponent(defineComponent<Extra>("EachOptStateExtra"));
    const state = optionalQueryState([Base], [Extra]);
    const world = new World(registry);

    const withExtra = world.spawn(
        0,
        withComponent(Base, { id: 1 }),
        withComponent(Extra, { bonus: 10 })
    );
    const withoutExtra = world.spawn(0, withComponent(Base, { id: 2 }));
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
    type Value = { n: number };
    const Value = registry.registerComponent(defineComponent<Value>("EachVsQueryValue"));
    const state = queryState([Value]);
    const world = new World(registry);

    const entities = [1, 2, 3, 4, 5].map((n) => world.spawn(0, withComponent(Value, { n })));

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

test("each rejects direct structural writes and releases its guard", () => {
    type Position = { x: number };
    const Position = registry.registerComponent(
        defineComponent<Position>("EachStructuralGuardPosition")
    );
    const Added = registry.registerComponent(defineComponent("EachStructuralGuardAdded"));
    const world = new World(registry);
    const entity = world.spawn(0, withComponent(Position, { x: 1 }));
    const expectedError = /during query iteration.*DeferredCommands/;
    const writes = [
        () => world.addComponent(entity, Added, {}),
        () => world.removeComponent(entity, Position),
        () => world.spawn(0),
        () => world.despawn(entity),
        () => world.batch((batch) => batch.addComponent(entity, Added, {})),
    ];

    for (const write of writes) {
        assert.throws(() => world.each([Position], write), expectedError);
        assert.equal(world.isAlive(entity), true);
        assert.equal(world.hasComponent(entity, Position), true);
        assert.equal(world.hasComponent(entity, Added), false);
    }

    world.addComponent(entity, Added, {});
    assert.equal(world.hasComponent(entity, Added), true);
});

test("each allows deferred structural writes until the next managed flush", () => {
    const Source = registry.registerComponent(defineComponent("EachDeferredGuardSource"));
    const Processed = registry.registerComponent(defineComponent("EachDeferredGuardProcessed"));
    const world = new World(registry);
    const entity = world.spawn(0, withMarker(Source));
    const commands = world.commands();

    world.each([Source], (current) => {
        commands.addComponent(current, Processed, {});
    });

    assert.equal(commands.pending, 1);
    assert.equal(world.hasComponent(entity, Processed), false);

    world.update(0);
    assert.equal(world.hasComponent(entity, Processed), true);
});

test("optional and cached each queries share the structural-write guard", () => {
    const Required = registry.registerComponent(defineComponent("EachSharedGuardRequired"));
    const Optional = registry.registerComponent(defineComponent("EachSharedGuardOptional"));
    const Added = registry.registerComponent(defineComponent("EachSharedGuardAdded"));
    const state = queryState([Required]);
    const optionalState = optionalQueryState([Required], [Optional]);
    const world = new World(registry);
    const entity = world.spawn(0, withMarker(Required));
    const add = () => world.addComponent(entity, Added, {});

    assert.throws(() => world.eachOptional([Required], [Optional], add), /during query iteration/);
    assert.throws(() => state.each(world, add), /during query iteration/);
    assert.throws(() => optionalState.each(world, add), /during query iteration/);
    assert.equal(world.hasComponent(entity, Added), false);
});

test("nested read-only each queries are allowed", () => {
    const Marker = registry.registerComponent(defineComponent("EachNestedReadMarker"));
    const world = new World(registry);
    world.spawn(0, withMarker(Marker));
    world.spawn(0, withMarker(Marker));
    let visits = 0;

    world.each([Marker], () => {
        world.each([Marker], () => {
            visits++;
        });
    });

    assert.equal(visits, 4);
});
