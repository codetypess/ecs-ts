import {
    assertRegisteredComponent,
    assertRegisteredComponents,
    AnyComponentType,
    Bundle,
    ComponentEntry,
    ComponentHook,
    ComponentLifecycleStage,
    ComponentRegistry,
    ComponentType,
} from "./component";
import { Commands } from "./commands";
import { Entity, formatEntity } from "./entity";
import type { EventObserver, EventType } from "./event";
import {
    add as addComponent,
    despawn as despawnEntity,
    insertBundle as insertComponentBundle,
    markChanged as markComponentChanged,
    remove as removeComponent,
    removeBundle as removeComponentBundle,
} from "./internal/component-ops";
import {
    getManyComponents,
    hasAllComponents,
    hasAnyComponents,
    isComponentAdded,
    isComponentChanged,
} from "./internal/component-read";
import { addComponentHook as registerComponentHook } from "./internal/component-hooks";
import { runSystemWithCommands } from "./internal/command-execution";
import { observeEvent, triggerEvent } from "./internal/events";
import {
    addMessageType,
    clearMessages as clearStoredMessages,
    drainMessages as drainStoredMessages,
    readMessages as readStoredMessages,
    writeMessage as writeStoredMessage,
} from "./internal/messages";
import {
    createRemovedReader as createBoundRemovedReader,
    drainRemoved as drainRemovedComponents,
} from "./internal/removed-store";
import {
    getResource as getStoredResource,
    hasResource as hasStoredResource,
    isResourceAdded as isStoredResourceAdded,
    isResourceChanged as isStoredResourceChanged,
    markResourceChanged as markStoredResourceChanged,
    matchesResource as matchesStoredResource,
    removeResource as removeStoredResource,
    setResource as setStoredResource,
} from "./internal/resources";
import {
    configureSet as configureScheduleSet,
    configureSetForStage as configureScheduleSetForStage,
    setFixedTimeStep as setScheduleFixedTimeStep,
    shouldRunSystem as shouldRunScheduledSystem,
} from "./internal/schedule-engine";
import {
    addStateSystem as addStateLifecycleSystem,
    addTransitionSystem as addStateTransitionSystem,
    currentState,
    hasState,
    initState,
    matchesState,
    onEnterState,
    onExitState,
    onTransitionState,
    setState,
} from "./internal/state-machine";
import * as worldQueries from "./internal/world-queries-api";
import * as worldSchedule from "./internal/world-schedule-api";
import {
    createWorldRuntime,
    currentChangeDetectionRange,
    type WorldRuntime,
} from "./internal/world-runtime";
import type { MessageId, MessageReader, MessageType } from "./message";
import type {
    ChangeDetectionRange,
    ComponentTuple,
    OptionalComponentTuple,
    OptionalQueryRow,
    OptionalQueryState,
    QueryFilter,
    QueryRow,
    QueryState,
} from "./query";
import { optionalQueryState, queryState } from "./query";
import type { RemovedComponent, RemovedReader, RemovedReaderOptions } from "./removed";
import type { ResourceType } from "./resource";
import type {
    ScheduleStage,
    SystemCallback,
    SystemOptions,
    SystemRunner,
    SystemSetLabel,
    SystemSetOptions,
} from "./scheduler";
import type { StateType, StateValue } from "./state";
import type { StateSystem, System, TransitionSystem } from "./system";

export { OptionalQueryState, optionalQueryState, QueryState, queryState } from "./query";
export { Commands } from "./commands";
export type {
    ComponentTuple,
    OptionalComponentTuple,
    OptionalQueryRow,
    QueryFilter,
    QueryRow,
} from "./query";
export { scheduleStages } from "./scheduler";
export type {
    ScheduleStage,
    SystemLabel,
    SystemOptions,
    SystemRunCondition,
    SystemSetLabel,
    SystemSetOptions,
} from "./scheduler";
export type { StateSystem, System, TransitionSystem } from "./system";

/**
 * Central ECS runtime.
 *
 * `World` owns entities, component storage, queries, resources, state machines,
 * schedulers, messages, and event observers.
 */
export class World {
    private readonly runScheduledSystems = (
        systems: readonly SystemRunner[],
        stage: ScheduleStage,
        dt: number
    ): void => {
        this.runSystems(systems, stage, dt);
    };
    private readonly runUpdateStageSystems = (
        systems: readonly SystemRunner[],
        dt: number
    ): void => {
        this.runSystems(systems, "update", dt);
    };
    readonly registry: ComponentRegistry;
    private readonly runtime: WorldRuntime;

    constructor(registry: ComponentRegistry) {
        this.registry = registry;
        this.runtime = createWorldRuntime(this, registry);
    }

    /** Creates a new entity and inserts the provided component entries immediately. */
    spawn(...entries: ComponentEntry<unknown>[]): Entity {
        return this.spawnBundle({ entries, registry: entries[0]?.type.registry });
    }

    /** Creates a new entity and inserts a reusable bundle into it. */
    spawnBundle(bundle: Bundle): Entity {
        this.assertBundleRegistered(bundle, "spawn");
        const entity = this.runtime.entities.create();
        this.insertBundle(entity, bundle);

        return entity;
    }

    /** Inserts or replaces every component entry from the bundle on an existing entity. */
    insertBundle(entity: Entity, bundle: Bundle): this {
        this.assertBundleRegistered(bundle, "insert");
        insertComponentBundle(this.runtime.componentContext, entity, bundle);

        return this;
    }

    /** Removes every component listed by the bundle and returns whether any removal happened. */
    removeBundle(entity: Entity, bundle: Bundle): boolean {
        this.assertBundleRegistered(bundle, "remove");
        return removeComponentBundle(this.runtime.componentContext, entity, bundle);
    }

    /** Returns whether the entity handle still points at a live entity. */
    isAlive(entity: Entity): boolean {
        return this.runtime.entities.isAlive(entity);
    }

    /** Inserts or replaces a component value on a live entity. */
    add<T>(entity: Entity, type: ComponentType<T>, value: T): this {
        assertRegisteredComponent(this.registry, type, "add");
        addComponent(this.runtime.componentContext, entity, type, value);

        return this;
    }

    /** Marks an existing component as changed without replacing its value. */
    markChanged<T>(entity: Entity, type: ComponentType<T>): boolean {
        assertRegisteredComponent(this.registry, type, "mark changed");
        return markComponentChanged(this.runtime.componentContext, entity, type);
    }

    // Keep these tiny component-read helpers inlined on World.
    // Benchmarks showed that forwarding through component helpers adds measurable overhead
    // on the `world.get`/`world.has` hot path, while writes and query execution still share
    // the flattened internal helpers.
    /** Returns whether the entity currently has the requested component. */
    has<T>(entity: Entity, type: ComponentType<T>): boolean {
        assertRegisteredComponent(this.registry, type, "read");

        return (
            this.runtime.entities.isAlive(entity) &&
            (this.runtime.componentStoreContext.stores[type.id]?.has(entity) ?? false)
        );
    }

    /** Returns whether the entity has every component in the provided list. */
    hasAll(entity: Entity, types: readonly AnyComponentType[]): boolean {
        assertRegisteredComponents(this.registry, types, "read");
        return hasAllComponents(
            this.runtime.entities,
            this.runtime.componentStoreContext.stores,
            entity,
            types
        );
    }

    /** Returns whether the entity has at least one component in the provided list. */
    hasAny(entity: Entity, types: readonly AnyComponentType[]): boolean {
        assertRegisteredComponents(this.registry, types, "read");
        return hasAnyComponents(
            this.runtime.entities,
            this.runtime.componentStoreContext.stores,
            entity,
            types
        );
    }

    /** Returns the component value for the entity, or `undefined` when absent. */
    get<T>(entity: Entity, type: ComponentType<T>): T | undefined {
        assertRegisteredComponent(this.registry, type, "read");

        if (!this.runtime.entities.isAlive(entity)) {
            return undefined;
        }

        return this.runtime.componentStoreContext.stores[type.id]?.get(entity) as T | undefined;
    }

    /** Returns the component value or throws when the entity does not have it. */
    mustGet<T>(entity: Entity, type: ComponentType<T>): T {
        const value = this.get(entity, type);

        if (value === undefined) {
            throw new Error(`Entity ${formatEntity(entity)} does not have ${type.name}`);
        }

        return value;
    }

    /** Returns multiple component values at once, or `undefined` if any are missing. */
    getMany<const TComponents extends readonly AnyComponentType[]>(
        entity: Entity,
        ...types: TComponents
    ): ComponentTuple<TComponents> | undefined {
        assertRegisteredComponents(this.registry, types, "read");
        return getManyComponents(
            this.runtime.entities,
            this.runtime.componentStoreContext.stores,
            entity,
            types
        );
    }

    /** Returns whether the component was added inside the current change-detection window. */
    isAdded<T>(entity: Entity, type: ComponentType<T>): boolean {
        assertRegisteredComponent(this.registry, type, "read");
        return isComponentAdded(
            this.runtime.entities,
            this.runtime.componentStoreContext.stores,
            entity,
            type,
            this.changeDetectionRange()
        );
    }

    /** Returns whether the component changed inside the current change-detection window. */
    isChanged<T>(entity: Entity, type: ComponentType<T>): boolean {
        assertRegisteredComponent(this.registry, type, "read");
        return isComponentChanged(
            this.runtime.entities,
            this.runtime.componentStoreContext.stores,
            entity,
            type,
            this.changeDetectionRange()
        );
    }

    /** Removes a single component and records lifecycle hooks plus removed data. */
    remove<T>(entity: Entity, type: ComponentType<T>): boolean {
        assertRegisteredComponent(this.registry, type, "remove");
        return removeComponent(this.runtime.componentContext, entity, type);
    }

    /** Removes all components from an entity, runs hooks, and destroys the entity handle. */
    despawn(entity: Entity): boolean {
        return despawnEntity(this.runtime.componentContext, entity);
    }

    /** Iterates entities that contain all requested component types. */
    query<const TComponents extends readonly AnyComponentType[]>(
        ...types: TComponents
    ): IterableIterator<QueryRow<TComponents>> {
        return worldQueries.query(this.runtime, types);
    }

    /** Iterates entities that match the requested components plus an explicit filter. */
    queryWhere<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter
    ): IterableIterator<QueryRow<TComponents>> {
        return worldQueries.queryWhere(this.runtime, types, filter);
    }

    /** Iterates entities where at least one requested component was newly added. */
    queryAdded<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents
    ): IterableIterator<QueryRow<TComponents>> {
        return worldQueries.queryAdded(this.runtime, types);
    }

    /** Iterates entities where at least one requested component changed recently. */
    queryChanged<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents
    ): IterableIterator<QueryRow<TComponents>> {
        return worldQueries.queryChanged(this.runtime, types);
    }

    /** Iterates queries with required and optional component sections. */
    queryOptional<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        required: TRequiredComponents,
        optional: TOptionalComponents,
        filter: QueryFilter = {}
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        return worldQueries.queryOptional(this.runtime, required, optional, filter);
    }

    /** Creates a reusable query definition that can cache store resolution across runs. */
    queryState<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter = {}
    ): QueryState<TComponents> {
        return queryState(types, filter);
    }

    /** Creates a reusable optional-query definition with cached store resolution. */
    optionalQueryState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        required: TRequiredComponents,
        optional: TOptionalComponents,
        filter: QueryFilter = {}
    ): OptionalQueryState<TRequiredComponents, TOptionalComponents> {
        return optionalQueryState(required, optional, filter);
    }

    /** Executes a cached required-component query. */
    queryWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): IterableIterator<QueryRow<TComponents>> {
        return worldQueries.queryWithState(this.runtime, state);
    }

    /** Returns `true` when a cached query matches at least one entity. */
    matchesAnyWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): boolean {
        return worldQueries.matchesAnyWithState(this.runtime, state);
    }

    /** Returns `true` when a cached query matches no entities. */
    matchesNoneWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): boolean {
        return !this.matchesAnyWithState(state);
    }

    /** Returns `true` when a cached query matches exactly one entity. */
    matchesSingleWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): boolean {
        return worldQueries.matchesSingleWithState(this.runtime, state);
    }

    /** Executes a cached optional query. */
    queryOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        state: OptionalQueryState<TRequiredComponents, TOptionalComponents>
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        return worldQueries.queryOptionalWithState(this.runtime, state);
    }

    /** Returns `true` when a cached optional query matches at least one entity. */
    matchesAnyOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(state: OptionalQueryState<TRequiredComponents, TOptionalComponents>): boolean {
        return worldQueries.matchesAnyOptionalWithState(this.runtime, state);
    }

    /** Returns `true` when a cached optional query matches no entities. */
    matchesNoneOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(state: OptionalQueryState<TRequiredComponents, TOptionalComponents>): boolean {
        return !this.matchesAnyOptionalWithState(state);
    }

    /** Returns `true` when a cached optional query matches exactly one entity. */
    matchesSingleOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(state: OptionalQueryState<TRequiredComponents, TOptionalComponents>): boolean {
        return worldQueries.matchesSingleOptionalWithState(this.runtime, state);
    }

    /** Visits each row from a cached required-component query. */
    eachWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        worldQueries.eachWithState(this.runtime, state, visitor);
    }

    /** Visits each row from a cached optional query. */
    eachOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        state: OptionalQueryState<TRequiredComponents, TOptionalComponents>,
        visitor: (
            entity: Entity,
            ...components: [
                ...ComponentTuple<TRequiredComponents>,
                ...OptionalComponentTuple<TOptionalComponents>,
            ]
        ) => void
    ): void {
        worldQueries.eachOptionalWithState(this.runtime, state, visitor);
    }

    /** Returns the only matching row, or `undefined` when there are no matches. */
    trySingle<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter = {}
    ): QueryRow<TComponents> | undefined {
        return worldQueries.trySingle(this.runtime, types, filter);
    }

    /** Returns the only matching row and throws unless there is exactly one. */
    single<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter = {}
    ): QueryRow<TComponents> {
        return worldQueries.single(this.runtime, types, filter);
    }

    /** Visits every entity that has all requested component types. */
    each<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        worldQueries.each(this.runtime, types, visitor);
    }

    /** Visits every entity that matches the given components plus filter. */
    eachWhere<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        worldQueries.eachWhere(this.runtime, types, filter, visitor);
    }

    /** Visits entities where at least one requested component was added recently. */
    eachAdded<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        worldQueries.eachAdded(this.runtime, types, visitor);
    }

    /** Visits entities where at least one requested component changed recently. */
    eachChanged<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        worldQueries.eachChanged(this.runtime, types, visitor);
    }

    /** Visits required-plus-optional query rows without allocating a query state object. */
    eachOptional<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        required: TRequiredComponents,
        optional: TOptionalComponents,
        filter: QueryFilter,
        visitor: (
            entity: Entity,
            ...components: [
                ...ComponentTuple<TRequiredComponents>,
                ...OptionalComponentTuple<TOptionalComponents>,
            ]
        ) => void
    ): void {
        worldQueries.eachOptional(this.runtime, required, optional, filter, visitor);
    }

    /** Drains and clears the removed-component buffer for the given component type. */
    drainRemoved<T>(type: ComponentType<T>): RemovedComponent<T>[] {
        assertRegisteredComponent(this.registry, type, "read removed");
        return drainRemovedComponents(this.runtime.removedContext, type);
    }

    /** Creates a removed-component reader bound to this world. */
    removedReader<T>(type: ComponentType<T>, options: RemovedReaderOptions = {}): RemovedReader<T> {
        assertRegisteredComponent(this.registry, type, "create removed reader");
        return createBoundRemovedReader(this.runtime.removedContext, type, options);
    }

    /** Reads removed components with an independent cursor-based reader. */
    readRemoved<T>(reader: RemovedReader<T>): readonly RemovedComponent<T>[] {
        return reader.read();
    }

    /** Releases a removed reader so its cursor no longer retains buffered history. */
    releaseRemovedReader<T>(reader: RemovedReader<T>): void {
        reader.close();
    }

    /** Registers every implemented lifecycle method from an object-style system. */
    addSystem(system: System, options: SystemOptions = {}): this {
        worldSchedule.addSystem(this.runtime, system, options);

        return this;
    }

    /** Configures ordering and run conditions shared by all systems in a set. */
    configureSet(set: SystemSetLabel, options: SystemSetOptions): this {
        configureScheduleSet(this.runtime.scheduleContext, set, options);

        return this;
    }

    /** Configures set ordering and run conditions for one stage only. */
    configureSetForStage(
        stage: ScheduleStage,
        set: SystemSetLabel,
        options: SystemSetOptions
    ): this {
        configureScheduleSetForStage(this.runtime.scheduleContext, stage, set, options);

        return this;
    }

    /** Sets the duration used by the fixed-update accumulator. */
    setFixedTimeStep(seconds: number): this {
        setScheduleFixedTimeStep(this.runtime.scheduleContext, seconds);

        return this;
    }

    /** Advances the world by one frame, running startup once and then update schedules. */
    update(dt: number): void {
        worldSchedule.update(
            this.runtime,
            this.runScheduledSystems,
            this.runUpdateStageSystems,
            dt
        );
    }

    /** Runs shutdown systems once and ignores subsequent calls. */
    shutdown(): void {
        worldSchedule.shutdown(this.runtime, this.runScheduledSystems);
    }

    /** Creates a deferred command queue bound to this world. */
    commands(): Commands {
        return new Commands(this);
    }

    /** Registers a message channel so it exists even before the first write. */
    addMessage<T>(type: MessageType<T>): this {
        addMessageType(this.runtime.messageContext, type);

        return this;
    }

    /** Writes a message into the current frame's message buffer. */
    writeMessage<T>(type: MessageType<T>, value: T): MessageId<T> {
        return writeStoredMessage(this.runtime.messageContext, type, value);
    }

    /** Reads unread messages for a cursor-based reader. */
    readMessages<T>(reader: MessageReader<T>): readonly T[] {
        return readStoredMessages(this.runtime.messageContext, reader);
    }

    /** Returns every buffered message for the channel and clears them. */
    drainMessages<T>(type: MessageType<T>): T[] {
        return drainStoredMessages(this.runtime.messageContext, type);
    }

    /** Clears all buffered messages for the channel. */
    clearMessages<T>(type: MessageType<T>): this {
        clearStoredMessages(this.runtime.messageContext, type);

        return this;
    }

    /** Registers an immediate event observer and returns an unsubscribe function. */
    observe<T>(type: EventType<T>, observer: EventObserver<T>): () => void {
        return observeEvent(this.runtime.eventContext, type.id, observer);
    }

    /** Triggers an event immediately; observers run in subscription order. */
    trigger<T>(type: EventType<T>, value: T): this {
        triggerEvent(this.runtime.eventContext, type.id, value, this);
        return this;
    }

    /** Registers a component hook that runs after the component is first added. */
    onAdd<T>(type: ComponentType<T>, hook: ComponentHook<T>): () => void {
        return this.onComponentHook(type, "onAdd", hook);
    }

    /** Registers a component hook that runs after every insert or replace. */
    onInsert<T>(type: ComponentType<T>, hook: ComponentHook<T>): () => void {
        return this.onComponentHook(type, "onInsert", hook);
    }

    /** Registers a component hook that runs with the previous value before replacement/removal. */
    onReplace<T>(type: ComponentType<T>, hook: ComponentHook<T>): () => void {
        return this.onComponentHook(type, "onReplace", hook);
    }

    /** Registers a component hook that runs when the component is removed explicitly. */
    onRemove<T>(type: ComponentType<T>, hook: ComponentHook<T>): () => void {
        return this.onComponentHook(type, "onRemove", hook);
    }

    /** Registers a component hook that runs when the entity despawns. */
    onDespawn<T>(type: ComponentType<T>, hook: ComponentHook<T>): () => void {
        return this.onComponentHook(type, "onDespawn", hook);
    }

    /** Registers a component hook for an arbitrary lifecycle stage. */
    onComponentHook<T>(
        type: ComponentType<T>,
        stage: ComponentLifecycleStage,
        hook: ComponentHook<T>
    ): () => void {
        assertRegisteredComponent(this.registry, type, "register hook for");
        return registerComponentHook(this.runtime.componentHookContext, type, stage, hook);
    }

    /** Ensures a state machine exists, using the provided initial value only on first creation. */
    initState<T extends StateValue>(type: StateType<T>, initial = type.initial): this {
        initState(this.runtime.stateContext, type, initial);

        return this;
    }

    /** Returns the current value of an initialized state machine. */
    state<T extends StateValue>(type: StateType<T>): T {
        return currentState(this.runtime.stateContext, type);
    }

    /** Returns whether the state machine has been initialized. */
    hasState<T extends StateValue>(type: StateType<T>): boolean {
        return hasState(this.runtime.stateContext, type);
    }

    /** Evaluates a predicate against the current state value. */
    stateMatches<T extends StateValue>(
        type: StateType<T>,
        predicate: (value: T, world: World) => boolean
    ): boolean {
        return matchesState(this.runtime.stateContext, type, predicate, this);
    }

    /** Requests a transition that will be applied during the next update cycle. */
    setState<T extends StateValue>(type: StateType<T>, next: T): this {
        setState(this.runtime.stateContext, type, next);

        return this;
    }

    /** Registers a callback that runs when the state enters the given value. */
    onEnter<T extends StateValue>(type: StateType<T>, value: T, system: SystemCallback): this {
        onEnterState(this.runtime.stateContext, type, value, system);

        return this;
    }

    /** Registers a callback that runs when the state exits the given value. */
    onExit<T extends StateValue>(type: StateType<T>, value: T, system: SystemCallback): this {
        onExitState(this.runtime.stateContext, type, value, system);

        return this;
    }

    /** Registers a callback that runs when the state transitions between two values. */
    onTransition<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: SystemCallback
    ): this {
        onTransitionState(this.runtime.stateContext, type, from, to, system);

        return this;
    }

    /** Registers object-style enter/exit callbacks for a concrete state value. */
    addStateSystem<T extends StateValue>(
        type: StateType<T>,
        value: T,
        system: StateSystem<T>
    ): this {
        addStateLifecycleSystem(this.runtime.stateContext, type, value, system.onEnter, system.onExit);

        return this;
    }

    /** Registers an object-style transition callback for a concrete state pair. */
    addTransitionSystem<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: TransitionSystem<T>
    ): this {
        addStateTransitionSystem(this.runtime.stateContext, type, from, to, system.onTransition);

        return this;
    }

    /** Inserts or replaces a singleton resource. */
    setResource<T>(type: ResourceType<T>, value: T): this {
        setStoredResource(this.runtime.resourceContext, type, value);

        return this;
    }

    /** Returns whether the resource exists. */
    hasResource<T>(type: ResourceType<T>): boolean {
        return hasStoredResource(this.runtime.resourceContext, type);
    }

    /** Returns the resource value, or `undefined` when missing. */
    getResource<T>(type: ResourceType<T>): T | undefined {
        return getStoredResource(this.runtime.resourceContext, type);
    }

    /** Evaluates a predicate against the current resource value. */
    resourceMatches<T>(
        type: ResourceType<T>,
        predicate: (value: T, world: World) => boolean
    ): boolean {
        return matchesStoredResource(this.runtime.resourceContext, type, predicate, this);
    }

    /** Returns the resource value or throws when it is missing. */
    resource<T>(type: ResourceType<T>): T {
        const resource = getStoredResource(this.runtime.resourceContext, type);

        if (resource === undefined) {
            throw new Error(`Resource not found: ${type.name}`);
        }

        return resource;
    }

    /** Removes a resource and returns the previous value, if any. */
    removeResource<T>(type: ResourceType<T>): T | undefined {
        return removeStoredResource(this.runtime.resourceContext, type);
    }

    /** Marks an existing resource as changed without replacing its value. */
    markResourceChanged<T>(type: ResourceType<T>): boolean {
        return markStoredResourceChanged(this.runtime.resourceContext, type);
    }

    /** Returns whether the resource was added inside the current change-detection window. */
    isResourceAdded<T>(type: ResourceType<T>): boolean {
        return isStoredResourceAdded(this.runtime.resourceContext, type);
    }

    /** Returns whether the resource changed inside the current change-detection window. */
    isResourceChanged<T>(type: ResourceType<T>): boolean {
        return isStoredResourceChanged(this.runtime.resourceContext, type);
    }

    private assertBundleRegistered(bundle: Bundle, action: string): void {
        if (bundle.registry !== undefined && bundle.registry !== this.registry) {
            throw new Error(
                `Cannot ${action} bundle from ${bundle.registry.name} in world ${this.registry.name}`
            );
        }

        for (const entry of bundle.entries) {
            assertRegisteredComponent(this.registry, entry.type, action);
        }
    }

    /** Falls back to a frame-local change window when no system-specific window is active. */
    private changeDetectionRange(): ChangeDetectionRange {
        return currentChangeDetectionRange(this.runtime);
    }

    /**
     * Runs systems with an isolated change-detection window per system.
     *
     * Each successful system run advances the global change tick so later systems can observe
     * structural edits and explicit `markChanged` calls from earlier systems in the same frame.
     */
    private runSystems(systems: readonly SystemRunner[], stage: ScheduleStage, dt: number): void {
        for (const system of systems) {
            const previousChangeDetection = this.runtime.activeChangeDetection;
            const thisRunTick = this.runtime.changeTick;

            this.runtime.activeChangeDetection = {
                lastRunTick: system.lastRunTick,
                thisRunTick,
            };

            try {
                if (!shouldRunScheduledSystem(this.runtime.scheduleContext, system, stage, this)) {
                    continue;
                }

                runSystemWithCommands(this, system, dt);
                system.lastRunTick = thisRunTick;
                this.runtime.changeTick++;
            } finally {
                this.runtime.activeChangeDetection = previousChangeDetection;
            }
        }
    }
}
