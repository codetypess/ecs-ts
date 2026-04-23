import { Commands, type CommandRuntime } from "./commands.js";
import {
    AnyComponentEntry,
    AnyComponentType,
    assertRegisteredComponent,
    ComponentHook,
    ComponentLifecycleStage,
    ComponentType,
} from "./component.js";
import { Entity, EntityManager, formatEntity, type EntityType } from "./entity.js";
import { assertRegisteredEvent, type EventObserver, type EventType } from "./event.js";
import { runSystemWithCommands } from "./internal/command-execution.js";
import {
    createComponentHookContext,
    runComponentHooks as dispatchComponentHooks,
    addComponentHook as registerComponentHook,
    type ComponentHookContext,
} from "./internal/component-hooks.js";
import {
    createComponentOpsContext,
    remove as deleteComponent,
    despawn as despawnEntity,
    add as insertComponent,
    addValidated as insertValidatedComponent,
    markChanged as markStoredComponentChanged,
    type ComponentOpsContext,
} from "./internal/component-ops.js";
import {
    getManyComponents,
    hasAllComponents,
    hasAnyComponents,
    isComponentAdded,
    isComponentChanged,
} from "./internal/component-read.js";
import {
    createComponentStoreContext,
    type ComponentStoreContext,
} from "./internal/component-store.js";
import {
    createEntityComponentIndexContext,
    getEntityComponents,
} from "./internal/entity-component-index.js";
import {
    assertComponentDepsPresent,
    assertComponentHasNoDependents,
    assertSpawnEntriesSatisfied,
    currentEntityComponentTypes,
    entriesHaveDependencyChecks,
    sortEntriesByDependencies,
} from "./internal/component-dependencies.js";
import {
    createEventContext,
    observeEvent,
    triggerEvent,
    type EventContext,
} from "./internal/events.js";
import {
    addMessageType,
    clearMessages as clearStoredMessages,
    createMessageContext,
    drainMessages as drainStoredMessages,
    readMessages as readStoredMessages,
    updateMessages as updateStoredMessages,
    writeMessage as writeStoredMessage,
    type MessageContext,
} from "./internal/messages.js";
import type { QueryExecutorContext } from "./internal/query-executor.js";
import { createQueryPlanContext } from "./internal/query-plan.js";
import {
    createRemovedReader as createBoundRemovedReader,
    createRemovedStoreContext,
    drainRemoved as drainRemovedComponents,
    recordRemoved as recordRemovedComponent,
    type RemovedStoreContext,
} from "./internal/removed-store.js";
import {
    createResourceContext,
    getResource as getStoredResource,
    hasResource as hasStoredResource,
    isResourceAdded as isStoredResourceAdded,
    isResourceChanged as isStoredResourceChanged,
    markResourceChanged as markStoredResourceChanged,
    matchesResource as matchesStoredResource,
    removeResource as removeStoredResource,
    setResource as setStoredResource,
    type ResourceContext,
} from "./internal/resources.js";
import {
    addSystemRunner as addScheduledSystemRunner,
    configureSet as configureScheduleSet,
    configureSetForStage as configureScheduleSetForStage,
    createScheduleEngineContext,
    runFixedUpdate as runScheduledFixedUpdate,
    runSchedule as runScheduledStage,
    setFixedTimeStep as setScheduleFixedTimeStep,
    shouldRunSystem as shouldRunScheduledSystem,
    type ScheduleEngineContext,
} from "./internal/schedule-engine.js";
import { runWorldBatch, type WorldBatchRuntime } from "./internal/world-batch.js";
import {
    addStateSystem as addStateLifecycleSystem,
    addTransitionSystem as addStateTransitionSystem,
    applyStateTransitions,
    createStateMachineContext,
    currentState,
    hasState,
    initState,
    matchesState,
    onEnterState,
    onExitState,
    onTransitionState,
    runInitialEnters,
    setState,
    type StateMachineContext,
} from "./internal/state-machine.js";
import { WorldQueryMethods } from "./internal/world-query-methods.js";
import {
    assertRegisteredMessage,
    type MessageId,
    type MessageReader,
    type MessageType,
} from "./message.js";
import type { ChangeDetectionRange, ComponentTuple } from "./query.js";
import type { Registry } from "./registry.js";
import type { RemovedComponent, RemovedReader, RemovedReaderOptions } from "./removed.js";
import { assertRegisteredResource, type ResourceType } from "./resource.js";
import type {
    ScheduleStage,
    SystemCallback,
    SystemOptions,
    SystemRunner,
    SystemSetLabel,
    SystemSetOptions,
} from "./scheduler.js";
import { createSystemRunner, scheduleStageDefinitions } from "./scheduler.js";
import { assertRegisteredState, type StateType, type StateValue } from "./state.js";
import type { StateSystem, System, TransitionSystem } from "./system.js";

export { Commands } from "./commands.js";
export { OptionalQueryState, optionalQueryState, QueryState, queryState } from "./query.js";
export type {
    ComponentTuple,
    OptionalComponentTuple,
    OptionalQueryRow,
    QueryFilter,
    QueryRow,
} from "./query.js";
export { scheduleStages } from "./scheduler.js";
export type {
    ScheduleStage,
    SystemLabel,
    SystemOptions,
    SystemRunCondition,
    SystemSetLabel,
    SystemSetOptions,
} from "./scheduler.js";
export type { StateSystem, System, TransitionSystem } from "./system.js";

/** Batched structural edits that are committed together after validation succeeds. */
export interface WorldBatch {
    spawn(...entries: AnyComponentEntry[]): Entity;
    spawn(etype: EntityType, ...entries: AnyComponentEntry[]): Entity;
    addComponent<T extends object>(entity: Entity, type: ComponentType<T>, value: T): this;
    removeComponent<T extends object>(entity: Entity, type: ComponentType<T>): this;
    despawn(entity: Entity): this;
}

/**
 * Central ECS runtime.
 *
 * `World` owns entities, component storage, queries, resources, state machines,
 * schedulers, messages, and event observers.
 */
export class World extends WorldQueryMethods {
    readonly registry: Registry;
    protected readonly entities: EntityManager;
    protected readonly queryContext: QueryExecutorContext;
    private readonly componentStoreContext: ComponentStoreContext;
    private readonly resourceContext: ResourceContext;
    private readonly removedContext: RemovedStoreContext;
    private readonly componentHookContext: ComponentHookContext;
    private readonly componentContext: ComponentOpsContext;
    private readonly entityComponents = createEntityComponentIndexContext();
    private readonly commandRuntime: CommandRuntime;
    private readonly stateContext: StateMachineContext;
    private readonly eventContext: EventContext;
    private readonly messageContext: MessageContext;
    private readonly scheduleContext: ScheduleEngineContext;
    private activeChangeDetection: ChangeDetectionRange | undefined;
    private changeTick = 1;
    private didStartup = false;
    private didShutdown = false;
    private activeBatchDepth = 0;

    constructor(registry: Registry) {
        super();
        this.registry = registry;
        this.entities = new EntityManager();
        this.commandRuntime = {
            reserveEntity: (etype) => this.entities.reserve(etype),
            releaseReservedEntity: (entity) => this.entities.releaseReserved(entity),
            commitReservedEntity: (entity) => {
                this.entities.commitReserved(entity);
            },
        };
        this.componentStoreContext = createComponentStoreContext(registry);

        this.removedContext = createRemovedStoreContext({
            getChangeTick: () => this.changeTick,
        });
        this.componentHookContext = createComponentHookContext();
        this.resourceContext = createResourceContext({
            getChangeTick: () => this.changeTick,
            getChangeDetectionRange: () => this.changeDetectionRange(),
        });
        this.componentContext = createComponentOpsContext({
            entities: this.entities,
            componentStores: this.componentStoreContext,
            entityComponents: this.entityComponents,
            getChangeTick: () => this.changeTick,
            getChangeDetectionRange: () => this.changeDetectionRange(),
            runComponentHooks: (type, stage, entity, component) => {
                dispatchComponentHooks(
                    this.componentHookContext,
                    type,
                    stage,
                    entity,
                    component,
                    this
                );
            },
            recordRemoved: (type, entity, component) => {
                recordRemovedComponent(this.removedContext, type, entity, component);
            },
        });
        this.stateContext = createStateMachineContext();
        this.eventContext = createEventContext();
        this.messageContext = createMessageContext();
        this.queryContext = {
            planContext: createQueryPlanContext({
                registry,
                stores: this.componentStoreContext.stores,
                getStoreVersion: () => this.componentStoreContext.storeVersion,
            }),
        };
        this.scheduleContext = createScheduleEngineContext();
    }

    /** Creates a new entity and inserts the provided component entries immediately. */
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

    /** Returns whether the entity handle still points at a live entity. */
    isAlive(entity: Entity): boolean {
        return this.entities.isAlive(entity);
    }

    /** Returns the type assigned when the entity was created, or `undefined` for stale handles. */
    entityType(entity: Entity): EntityType | undefined {
        return this.entities.entityType(entity);
    }

    /** Stages structural edits and commits their final diff after validation succeeds. */
    batch<T>(run: (batch: WorldBatch) => T): T {
        if (this.activeBatchDepth > 0) {
            throw new Error("Nested world.batch calls are not supported");
        }

        this.activeBatchDepth++;

        try {
            return runWorldBatch(this.createWorldBatchRuntime(), run);
        } finally {
            this.activeBatchDepth--;
        }
    }

    /** Inserts or replaces a component value on a live entity. */
    addComponent<T extends object>(entity: Entity, type: ComponentType<T>, value: T): this {
        if (type.registry !== this.registry) {
            assertRegisteredComponent(this.registry, type, "add");
        }

        if (type.deps.length > 0 && this.entities.isAlive(entity)) {
            assertComponentDepsPresent(
                entity,
                type,
                currentEntityComponentTypes(
                    getEntityComponents(this.entityComponents, entity),
                    (componentId) => this.registry.componentType(componentId)
                ),
                "add"
            );
        }

        insertComponent(this.componentContext, entity, type, value);

        return this;
    }

    /** Marks an existing component as changed without replacing its value. */
    markComponentChanged<T extends object>(entity: Entity, type: ComponentType<T>): boolean {
        if (type.registry !== this.registry) {
            assertRegisteredComponent(this.registry, type, "mark changed");
        }

        return markStoredComponentChanged(this.componentContext, entity, type);
    }

    // Keep these tiny component-read helpers inlined on World.
    // Benchmarks showed that forwarding through component helpers adds measurable overhead
    // on the `world.getComponent`/`world.hasComponent` hot path, while writes and query
    // execution still share the flattened internal helpers.
    /** Returns whether the entity currently has the requested component. */
    hasComponent<T extends object>(entity: Entity, type: ComponentType<T>): boolean {
        if (type.registry !== this.registry) {
            assertRegisteredComponent(this.registry, type, "read");
        }

        return (
            this.entities.isAlive(entity) &&
            (this.componentStoreContext.stores[type.id]?.has(entity) ?? false)
        );
    }

    /** Returns whether the entity has every component in the provided list. */
    hasAllComponents(entity: Entity, types: readonly AnyComponentType[]): boolean {
        for (const type of types) {
            if (type.registry !== this.registry) {
                assertRegisteredComponent(this.registry, type, "read");
            }
        }

        return hasAllComponents(this.entities, this.componentStoreContext.stores, entity, types);
    }

    /** Returns whether the entity has at least one component in the provided list. */
    hasAnyComponents(entity: Entity, types: readonly AnyComponentType[]): boolean {
        for (const type of types) {
            if (type.registry !== this.registry) {
                assertRegisteredComponent(this.registry, type, "read");
            }
        }

        return hasAnyComponents(this.entities, this.componentStoreContext.stores, entity, types);
    }

    /** Returns the component value for the entity, or `undefined` when absent. */
    getComponent<T extends object>(entity: Entity, type: ComponentType<T>): T | undefined {
        if (type.registry !== this.registry) {
            assertRegisteredComponent(this.registry, type, "read");
        }

        if (!this.entities.isAlive(entity)) {
            return undefined;
        }

        return this.componentStoreContext.stores[type.id]?.get(entity) as T | undefined;
    }

    /** Returns the component value or throws when the entity does not have it. */
    mustGetComponent<T extends object>(entity: Entity, type: ComponentType<T>): T {
        const value = this.getComponent(entity, type);

        if (value === undefined) {
            throw new Error(`Entity ${formatEntity(entity)} does not have ${type.name}`);
        }

        return value;
    }

    /** Returns multiple component values at once, or `undefined` if any are missing. */
    getManyComponents<const TComponents extends readonly AnyComponentType[]>(
        entity: Entity,
        ...types: TComponents
    ): ComponentTuple<TComponents> | undefined {
        for (const type of types) {
            if (type.registry !== this.registry) {
                assertRegisteredComponent(this.registry, type, "read");
            }
        }

        return getManyComponents(this.entities, this.componentStoreContext.stores, entity, types);
    }

    /** Returns whether the component was added inside the current change-detection window. */
    isComponentAdded<T extends object>(entity: Entity, type: ComponentType<T>): boolean {
        if (type.registry !== this.registry) {
            assertRegisteredComponent(this.registry, type, "read");
        }

        return isComponentAdded(
            this.entities,
            this.componentStoreContext.stores,
            entity,
            type,
            this.changeDetectionRange()
        );
    }

    /** Returns whether the component changed inside the current change-detection window. */
    isComponentChanged<T extends object>(entity: Entity, type: ComponentType<T>): boolean {
        if (type.registry !== this.registry) {
            assertRegisteredComponent(this.registry, type, "read");
        }

        return isComponentChanged(
            this.entities,
            this.componentStoreContext.stores,
            entity,
            type,
            this.changeDetectionRange()
        );
    }

    /** Removes a single component and records lifecycle hooks plus removed data. */
    removeComponent<T extends object>(entity: Entity, type: ComponentType<T>): boolean {
        if (type.registry !== this.registry) {
            assertRegisteredComponent(this.registry, type, "remove");
        }

        const componentIds = getEntityComponents(this.entityComponents, entity);

        if (this.entities.isAlive(entity) && componentIds.length > 1) {
            assertComponentHasNoDependents(
                entity,
                type,
                currentEntityComponentTypes(componentIds, (componentId) =>
                    this.registry.componentType(componentId)
                ),
                "remove"
            );
        }

        return deleteComponent(this.componentContext, entity, type);
    }

    /** Removes all components from an entity, runs hooks, and destroys the entity handle. */
    despawn(entity: Entity): boolean {
        return despawnEntity(this.componentContext, entity);
    }

    /** Drains and clears the removed-component buffer for the given component type. */
    drainRemoved<TComponent extends AnyComponentType>(
        type: TComponent
    ): RemovedComponent<TComponent>[] {
        if (type.registry !== this.registry) {
            assertRegisteredComponent(this.registry, type, "read removed");
        }

        return drainRemovedComponents(this.removedContext, type);
    }

    /** Creates a removed-component reader bound to this world. */
    removedReader<TComponent extends AnyComponentType>(
        type: TComponent,
        options: RemovedReaderOptions = {}
    ): RemovedReader<TComponent> {
        if (type.registry !== this.registry) {
            assertRegisteredComponent(this.registry, type, "create removed reader");
        }

        return createBoundRemovedReader(this.removedContext, type, options);
    }

    /** Reads removed components with an independent cursor-based reader. */
    readRemoved<TComponent extends AnyComponentType>(
        reader: RemovedReader<TComponent>
    ): readonly RemovedComponent<TComponent>[] {
        return reader.read();
    }

    /** Releases a removed reader so its cursor no longer retains buffered history. */
    releaseRemovedReader<TComponent extends AnyComponentType>(
        reader: RemovedReader<TComponent>
    ): void {
        reader.close();
    }

    /** Registers every implemented lifecycle method from an object-style system. */
    addSystem(system: System, options: SystemOptions = {}): this {
        for (const { stage, systemMethod } of scheduleStageDefinitions) {
            const method = system[systemMethod];

            if (method !== undefined) {
                addScheduledSystemRunner(
                    this.scheduleContext,
                    stage,
                    createSystemRunner(method.bind(system), options)
                );
            }
        }

        return this;
    }

    /** Configures ordering and run conditions shared by all systems in a set. */
    configureSet(set: SystemSetLabel, options: SystemSetOptions): this {
        configureScheduleSet(this.scheduleContext, set, options);

        return this;
    }

    /** Configures set ordering and run conditions for one stage only. */
    configureSetForStage(
        stage: ScheduleStage,
        set: SystemSetLabel,
        options: SystemSetOptions
    ): this {
        configureScheduleSetForStage(this.scheduleContext, stage, set, options);

        return this;
    }

    /** Sets the duration used by the fixed-update accumulator. */
    setFixedTimeStep(seconds: number): this {
        setScheduleFixedTimeStep(this.scheduleContext, seconds);

        return this;
    }

    /** Advances the world by one frame, running startup once and then update schedules. */
    update(dt: number): void {
        if (this.didShutdown) {
            return;
        }

        if (!this.didStartup) {
            this.runStartupSchedules();
        }

        updateStoredMessages(this.messageContext);
        this.runUpdateSchedules(dt);
        this.changeTick++;
    }

    /** Runs shutdown systems once and ignores subsequent calls. */
    shutdown(): void {
        if (this.didShutdown) {
            return;
        }

        this.didShutdown = true;
        runScheduledStage(this.scheduleContext, "shutdown", 0, this.runSystems);
    }

    /** Creates a deferred command queue bound to this world. */
    commands(): Commands {
        return new Commands(this, this.commandRuntime);
    }

    /** Registers a message channel so it exists even before the first write. */
    addMessage<T>(type: MessageType<T>): this {
        if (type.registry !== this.registry) {
            assertRegisteredMessage(this.registry, type, "add");
        }

        addMessageType(this.messageContext, type);

        return this;
    }

    /** Writes a message into the current frame's message buffer. */
    writeMessage<T>(type: MessageType<T>, value: T): MessageId<T> {
        if (type.registry !== this.registry) {
            assertRegisteredMessage(this.registry, type, "write");
        }

        return writeStoredMessage(this.messageContext, type, value);
    }

    /** Reads unread messages for a cursor-based reader. */
    readMessages<T>(reader: MessageReader<T>): readonly T[] {
        if (reader.type.registry !== this.registry) {
            assertRegisteredMessage(this.registry, reader.type, "read");
        }

        return readStoredMessages(this.messageContext, reader);
    }

    /** Returns every buffered message for the channel and clears them. */
    drainMessages<T>(type: MessageType<T>): T[] {
        if (type.registry !== this.registry) {
            assertRegisteredMessage(this.registry, type, "drain");
        }

        return drainStoredMessages(this.messageContext, type);
    }

    /** Clears all buffered messages for the channel. */
    clearMessages<T>(type: MessageType<T>): this {
        if (type.registry !== this.registry) {
            assertRegisteredMessage(this.registry, type, "clear");
        }

        clearStoredMessages(this.messageContext, type);

        return this;
    }

    /** Registers an immediate event observer and returns an unsubscribe function. */
    observe<T>(type: EventType<T>, observer: EventObserver<T>): () => void {
        if (type.registry !== this.registry) {
            assertRegisteredEvent(this.registry, type, "observe");
        }

        return observeEvent(this.eventContext, type.id, observer);
    }

    /** Triggers an event immediately; observers run in subscription order. */
    trigger<T>(type: EventType<T>, value: T): this {
        if (type.registry !== this.registry) {
            assertRegisteredEvent(this.registry, type, "trigger");
        }

        triggerEvent(this.eventContext, type.id, value, this);
        return this;
    }

    /** Registers a component hook that runs after the component is first added. */
    onAdd<T extends object>(type: ComponentType<T>, hook: ComponentHook<T>): () => void {
        return this.onComponentHook(type, "onAdd", hook);
    }

    /** Registers a component hook that runs after every insert or replace. */
    onInsert<T extends object>(type: ComponentType<T>, hook: ComponentHook<T>): () => void {
        return this.onComponentHook(type, "onInsert", hook);
    }

    /** Registers a component hook that runs with the previous value before replacement/removal. */
    onReplace<T extends object>(type: ComponentType<T>, hook: ComponentHook<T>): () => void {
        return this.onComponentHook(type, "onReplace", hook);
    }

    /** Registers a component hook that runs when the component is removed explicitly. */
    onRemove<T extends object>(type: ComponentType<T>, hook: ComponentHook<T>): () => void {
        return this.onComponentHook(type, "onRemove", hook);
    }

    /** Registers a component hook that runs when the entity despawns. */
    onDespawn<T extends object>(type: ComponentType<T>, hook: ComponentHook<T>): () => void {
        return this.onComponentHook(type, "onDespawn", hook);
    }

    /** Registers a component hook for an arbitrary lifecycle stage. */
    onComponentHook<T extends object>(
        type: ComponentType<T>,
        stage: ComponentLifecycleStage,
        hook: ComponentHook<T>
    ): () => void {
        if (type.registry !== this.registry) {
            assertRegisteredComponent(this.registry, type, "register hook for");
        }

        return registerComponentHook(this.componentHookContext, type, stage, hook);
    }

    /** Ensures a state machine exists, using the provided initial value only on first creation. */
    initState<T extends StateValue>(type: StateType<T>, initial = type.initial): this {
        if (type.registry !== this.registry) {
            assertRegisteredState(this.registry, type, "initialize");
        }

        initState(this.stateContext, type, initial);

        return this;
    }

    /** Returns the current value of an initialized state machine. */
    state<T extends StateValue>(type: StateType<T>): T {
        if (type.registry !== this.registry) {
            assertRegisteredState(this.registry, type, "read");
        }

        return currentState(this.stateContext, type);
    }

    /** Returns whether the state machine has been initialized. */
    hasState<T extends StateValue>(type: StateType<T>): boolean {
        if (type.registry !== this.registry) {
            assertRegisteredState(this.registry, type, "read");
        }

        return hasState(this.stateContext, type);
    }

    /** Evaluates a predicate against the current state value. */
    stateMatches<T extends StateValue>(
        type: StateType<T>,
        predicate: (value: T, world: World) => boolean
    ): boolean {
        if (type.registry !== this.registry) {
            assertRegisteredState(this.registry, type, "read");
        }

        return matchesState(this.stateContext, type, predicate, this);
    }

    /** Requests a transition that will be applied during the next update cycle. */
    setState<T extends StateValue>(type: StateType<T>, next: T): this {
        if (type.registry !== this.registry) {
            assertRegisteredState(this.registry, type, "set");
        }

        setState(this.stateContext, type, next);

        return this;
    }

    /** Registers a callback that runs when the state enters the given value. */
    onEnter<T extends StateValue>(type: StateType<T>, value: T, system: SystemCallback): this {
        if (type.registry !== this.registry) {
            assertRegisteredState(this.registry, type, "register enter system for");
        }

        onEnterState(this.stateContext, type, value, system);

        return this;
    }

    /** Registers a callback that runs when the state exits the given value. */
    onExit<T extends StateValue>(type: StateType<T>, value: T, system: SystemCallback): this {
        if (type.registry !== this.registry) {
            assertRegisteredState(this.registry, type, "register exit system for");
        }

        onExitState(this.stateContext, type, value, system);

        return this;
    }

    /** Registers a callback that runs when the state transitions between two values. */
    onTransition<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: SystemCallback
    ): this {
        if (type.registry !== this.registry) {
            assertRegisteredState(this.registry, type, "register transition system for");
        }

        onTransitionState(this.stateContext, type, from, to, system);

        return this;
    }

    /** Registers object-style enter/exit callbacks for a concrete state value. */
    addStateSystem<T extends StateValue>(
        type: StateType<T>,
        value: T,
        system: StateSystem<T>
    ): this {
        if (type.registry !== this.registry) {
            assertRegisteredState(this.registry, type, "register state system for");
        }

        addStateLifecycleSystem(this.stateContext, type, value, system.onEnter, system.onExit);

        return this;
    }

    /** Registers an object-style transition callback for a concrete state pair. */
    addTransitionSystem<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: TransitionSystem<T>
    ): this {
        if (type.registry !== this.registry) {
            assertRegisteredState(this.registry, type, "register transition system for");
        }

        addStateTransitionSystem(this.stateContext, type, from, to, system.onTransition);

        return this;
    }

    /** Inserts or replaces a singleton resource. */
    setResource<T>(type: ResourceType<T>, value: T): this {
        if (type.registry !== this.registry) {
            assertRegisteredResource(this.registry, type, "set");
        }

        setStoredResource(this.resourceContext, type, value);

        return this;
    }

    /** Returns whether the resource exists. */
    hasResource<T>(type: ResourceType<T>): boolean {
        if (type.registry !== this.registry) {
            assertRegisteredResource(this.registry, type, "read");
        }

        return hasStoredResource(this.resourceContext, type);
    }

    /** Returns the resource value, or `undefined` when missing. */
    getResource<T>(type: ResourceType<T>): T | undefined {
        if (type.registry !== this.registry) {
            assertRegisteredResource(this.registry, type, "read");
        }

        return getStoredResource(this.resourceContext, type);
    }

    /** Evaluates a predicate against the current resource value. */
    resourceMatches<T>(
        type: ResourceType<T>,
        predicate: (value: T, world: World) => boolean
    ): boolean {
        if (type.registry !== this.registry) {
            assertRegisteredResource(this.registry, type, "read");
        }

        return matchesStoredResource(this.resourceContext, type, predicate, this);
    }

    /** Returns the resource value or throws when it is missing. */
    resource<T>(type: ResourceType<T>): T {
        if (type.registry !== this.registry) {
            assertRegisteredResource(this.registry, type, "read");
        }

        const resource = getStoredResource(this.resourceContext, type);

        if (resource === undefined) {
            throw new Error(`Resource not found: ${type.name}`);
        }

        return resource;
    }

    /** Removes a resource and returns the previous value, if any. */
    removeResource<T>(type: ResourceType<T>): T | undefined {
        if (type.registry !== this.registry) {
            assertRegisteredResource(this.registry, type, "remove");
        }

        return removeStoredResource(this.resourceContext, type);
    }

    /** Marks an existing resource as changed without replacing its value. */
    markResourceChanged<T>(type: ResourceType<T>): boolean {
        if (type.registry !== this.registry) {
            assertRegisteredResource(this.registry, type, "mark changed");
        }

        return markStoredResourceChanged(this.resourceContext, type);
    }

    /** Returns whether the resource was added inside the current change-detection window. */
    isResourceAdded<T>(type: ResourceType<T>): boolean {
        if (type.registry !== this.registry) {
            assertRegisteredResource(this.registry, type, "read");
        }

        return isStoredResourceAdded(this.resourceContext, type);
    }

    /** Returns whether the resource changed inside the current change-detection window. */
    isResourceChanged<T>(type: ResourceType<T>): boolean {
        if (type.registry !== this.registry) {
            assertRegisteredResource(this.registry, type, "read");
        }

        return isStoredResourceChanged(this.resourceContext, type);
    }

    private createWorldBatchRuntime(): WorldBatchRuntime {
        return {
            assertEntriesRegistered: (entries, action) => {
                this.assertEntriesRegistered(entries, action);
            },
            assertComponentRegistered: (type, action) => {
                if (type.registry !== this.registry) {
                    assertRegisteredComponent(this.registry, type, action);
                }
            },
            isAlive: (entity) => this.entities.isAlive(entity),
            reserveEntity: this.commandRuntime.reserveEntity,
            releaseReservedEntity: this.commandRuntime.releaseReservedEntity,
            commitReservedEntity: this.commandRuntime.commitReservedEntity,
            entityComponentIds: (entity) => getEntityComponents(this.entityComponents, entity),
            componentTypeById: (componentId) => this.registry.componentType(componentId),
            insertComponent: (entity, type, value) => {
                insertValidatedComponent(this.componentContext, entity, type, value);
            },
            removeComponent: (entity, type) => deleteComponent(this.componentContext, entity, type),
            despawnEntity: (entity) => despawnEntity(this.componentContext, entity),
        };
    }

    private spawnWithEntries(etype: EntityType, entries: readonly AnyComponentEntry[]): Entity {
        this.assertEntriesRegistered(entries, "spawn");
        // Validate dependency closure before creating the entity, so failed spawns leave no shell.
        const orderedEntries = entriesHaveDependencyChecks(entries)
            ? (assertSpawnEntriesSatisfied(entries), sortEntriesByDependencies(entries))
            : entries;
        const entity = this.entities.create(etype);

        for (const entry of orderedEntries) {
            insertComponent(this.componentContext, entity, entry.type, entry.value);
        }

        return entity;
    }

    private assertEntriesRegistered(entries: readonly AnyComponentEntry[], action: string): void {
        for (const entry of entries) {
            if (entry.type.registry !== this.registry) {
                assertRegisteredComponent(this.registry, entry.type, action);
            }
        }
    }

    /** Falls back to a frame-local change window when no system-specific window is active. */
    protected changeDetectionRange(): ChangeDetectionRange {
        return (
            this.activeChangeDetection ?? {
                lastRunTick: this.changeTick - 1,
                thisRunTick: this.changeTick,
            }
        );
    }

    private runStartupSchedules(): void {
        for (const stage of ["preStartup", "startup", "postStartup"] as const) {
            runScheduledStage(this.scheduleContext, stage, 0, this.runSystems);
        }

        this.didStartup = true;
    }

    private runUpdateSchedules(dt: number): void {
        runInitialEnters(this.stateContext, dt, this.runUpdateStageSystems);
        runScheduledStage(this.scheduleContext, "first", dt, this.runSystems);
        runScheduledStage(this.scheduleContext, "preUpdate", dt, this.runSystems);
        runScheduledFixedUpdate(this.scheduleContext, dt, this.runSystems);
        applyStateTransitions(this.stateContext, dt, this.runUpdateStageSystems);
        runScheduledStage(this.scheduleContext, "update", dt, this.runSystems);
        runScheduledStage(this.scheduleContext, "postUpdate", dt, this.runSystems);
        runScheduledStage(this.scheduleContext, "last", dt, this.runSystems);
    }

    private readonly runUpdateStageSystems = (
        systems: readonly SystemRunner[],
        dt: number
    ): void => {
        this.runSystems(systems, "update", dt);
    };

    /**
     * Runs systems with an isolated change-detection window per system.
     *
     * Each successful system run advances the global change tick so later systems can observe
     * structural edits and explicit `markChanged` calls from earlier systems in the same frame.
     */
    private readonly runSystems = (
        systems: readonly SystemRunner[],
        stage: ScheduleStage,
        dt: number
    ): void => {
        for (const system of systems) {
            const previousChangeDetection = this.activeChangeDetection;
            const thisRunTick = this.changeTick;

            this.activeChangeDetection = {
                lastRunTick: system.lastRunTick,
                thisRunTick,
            };

            try {
                if (!shouldRunScheduledSystem(this.scheduleContext, system, stage, this)) {
                    continue;
                }

                runSystemWithCommands(this, system, dt);
                system.lastRunTick = thisRunTick;
                this.changeTick++;
            } finally {
                this.activeChangeDetection = previousChangeDetection;
            }
        }
    };
}
