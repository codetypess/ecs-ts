import type {
    AnyComponentType,
    Bundle,
    ComponentEntry,
    ComponentHook,
    ComponentLifecycleStage,
    ComponentType,
} from "./component";
import { Commands } from "./commands";
import { Entity, EntityManager } from "./entity";
import type { EventObserver, EventType } from "./event";
import {
    add as addComponent,
    createComponentRuntimeContext,
    despawn as despawnEntity,
    get as getComponent,
    getMany as getManyComponents,
    has as hasComponent,
    hasAll as hasAllComponents,
    hasAny as hasAnyComponents,
    insertBundle as insertComponentBundle,
    isAdded as isComponentAdded,
    isChanged as isComponentChanged,
    markChanged as markComponentChanged,
    mustGet as mustGetComponent,
    remove as removeComponent,
    removeBundle as removeComponentBundle,
    type ComponentRuntimeContext,
} from "./internal/component-runtime";
import { createComponentStoreRuntimeContext } from "./internal/component-store-runtime";
import {
    addComponentHook as registerComponentHook,
    createComponentHookRuntimeContext,
    runComponentHooks as dispatchComponentHooks,
} from "./internal/component-hook-runtime";
import { runSystemWithCommands } from "./internal/command-runtime";
import { createEventRuntimeContext, observeEvent, triggerEvent } from "./internal/event-runtime";
import {
    addMessageType,
    clearMessages as clearStoredMessages,
    createMessageRuntimeContext,
    drainMessages as drainStoredMessages,
    readMessages as readStoredMessages,
    updateMessages as updateStoredMessages,
    writeMessage as writeStoredMessage,
} from "./internal/message-runtime";
import { createQueryPlanRuntimeContext } from "./internal/query-plan-runtime";
import {
    each as eachQuery,
    eachOptional as eachOptionalQuery,
    eachOptionalWithState as eachOptionalQueryWithState,
    eachWithState as eachQueryWithState,
    matchesAnyOptionalWithState as matchesAnyOptionalQueryWithState,
    matchesAnyWithState as matchesAnyQueryWithState,
    matchesSingleOptionalWithState as matchesSingleOptionalQueryWithState,
    matchesSingleWithState as matchesSingleQueryWithState,
    query as runQuery,
    queryOptional as runOptionalQuery,
    queryOptionalWithState as runOptionalQueryWithState,
    queryWithState as runQueryWithState,
    type QueryRuntimeContext,
} from "./internal/query-runtime";
import {
    createRemovedRuntimeContext,
    drainRemoved as drainRemovedComponents,
    readRemoved as readRemovedComponents,
    recordRemoved as recordRemovedComponent,
} from "./internal/removed-runtime";
import {
    createResourceRuntimeContext,
    getResource as getStoredResource,
    hasResource as hasStoredResource,
    isResourceAdded as isStoredResourceAdded,
    isResourceChanged as isStoredResourceChanged,
    markResourceChanged as markStoredResourceChanged,
    matchesResource as matchesStoredResource,
    removeResource as removeStoredResource,
    setResource as setStoredResource,
} from "./internal/resource-runtime";
import {
    addSystemRunner as addScheduledSystemRunner,
    configureSet as configureScheduleSet,
    configureSetForStage as configureScheduleSetForStage,
    createScheduleRuntimeContext,
    runFixedUpdate as runScheduledFixedUpdate,
    runSchedule as runScheduledStage,
    setFixedTimeStep as setScheduleFixedTimeStep,
    shouldRunSystem as shouldRunScheduledSystem,
    type ScheduleRuntimeContext,
} from "./internal/schedule-runtime";
import {
    addStateSystem as addStateLifecycleSystem,
    addTransitionSystem as addStateTransitionSystem,
    applyStateTransitions,
    createStateRuntimeContext,
    currentState,
    hasState,
    initState,
    matchesState,
    onEnterState,
    onExitState,
    onTransitionState,
    runInitialEnters,
    setState,
    type StateRuntimeContext,
} from "./internal/state-runtime";
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
import type { RemovedComponent, RemovedReader } from "./removed";
import type { ResourceType } from "./resource";
import type {
    ScheduleStage,
    SystemCallback,
    SystemOptions,
    SystemRunner,
    SystemSetLabel,
    SystemSetOptions,
} from "./scheduler";
import { createSystemRunner, scheduleStageDefinitions } from "./scheduler";
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
    private readonly entities = new EntityManager();
    private readonly componentStoreContext = createComponentStoreRuntimeContext();
    private readonly resourceContext = createResourceRuntimeContext({
        getChangeTick: () => this.changeTick,
        getChangeDetectionRange: () => this.changeDetectionRange(),
    });
    private readonly removedContext = createRemovedRuntimeContext({
        getChangeTick: () => this.changeTick,
    });
    private readonly componentHookContext = createComponentHookRuntimeContext();
    private readonly componentContext: ComponentRuntimeContext = createComponentRuntimeContext({
        entities: this.entities,
        componentStores: this.componentStoreContext,
        getChangeTick: () => this.changeTick,
        getChangeDetectionRange: () => this.changeDetectionRange(),
        runComponentHooks: (type, stage, entity, component) => {
            dispatchComponentHooks(this.componentHookContext, type, stage, entity, component, this);
        },
        recordRemoved: (type, entity, component) => {
            recordRemovedComponent(this.removedContext, type, entity, component);
        },
    });
    private readonly stateContext: StateRuntimeContext = createStateRuntimeContext();
    private readonly eventContext = createEventRuntimeContext();
    private readonly messageContext = createMessageRuntimeContext();
    private readonly queryContext: QueryRuntimeContext = {
        planRuntime: createQueryPlanRuntimeContext({
            stores: this.componentStoreContext.stores,
            getStoreVersion: () => this.componentStoreContext.storeVersion,
        }),
        isAlive: (entity) => this.entities.isAlive(entity),
    };
    private readonly scheduleContext: ScheduleRuntimeContext = createScheduleRuntimeContext();
    private activeChangeDetection: ChangeDetectionRange | undefined;
    private changeTick = 1;
    private didStartup = false;
    private didShutdown = false;

    spawn(...entries: ComponentEntry<unknown>[]): Entity {
        return this.spawnBundle({ entries });
    }

    spawnBundle(bundle: Bundle): Entity {
        const entity = this.entities.create();
        this.insertBundle(entity, bundle);

        return entity;
    }

    insertBundle(entity: Entity, bundle: Bundle): this {
        insertComponentBundle(this.componentContext, entity, bundle);

        return this;
    }

    removeBundle(entity: Entity, bundle: Bundle): boolean {
        return removeComponentBundle(this.componentContext, entity, bundle);
    }

    isAlive(entity: Entity): boolean {
        return this.entities.isAlive(entity);
    }

    add<T>(entity: Entity, type: ComponentType<T>, value: T): this {
        addComponent(this.componentContext, entity, type, value);

        return this;
    }

    markChanged<T>(entity: Entity, type: ComponentType<T>): boolean {
        return markComponentChanged(this.componentContext, entity, type);
    }

    has<T>(entity: Entity, type: ComponentType<T>): boolean {
        return hasComponent(this.componentContext, entity, type);
    }

    hasAll(entity: Entity, types: readonly AnyComponentType[]): boolean {
        return hasAllComponents(this.componentContext, entity, types);
    }

    hasAny(entity: Entity, types: readonly AnyComponentType[]): boolean {
        return hasAnyComponents(this.componentContext, entity, types);
    }

    get<T>(entity: Entity, type: ComponentType<T>): T | undefined {
        return getComponent(this.componentContext, entity, type);
    }

    mustGet<T>(entity: Entity, type: ComponentType<T>): T {
        return mustGetComponent(this.componentContext, entity, type);
    }

    getMany<const TComponents extends readonly AnyComponentType[]>(
        entity: Entity,
        ...types: TComponents
    ): ComponentTuple<TComponents> | undefined {
        return getManyComponents(this.componentContext, entity, ...types);
    }

    isAdded<T>(entity: Entity, type: ComponentType<T>): boolean {
        return isComponentAdded(this.componentContext, entity, type);
    }

    isChanged<T>(entity: Entity, type: ComponentType<T>): boolean {
        return isComponentChanged(this.componentContext, entity, type);
    }

    remove<T>(entity: Entity, type: ComponentType<T>): boolean {
        return removeComponent(this.componentContext, entity, type);
    }

    despawn(entity: Entity): boolean {
        return despawnEntity(this.componentContext, entity);
    }

    query<const TComponents extends readonly AnyComponentType[]>(
        ...types: TComponents
    ): IterableIterator<QueryRow<TComponents>> {
        return runQuery(this.queryContext, types, {}, this.changeDetectionRange());
    }

    queryWhere<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter
    ): IterableIterator<QueryRow<TComponents>> {
        return runQuery(this.queryContext, types, filter, this.changeDetectionRange());
    }

    queryAdded<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents
    ): IterableIterator<QueryRow<TComponents>> {
        return runQuery(this.queryContext, types, { added: types }, this.changeDetectionRange());
    }

    queryChanged<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents
    ): IterableIterator<QueryRow<TComponents>> {
        return runQuery(
            this.queryContext,
            types,
            { changed: types },
            this.changeDetectionRange()
        );
    }

    queryOptional<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        required: TRequiredComponents,
        optional: TOptionalComponents,
        filter: QueryFilter = {}
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        return runOptionalQuery(
            this.queryContext,
            required,
            optional,
            filter,
            this.changeDetectionRange()
        );
    }

    queryState<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter = {}
    ): QueryState<TComponents> {
        return queryState(types, filter);
    }

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

    queryWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): IterableIterator<QueryRow<TComponents>> {
        return runQueryWithState(this.queryContext, state, this.changeDetectionRange());
    }

    matchesAnyWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): boolean {
        return matchesAnyQueryWithState(this.queryContext, state, this.changeDetectionRange());
    }

    matchesNoneWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): boolean {
        return !this.matchesAnyWithState(state);
    }

    matchesSingleWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): boolean {
        return matchesSingleQueryWithState(this.queryContext, state, this.changeDetectionRange());
    }

    queryOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        state: OptionalQueryState<TRequiredComponents, TOptionalComponents>
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        return runOptionalQueryWithState(this.queryContext, state, this.changeDetectionRange());
    }

    matchesAnyOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(state: OptionalQueryState<TRequiredComponents, TOptionalComponents>): boolean {
        return matchesAnyOptionalQueryWithState(
            this.queryContext,
            state,
            this.changeDetectionRange()
        );
    }

    matchesNoneOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(state: OptionalQueryState<TRequiredComponents, TOptionalComponents>): boolean {
        return !this.matchesAnyOptionalWithState(state);
    }

    matchesSingleOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(state: OptionalQueryState<TRequiredComponents, TOptionalComponents>): boolean {
        return matchesSingleOptionalQueryWithState(
            this.queryContext,
            state,
            this.changeDetectionRange()
        );
    }

    eachWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        eachQueryWithState(this.queryContext, state, this.changeDetectionRange(), visitor);
    }

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
        eachOptionalQueryWithState(
            this.queryContext,
            state,
            this.changeDetectionRange(),
            visitor
        );
    }

    trySingle<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter = {}
    ): QueryRow<TComponents> | undefined {
        const iterator = this.queryWhere(types, filter);
        const first = iterator.next();

        if (first.done === true) {
            return undefined;
        }

        const second = iterator.next();

        if (second.done !== true) {
            throw new Error("Expected at most one query result");
        }

        return first.value;
    }

    single<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter = {}
    ): QueryRow<TComponents> {
        const row = this.trySingle(types, filter);

        if (row === undefined) {
            throw new Error("Expected exactly one query result");
        }

        return row;
    }

    each<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        eachQuery(this.queryContext, types, {}, this.changeDetectionRange(), visitor);
    }

    eachWhere<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        eachQuery(this.queryContext, types, filter, this.changeDetectionRange(), visitor);
    }

    eachAdded<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        eachQuery(
            this.queryContext,
            types,
            { added: types },
            this.changeDetectionRange(),
            visitor
        );
    }

    eachChanged<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        eachQuery(
            this.queryContext,
            types,
            { changed: types },
            this.changeDetectionRange(),
            visitor
        );
    }

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
        eachOptionalQuery(
            this.queryContext,
            required,
            optional,
            filter,
            this.changeDetectionRange(),
            visitor
        );
    }

    drainRemoved<T>(type: ComponentType<T>): RemovedComponent<T>[] {
        return drainRemovedComponents(this.removedContext, type);
    }

    readRemoved<T>(reader: RemovedReader<T>): readonly RemovedComponent<T>[] {
        return readRemovedComponents(this.removedContext, reader);
    }

    addSystem(system: System, options: SystemOptions = {}): this {
        this.registerSystem(system, options);

        return this;
    }

    configureSet(set: SystemSetLabel, options: SystemSetOptions): this {
        configureScheduleSet(this.scheduleContext, set, options);

        return this;
    }

    configureSetForStage(
        stage: ScheduleStage,
        set: SystemSetLabel,
        options: SystemSetOptions
    ): this {
        configureScheduleSetForStage(this.scheduleContext, stage, set, options);

        return this;
    }

    setFixedTimeStep(seconds: number): this {
        setScheduleFixedTimeStep(this.scheduleContext, seconds);

        return this;
    }

    update(dt: number): void {
        if (!this.didStartup) {
            this.runStartupSchedules();
        }

        this.updateMessages();
        this.runUpdateSchedules(dt);
        this.changeTick++;
    }

    shutdown(): void {
        if (this.didShutdown) {
            return;
        }

        this.runSchedule("shutdown", 0);
        this.didShutdown = true;
    }

    commands(): Commands {
        return new Commands(this);
    }

    addMessage<T>(type: MessageType<T>): this {
        addMessageType(this.messageContext, type);

        return this;
    }

    writeMessage<T>(type: MessageType<T>, value: T): MessageId<T> {
        return writeStoredMessage(this.messageContext, type, value);
    }

    readMessages<T>(reader: MessageReader<T>): readonly T[] {
        return readStoredMessages(this.messageContext, reader);
    }

    drainMessages<T>(type: MessageType<T>): T[] {
        return drainStoredMessages(this.messageContext, type);
    }

    clearMessages<T>(type: MessageType<T>): this {
        clearStoredMessages(this.messageContext, type);

        return this;
    }

    observe<T>(type: EventType<T>, observer: EventObserver<T>): () => void {
        return observeEvent(this.eventContext, type.id, observer);
    }

    trigger<T>(type: EventType<T>, value: T): this {
        triggerEvent(this.eventContext, type.id, value, this);
        return this;
    }

    onAdd<T>(type: ComponentType<T>, hook: ComponentHook<T>): () => void {
        return this.onComponentHook(type, "onAdd", hook);
    }

    onInsert<T>(type: ComponentType<T>, hook: ComponentHook<T>): () => void {
        return this.onComponentHook(type, "onInsert", hook);
    }

    onReplace<T>(type: ComponentType<T>, hook: ComponentHook<T>): () => void {
        return this.onComponentHook(type, "onReplace", hook);
    }

    onRemove<T>(type: ComponentType<T>, hook: ComponentHook<T>): () => void {
        return this.onComponentHook(type, "onRemove", hook);
    }

    onDespawn<T>(type: ComponentType<T>, hook: ComponentHook<T>): () => void {
        return this.onComponentHook(type, "onDespawn", hook);
    }

    onComponentHook<T>(
        type: ComponentType<T>,
        stage: ComponentLifecycleStage,
        hook: ComponentHook<T>
    ): () => void {
        return registerComponentHook(this.componentHookContext, type, stage, hook);
    }

    initState<T extends StateValue>(type: StateType<T>, initial = type.initial): this {
        initState(this.stateContext, type, initial);

        return this;
    }

    state<T extends StateValue>(type: StateType<T>): T {
        return currentState(this.stateContext, type);
    }

    hasState<T extends StateValue>(type: StateType<T>): boolean {
        return hasState(this.stateContext, type);
    }

    stateMatches<T extends StateValue>(
        type: StateType<T>,
        predicate: (value: T, world: World) => boolean
    ): boolean {
        return matchesState(this.stateContext, type, predicate, this);
    }

    setState<T extends StateValue>(type: StateType<T>, next: T): this {
        setState(this.stateContext, type, next);

        return this;
    }

    onEnter<T extends StateValue>(type: StateType<T>, value: T, system: SystemCallback): this {
        onEnterState(this.stateContext, type, value, system);

        return this;
    }

    onExit<T extends StateValue>(type: StateType<T>, value: T, system: SystemCallback): this {
        onExitState(this.stateContext, type, value, system);

        return this;
    }

    onTransition<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: SystemCallback
    ): this {
        onTransitionState(this.stateContext, type, from, to, system);

        return this;
    }

    addStateSystem<T extends StateValue>(
        type: StateType<T>,
        value: T,
        system: StateSystem<T>
    ): this {
        addStateLifecycleSystem(this.stateContext, type, value, system.onEnter, system.onExit);

        return this;
    }

    addTransitionSystem<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: TransitionSystem<T>
    ): this {
        addStateTransitionSystem(this.stateContext, type, from, to, system.onTransition);

        return this;
    }

    setResource<T>(type: ResourceType<T>, value: T): this {
        setStoredResource(this.resourceContext, type, value);

        return this;
    }

    hasResource<T>(type: ResourceType<T>): boolean {
        return hasStoredResource(this.resourceContext, type);
    }

    getResource<T>(type: ResourceType<T>): T | undefined {
        return getStoredResource(this.resourceContext, type);
    }

    resourceMatches<T>(
        type: ResourceType<T>,
        predicate: (value: T, world: World) => boolean
    ): boolean {
        return matchesStoredResource(this.resourceContext, type, predicate, this);
    }

    resource<T>(type: ResourceType<T>): T {
        const resource = getStoredResource(this.resourceContext, type);

        if (resource === undefined) {
            throw new Error(`Resource not found: ${type.name}`);
        }

        return resource;
    }

    removeResource<T>(type: ResourceType<T>): T | undefined {
        return removeStoredResource(this.resourceContext, type);
    }

    markResourceChanged<T>(type: ResourceType<T>): boolean {
        return markStoredResourceChanged(this.resourceContext, type);
    }

    isResourceAdded<T>(type: ResourceType<T>): boolean {
        return isStoredResourceAdded(this.resourceContext, type);
    }

    isResourceChanged<T>(type: ResourceType<T>): boolean {
        return isStoredResourceChanged(this.resourceContext, type);
    }

    private changeDetectionRange(): ChangeDetectionRange {
        return (
            this.activeChangeDetection ?? {
                lastRunTick: this.changeTick - 1,
                thisRunTick: this.changeTick,
            }
        );
    }

    private updateMessages(): void {
        updateStoredMessages(this.messageContext);
    }

    private registerSystem(system: System, options: SystemOptions): void {
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
    }

    private runSchedule(stage: ScheduleStage, dt: number): void {
        runScheduledStage(this.scheduleContext, stage, dt, this.runScheduledSystems);
    }

    private runFixedUpdate(dt: number): void {
        runScheduledFixedUpdate(this.scheduleContext, dt, this.runScheduledSystems);
    }

    private runStartupSchedules(): void {
        for (const stage of ["preStartup", "startup", "postStartup"] as const) {
            this.runSchedule(stage, 0);
        }

        this.didStartup = true;
    }

    private runUpdateSchedules(dt: number): void {
        runInitialEnters(this.stateContext, dt, this.runUpdateStageSystems);
        this.runSchedule("first", dt);
        this.runSchedule("preUpdate", dt);
        this.runFixedUpdate(dt);
        applyStateTransitions(this.stateContext, dt, this.runUpdateStageSystems);
        this.runSchedule("update", dt);
        this.runSchedule("postUpdate", dt);
        this.runSchedule("last", dt);
    }

    private runSystems(systems: readonly SystemRunner[], stage: ScheduleStage, dt: number): void {
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
    }

}
