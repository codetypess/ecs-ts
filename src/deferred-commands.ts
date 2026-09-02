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
    activeEventPath(): readonly AnyEventType[];
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
    readonly eventPath: readonly AnyEventType[];
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

/**
 * World-owned deferred commands with a projected component view.
 *
 * Each managed flush executes one queue snapshot; commands produced during execution remain
 * pending for the next managed boundary.
 */
export abstract class DeferredCommands {
    /** Number of commands waiting for the next World-managed flush boundary. */
    abstract readonly pending: number;

    /**
     * Reserves an entity handle and queues its creation.
     *
     * The reserved entity is not live until the World flushes its commands, but its initial
     * components are immediately available through this command buffer's component-read methods.
     */
    abstract spawn(etype: EntityType, ...entries: AnyComponentEntry[]): Entity;

    /**
     * Queues a component insertion or replacement and returns the queued value.
     *
     * The value is immediately visible through this command buffer's component-read methods,
     * but it does not become visible through `World` or queries until a managed flush.
     */
    abstract addComponent<T extends object>(entity: Entity, type: ComponentType<T>, value: T): T;

    /** Queues component removal and immediately hides it from command-buffer reads. */
    abstract removeComponent<T extends object>(entity: Entity, type: ComponentType<T>): this;

    /** Reads a component from the projected command-buffer view, then committed World state. */
    abstract getComponent<T extends object>(entity: Entity, type: ComponentType<T>): T | undefined;

    /** Tests the projected command-buffer view overlaid on committed World state. */
    abstract hasComponent<T extends object>(entity: Entity, type: ComponentType<T>): boolean;

    /** Requires a component from the projected command-buffer view. */
    abstract mustGetComponent<T extends object>(entity: Entity, type: ComponentType<T>): T;

    /** Queues entity destruction and immediately hides its components from command-buffer reads. */
    abstract despawn(entity: Entity): this;

    /** Queues a state transition. */
    abstract setState<T extends StateValue>(type: StateType<T>, next: T): this;

    /** Queues resource insertion or replacement. */
    abstract setResource<T>(type: ResourceType<T>, value: T): this;

    /** Queues resource removal. */
    abstract removeResource<T>(type: ResourceType<T>): this;

    /** Queues a manual resource change marker. */
    abstract markResourceChanged<T>(type: ResourceType<T>): this;

    /** Queues a manual component change marker. */
    abstract markComponentChanged<T extends object>(entity: Entity, type: ComponentType<T>): this;

    /** Queues a message write. */
    abstract writeMessage<T>(type: MessageType<T>, value: T): this;

    /** Queues event dispatch for the next managed command boundary. */
    abstract trigger<T>(type: EventType<T>, value: T): this;

    /** Queues an arbitrary World callback that is not projected by component reads. */
    abstract run(command: (world: World) => void): this;
}

export interface DeferredCommandControl {
    readonly commands: DeferredCommands;
    flush(): void;
    discard(): void;
}

/** Creates the shared command buffer and its World-only execution controls. */
export function createDeferredCommands(
    world: World,
    runtime: DeferredCommandRuntime
): DeferredCommandControl {
    const commands = new WorldDeferredCommands(world, runtime);

    return {
        commands,
        flush: () => commands.flush(),
        discard: () => commands.discard(),
    };
}

class WorldDeferredCommands extends DeferredCommands {
    private queue: DeferredCommand[] = [];
    private flushing: DeferredCommand[] = [];
    private readonly pendingEntities = new Map<Entity, PendingEntityState>();
    private activeEventPath: readonly AnyEventType[] = [];

    constructor(
        private readonly world: World,
        private readonly runtime: DeferredCommandRuntime
    ) {
        super();
    }

    /** Number of commands waiting for the next World-managed boundary. */
    override get pending(): number {
        return this.queue.length;
    }

    /**
     * Queues an entity spawn using the same component-entry format as `World.spawn`.
     *
     * The reserved entity is not live until a managed boundary, but its initial components are
     * immediately available through this command buffer's component-read methods.
     */
    override spawn(etype: EntityType, ...entries: AnyComponentEntry[]): Entity {
        return this.spawnWithEntries(etype, entries);
    }

    /**
     * Queues a component insertion or replacement.
     *
     * The value is immediately visible through this command buffer's component-read methods,
     * but it does not become visible through `World` or queries until a managed boundary. The same
     * value is returned for immediate initialization.
     */
    override addComponent<T extends object>(entity: Entity, type: ComponentType<T>, value: T): T {
        this.enqueue({
            kind: "addComponent",
            entity,
            type,
            value,
        });

        return value;
    }

    /**
     * Queues component removal.
     *
     * Subsequent reads from this command buffer treat the component as absent, while direct
     * `World` reads continue to see the committed value until the next managed boundary.
     */
    override removeComponent<T extends object>(entity: Entity, type: ComponentType<T>): this {
        return this.enqueue({
            kind: "removeComponent",
            entity,
            type,
        });
    }

    /**
     * Returns the component value projected by this buffer's pending commands.
     *
     * Pending writes take precedence over committed `World` state. Components on reserved
     * spawns are readable here before commit, and pending removal or despawn returns `undefined`.
     * The projection is not validation: dependency checks and lifecycle hooks may still make
     * command execution fail.
     */
    override getComponent<T extends object>(entity: Entity, type: ComponentType<T>): T | undefined {
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
    override hasComponent<T extends object>(entity: Entity, type: ComponentType<T>): boolean {
        return this.getComponent(entity, type) !== undefined;
    }

    /** Returns the overlaid component value or throws when it is absent. */
    override mustGetComponent<T extends object>(entity: Entity, type: ComponentType<T>): T {
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
     * All component reads for the entity become absent in this buffer's pending view immediately.
     */
    override despawn(entity: Entity): this {
        return this.enqueue({
            kind: "despawn",
            entity,
        });
    }

    /** Queues a state transition request. */
    override setState<T extends StateValue>(type: StateType<T>, next: T): this {
        return this.enqueue({
            kind: "setState",
            type,
            value: next,
        });
    }

    /** Queues resource insertion or replacement. */
    override setResource<T>(type: ResourceType<T>, value: T): this {
        return this.enqueue({
            kind: "setResource",
            type,
            value,
        });
    }

    /** Queues resource removal. */
    override removeResource<T>(type: ResourceType<T>): this {
        return this.enqueue({
            kind: "removeResource",
            type,
        });
    }

    /** Queues a manual resource change marker. */
    override markResourceChanged<T>(type: ResourceType<T>): this {
        return this.enqueue({
            kind: "markResourceChanged",
            type,
        });
    }

    /**
     * Queues a manual component change marker.
     *
     * This changes only the component's detection tick during execution and does not alter the
     * component value represented by the pending view.
     */
    override markComponentChanged<T extends object>(entity: Entity, type: ComponentType<T>): this {
        return this.enqueue({
            kind: "markComponentChanged",
            entity,
            type,
        });
    }

    /** Queues a message write. */
    override writeMessage<T>(type: MessageType<T>, value: T): this {
        return this.enqueue({
            kind: "writeMessage",
            type,
            value,
        });
    }

    /** Queues event dispatch for the next managed command boundary. */
    override trigger<T>(type: EventType<T>, value: T): this {
        const eventPath =
            this.activeEventPath.length > 0 ? this.activeEventPath : this.runtime.activeEventPath();

        return this.enqueue({
            kind: "trigger",
            type,
            value,
            eventPath: [...eventPath],
        });
    }

    /** Queues an arbitrary world callback whose effects are not projected by component reads. */
    override run(command: (world: World) => void): this {
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

    /** Reserves an entity handle immediately, then commits it at a managed boundary. */
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
        if (this.queue.length === 0) {
            return;
        }

        if (this.flushing.length > 0) {
            throw new Error("Deferred command execution is not reentrant");
        }

        this.runtime.assertCanFlush();
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

    /** Drops queued work and releases entity handles reserved by uncommitted spawn commands. */
    discard(): void {
        for (const command of this.queue) {
            if (command.kind === "spawn") {
                this.runtime.releaseReservedEntity(command.entity);
            }
        }

        for (const command of this.flushing) {
            if (command.kind === "spawn") {
                this.runtime.releaseReservedEntity(command.entity);
            }
        }

        this.queue.length = 0;
        this.flushing.length = 0;
        this.pendingEntities.clear();
        this.activeEventPath = [];
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
            case "trigger": {
                const cycleStart = command.eventPath.indexOf(command.type);

                if (cycleStart !== -1) {
                    const cycle = [...command.eventPath.slice(cycleStart), command.type]
                        .map((current) => current.name)
                        .join(" -> ");

                    throw new Error(`Event dispatch cycle detected: ${cycle}`);
                }

                const previousEventPath = this.activeEventPath;
                this.activeEventPath = [...command.eventPath, command.type];

                try {
                    this.world.trigger(command.type, command.value);
                } finally {
                    this.activeEventPath = previousEventPath;
                }

                return;
            }
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
