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
        return this.enqueue((world) => {
            world.add(entity, type, value);
        });
    }

    remove<T>(entity: Entity, type: ComponentType<T>): this {
        return this.enqueue((world) => {
            world.remove(entity, type);
        });
    }

    insertBundle(entity: Entity, bundle: Bundle): this {
        return this.enqueue((world) => {
            world.insertBundle(entity, bundle);
        });
    }

    removeBundle(entity: Entity, bundle: Bundle): this {
        return this.enqueue((world) => {
            world.removeBundle(entity, bundle);
        });
    }

    despawn(entity: Entity): this {
        return this.enqueue((world) => {
            world.despawn(entity);
        });
    }

    setState<T extends StateValue>(type: StateType<T>, next: T): this {
        return this.enqueue((world) => {
            world.setState(type, next);
        });
    }

    setResource<T>(type: ResourceType<T>, value: T): this {
        return this.enqueue((world) => {
            world.setResource(type, value);
        });
    }

    removeResource<T>(type: ResourceType<T>): this {
        return this.enqueue((world) => {
            world.removeResource(type);
        });
    }

    markResourceChanged<T>(type: ResourceType<T>): this {
        return this.enqueue((world) => {
            world.markResourceChanged(type);
        });
    }

    markChanged<T>(entity: Entity, type: ComponentType<T>): this {
        return this.enqueue((world) => {
            world.markChanged(entity, type);
        });
    }

    writeMessage<T>(type: MessageType<T>, value: T): this {
        return this.enqueue((world) => {
            world.writeMessage(type, value);
        });
    }

    trigger<T>(type: EventType<T>, value: T): this {
        return this.enqueue((world) => {
            world.trigger(type, value);
        });
    }

    run(command: (world: World) => void): this {
        return this.enqueue(command);
    }

    private enqueue(command: CommandRunner): this {
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
