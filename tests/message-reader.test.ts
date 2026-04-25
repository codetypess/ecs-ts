import assert from "node:assert/strict";
import { test } from "node:test";
import { World, createRegistry } from "../src";

const registry = createRegistry("message-reader-test");

test("advanceTo rewinds cursor to re-read already-seen messages", () => {
    const Damage = registry.defineMessage<{ amount: number }>("AdvanceToRewindDamage");
    const world = new World(registry);

    world.addMessage(Damage);
    const reader = world.messageReader(Damage);
    world.writeMessage(Damage, { amount: 5 });
    world.writeMessage(Damage, { amount: 10 });

    const first = reader.read();

    assert.equal(first.length, 2);

    // Rewind to re-read from the beginning
    reader.advanceTo(0);

    const second = reader.read();

    assert.equal(second.length, 2);
    assert.equal(second[0]?.amount, 5);
    assert.equal(second[1]?.amount, 10);
});

test("advanceTo fast-forwards cursor to skip messages", () => {
    const Event = registry.defineMessage<{ n: number }>("AdvanceToSkipEvent");
    const world = new World(registry);

    world.addMessage(Event);
    const reader = world.messageReader(Event);
    world.writeMessage(Event, { n: 1 });
    world.writeMessage(Event, { n: 2 });
    world.writeMessage(Event, { n: 3 });

    // A reader that starts past the first two messages
    reader.advanceTo(2);

    const result = reader.read();

    assert.equal(result.length, 1);
    assert.equal(result[0]?.n, 3);
});

test("advanceTo can be used to start a reader mid-stream", () => {
    const Cmd = registry.defineMessage<{ seq: number }>("AdvanceToMidStreamCmd");
    const world = new World(registry);

    world.addMessage(Cmd);
    world.writeMessage(Cmd, { seq: 0 });
    world.writeMessage(Cmd, { seq: 1 });

    const lateReader = world.messageReader(Cmd);

    // Fast-forward to skip the two messages already written
    lateReader.advanceTo(2);

    world.writeMessage(Cmd, { seq: 2 });

    const result = lateReader.read();

    assert.equal(result.length, 1);
    assert.equal(result[0]?.seq, 2);
});

test("cursor reflects next unread id after reading", () => {
    const Tick = registry.defineMessage<void>("CursorTick");
    const world = new World(registry);

    world.addMessage(Tick);
    const reader = world.messageReader(Tick);
    assert.equal(reader.cursor, 0);

    world.writeMessage(Tick, undefined);
    world.writeMessage(Tick, undefined);

    reader.read();

    assert.equal(reader.cursor, 2);

    world.writeMessage(Tick, undefined);

    reader.read();

    assert.equal(reader.cursor, 3);
});

test("_readBuffer is reused across successive reads", () => {
    const Blob = registry.defineMessage<{ v: number }>("ReadBufferBlob");
    const world = new World(registry);

    world.addMessage(Blob);
    const reader = world.messageReader(Blob);
    world.writeMessage(Blob, { v: 1 });

    const result1 = reader.read();

    assert.equal(result1.length, 1);

    // Rewind and re-read — must return the same array object
    reader.advanceTo(0);

    const result2 = reader.read();

    assert.equal(result1, result2, "_readBuffer should be the same array reference");
    assert.equal(result2[0]?.v, 1);
});

test("empty reads reuse the buffer without advancing the cursor", () => {
    const Empty = registry.defineMessage<{ v: number }>("EmptyReadBuffer");
    const world = new World(registry);

    world.addMessage(Empty);
    const reader = world.messageReader(Empty);

    const result1 = reader.read();
    const result2 = reader.read();

    assert.equal(result1, result2, "_readBuffer should be reused for empty reads");
    assert.equal(result1.length, 0);
    assert.equal(reader.cursor, 0);

    world.writeMessage(Empty, { v: 1 });

    const result3 = reader.read();

    assert.equal(result3, result1);
    assert.equal(result3.length, 1);
    assert.equal(reader.cursor, 1);
});

test("reading after message expiry returns empty result", () => {
    const Shot = registry.defineMessage<{ dmg: number }>("ExpiryShot");
    const world = new World(registry);

    world.addMessage(Shot);
    const reader = world.messageReader(Shot);
    world.writeMessage(Shot, { dmg: 7 });
    world.update(0); // swap buffers
    world.update(0); // swap again — first message is gone

    const result = reader.read();

    assert.equal(result.length, 0);
});
