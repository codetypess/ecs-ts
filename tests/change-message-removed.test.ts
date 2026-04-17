import assert from "node:assert/strict";
import { test } from "node:test";
import {
    Commands,
    Entity,
    World,
    createRegistry,
    defineMessage,
    defineState,
    messageReader,
    withComponent,
} from "../src";

const registry = createRegistry("change-message-removed-test");

test("per-system change detection lets state systems see earlier changes", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("ChangedPosition");
    const Mode = defineState<"editing" | "watching">("ChangedMode", "editing");
    const seen: number[] = [];

    class MutationSystem {
        private entity: Entity | undefined;
        private frame = 0;

        onStartup(_world: World, _dt: number, commands: Commands): void {
            this.entity = commands.spawn(withComponent(Position, { x: 0, y: 0 }));
        }

        onUpdate(world: World, _dt: number, commands: Commands): void {
            if (this.entity === undefined || this.frame !== 0) {
                this.frame++;
                return;
            }

            const position = world.mustGet(this.entity, Position);

            position.x = 10;
            commands.markChanged(this.entity, Position);
            commands.setState(Mode, "watching");
            this.frame++;
        }
    }

    class WatchingEnterSystem {
        onEnter(world: World): void {
            world.eachChanged([Position], (_entity, position) => {
                seen.push(position.x);
            });
        }
    }

    const world = new World(registry);

    world.initState(Mode);
    world.addSystem(new MutationSystem());
    world.addStateSystem(Mode, "watching", new WatchingEnterSystem());

    world.update(0);
    world.update(0);

    assert.deepEqual(seen, [10]);
});

test("message readers keep independent cursors", () => {
    const Health = registry.defineComponent<{ value: number }>("MessageHealth");
    const Damage = defineMessage<{ target: Entity; amount: number }>("MessageDamage");
    const world = new World(registry);
    const target = world.spawn(withComponent(Health, { value: 100 }));
    const readerA = messageReader(Damage);
    const readerB = messageReader(Damage);

    world.addMessage(Damage);
    world.writeMessage(Damage, { target, amount: 10 });

    assert.equal(readerA.read(world).length, 1);
    assert.equal(readerB.read(world).length, 1);
    assert.equal(readerA.read(world).length, 0);

    world.writeMessage(Damage, { target, amount: 5 });

    const unread = readerA.read(world);

    assert.equal(unread.length, 1);
    assert.equal(unread[0]?.amount, 5);
});

test("messages expire after the next message update window", () => {
    const Damage = defineMessage<{ amount: number }>("ExpiringDamage");
    const world = new World(registry);
    const timelyReader = messageReader(Damage);
    const lateReader = messageReader(Damage);

    world.addMessage(Damage);
    world.writeMessage(Damage, { amount: 1 });
    world.update(0);

    assert.deepEqual(timelyReader.read(world), [{ amount: 1 }]);

    world.update(0);

    assert.deepEqual(lateReader.read(world), []);
});

test("removed readers can inspect records without draining them", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("RemovedPosition");
    const world = new World(registry);
    const entity = world.spawn(withComponent(Position, { x: 1, y: 2 }));
    const readerA = world.removedReader(Position);
    const readerB = world.removedReader(Position);

    world.remove(entity, Position);

    const removedA = readerA.read();
    const removedB = readerB.read();

    assert.equal(removedA.length, 1);
    assert.equal(removedB.length, 1);
    assert.equal(removedA[0]?.entity, entity);
    assert.deepEqual(removedA[0]?.component, { x: 1, y: 2 });
    assert.equal(world.drainRemoved(Position).length, 0);
    assert.equal(world.drainRemoved(Position).length, 0);
});

test("removed readers only see removals still buffered after drain", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>(
        "RemovedAfterDrainPosition"
    );
    const world = new World(registry);
    const reader = world.removedReader(Position);
    const first = world.spawn(withComponent(Position, { x: 1, y: 2 }));

    world.remove(first, Position);
    assert.equal(world.drainRemoved(Position).length, 1);

    const second = world.spawn(withComponent(Position, { x: 3, y: 4 }));

    world.remove(second, Position);

    const removed = reader.read();

    assert.equal(removed.length, 1);
    assert.equal(removed[0]?.entity, second);
    assert.deepEqual(removed[0]?.component, { x: 3, y: 4 });
});

test("removed readers hide fully consumed history from drainRemoved immediately", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("RemovedConsumedPosition");
    const world = new World(registry);
    const reader = world.removedReader(Position);
    const entity = world.spawn(withComponent(Position, { x: 1, y: 2 }));

    world.remove(entity, Position);

    assert.equal(reader.read().length, 1);
    assert.equal(world.drainRemoved(Position).length, 0);
});

test("drainRemoved keeps working even when no removed reader exists", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("RemovedDrainOnlyPosition");
    const world = new World(registry);
    const entity = world.spawn(withComponent(Position, { x: 1, y: 2 }));

    world.remove(entity, Position);

    const removed = world.drainRemoved(Position);

    assert.equal(removed.length, 1);
    assert.equal(removed[0]?.entity, entity);
    assert.deepEqual(removed[0]?.component, { x: 1, y: 2 });
});

test("removed history compacts once every live reader advances past it", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>(
        "RemovedCompactionPosition"
    );
    const world = new World(registry);
    const readerA = world.removedReader(Position);
    const readerB = world.removedReader(Position);
    const first = world.spawn(withComponent(Position, { x: 1, y: 2 }));

    world.remove(first, Position);

    assert.equal(readerA.read().length, 1);

    const second = world.spawn(withComponent(Position, { x: 3, y: 4 }));

    world.remove(second, Position);

    const unreadB = readerB.read();

    assert.equal(unreadB.length, 2);
    assert.equal(unreadB[0]?.entity, first);
    assert.equal(unreadB[1]?.entity, second);

    const unreadA = readerA.read();

    assert.equal(unreadA.length, 1);
    assert.equal(unreadA[0]?.entity, second);
    assert.equal(world.drainRemoved(Position).length, 0);
});

test("closing a removed reader releases any history pinned by its cursor", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>("RemovedClosePosition");
    const world = new World(registry);
    const readerA = world.removedReader(Position);
    const readerB = world.removedReader(Position);
    const entity = world.spawn(withComponent(Position, { x: 1, y: 2 }));

    world.remove(entity, Position);

    assert.equal(readerA.read().length, 1);
    assert.equal(world.drainRemoved(Position).length, 1);

    readerB.close();

    assert.equal(world.drainRemoved(Position).length, 0);
});

test("late removed readers only see history retained by currently live readers", () => {
    const Position = registry.defineComponent<{ x: number; y: number }>(
        "RemovedLateReaderPosition"
    );
    const world = new World(registry);
    const earlyReader = world.removedReader(Position);
    const entity = world.spawn(withComponent(Position, { x: 1, y: 2 }));

    world.remove(entity, Position);
    assert.equal(earlyReader.read().length, 1);

    const lateReader = world.removedReader(Position);

    assert.equal(lateReader.read().length, 0);
});
