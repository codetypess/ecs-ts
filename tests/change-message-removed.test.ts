import assert from "node:assert/strict";
import { test } from "node:test";
import {
    Commands,
    Entity,
    World,
    defineComponent,
    defineMessage,
    defineState,
    messageReader,
    removedReader,
    withComponent,
} from "../src";

test("per-system change detection lets state systems see earlier changes", () => {
    const Position = defineComponent<{ x: number; y: number }>("ChangedPosition");
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

    const world = new World();

    world.initState(Mode);
    world.addSystem(new MutationSystem());
    world.addStateSystem(Mode, "watching", new WatchingEnterSystem());

    world.update(0);
    world.update(0);

    assert.deepEqual(seen, [10]);
});

test("message readers keep independent cursors", () => {
    const Health = defineComponent<{ value: number }>("MessageHealth");
    const Damage = defineMessage<{ target: Entity; amount: number }>("MessageDamage");
    const world = new World();
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

test("removed readers can inspect records without draining them", () => {
    const Position = defineComponent<{ x: number; y: number }>("RemovedPosition");
    const world = new World();
    const entity = world.spawn(withComponent(Position, { x: 1, y: 2 }));
    const readerA = removedReader(Position);
    const readerB = removedReader(Position);

    world.remove(entity, Position);

    const removedA = readerA.read(world);
    const removedB = readerB.read(world);

    assert.equal(removedA.length, 1);
    assert.equal(removedB.length, 1);
    assert.equal(removedA[0]?.entity, entity);
    assert.deepEqual(removedA[0]?.component, { x: 1, y: 2 });
    assert.equal(world.drainRemoved(Position).length, 1);
    assert.equal(world.drainRemoved(Position).length, 0);
});
