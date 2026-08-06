import assert from "node:assert/strict";
import { test } from "node:test";
import { World, createRegistry, entityIndex, withComponent } from "../src";

test("world enforces component dependencies on direct writes", () => {
    const registry = createRegistry("world-component-deps-test");
    type Transform = { x: number; y: number };
    const Transform = registry.defineComponent<Transform>("Transform");
    type Element = { name: string };
    const Element = registry.defineComponent<Element>("Element", {
        deps: [Transform],
    });
    const world = new World(registry);
    const entity = world.spawn(0);

    assert.throws(
        () => world.addComponent(entity, Element, { name: "button" }),
        /missing dependency Transform/
    );

    world.addComponent(entity, Transform, { x: 0, y: 0 });
    world.addComponent(entity, Element, { name: "button" });

    assert.throws(
        () => world.removeComponent(entity, Transform),
        /component Element depends on it/
    );

    assert.equal(world.removeComponent(entity, Element), true);
    assert.equal(world.removeComponent(entity, Transform), true);
});

test("visible dependent components can safely mustGet their dependencies", () => {
    const registry = createRegistry("world-component-deps-must-get-test");
    type Transform = { x: number; y: number };
    const Transform = registry.defineComponent<Transform>("Transform");
    type Element = { name: string };
    const Element = registry.defineComponent<Element>("Element", {
        deps: [Transform],
    });
    const world = new World(registry);
    const entity = world.spawn(
        0,
        withComponent(Element, { name: "button" }),
        withComponent(Transform, { x: 4, y: 5 })
    );

    assert.equal(world.hasComponent(entity, Element), true);
    assert.deepEqual(world.mustGetComponent(entity, Transform), { x: 4, y: 5 });
});

test("failed dependency spawn does not publish an empty entity", () => {
    const registry = createRegistry("world-component-deps-failed-spawn-test");
    type Transform = { x: number; y: number };
    const Transform = registry.defineComponent<Transform>("Transform");
    type Element = { name: string };
    const Element = registry.defineComponent<Element>("Element", {
        deps: [Transform],
    });
    const world = new World(registry);

    assert.throws(
        () => world.spawn(0, withComponent(Element, { name: "broken" })),
        /missing dependency Transform/
    );

    const entity = world.spawn(0);

    assert.equal(entityIndex(entity), 0);
    assert.equal(world.isAlive(entity), true);
});

test("spawn inserts dependencies before dependents and despawn removes dependents first", () => {
    const registry = createRegistry("world-component-deps-order-test");
    const events: string[] = [];
    type Transform = { x: number; y: number };
    const Transform = registry.defineComponent<Transform>("Transform", {
        onAdd() {
            events.push("transform:add");
        },
        onRemove(entity, _transform, world, reason) {
            events.push(`transform:${reason}:element=${world.hasComponent(entity, Element)}`);
        },
    });
    type Element = { name: string };
    const Element = registry.defineComponent<Element>("Element", {
        deps: [Transform],
        onAdd(entity, _element, world) {
            events.push(`element:add:transform=${world.hasComponent(entity, Transform)}`);
        },
        onRemove(entity, _element, world, reason) {
            events.push(`element:${reason}:transform=${world.hasComponent(entity, Transform)}`);
        },
    });
    const world = new World(registry);
    const entity = world.spawn(
        0,
        withComponent(Element, { name: "panel" }),
        withComponent(Transform, { x: 3, y: 4 })
    );

    assert.deepEqual(events, ["transform:add", "element:add:transform=true"]);

    events.length = 0;
    world.despawn(entity);

    assert.deepEqual(events, [
        "element:despawned:transform=true",
        "transform:despawned:element=false",
    ]);
});

test("dependency sorting preserves duplicate component entry order", () => {
    const registry = createRegistry("world-component-deps-duplicate-order-test");
    type Transform = { x: number; y: number };
    const Transform = registry.defineComponent<Transform>("Transform");
    type Element = { name: string };
    const Element = registry.defineComponent<Element>("Element", {
        deps: [Transform],
    });
    const world = new World(registry);
    const entity = world.spawn(
        0,
        withComponent(Element, { name: "first" }),
        withComponent(Transform, { x: 1, y: 2 }),
        withComponent(Element, { name: "second" })
    );

    assert.deepEqual(world.mustGetComponent(entity, Element), { name: "second" });
});

test("batch validates final component state and returns committed entities", () => {
    const registry = createRegistry("world-batch-component-deps-test");
    type Transform = { x: number; y: number };
    const Transform = registry.defineComponent<Transform>("Transform");
    type Element = { name: string };
    const Element = registry.defineComponent<Element>("Element", {
        deps: [Transform],
    });
    const world = new World(registry);

    const entity = world.batch((batch) => {
        const entity = batch.spawn(0);

        batch.addComponent(entity, Element, { name: "button" });
        batch.addComponent(entity, Transform, { x: 10, y: 20 });

        return entity;
    });

    assert.equal(world.isAlive(entity), true);
    assert.deepEqual(world.mustGetComponent(entity, Transform), { x: 10, y: 20 });
    assert.deepEqual(world.mustGetComponent(entity, Element), { name: "button" });
});

test("batch commit keeps dependency mustGet invariant for hooks and later reads", () => {
    const registry = createRegistry("world-batch-component-deps-must-get-test");
    const seen: Array<{ x: number; y: number }> = [];
    type Transform = { x: number; y: number };
    const Transform = registry.defineComponent<Transform>("Transform");
    type Element = { name: string };
    const Element = registry.defineComponent<Element>("Element", {
        deps: [Transform],
        onAdd(entity, _element, world) {
            seen.push(world.mustGetComponent(entity, Transform));
        },
    });
    const world = new World(registry);

    const entity = world.batch((batch) => {
        const entity = batch.spawn(0);

        batch.addComponent(entity, Element, { name: "panel" });
        batch.addComponent(entity, Transform, { x: 7, y: 9 });

        return entity;
    });

    assert.deepEqual(seen, [{ x: 7, y: 9 }]);
    assert.equal(world.hasComponent(entity, Element), true);
    assert.deepEqual(world.mustGetComponent(entity, Transform), { x: 7, y: 9 });
});

test("batch commits only the final diff for component hooks", () => {
    const registry = createRegistry("world-batch-final-diff-test");
    const events: string[] = [];
    type Value = { value: number };
    const Value = registry.defineComponent<Value>("Value", {
        onAdd(_entity, value) {
            events.push(`add:${value.value}`);
        },
        onInsert(_entity, value) {
            events.push(`insert:${value.value}`);
        },
        onUnset(_entity, value) {
            events.push(`unset:${value.value}`);
        },
        onReplace(_entity, previous, next) {
            events.push(`replace:${previous.value}->${next.value}`);
        },
        onRemove(_entity, value) {
            events.push(`remove:${value.value}`);
        },
    });
    const world = new World(registry);
    const transient = world.spawn(0);

    world.batch((batch) => {
        batch.addComponent(transient, Value, { value: 1 });
        batch.removeComponent(transient, Value);
    });

    assert.deepEqual(events, []);

    const existing = world.spawn(0, withComponent(Value, { value: 1 }));
    events.length = 0;

    world.batch((batch) => {
        batch.removeComponent(existing, Value);
        batch.addComponent(existing, Value, { value: 2 });
    });

    assert.deepEqual(events, ["unset:1", "replace:1->2", "insert:2"]);
    assert.deepEqual(world.mustGetComponent(existing, Value), { value: 2 });
});

test("batch does not commit when the callback throws or validation fails", () => {
    const registry = createRegistry("world-batch-failure-test");
    type Transform = { x: number; y: number };
    const Transform = registry.defineComponent<Transform>("Transform");
    type Element = { name: string };
    const Element = registry.defineComponent<Element>("Element", {
        deps: [Transform],
    });
    const world = new World(registry);

    assert.throws(
        () =>
            world.batch((batch) => {
                const entity = batch.spawn(0);

                batch.addComponent(entity, Transform, { x: 1, y: 2 });

                throw new Error("abort batch");
            }),
        /abort batch/
    );
    assert.equal(Array.from(world.query([Transform])).length, 0);

    assert.throws(
        () =>
            world.batch((batch) => {
                const entity = batch.spawn(0);

                batch.addComponent(entity, Element, { name: "broken" });
            }),
        /component Element requires Transform/
    );
    assert.equal(Array.from(world.query([Element])).length, 0);
});

test("nested world.batch calls are rejected", () => {
    const world = new World(createRegistry("world-batch-nested-test"));

    assert.throws(
        () =>
            world.batch(() => {
                world.batch(() => undefined);
            }),
        /Nested world\.batch calls are not supported/
    );
});

test("batch writer cannot be reused after the callback returns", () => {
    const world = new World(createRegistry("world-batch-closed-writer-test"));
    const batch = world.batch((writer) => writer);

    assert.throws(
        () => batch.spawn(0),
        /Cannot use world\.batch after the callback has already returned/
    );
});
