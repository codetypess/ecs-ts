import type { Bundle, ComponentEntry, ComponentType } from "./component";
import type { Entity } from "./entity";
import type { EventType } from "./event";
import type { MessageType } from "./message";
import type { ResourceType } from "./resource";
import type { StateType, StateValue } from "./state";
import type { World } from "./world";

type CommandRunner = (world: World) => void;

/** Deferred structural edits that are flushed after a system or observer finishes. */
export class Commands {
    private readonly queue: CommandRunner[] = [];

    constructor(private readonly world: World) {}

    /** Number of queued commands waiting to be flushed. */
    get pending(): number {
        return this.queue.length;
    }

    /** Queues an entity spawn using the same component-entry format as `World.spawn`. */
    spawn(...entries: ComponentEntry<unknown>[]): Entity {
        return this.spawnBundle({ entries, registry: entries[0]?.type.registry });
    }

    /** Reserves an entity immediately, then queues component insertion into it. */
    spawnBundle(bundle: Bundle): Entity {
        const entity = this.world.spawn();
        this.insertBundle(entity, bundle);

        return entity;
    }

    /** Queues a component insertion or replacement. */
    add<T>(entity: Entity, type: ComponentType<T>, value: T): this {
        return this.enqueue((world) => {
            world.add(entity, type, value);
        });
    }

    /** Queues component removal. */
    remove<T>(entity: Entity, type: ComponentType<T>): this {
        return this.enqueue((world) => {
            world.remove(entity, type);
        });
    }

    /** Queues bundle insertion for an existing entity. */
    insertBundle(entity: Entity, bundle: Bundle): this {
        return this.enqueue((world) => {
            world.insertBundle(entity, bundle);
        });
    }

    /** Queues removal of every component listed in the bundle. */
    removeBundle(entity: Entity, bundle: Bundle): this {
        return this.enqueue((world) => {
            world.removeBundle(entity, bundle);
        });
    }

    /** Queues entity despawn. */
    despawn(entity: Entity): this {
        return this.enqueue((world) => {
            world.despawn(entity);
        });
    }

    /** Queues a state transition request. */
    setState<T extends StateValue>(type: StateType<T>, next: T): this {
        return this.enqueue((world) => {
            world.setState(type, next);
        });
    }

    /** Queues resource insertion or replacement. */
    setResource<T>(type: ResourceType<T>, value: T): this {
        return this.enqueue((world) => {
            world.setResource(type, value);
        });
    }

    /** Queues resource removal. */
    removeResource<T>(type: ResourceType<T>): this {
        return this.enqueue((world) => {
            world.removeResource(type);
        });
    }

    /** Queues a manual resource change marker. */
    markResourceChanged<T>(type: ResourceType<T>): this {
        return this.enqueue((world) => {
            world.markResourceChanged(type);
        });
    }

    /** Queues a manual component change marker. */
    markChanged<T>(entity: Entity, type: ComponentType<T>): this {
        return this.enqueue((world) => {
            world.markChanged(entity, type);
        });
    }

    /** Queues a message write. */
    writeMessage<T>(type: MessageType<T>, value: T): this {
        return this.enqueue((world) => {
            world.writeMessage(type, value);
        });
    }

    /** Queues an immediate event trigger to run after the current command batch flushes. */
    trigger<T>(type: EventType<T>, value: T): this {
        return this.enqueue((world) => {
            world.trigger(type, value);
        });
    }

    /** Queues an arbitrary world callback. */
    run(command: (world: World) => void): this {
        return this.enqueue(command);
    }

    private enqueue(command: CommandRunner): this {
        this.queue.push(command);

        return this;
    }

    /** Executes the queued commands in insertion order. */
    flush(): void {
        const commands = this.queue.splice(0);

        for (const command of commands) {
            command(this.world);
        }
    }
}
