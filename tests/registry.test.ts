import assert from "node:assert/strict";
import { test } from "node:test";
import { createRegistry, requireComponent } from "../src";

test("registry assigns stable keys and supports name and key lookups", () => {
    const registry = createRegistry("registry-test");
    const Position = registry.defineComponent<{ x: number; y: number }>("Position");
    const SharedResource = registry.defineResource<{ enabled: boolean }>("Shared");
    const SharedState = registry.defineState("Shared", "idle" as "idle" | "running");
    const DamageMessage = registry.defineMessage<{ amount: number }>("Damage");
    const DamageEvent = registry.defineEvent<{ amount: number }>("Damage");

    assert.equal(Position.key, "registry-test/component/Position");
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

test("registry seal and finalize prevent new definitions", () => {
    const sealedRegistry = createRegistry("registry-sealed-test");

    assert.equal(sealedRegistry.isSealed, false);
    assert.equal(sealedRegistry.seal(), sealedRegistry);
    assert.equal(sealedRegistry.isSealed, true);
    assert.throws(
        () => sealedRegistry.defineComponent("AfterSeal"),
        /Cannot define component AfterSeal in registry-sealed-test: registry is sealed/
    );

    const finalizedRegistry = createRegistry("registry-finalize-test");

    assert.equal(finalizedRegistry.finalize(), finalizedRegistry);
    assert.equal(finalizedRegistry.isSealed, true);
    assert.throws(
        () => finalizedRegistry.defineResource("AfterFinalize"),
        /Cannot define resource AfterFinalize in registry-finalize-test: registry is sealed/
    );
});

test("registry validates required components during definition", () => {
    const registry = createRegistry("registry-required-test");
    const Transform = registry.defineComponent<{ x: number; y: number }>("Transform");

    assert.throws(
        () =>
            registry.defineComponent("RigidBody", {
                require: [
                    requireComponent(Transform, () => ({ x: 0, y: 0 })),
                    requireComponent(Transform, () => ({ x: 1, y: 1 })),
                ],
            }),
        /Component RigidBody in registry-required-test requires Transform more than once/
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
