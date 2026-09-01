import assert from "node:assert/strict";
import { test } from "node:test";
import {
    defineComponent,
    defineResource,
    defineState,
    World,
    createRegistry,
    matchesAny,
    matchesNone,
    matchesSingle,
    queryState,
    resourceAdded,
    resourceChanged,
    resourceExists,
    resourceMatches,
    runIfAll,
    runIfAny,
    runIfNot,
    stateIs,
    stateMatches,
    withComponent,
    withMarker,
} from "../src";

const registry = createRegistry("run-if-test");

// ---------------------------------------------------------------------------
// Composable helpers: runIfAll / runIfAny / runIfNot
// ---------------------------------------------------------------------------

test("runIfAll returns true only when all conditions pass", () => {
    const world = new World(registry);
    const always = () => true;
    const never = () => false;

    assert.equal(runIfAll(always, always, always)(world), true);
    assert.equal(runIfAll(always, never, always)(world), false);
    assert.equal(runIfAll(never)(world), false);
    assert.equal(runIfAll()(world), true);
});

test("runIfAll short-circuits on first false condition", () => {
    const world = new World(registry);
    let evaluated = 0;
    const track = () => {
        evaluated++;
        return true;
    };
    const never = () => false;

    runIfAll(never, track)(world);

    assert.equal(evaluated, 0);
});

test("runIfAny returns true when at least one condition passes", () => {
    const world = new World(registry);
    const always = () => true;
    const never = () => false;

    assert.equal(runIfAny(always, never)(world), true);
    assert.equal(runIfAny(never, never)(world), false);
    assert.equal(runIfAny()(world), false);
});

test("runIfAny short-circuits on first true condition", () => {
    const world = new World(registry);
    let evaluated = 0;
    const track = () => {
        evaluated++;
        return true;
    };
    const always = () => true;

    runIfAny(always, track)(world);

    assert.equal(evaluated, 0);
});

test("runIfNot inverts the underlying condition", () => {
    const world = new World(registry);

    assert.equal(runIfNot(() => true)(world), false);
    assert.equal(runIfNot(() => false)(world), true);
});

// ---------------------------------------------------------------------------
// matchesAny / matchesNone / matchesSingle with a plain query state
// ---------------------------------------------------------------------------

test("matchesAny returns true when the query has at least one result", () => {
    const Flag = registry.registerComponent(defineComponent("RunIfAnyFlag"));
    const state = queryState([Flag]);
    const world = new World(registry);

    assert.equal(matchesAny(state)(world), false);

    const entity = world.spawn(0, withMarker(Flag));
    const entity2 = world.spawn(0, withMarker(Flag));

    assert.equal(matchesAny(state)(world), true);

    world.despawn(entity);
    world.despawn(entity2);
});

test("matchesNone returns true when the query has no results", () => {
    const Marker = registry.registerComponent(defineComponent("RunIfNoMarker"));
    const state = queryState([Marker]);
    const world = new World(registry);

    assert.equal(matchesNone(state)(world), true);

    const entity = world.spawn(0, withMarker(Marker));

    assert.equal(matchesNone(state)(world), false);

    world.despawn(entity);
});

test("matchesSingle returns true only when exactly one entity matches", () => {
    const Boss = registry.registerComponent(defineComponent("RunIfSingleBoss"));
    const state = queryState([Boss]);
    const world = new World(registry);

    assert.equal(matchesSingle(state)(world), false);

    const a = world.spawn(0, withMarker(Boss));

    assert.equal(matchesSingle(state)(world), true);

    const b = world.spawn(0, withMarker(Boss));

    assert.equal(matchesSingle(state)(world), false);

    world.despawn(a);
    world.despawn(b);
});

// ---------------------------------------------------------------------------
// Resource-based helpers
// ---------------------------------------------------------------------------

test("resourceExists returns false before the resource is set", () => {
    const Config = registry.registerResource(defineResource<{ value: number }>("RunIfConfig"));
    const world = new World(registry);

    assert.equal(resourceExists(Config)(world), false);

    world.setResource(Config, { value: 1 });

    assert.equal(resourceExists(Config)(world), true);
});

test("resourceAdded is true in the frame the resource is set", () => {
    const Score = registry.registerResource(defineResource<{ n: number }>("RunIfScore"));
    const world = new World(registry);

    assert.equal(resourceAdded(Score)(world), false);

    world.setResource(Score, { n: 0 });

    assert.equal(resourceAdded(Score)(world), true);

    world.update(0);

    assert.equal(resourceAdded(Score)(world), false);
});

test("resourceChanged is true when marked changed and false after update", () => {
    const Speed = registry.registerResource(defineResource<{ v: number }>("RunIfSpeed"));
    const world = new World(registry);

    world.setResource(Speed, { v: 5 });
    world.update(0);

    assert.equal(resourceChanged(Speed)(world), false);

    world.mustGetResource(Speed).v = 10;
    world.markResourceChanged(Speed);

    assert.equal(resourceChanged(Speed)(world), true);

    world.update(0);

    assert.equal(resourceChanged(Speed)(world), false);
});

test("resourceMatches evaluates the predicate against the resource value", () => {
    const Level = registry.registerResource(defineResource<{ n: number }>("RunIfLevel"));
    const world = new World(registry);

    world.setResource(Level, { n: 3 });

    assert.equal(resourceMatches(Level, (l) => l.n > 2)(world), true);
    assert.equal(resourceMatches(Level, (l) => l.n > 5)(world), false);
});

test("resourceMatches returns false when resource is absent", () => {
    const Missing = registry.registerResource(defineResource<{ x: number }>("RunIfMissing"));
    const world = new World(registry);

    assert.equal(resourceMatches(Missing, () => true)(world), false);
});

// ---------------------------------------------------------------------------
// State-based helpers
// ---------------------------------------------------------------------------

test("stateIs matches only the exact state value", () => {
    const Mode = registry.registerState(defineState<"a" | "b" | "c">("RunIfMode", "a"));
    const world = new World(registry);

    world.initState(Mode);

    assert.equal(stateIs(Mode, "a")(world), true);
    assert.equal(stateIs(Mode, "b")(world), false);

    world.setState(Mode, "b");
    world.update(0);

    assert.equal(stateIs(Mode, "b")(world), true);
    assert.equal(stateIs(Mode, "a")(world), false);
});

test("stateIs returns false when state is not initialized", () => {
    const Ghost = registry.registerState(defineState<"on" | "off">("RunIfGhostState", "on"));
    const world = new World(registry);

    assert.equal(stateIs(Ghost, "on")(world), false);
});

test("stateMatches evaluates a predicate over the current state", () => {
    const Counter = registry.registerState(defineState<number>("RunIfCounterState", 0));
    const world = new World(registry);

    world.initState(Counter);
    world.setState(Counter, 5);
    world.update(0);

    assert.equal(stateMatches(Counter, (n) => n > 3)(world), true);
    assert.equal(stateMatches(Counter, (n) => n > 10)(world), false);
});

// ---------------------------------------------------------------------------
// matchesAny on withComponent (marker) spawned directly
// ---------------------------------------------------------------------------

test("matchesAny works correctly on a query with filter", () => {
    type Item = { tag: string };
    const Item = registry.registerComponent(defineComponent<Item>("RunIfItem"));
    const Active = registry.registerComponent(defineComponent("RunIfActive"));
    const activeItems = queryState([Item], { with: [Active] });
    const world = new World(registry);

    assert.equal(matchesAny(activeItems)(world), false);

    const e = world.spawn(0, withComponent(Item, { tag: "sword" }), withMarker(Active));

    assert.equal(matchesAny(activeItems)(world), true);

    world.despawn(e);

    assert.equal(matchesAny(activeItems)(world), false);
});
