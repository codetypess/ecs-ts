import type { AnyComponentEntry, ComponentType } from "./component";
import type { Entity, EntityType } from "./entity";
import type { EventType } from "./event";
import {
    entriesHaveDependencyChecks,
    sortEntriesByDependencies,
} from "./internal/component-dependencies";
import type { MessageType } from "./message";
import type { ResourceType } from "./resource";
import type { StateType, StateValue } from "./state";
import type { World } from "./world";

export interface CommandRuntime {
    reserveEntity(etype: EntityType): Entity;
    commitReservedEntity(entity: Entity): void;
    releaseReservedEntity(entity: Entity): boolean;
}

type CommandRunner = (world: World) => void;

/** Deferred structural edits that are flushed after a system or observer finishes. */
export class Commands {
    private queue: CommandRunner[] = [];
    private flushing: CommandRunner[] = [];

    constructor(
        private readonly world: World,
        private readonly runtime: CommandRuntime
    ) {}

    /** Number of queued commands waiting to be flushed. */
    get pending(): number {
        return this.queue.length;
    }

    /** Queues an entity spawn using the same component-entry format as `World.spawn`. */
    spawn(...entries: AnyComponentEntry[]): Entity;
    spawn(etype: EntityType, ...entries: AnyComponentEntry[]): Entity;
    spawn(...args: [EntityType, ...AnyComponentEntry[]] | AnyComponentEntry[]): Entity {
        if (args.length > 0 && typeof args[0] !== "object") {
            const etype = args[0] as EntityType;
            const entries = args.slice(1) as AnyComponentEntry[];

            return this.spawnWithEntries(etype, entries);
        }

        const entries = args as AnyComponentEntry[];

        return this.spawnWithEntries(0, entries);
    }

    /** Queues a component insertion or replacement. */
    addComponent<T extends object>(entity: Entity, type: ComponentType<T>, value: T): this {
        return this.enqueue((world) => {
            world.addComponent(entity, type, value);
        });
    }

    /** Queues component removal. */
    removeComponent<T extends object>(entity: Entity, type: ComponentType<T>): this {
        return this.enqueue((world) => {
            world.removeComponent(entity, type);
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
    markComponentChanged<T extends object>(entity: Entity, type: ComponentType<T>): this {
        return this.enqueue((world) => {
            world.markComponentChanged(entity, type);
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

    /** Reserves an entity handle immediately, then commits it during flush. */
    private spawnWithEntries(etype: EntityType, entries: readonly AnyComponentEntry[]): Entity {
        const orderedEntries = entriesHaveDependencyChecks(entries)
            ? sortEntriesByDependencies(entries)
            : entries;
        const entity = this.runtime.reserveEntity(etype);

        this.enqueue((world) => {
            try {
                this.runtime.commitReservedEntity(entity);

                for (const entry of orderedEntries) {
                    world.addComponent(entity, entry.type, entry.value);
                }
            } catch (error) {
                if (world.isAlive(entity)) {
                    world.despawn(entity);
                } else {
                    this.runtime.releaseReservedEntity(entity);
                }

                throw error;
            }
        });

        return entity;
    }

    /** Executes the queued commands in insertion order. */
    flush(): void {
        [this.flushing, this.queue] = [this.queue, this.flushing];

        let index = 0;

        try {
            for (; index < this.flushing.length; index++) {
                this.flushing[index]!(this.world);
            }
        } catch (error) {
            const remaining = this.flushing.slice(index + 1);

            if (remaining.length > 0) {
                this.queue = [...remaining, ...this.queue];
            }

            this.flushing.length = 0;
            throw error;
        }

        this.flushing.length = 0;
    }
}
