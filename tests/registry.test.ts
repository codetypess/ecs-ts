import assert from "node:assert/strict";
import { test } from "node:test";
import {
    defineEvent,
    defineMessage,
    defineResource,
    defineState,
    createRegistry,
    defineComponent,
} from "../src";

test("registry assigns stable keys and supports name and key lookups", () => {
    const registry = createRegistry("registry-test");
    type Position = { x: number; y: number };
    const Position = registry.registerComponent(defineComponent<Position>("Position"));
    const SharedResource = registry.registerResource(
        defineResource<{ enabled: boolean }>("Shared")
    );
    const SharedState = registry.registerState(defineState("Shared", "idle" as "idle" | "running"));
    const DamageMessage = registry.registerMessage(defineMessage<{ amount: number }>("Damage"));
    const DamageEvent = registry.registerEvent(defineEvent<{ amount: number }>("Damage"));

    assert.equal(Position.key, "component/Position");
    assert.equal(SharedResource.key, "resource/Shared");
    assert.equal(SharedState.key, "state/Shared");
    assert.equal(DamageMessage.key, "message/Damage");
    assert.equal(DamageEvent.key, "event/Damage");

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
    const Position = registry.registerComponent(defineComponent<Position>("Position"));
    type Velocity = { x: number; y: number };
    const Velocity = registry.registerComponent(defineComponent<Velocity>("Velocity"));
    const SharedResource = registry.registerResource(
        defineResource<{ enabled: boolean }>("Shared")
    );
    const Mode = registry.registerState(defineState("Mode", "idle" as "idle" | "running"));
    const DamageMessage = registry.registerMessage(defineMessage<{ amount: number }>("Damage"));
    const DamageEvent = registry.registerEvent(defineEvent<{ amount: number }>("Damage"));

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

    registry.registerComponent(defineComponent("Position"));
    registry.registerResource(defineResource("Config"));
    registry.registerState(defineState("Mode", "idle" as "idle" | "running"));
    registry.registerMessage(defineMessage("Damage"));
    registry.registerEvent(defineEvent("Damage"));

    assert.throws(
        () => registry.registerComponent(defineComponent("Position")),
        /Cannot register component Position in registry-duplicate-test: name is already used/
    );
    assert.throws(
        () => registry.registerResource(defineResource("Config")),
        /Cannot register resource Config in registry-duplicate-test: name is already used/
    );
    assert.throws(
        () => registry.registerState(defineState("Mode", "running" as "idle" | "running")),
        /Cannot register state Mode in registry-duplicate-test: name is already used/
    );
    assert.throws(
        () => registry.registerMessage(defineMessage("Damage")),
        /Cannot register message Damage in registry-duplicate-test: name is already used/
    );
    assert.throws(
        () => registry.registerEvent(defineEvent("Damage")),
        /Cannot register event Damage in registry-duplicate-test: name is already used/
    );
});

test("registry seal prevents new definitions", () => {
    const sealedRegistry = createRegistry("registry-sealed-test");

    assert.equal(sealedRegistry.isSealed, false);
    assert.equal(sealedRegistry.seal(), sealedRegistry);
    assert.equal(sealedRegistry.isSealed, true);
    assert.throws(
        () => sealedRegistry.registerComponent(defineComponent("AfterSeal")),
        /Cannot register component AfterSeal in registry-sealed-test: registry is sealed/
    );
});

test("registry rejects blank names", () => {
    assert.throws(() => createRegistry("   "), /Registry name must be a non-empty string/);

    const registry = createRegistry("registry-empty-name-test");

    assert.throws(
        () => registry.registerComponent(defineComponent("   ")),
        /Cannot define component: name must be a non-empty string/
    );
});

test("registry stores component dependencies and rejects invalid dependency metadata", () => {
    const registry = createRegistry("registry-component-deps-test");
    type Transform = { x: number; y: number };
    const Transform = registry.registerComponent(defineComponent<Transform>("Transform"));
    type Element = { name: string };
    const Element = registry.registerComponent(
        defineComponent<Element>("Element", {
            deps: [Transform],
        })
    );
    const otherRegistry = createRegistry("registry-component-deps-other");
    const Foreign = otherRegistry.registerComponent(defineComponent("Foreign"));

    assert.deepEqual(Element.deps, [Transform]);
    assert.throws(
        () =>
            registry.registerComponent(
                defineComponent("ForeignDependent", {
                    deps: [Foreign],
                })
            ),
        /dependency Foreign is not registered in registry-component-deps-test/
    );
    assert.throws(
        () =>
            registry.registerComponent(
                defineComponent("DuplicatedDependent", {
                    deps: [Transform, Transform],
                })
            ),
        /dependency Transform is duplicated/
    );
    assert.throws(
        () =>
            registry.registerComponent(
                defineComponent("UndefinedDependent", {
                    deps: [undefined as never],
                })
            ),
        /dependency at index 0 is undefined/
    );
    assert.throws(
        () =>
            registry.registerComponent(
                defineComponent("NullDependent", {
                    deps: [null as never],
                })
            ),
        /dependency at index 0 is null/
    );
});

test("type definitions can be registered in multiple registries", () => {
    const Position = defineComponent<{ x: number }>("SharedPosition");
    const Settings = defineResource<{ enabled: boolean }>("SharedSettings");
    const Mode = defineState("SharedMode", "idle" as "idle" | "running");
    const Notice = defineMessage<{ value: number }>("SharedNotice");
    const Ping = defineEvent<{ value: number }>("SharedPing");
    const first = createRegistry("shared-first");
    const second = createRegistry("shared-second");

    for (const registry of [first, second]) {
        registry.registerComponent(Position);
        registry.registerResource(Settings);
        registry.registerState(Mode);
        registry.registerMessage(Notice);
        registry.registerEvent(Ping);
    }

    assert.equal(first.componentTypeByName(Position.name), Position);
    assert.equal(second.componentTypeByName(Position.name), Position);
    assert.equal(first.resourceTypeByName(Settings.name), Settings);
    assert.equal(second.resourceTypeByName(Settings.name), Settings);
    assert.equal(first.stateTypeByName(Mode.name), Mode);
    assert.equal(second.stateTypeByName(Mode.name), Mode);
    assert.equal(first.messageTypeByName(Notice.name), Notice);
    assert.equal(second.messageTypeByName(Notice.name), Notice);
    assert.equal(first.eventTypeByName(Ping.name), Ping);
    assert.equal(second.eventTypeByName(Ping.name), Ping);
});
