import {
    AnyComponentEntry,
    AnyComponentType,
    assertRegisteredComponent,
    assertRegisteredComponents,
    ComponentAddReason,
    ComponentRemoveReason,
    ComponentType,
} from "./component.js";
import { DeferredCommands, type DeferredCommandRuntime } from "./deferred-commands.js";
import { Entity, formatEntity, type EntityType } from "./entity.js";
import { assertRegisteredEvent, type EventObserver, type EventType } from "./event.js";
import { runSystemWithDeferredCommands } from "./internal/command-execution.js";
import {
    assertComponentDepsPresent,
    assertComponentHasNoDependents,
    assertSpawnEntriesSatisfied,
    currentEntityComponentTypes,
    entriesHaveDependencyChecks,
    sortEntriesByDependencies,
} from "./internal/component-dependencies.js";
import {
    remove as deleteComponent,
    despawn as despawnEntity,
    add as insertComponent,
    addValidated as insertValidatedComponent,
    markChanged as markStoredComponentChanged,
} from "./internal/component-ops.js";
import {
    getManyComponents,
    hasAllComponents,
    hasAnyComponents,
    isComponentAdded,
    isComponentChanged,
} from "./internal/component-read.js";
import { createEcsContext, type EcsContext } from "./internal/ecs-context.js";
import { getEntityComponents } from "./internal/entity-component-index.js";
import {
    createEventContext,
    observeEvent,
    triggerEvent,
    type EventContext,
} from "./internal/events.js";
import {
    addMessageType,
    clearMessages as clearStoredMessages,
    createMessageReader as createBoundMessageReader,
    createMessageContext,
    drainMessages as drainStoredMessages,
    updateMessages as updateStoredMessages,
    writeMessage as writeStoredMessage,
    type MessageContext,
} from "./internal/messages.js";

import {
    getResource as getStoredResource,
    hasResource as hasStoredResource,
    isResourceAdded as isStoredResourceAdded,
    isResourceChanged as isStoredResourceChanged,
    markResourceChanged as markStoredResourceChanged,
    matchesResource as matchesStoredResource,
    removeResource as removeStoredResource,
    setResource as setStoredResource,
} from "./internal/resources.js";
import {
    addSystemRunner as addScheduledSystemRunner,
    configureSet as configureScheduleSet,
    configureSetForStage as configureScheduleSetForStage,
    createScheduleEngineContext,
    runFixedUpdate as runScheduledFixedUpdate,
    runSchedule as runScheduledStage,
    setFixedTimeStep as setScheduleFixedTimeStep,
    setMaxFixedStepsPerFrame as setScheduleMaxFixedStepsPerFrame,
    shouldRunSystem as shouldRunScheduledSystem,
    type ScheduleEngineContext,
} from "./internal/schedule-engine.js";
import {
    addStateSystem as addStateLifecycleSystem,
    addTransitionSystem as addStateTransitionSystem,
    applyStateTransitions,
    createStateMachineContext,
    currentState,
    hasState,
    initState,
    matchesState,
    runInitialEnters,
    setState,
    type StateMachineContext,
} from "./internal/state-machine.js";
import { runWorldBatch, type WorldBatch, type WorldBatchRuntime } from "./internal/world-batch.js";
import { WorldQueryMethods } from "./internal/world-query-methods.js";
import {
    assertRegisteredMessage,
    type MessageId,
    type MessageReader,
    type MessageReaderOptions,
    type MessageType,
} from "./message.js";
import type { ChangeDetectionRange, ComponentTuple } from "./query.js";
import type { Registry } from "./registry.js";

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

export { DeferredCommands } from "./deferred-commands.js";
export type { WorldBatch } from "./internal/world-batch.js";
export { optionalQueryState, queryState } from "./query.js";
export type {
    ComponentTuple,
    OptionalComponentTuple,
    OptionalQueryRow,
    OptionalQueryState,
    QueryFilter,
    QueryRow,
    QueryState,
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

/**
 * Central ECS runtime.
 *
 * `World` owns entities, component storage, queries, resources, state machines,
 * schedulers, messages, and event observers.
 */
export class World extends WorldQueryMethods {
    readonly registry: Registry;
    protected readonly ecsContext: EcsContext;
    private readonly deferredCommandRuntime: DeferredCommandRuntime;
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
        const runComponentHooks = ((type, stage, entity, componentOrPrevious, next) => {
            if (stage === "onReplace") {
                type.lifecycle.onReplace?.(
                    entity,
                    componentOrPrevious,
                    next as typeof componentOrPrevious,
                    this
                );

                return;
            }

            if (stage === "onAdd") {
                type.lifecycle.onAdd?.(
                    entity,
                    componentOrPrevious,
                    this,
                    next as ComponentAddReason
                );

                return;
            }

            if (stage === "onRemove") {
                type.lifecycle.onRemove?.(
                    entity,
                    componentOrPrevious,
                    this,
                    next as ComponentRemoveReason
                );

                return;
            }

            if (stage === "onInsert") {
                type.lifecycle.onInsert?.(entity, componentOrPrevious, this);

                return;
            }

            type.lifecycle.onUnset?.(entity, componentOrPrevious, this);
        }) as EcsContext["components"]["runComponentHooks"];
        this.ecsContext = createEcsContext({
            registry,
            getChangeTick: () => this.changeTick,
            getChangeDetectionRange: () => this.changeDetectionRange(),
            runComponentHooks,
        });
        this.deferredCommandRuntime = {
            reserveEntity: (etype) => this.ecsContext.entities.reserve(etype),
            releaseReservedEntity: (entity) => this.ecsContext.entities.releaseReserved(entity),
            commitReservedEntity: (entity) => {
                this.ecsContext.entities.commitReserved(entity);
            },
            addSpawnedComponent: (entity, type, value) => {
                this.addComponentWithReason(entity, type, value, "spawned");
            },
        };
        this.stateContext = createStateMachineContext();
        this.eventContext = createEventContext();
        this.messageContext = createMessageContext();
        this.scheduleContext = createScheduleEngineContext();
    }

    /** Creates a new entity and inserts the provided component entries immediately. */
    spawn(etype: EntityType, ...entries: AnyComponentEntry[]): Entity {
        this.assertEntriesRegistered(entries, "spawn");
        // Validate dependency closure before creating the entity, so failed spawns leave no shell.
        const orderedEntries = entriesHaveDependencyChecks(entries)
            ? (assertSpawnEntriesSatisfied(entries), sortEntriesByDependencies(entries))
            : entries;
        const entity = this.ecsContext.entities.create(etype);

        for (const entry of orderedEntries) {
            insertComponent(this.ecsContext.components, entity, entry.type, entry.value, "spawned");
        }

        return entity;
    }

    /** Returns whether the entity handle still points at a live entity. */
    isAlive(entity: Entity): boolean {
        return this.ecsContext.entities.isAlive(entity);
    }

    /** Returns the type assigned when the entity was created, or `undefined` for stale handles. */
    entityType(entity: Entity): EntityType | undefined {
        return this.ecsContext.entities.entityType(entity);
    }

    /** Iterates every currently live entity handle in storage-index order. */
    entities(): IterableIterator<Entity> {
        return this.ecsContext.entities.entities();
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
        this.addComponentWithReason(entity, type, value, "added");

        return this;
    }

    /** Marks an existing component as changed without replacing its value. */
    markComponentChanged<T extends object>(entity: Entity, type: ComponentType<T>): boolean {
        assertRegisteredComponent(this.registry, type, "mark changed");

        return markStoredComponentChanged(this.ecsContext.components, entity, type);
    }

    // Keep these tiny component-read helpers inlined on World.
    // Benchmarks showed that forwarding through component helpers adds measurable overhead
    // on the `world.getComponent`/`world.hasComponent` hot path, while writes and query
    // execution still share the flattened internal helpers.
    /** Returns whether the entity currently has the requested component. */
    hasComponent<T extends object>(entity: Entity, type: ComponentType<T>): boolean {
        assertRegisteredComponent(this.registry, type, "read");

        return (
            this.ecsContext.entities.isAlive(entity) &&
            (this.ecsContext.componentStores.stores[type.id]?.has(entity) ?? false)
        );
    }

    /** Returns whether the entity has every component in the provided list. */
    hasAllComponents(entity: Entity, types: readonly AnyComponentType[]): boolean {
        assertRegisteredComponents(this.registry, types, "read");

        return hasAllComponents(
            this.ecsContext.entities,
            this.ecsContext.componentStores.stores,
            entity,
            types
        );
    }

    /** Returns whether the entity has at least one component in the provided list. */
    hasAnyComponents(entity: Entity, types: readonly AnyComponentType[]): boolean {
        assertRegisteredComponents(this.registry, types, "read");

        return hasAnyComponents(
            this.ecsContext.entities,
            this.ecsContext.componentStores.stores,
            entity,
            types
        );
    }

    /** Returns the component value for the entity, or `undefined` when absent. */
    getComponent<T extends object>(entity: Entity, type: ComponentType<T>): T | undefined {
        assertRegisteredComponent(this.registry, type, "read");

        if (!this.ecsContext.entities.isAlive(entity)) {
            return undefined;
        }

        return this.ecsContext.componentStores.stores[type.id]?.get(entity) as T | undefined;
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
        assertRegisteredComponents(this.registry, types, "read");

        return getManyComponents(
            this.ecsContext.entities,
            this.ecsContext.componentStores.stores,
            entity,
            types
        );
    }

    /** Returns whether the component was added inside the current change-detection window. */
    isComponentAdded<T extends object>(entity: Entity, type: ComponentType<T>): boolean {
        assertRegisteredComponent(this.registry, type, "read");

        return isComponentAdded(
            this.ecsContext.entities,
            this.ecsContext.componentStores.stores,
            entity,
            type,
            this.changeDetectionRange()
        );
    }

    /** Returns whether the component changed inside the current change-detection window. */
    isComponentChanged<T extends object>(entity: Entity, type: ComponentType<T>): boolean {
        assertRegisteredComponent(this.registry, type, "read");

        return isComponentChanged(
            this.ecsContext.entities,
            this.ecsContext.componentStores.stores,
            entity,
            type,
            this.changeDetectionRange()
        );
    }

    /** Removes a single component and records lifecycle hooks plus removed data. */
    removeComponent<T extends object>(entity: Entity, type: ComponentType<T>): boolean {
        assertRegisteredComponent(this.registry, type, "remove");

        const componentIds = getEntityComponents(this.ecsContext.entityComponents, entity);

        if (this.ecsContext.entities.isAlive(entity) && componentIds.length > 1) {
            assertComponentHasNoDependents(
                entity,
                type,
                currentEntityComponentTypes(componentIds, (componentId) =>
                    this.registry.componentType(componentId)
                ),
                "remove"
            );
        }

        return deleteComponent(this.ecsContext.components, entity, type);
    }

    /** Removes all components from an entity, runs hooks, and destroys the entity handle. */
    despawn(entity: Entity): boolean {
        return despawnEntity(this.ecsContext.components, entity);
    }

    /** Registers an object-style system or a callback for one schedule stage. */
    addSystem(system: System, options?: SystemOptions): this;
    addSystem(stage: ScheduleStage, system: SystemCallback, options?: SystemOptions): this;
    addSystem(
        systemOrStage: System | ScheduleStage,
        optionsOrSystem: SystemOptions | SystemCallback = {},
        maybeOptions: SystemOptions = {}
    ): this {
        if (typeof systemOrStage === "string") {
            addScheduledSystemRunner(
                this.scheduleContext,
                systemOrStage,
                createSystemRunner(optionsOrSystem as SystemCallback, maybeOptions)
            );

            return this;
        }

        const system = systemOrStage;
        const options = optionsOrSystem as SystemOptions;

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

    /** Sets the maximum number of fixed-update steps run per frame before excess time is dropped. */
    setMaxFixedStepsPerFrame(maxSteps: number): this {
        setScheduleMaxFixedStepsPerFrame(this.scheduleContext, maxSteps);

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
    commands(): DeferredCommands {
        return new DeferredCommands(this, this.deferredCommandRuntime);
    }

    /** Registers a message channel so it exists even before the first write. */
    addMessage<T>(type: MessageType<T>): this {
        assertRegisteredMessage(this.registry, type, "add");

        addMessageType(this.messageContext, type);

        return this;
    }

    /** Writes a message into the current frame's message buffer. */
    writeMessage<T>(type: MessageType<T>, value: T): MessageId<T> {
        assertRegisteredMessage(this.registry, type, "write");

        return writeStoredMessage(this.messageContext, type, value);
    }

    /** Creates a message reader bound to this world. */
    messageReader<T>(type: MessageType<T>, options: MessageReaderOptions = {}): MessageReader<T> {
        assertRegisteredMessage(this.registry, type, "create message reader");

        return createBoundMessageReader(this.messageContext, type, options);
    }

    /** Returns every buffered message for the channel and clears them. */
    drainMessages<T>(type: MessageType<T>): T[] {
        assertRegisteredMessage(this.registry, type, "drain");

        return drainStoredMessages(this.messageContext, type);
    }

    /** Clears all buffered messages for the channel. */
    clearMessages<T>(type: MessageType<T>): this {
        assertRegisteredMessage(this.registry, type, "clear");

        clearStoredMessages(this.messageContext, type);

        return this;
    }

    /** Registers an immediate event observer and returns an unsubscribe function. */
    observe<T>(type: EventType<T>, observer: EventObserver<T>): () => void {
        assertRegisteredEvent(this.registry, type, "observe");

        return observeEvent(this.eventContext, type.id, observer);
    }

    /** Triggers an event immediately; observers run in subscription order. */
    trigger<T>(type: EventType<T>, value: T): this {
        assertRegisteredEvent(this.registry, type, "trigger");

        triggerEvent(this.eventContext, type.id, value, this);
        return this;
    }

    /** Ensures a state machine exists, using the provided initial value only on first creation. */
    initState<T extends StateValue>(type: StateType<T>, initial = type.initial): this {
        assertRegisteredState(this.registry, type, "initialize");

        initState(this.stateContext, type, initial);

        return this;
    }

    /** Returns the current value when the state machine has been initialized. */
    getState<T extends StateValue>(type: StateType<T>): T | undefined {
        assertRegisteredState(this.registry, type, "read");

        return hasState(this.stateContext, type)
            ? currentState(this.stateContext, type)
            : undefined;
    }

    /** Returns the current value of an initialized state machine. */
    mustGetState<T extends StateValue>(type: StateType<T>): T {
        assertRegisteredState(this.registry, type, "read");

        return currentState(this.stateContext, type);
    }

    /** Returns whether the state machine has been initialized. */
    hasState<T extends StateValue>(type: StateType<T>): boolean {
        assertRegisteredState(this.registry, type, "read");

        return hasState(this.stateContext, type);
    }

    /** Evaluates a predicate against the current state value. */
    stateMatches<T extends StateValue>(
        type: StateType<T>,
        predicate: (value: T, world: World) => boolean
    ): boolean {
        assertRegisteredState(this.registry, type, "read");

        return matchesState(this.stateContext, type, predicate, this);
    }

    /** Requests a transition that will be applied during the next update cycle. */
    setState<T extends StateValue>(type: StateType<T>, next: T): this {
        assertRegisteredState(this.registry, type, "set");

        setState(this.stateContext, type, next);

        return this;
    }

    /** Registers object-style enter/exit callbacks for a concrete state value. */
    addStateSystem<T extends StateValue>(
        type: StateType<T>,
        value: T,
        system: StateSystem<T>
    ): this {
        assertRegisteredState(this.registry, type, "register state system for");

        addStateLifecycleSystem(this.stateContext, type, value, system);

        return this;
    }

    /** Registers an object-style callback that observes every transition for a state type. */
    addTransitionSystem<T extends StateValue>(
        type: StateType<T>,
        system: TransitionSystem<T>
    ): this {
        assertRegisteredState(this.registry, type, "register transition system for");

        addStateTransitionSystem(this.stateContext, type, system);

        return this;
    }

    /** Inserts or replaces a singleton resource. */
    setResource<T>(type: ResourceType<T>, value: T): this {
        assertRegisteredResource(this.registry, type, "set");

        setStoredResource(this.ecsContext.resources, type, value);

        return this;
    }

    /** Returns whether the resource exists. */
    hasResource<T>(type: ResourceType<T>): boolean {
        assertRegisteredResource(this.registry, type, "read");

        return hasStoredResource(this.ecsContext.resources, type);
    }

    /** Returns the resource value, or `undefined` when missing. */
    getResource<T>(type: ResourceType<T>): T | undefined {
        assertRegisteredResource(this.registry, type, "read");

        return getStoredResource(this.ecsContext.resources, type);
    }

    /** Evaluates a predicate against the current resource value. */
    resourceMatches<T>(
        type: ResourceType<T>,
        predicate: (value: T, world: World) => boolean
    ): boolean {
        assertRegisteredResource(this.registry, type, "read");

        return matchesStoredResource(this.ecsContext.resources, type, predicate, this);
    }

    /** Returns the resource value or throws when it is missing. */
    mustGetResource<T>(type: ResourceType<T>): T {
        assertRegisteredResource(this.registry, type, "read");

        const resource = getStoredResource(this.ecsContext.resources, type);

        if (resource === undefined) {
            throw new Error(`Resource not found: ${type.name}`);
        }

        return resource;
    }

    /** Removes a resource and returns the previous value, if any. */
    removeResource<T>(type: ResourceType<T>): T | undefined {
        assertRegisteredResource(this.registry, type, "remove");

        return removeStoredResource(this.ecsContext.resources, type);
    }

    /** Marks an existing resource as changed without replacing its value. */
    markResourceChanged<T>(type: ResourceType<T>): boolean {
        assertRegisteredResource(this.registry, type, "mark changed");

        return markStoredResourceChanged(this.ecsContext.resources, type);
    }

    /** Returns whether the resource was added inside the current change-detection window. */
    isResourceAdded<T>(type: ResourceType<T>): boolean {
        assertRegisteredResource(this.registry, type, "read");

        return isStoredResourceAdded(this.ecsContext.resources, type);
    }

    /** Returns whether the resource changed inside the current change-detection window. */
    isResourceChanged<T>(type: ResourceType<T>): boolean {
        assertRegisteredResource(this.registry, type, "read");

        return isStoredResourceChanged(this.ecsContext.resources, type);
    }

    private createWorldBatchRuntime(): WorldBatchRuntime {
        return {
            assertEntriesRegistered: (entries, action) => {
                this.assertEntriesRegistered(entries, action);
            },
            assertComponentRegistered: (type, action) => {
                assertRegisteredComponent(this.registry, type, action);
            },
            isAlive: (entity) => this.ecsContext.entities.isAlive(entity),
            reserveEntity: this.deferredCommandRuntime.reserveEntity,
            releaseReservedEntity: this.deferredCommandRuntime.releaseReservedEntity,
            commitReservedEntity: this.deferredCommandRuntime.commitReservedEntity,
            entityComponentIds: (entity) =>
                getEntityComponents(this.ecsContext.entityComponents, entity),
            componentTypeById: (componentId) => this.registry.componentType(componentId),
            insertComponent: (entity, type, value, reason) => {
                insertValidatedComponent(this.ecsContext.components, entity, type, value, reason);
            },
            removeComponent: (entity, type) =>
                deleteComponent(this.ecsContext.components, entity, type),
            despawnEntity: (entity) => despawnEntity(this.ecsContext.components, entity),
        };
    }

    private addComponentWithReason<T extends object>(
        entity: Entity,
        type: ComponentType<T>,
        value: T,
        reason: ComponentAddReason
    ): void {
        assertRegisteredComponent(this.registry, type, "add");

        if (type.deps.length > 0 && this.ecsContext.entities.isAlive(entity)) {
            assertComponentDepsPresent(
                entity,
                type,
                currentEntityComponentTypes(
                    getEntityComponents(this.ecsContext.entityComponents, entity),
                    (componentId) => this.registry.componentType(componentId)
                ),
                "add"
            );
        }

        insertComponent(this.ecsContext.components, entity, type, value, reason);
    }

    private assertEntriesRegistered(entries: readonly AnyComponentEntry[], action: string): void {
        for (const entry of entries) {
            assertRegisteredComponent(this.registry, entry.type, action);
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

                runSystemWithDeferredCommands(this, system, dt);
                system.lastRunTick = thisRunTick;
                this.changeTick++;
            } finally {
                this.activeChangeDetection = previousChangeDetection;
            }
        }
    };
}
