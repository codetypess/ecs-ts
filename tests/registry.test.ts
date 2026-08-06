import assert from "node:assert/strict";
import { test } from "node:test";
import { createRegistry, defineComponent } from "../src";

test("registry assigns stable keys and supports name and key lookups", () => {
    const registry = createRegistry("registry-test");
    type Position = { x: number; y: number };
    const Position = registry.defineComponent<Position>("Position");
    const SharedResource = registry.defineResource<{ enabled: boolean }>("Shared");
    const SharedState = registry.defineState("Shared", "idle" as "idle" | "running");
    const DamageMessage = registry.defineMessage<{ amount: number }>("Damage");
    const DamageEvent = registry.defineEvent<{ amount: number }>("Damage");

    assert.equal(Position.key, "component/Position");
    assert.equal(SharedResource.key, "registry-test/resource/Shared");
    assert.equal(SharedState.key, "registry-test/state/Shared");
    assert.equal(DamageMessage.key, "registry-test/message/Damage");
    assert.equal(DamageEvent.key, "registry-test/event/Damage");

    assert.equal(registry.componentTypeByName("Position"), Position);
    assert.equal(registry.resourceTypeByName("Shared"), SharedResource);
    assert.equal(registry.stateTypeByName("Shared"), SharedState);
    assert.equal(registry.messageTypeByName("Damage"), DamageMessage);
    assert.equal(registry.eventTypeByName("Damage"), DamageEvent);

    assert.equal(registry.typeByKey(Position.key), Position);
    assert.equal(registry.typeByKey(SharedResource.key), SharedResource);
    assert.equal(registry.typeByKey(SharedState.key), SharedState);
    assert.equal(registry.typeByKey(DamageMessage.key), DamageMessage);
    assert.equal(registry.typeByKey(DamageEvent.key), DamageEvent);
});

test("registry exposes definition-order enumeration snapshots", () => {
    const registry = createRegistry("registry-enumeration-test");
    type Position = { x: number; y: number };
    const Position = registry.defineComponent<Position>("Position");
    type Velocity = { x: number; y: number };
    const Velocity = registry.defineComponent<Velocity>("Velocity");
    const SharedResource = registry.defineResource<{ enabled: boolean }>("Shared");
    const Mode = registry.defineState("Mode", "idle" as "idle" | "running");
    const DamageMessage = registry.defineMessage<{ amount: number }>("Damage");
    const DamageEvent = registry.defineEvent<{ amount: number }>("Damage");

    const components = registry.componentTypes();
    const resources = registry.resourceTypes();
    const states = registry.stateTypes();
    const messages = registry.messageTypes();
    const events = registry.eventTypes();

    assert.deepEqual(components, [Position, Velocity]);
    assert.deepEqual(resources, [SharedResource]);
    assert.deepEqual(states, [Mode]);
    assert.deepEqual(messages, [DamageMessage]);
    assert.deepEqual(events, [DamageEvent]);

    (components as unknown as unknown[]).length = 0;

    assert.deepEqual(registry.componentTypes(), [Position, Velocity]);
});

test("registry rejects duplicate names within the same type kind", () => {
    const registry = createRegistry("registry-duplicate-test");

    registry.defineComponent("Position");
    registry.defineResource("Config");
    registry.defineState("Mode", "idle" as "idle" | "running");
    registry.defineMessage("Damage");
    registry.defineEvent("Damage");

    assert.throws(
        () => registry.defineComponent("Position"),
        /Cannot define component Position in registry-duplicate-test: name is already used/
    );
    assert.throws(
        () => registry.defineResource("Config"),
        /Cannot define resource Config in registry-duplicate-test: name is already used/
    );
    assert.throws(
        () => registry.defineState("Mode", "running" as "idle" | "running"),
        /Cannot define state Mode in registry-duplicate-test: name is already used/
    );
    assert.throws(
        () => registry.defineMessage("Damage"),
        /Cannot define message Damage in registry-duplicate-test: name is already used/
    );
    assert.throws(
        () => registry.defineEvent("Damage"),
        /Cannot define event Damage in registry-duplicate-test: name is already used/
    );
});

test("registry seal prevents new definitions", () => {
    const sealedRegistry = createRegistry("registry-sealed-test");

    assert.equal(sealedRegistry.isSealed, false);
    assert.equal(sealedRegistry.seal(), sealedRegistry);
    assert.equal(sealedRegistry.isSealed, true);
    assert.throws(
        () => sealedRegistry.defineComponent("AfterSeal"),
        /Cannot define component AfterSeal in registry-sealed-test: registry is sealed/
    );
});

test("registry rejects blank names", () => {
    assert.throws(() => createRegistry("   "), /Registry name must be a non-empty string/);

    const registry = createRegistry("registry-empty-name-test");

    assert.throws(
        () => registry.defineComponent("   "),
        /Cannot define component: name must be a non-empty string/
    );
});

test("registry stores component dependencies and rejects invalid dependency metadata", () => {
    const registry = createRegistry("registry-component-deps-test");
    type Transform = { x: number; y: number };
    const Transform = registry.defineComponent<Transform>("Transform");
    type Element = { name: string };
    const Element = registry.defineComponent<Element>("Element", {
        deps: [Transform],
    });
    const otherRegistry = createRegistry("registry-component-deps-other");
    const Foreign = otherRegistry.defineComponent("Foreign");

    assert.deepEqual(Element.deps, [Transform]);
    assert.throws(
        () =>
            registry.defineComponent("ForeignDependent", {
                deps: [Foreign],
            }),
        /dependency Foreign is not registered in registry-component-deps-test/
    );
    assert.throws(
        () =>
            registry.defineComponent("DuplicatedDependent", {
                deps: [Transform, Transform],
            }),
        /dependency Transform is duplicated/
    );
    assert.throws(
        () =>
            registry.defineComponent("UndefinedDependent", {
                deps: [undefined as never],
            }),
        /dependency at index 0 is undefined/
    );
    assert.throws(
        () =>
            registry.defineComponent("NullDependent", {
                deps: [null as never],
            }),
        /dependency at index 0 is null/
    );
});

test("component definitions can be registered in multiple registries", () => {
    const Position = defineComponent<{ x: number }>("SharedPosition");
    const first = createRegistry("shared-first");
    const second = createRegistry("shared-second");

    first.registerComponent(Position);
    second.registerComponent(Position);

    assert.equal(first.componentTypeByName("SharedPosition"), Position);
    assert.equal(second.componentTypeByName("SharedPosition"), Position);
});
