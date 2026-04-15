import type { Bundle, ComponentEntry, ComponentType } from "./component";
import type { Entity } from "./entity";
import type { EventType } from "./event";
import type { MessageType } from "./message";
import type { ResourceType } from "./resource";
import type { StateType, StateValue } from "./state";
import type { World } from "./world";

type CommandRunner = (world: World) => void;

export class Commands {
    private readonly queue: CommandRunner[] = [];

    constructor(private readonly world: World) {}

    get pending(): number {
        return this.queue.length;
    }

    spawn(...entries: ComponentEntry<unknown>[]): Entity {
        return this.spawnBundle({ entries });
    }

    spawnBundle(bundle: Bundle): Entity {
        const entity = this.world.spawn();
        this.insertBundle(entity, bundle);

        return entity;
    }

    add<T>(entity: Entity, type: ComponentType<T>, value: T): this {
        this.queue.push((world) => {
            world.add(entity, type, value);
        });

        return this;
    }

    remove<T>(entity: Entity, type: ComponentType<T>): this {
        this.queue.push((world) => {
            world.remove(entity, type);
        });

        return this;
    }

    insertBundle(entity: Entity, bundle: Bundle): this {
        this.queue.push((world) => {
            world.insertBundle(entity, bundle);
        });

        return this;
    }

    removeBundle(entity: Entity, bundle: Bundle): this {
        this.queue.push((world) => {
            world.removeBundle(entity, bundle);
        });

        return this;
    }

    despawn(entity: Entity): this {
        this.queue.push((world) => {
            world.despawn(entity);
        });

        return this;
    }

    setState<T extends StateValue>(type: StateType<T>, next: T): this {
        this.queue.push((world) => {
            world.setState(type, next);
        });

        return this;
    }

    setResource<T>(type: ResourceType<T>, value: T): this {
        this.queue.push((world) => {
            world.setResource(type, value);
        });

        return this;
    }

    removeResource<T>(type: ResourceType<T>): this {
        this.queue.push((world) => {
            world.removeResource(type);
        });

        return this;
    }

    markResourceChanged<T>(type: ResourceType<T>): this {
        this.queue.push((world) => {
            world.markResourceChanged(type);
        });

        return this;
    }

    markChanged<T>(entity: Entity, type: ComponentType<T>): this {
        this.queue.push((world) => {
            world.markChanged(entity, type);
        });

        return this;
    }

    writeMessage<T>(type: MessageType<T>, value: T): this {
        this.queue.push((world) => {
            world.writeMessage(type, value);
        });

        return this;
    }

    trigger<T>(type: EventType<T>, value: T): this {
        this.queue.push((world) => {
            world.trigger(type, value);
        });

        return this;
    }

    run(command: (world: World) => void): this {
        this.queue.push(command);

        return this;
    }

    flush(): void {
        const commands = this.queue.splice(0);

        for (const command of commands) {
            command(this.world);
        }
    }
}
