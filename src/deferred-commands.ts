import type { AnyComponentEntry, AnyComponentType, ComponentType } from "./component";
import { formatEntity, type Entity, type EntityType } from "./entity";
import type { AnyEventType, EventType } from "./event";
import {
    entriesHaveDependencyChecks,
    sortEntriesByDependencies,
} from "./internal/component-dependencies";
import type { AnyMessageType, MessageType } from "./message";
import type { AnyResourceType, ResourceType } from "./resource";
import type { AnyStateType, StateType, StateValue } from "./state";
import type { World } from "./world";

export interface DeferredCommandRuntime {
    reserveEntity(etype: EntityType): Entity;
    commitReservedEntity(entity: Entity): void;
    releaseReservedEntity(entity: Entity): boolean;
    addSpawnedComponent<T extends object>(entity: Entity, type: ComponentType<T>, value: T): void;
    assertCanFlush(): void;
}

interface SpawnCommand {
    readonly kind: "spawn";
    readonly entity: Entity;
    readonly entries: readonly AnyComponentEntry[];
}

interface AddComponentCommand {
    readonly kind: "addComponent";
    readonly entity: Entity;
    readonly type: AnyComponentType;
    readonly value: object;
}

interface RemoveComponentCommand {
    readonly kind: "removeComponent";
    readonly entity: Entity;
    readonly type: AnyComponentType;
}

interface DespawnCommand {
    readonly kind: "despawn";
    readonly entity: Entity;
}

interface SetStateCommand {
    readonly kind: "setState";
    readonly type: AnyStateType;
    readonly value: StateValue;
}

interface SetResourceCommand {
    readonly kind: "setResource";
    readonly type: AnyResourceType;
    readonly value: unknown;
}

interface RemoveResourceCommand {
    readonly kind: "removeResource";
    readonly type: AnyResourceType;
}

interface MarkResourceChangedCommand {
    readonly kind: "markResourceChanged";
    readonly type: AnyResourceType;
}

interface MarkComponentChangedCommand {
    readonly kind: "markComponentChanged";
    readonly entity: Entity;
    readonly type: AnyComponentType;
}

interface WriteMessageCommand {
    readonly kind: "writeMessage";
    readonly type: AnyMessageType;
    readonly value: unknown;
}

interface TriggerCommand {
    readonly kind: "trigger";
    readonly type: AnyEventType;
    readonly value: unknown;
}

interface RunCommand {
    readonly kind: "run";
    readonly callback: (world: World) => void;
}

type DeferredCommand =
    | SpawnCommand
    | AddComponentCommand
    | RemoveComponentCommand
    | DespawnCommand
    | SetStateCommand
    | SetResourceCommand
    | RemoveResourceCommand
    | MarkResourceChangedCommand
    | MarkComponentChangedCommand
    | WriteMessageCommand
    | TriggerCommand
    | RunCommand;

const REMOVED_COMPONENT = Symbol("removed component");

interface PendingEntityState {
    spawned: boolean;
    despawned: boolean;
    readonly components: Map<AnyComponentType, object | typeof REMOVED_COMPONENT>;
}

/** Deferred world commands with a projected component view, flushed after a system or observer. */
export class DeferredCommands {
    private queue: DeferredCommand[] = [];
    private flushing: DeferredCommand[] = [];
    private readonly pendingEntities = new Map<Entity, PendingEntityState>();

    constructor(
        private readonly world: World,
        private readonly runtime: DeferredCommandRuntime
    ) {}

    /** Number of queued commands waiting to be flushed. */
    get pending(): number {
        return this.queue.length;
    }

    /**
     * Queues an entity spawn using the same component-entry format as `World.spawn`.
     *
     * The reserved entity is not live until flush, but its initial components are immediately
     * available through this command queue's component-read methods.
     */
    spawn(etype: EntityType, ...entries: AnyComponentEntry[]): Entity {
        return this.spawnWithEntries(etype, entries);
    }

    /**
     * Queues a component insertion or replacement.
     *
     * The value is immediately visible through this command queue's component-read methods,
     * but it does not become visible through `World` or queries until a successful flush.
     */
    addComponent<T extends object>(entity: Entity, type: ComponentType<T>, value: T): this {
        return this.enqueue({
            kind: "addComponent",
            entity,
            type,
            value,
        });
    }

    /**
     * Queues component removal.
     *
     * Subsequent reads from this command queue treat the component as absent, while direct
     * `World` reads continue to see the committed value until flush.
     */
    removeComponent<T extends object>(entity: Entity, type: ComponentType<T>): this {
        return this.enqueue({
            kind: "removeComponent",
            entity,
            type,
        });
    }

    /**
     * Returns the component value projected by this queue's pending commands.
     *
     * Pending writes take precedence over committed `World` state. Components on reserved
     * spawns are readable here before flush, and pending removal or despawn returns `undefined`.
     * The projection is not validation: dependency checks and lifecycle hooks may still make
     * flush fail.
     */
    getComponent<T extends object>(entity: Entity, type: ComponentType<T>): T | undefined {
        const pending = this.pendingEntities.get(entity);

        if (pending !== undefined) {
            if (pending.despawned) {
                return undefined;
            }

            if (pending.components.has(type)) {
                const value = pending.components.get(type);
                return value === REMOVED_COMPONENT ? undefined : (value as T);
            }

            if (pending.spawned) {
                return undefined;
            }
        }

        return this.world.getComponent(entity, type);
    }

    /** Returns whether the component exists after pending commands overlay committed World state. */
    hasComponent<T extends object>(entity: Entity, type: ComponentType<T>): boolean {
        return this.getComponent(entity, type) !== undefined;
    }

    /** Returns the overlaid component value or throws when it is absent. */
    mustGetComponent<T extends object>(entity: Entity, type: ComponentType<T>): T {
        const value = this.getComponent(entity, type);

        if (value === undefined) {
            throw new Error(
                `Entity ${formatEntity(entity)} does not have ${type.name} in deferred command view`
            );
        }

        return value;
    }

    /**
     * Queues entity despawn.
     *
     * All component reads for the entity become absent in this queue's pending view immediately.
     */
    despawn(entity: Entity): this {
        return this.enqueue({
            kind: "despawn",
            entity,
        });
    }

    /** Queues a state transition request. */
    setState<T extends StateValue>(type: StateType<T>, next: T): this {
        return this.enqueue({
            kind: "setState",
            type,
            value: next,
        });
    }

    /** Queues resource insertion or replacement. */
    setResource<T>(type: ResourceType<T>, value: T): this {
        return this.enqueue({
            kind: "setResource",
            type,
            value,
        });
    }

    /** Queues resource removal. */
    removeResource<T>(type: ResourceType<T>): this {
        return this.enqueue({
            kind: "removeResource",
            type,
        });
    }

    /** Queues a manual resource change marker. */
    markResourceChanged<T>(type: ResourceType<T>): this {
        return this.enqueue({
            kind: "markResourceChanged",
            type,
        });
    }

    /**
     * Queues a manual component change marker.
     *
     * This changes only the component's detection tick during flush and does not alter the
     * component value represented by the pending view.
     */
    markComponentChanged<T extends object>(entity: Entity, type: ComponentType<T>): this {
        return this.enqueue({
            kind: "markComponentChanged",
            entity,
            type,
        });
    }

    /** Queues a message write. */
    writeMessage<T>(type: MessageType<T>, value: T): this {
        return this.enqueue({
            kind: "writeMessage",
            type,
            value,
        });
    }

    /** Queues an immediate event trigger to run after the current command batch flushes. */
    trigger<T>(type: EventType<T>, value: T): this {
        return this.enqueue({
            kind: "trigger",
            type,
            value,
        });
    }

    /** Queues an arbitrary world callback whose effects are not projected by component reads. */
    run(command: (world: World) => void): this {
        return this.enqueue({
            kind: "run",
            callback: command,
        });
    }

    private enqueue(command: DeferredCommand): this {
        this.queue.push(command);
        this.applyToPendingView(command);

        return this;
    }

    /** Reserves an entity handle immediately, then commits it during flush. */
    private spawnWithEntries(etype: EntityType, entries: readonly AnyComponentEntry[]): Entity {
        const orderedEntries = entriesHaveDependencyChecks(entries)
            ? sortEntriesByDependencies(entries)
            : entries;
        const entity = this.runtime.reserveEntity(etype);

        this.enqueue({
            kind: "spawn",
            entity,
            entries: orderedEntries,
        });

        return entity;
    }

    /** Executes queued commands in insertion order and rebuilds the view for commands left over. */
    flush(): void {
        if (this.queue.length > 0) {
            this.runtime.assertCanFlush();
        }
        [this.flushing, this.queue] = [this.queue, this.flushing];

        let index = 0;

        try {
            for (; index < this.flushing.length; index++) {
                this.executeCommand(this.flushing[index]!);
            }
        } catch (error) {
            const remaining = this.flushing.slice(index + 1);

            if (remaining.length > 0) {
                this.queue = [...remaining, ...this.queue];
            }

            this.flushing.length = 0;
            this.rebuildPendingView();
            throw error;
        }

        this.flushing.length = 0;
        this.rebuildPendingView();
    }

    private executeCommand(command: DeferredCommand): void {
        switch (command.kind) {
            case "spawn":
                this.executeSpawn(command);
                return;
            case "addComponent":
                this.world.addComponent(command.entity, command.type, command.value);
                return;
            case "removeComponent":
                this.world.removeComponent(command.entity, command.type);
                return;
            case "despawn":
                this.world.despawn(command.entity);
                return;
            case "setState":
                this.world.setState(command.type, command.value);
                return;
            case "setResource":
                this.world.setResource(command.type, command.value);
                return;
            case "removeResource":
                this.world.removeResource(command.type);
                return;
            case "markResourceChanged":
                this.world.markResourceChanged(command.type);
                return;
            case "markComponentChanged":
                this.world.markComponentChanged(command.entity, command.type);
                return;
            case "writeMessage":
                this.world.writeMessage(command.type, command.value);
                return;
            case "trigger":
                this.world.trigger(command.type, command.value);
                return;
            case "run":
                command.callback(this.world);
                return;
        }
    }

    private executeSpawn(command: SpawnCommand): void {
        try {
            this.runtime.commitReservedEntity(command.entity);

            for (const entry of command.entries) {
                this.runtime.addSpawnedComponent(command.entity, entry.type, entry.value);
            }
        } catch (error) {
            if (this.world.isAlive(command.entity)) {
                this.world.despawn(command.entity);
            } else {
                this.runtime.releaseReservedEntity(command.entity);
            }

            throw error;
        }
    }

    private applyToPendingView(command: DeferredCommand): void {
        switch (command.kind) {
            case "spawn": {
                const pending = this.ensurePendingEntity(command.entity);
                pending.spawned = true;
                pending.despawned = false;

                for (const entry of command.entries) {
                    pending.components.set(entry.type, entry.value);
                }
                return;
            }
            case "addComponent": {
                const pending = this.ensurePendingEntity(command.entity);
                pending.components.set(command.type, command.value);
                return;
            }
            case "removeComponent": {
                const pending = this.ensurePendingEntity(command.entity);
                pending.components.set(command.type, REMOVED_COMPONENT);
                return;
            }
            case "despawn": {
                const pending = this.ensurePendingEntity(command.entity);
                pending.despawned = true;
                return;
            }
            default:
                return;
        }
    }

    private ensurePendingEntity(entity: Entity): PendingEntityState {
        let pending = this.pendingEntities.get(entity);

        if (pending === undefined) {
            pending = {
                spawned: false,
                despawned: false,
                components: new Map(),
            };
            this.pendingEntities.set(entity, pending);
        }

        return pending;
    }

    private rebuildPendingView(): void {
        this.pendingEntities.clear();

        for (const command of this.queue) {
            this.applyToPendingView(command);
        }
    }
}
