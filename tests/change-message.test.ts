import assert from "node:assert/strict";
import { test } from "node:test";
import {
    defineComponent,
    defineMessage,
    defineState,
    DeferredCommands,
    Entity,
    World,
    createRegistry,
    withComponent,
} from "../src";

const registry = createRegistry("change-message-test");

test("per-system change detection lets state systems see earlier changes", () => {
    type Position = { x: number; y: number };
    const Position = registry.registerComponent(defineComponent<Position>("ChangedPosition"));
    const Mode = registry.registerState(
        defineState<"editing" | "watching">("ChangedMode", "editing")
    );
    const seen: number[] = [];

    class MutationSystem {
        private entity: Entity | undefined;
        private frame = 0;

        onStartup(_world: World, _dt: number, commands: DeferredCommands): void {
            this.entity = commands.spawn(0, withComponent(Position, { x: 0, y: 0 }));
        }

        onUpdate(world: World, _dt: number, commands: DeferredCommands): void {
            if (this.entity === undefined || this.frame !== 0) {
                this.frame++;
                return;
            }

            const position = world.mustGetComponent(this.entity, Position);

            position.x = 10;
            commands.markComponentChanged(this.entity, Position);
            commands.setState(Mode, "watching");
            this.frame++;
        }
    }

    class WatchingEnterSystem {
        onEnter(world: World): void {
            world.each([Position], { changed: [Position] }, (_entity, position) => {
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
    type Health = { value: number };
    const Health = registry.registerComponent(defineComponent<Health>("MessageHealth"));
    const Damage = registry.registerMessage(
        defineMessage<{ target: Entity; amount: number }>("MessageDamage")
    );
    const world = new World(registry);
    const target = world.spawn(0, withComponent(Health, { value: 100 }));

    world.addMessage(Damage);
    const readerA = world.messageReader(Damage);
    const readerB = world.messageReader(Damage);
    world.writeMessage(Damage, { target, amount: 10 });

    assert.equal(readerA.read().length, 1);
    assert.equal(readerB.read().length, 1);
    assert.equal(readerA.read().length, 0);

    world.writeMessage(Damage, { target, amount: 5 });

    const unread = readerA.read();

    assert.equal(unread.length, 1);
    assert.equal(unread[0]?.amount, 5);
});

test("messages expire after the next message update window", () => {
    const Damage = registry.registerMessage(defineMessage<{ amount: number }>("ExpiringDamage"));
    const world = new World(registry);

    world.addMessage(Damage);
    const timelyReader = world.messageReader(Damage);
    const lateReader = world.messageReader(Damage);
    world.writeMessage(Damage, { amount: 1 });
    world.update(0);

    assert.deepEqual(timelyReader.read(), [{ amount: 1 }]);

    world.update(0);

    assert.deepEqual(lateReader.read(), []);
});
