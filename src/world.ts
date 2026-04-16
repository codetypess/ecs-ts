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
import { ComponentStoreRuntime } from "./internal/component-store-runtime";
import { ComponentRuntime } from "./internal/component-runtime";
import { ComponentHookRuntime } from "./internal/component-hook-runtime";
import { runSystemWithCommands } from "./internal/command-runtime";
import { EventRuntime } from "./internal/event-runtime";
import { MessageRuntime } from "./internal/message-runtime";
import { QueryPlanRuntime } from "./internal/query-plan-runtime";
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
import { RemovedRuntime } from "./internal/removed-runtime";
import { ResourceRuntime } from "./internal/resource-runtime";
import { ScheduleRuntime } from "./internal/schedule-runtime";
import { StateRuntime } from "./internal/state-runtime";
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
    private readonly componentStoreRuntime = new ComponentStoreRuntime();
    private readonly resourceRuntime = new ResourceRuntime({
        getChangeTick: () => this.changeTick,
        getChangeDetectionRange: () => this.changeDetectionRange(),
    });
    private readonly removedRuntime = new RemovedRuntime({
        getChangeTick: () => this.changeTick,
    });
    private readonly componentHookRuntime = new ComponentHookRuntime();
    private readonly componentRuntime = new ComponentRuntime({
        entities: this.entities,
        componentStores: this.componentStoreRuntime,
        getChangeTick: () => this.changeTick,
        getChangeDetectionRange: () => this.changeDetectionRange(),
        runComponentHooks: (type, stage, entity, component) => {
            this.componentHookRuntime.run(type, stage, entity, component, this);
        },
        recordRemoved: (type, entity, component) => {
            this.removedRuntime.record(type, entity, component);
        },
    });
    private readonly stateRuntime = new StateRuntime();
    private readonly eventRuntime = new EventRuntime();
    private readonly messageRuntime = new MessageRuntime();
    private readonly queryContext: QueryRuntimeContext = {
        planRuntime: new QueryPlanRuntime({
            stores: this.componentStoreRuntime.stores,
            getStoreVersion: () => this.componentStoreRuntime.version,
        }),
        isAlive: (entity) => this.entities.isAlive(entity),
    };
    private readonly scheduleRuntime = new ScheduleRuntime();
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
        this.componentRuntime.insertBundle(entity, bundle);

        return this;
    }

    removeBundle(entity: Entity, bundle: Bundle): boolean {
        return this.componentRuntime.removeBundle(entity, bundle);
    }

    isAlive(entity: Entity): boolean {
        return this.entities.isAlive(entity);
    }

    add<T>(entity: Entity, type: ComponentType<T>, value: T): this {
        this.componentRuntime.add(entity, type, value);

        return this;
    }

    markChanged<T>(entity: Entity, type: ComponentType<T>): boolean {
        return this.componentRuntime.markChanged(entity, type);
    }

    has<T>(entity: Entity, type: ComponentType<T>): boolean {
        return this.componentRuntime.has(entity, type);
    }

    hasAll(entity: Entity, types: readonly AnyComponentType[]): boolean {
        return this.componentRuntime.hasAll(entity, types);
    }

    hasAny(entity: Entity, types: readonly AnyComponentType[]): boolean {
        return this.componentRuntime.hasAny(entity, types);
    }

    get<T>(entity: Entity, type: ComponentType<T>): T | undefined {
        return this.componentRuntime.get(entity, type);
    }

    mustGet<T>(entity: Entity, type: ComponentType<T>): T {
        return this.componentRuntime.mustGet(entity, type);
    }

    getMany<const TComponents extends readonly AnyComponentType[]>(
        entity: Entity,
        ...types: TComponents
    ): ComponentTuple<TComponents> | undefined {
        return this.componentRuntime.getMany(entity, ...types);
    }

    isAdded<T>(entity: Entity, type: ComponentType<T>): boolean {
        return this.componentRuntime.isAdded(entity, type);
    }

    isChanged<T>(entity: Entity, type: ComponentType<T>): boolean {
        return this.componentRuntime.isChanged(entity, type);
    }

    remove<T>(entity: Entity, type: ComponentType<T>): boolean {
        return this.componentRuntime.remove(entity, type);
    }

    despawn(entity: Entity): boolean {
        return this.componentRuntime.despawn(entity);
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
        return this.removedRuntime.drain(type);
    }

    readRemoved<T>(reader: RemovedReader<T>): readonly RemovedComponent<T>[] {
        return this.removedRuntime.read(reader);
    }

    addSystem(system: System, options: SystemOptions = {}): this {
        this.registerSystem(system, options);

        return this;
    }

    configureSet(set: SystemSetLabel, options: SystemSetOptions): this {
        this.scheduleRuntime.configureSet(set, options);

        return this;
    }

    configureSetForStage(
        stage: ScheduleStage,
        set: SystemSetLabel,
        options: SystemSetOptions
    ): this {
        this.scheduleRuntime.configureSetForStage(stage, set, options);

        return this;
    }

    setFixedTimeStep(seconds: number): this {
        this.scheduleRuntime.setFixedTimeStep(seconds);

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
        this.messageRuntime.add(type);

        return this;
    }

    writeMessage<T>(type: MessageType<T>, value: T): MessageId<T> {
        return this.messageRuntime.write(type, value);
    }

    readMessages<T>(reader: MessageReader<T>): readonly T[] {
        return this.messageRuntime.read(reader);
    }

    drainMessages<T>(type: MessageType<T>): T[] {
        return this.messageRuntime.drain(type);
    }

    clearMessages<T>(type: MessageType<T>): this {
        this.messageRuntime.clear(type);

        return this;
    }

    observe<T>(type: EventType<T>, observer: EventObserver<T>): () => void {
        return this.eventRuntime.observe(type.id, observer);
    }

    trigger<T>(type: EventType<T>, value: T): this {
        this.eventRuntime.trigger(type.id, value, this);
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
        return this.componentHookRuntime.add(type, stage, hook);
    }

    initState<T extends StateValue>(type: StateType<T>, initial = type.initial): this {
        this.stateRuntime.init(type, initial);

        return this;
    }

    state<T extends StateValue>(type: StateType<T>): T {
        return this.stateRuntime.current(type);
    }

    hasState<T extends StateValue>(type: StateType<T>): boolean {
        return this.stateRuntime.has(type);
    }

    stateMatches<T extends StateValue>(
        type: StateType<T>,
        predicate: (value: T, world: World) => boolean
    ): boolean {
        return this.stateRuntime.matches(type, predicate, this);
    }

    setState<T extends StateValue>(type: StateType<T>, next: T): this {
        this.stateRuntime.set(type, next);

        return this;
    }

    onEnter<T extends StateValue>(type: StateType<T>, value: T, system: SystemCallback): this {
        this.stateRuntime.onEnter(type, value, system);

        return this;
    }

    onExit<T extends StateValue>(type: StateType<T>, value: T, system: SystemCallback): this {
        this.stateRuntime.onExit(type, value, system);

        return this;
    }

    onTransition<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: SystemCallback
    ): this {
        this.stateRuntime.onTransition(type, from, to, system);

        return this;
    }

    addStateSystem<T extends StateValue>(
        type: StateType<T>,
        value: T,
        system: StateSystem<T>
    ): this {
        this.stateRuntime.addStateSystem(type, value, system.onEnter, system.onExit);

        return this;
    }

    addTransitionSystem<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: TransitionSystem<T>
    ): this {
        this.stateRuntime.addTransitionSystem(type, from, to, system.onTransition);

        return this;
    }

    setResource<T>(type: ResourceType<T>, value: T): this {
        this.resourceRuntime.set(type, value);

        return this;
    }

    hasResource<T>(type: ResourceType<T>): boolean {
        return this.resourceRuntime.has(type);
    }

    getResource<T>(type: ResourceType<T>): T | undefined {
        return this.resourceRuntime.get(type);
    }

    resourceMatches<T>(
        type: ResourceType<T>,
        predicate: (value: T, world: World) => boolean
    ): boolean {
        return this.resourceRuntime.matches(type, predicate, this);
    }

    resource<T>(type: ResourceType<T>): T {
        const resource = this.resourceRuntime.get(type);

        if (resource === undefined) {
            throw new Error(`Resource not found: ${type.name}`);
        }

        return resource;
    }

    removeResource<T>(type: ResourceType<T>): T | undefined {
        return this.resourceRuntime.remove(type);
    }

    markResourceChanged<T>(type: ResourceType<T>): boolean {
        return this.resourceRuntime.markChanged(type);
    }

    isResourceAdded<T>(type: ResourceType<T>): boolean {
        return this.resourceRuntime.isAdded(type);
    }

    isResourceChanged<T>(type: ResourceType<T>): boolean {
        return this.resourceRuntime.isChanged(type);
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
        this.messageRuntime.update();
    }

    private registerSystem(system: System, options: SystemOptions): void {
        for (const { stage, systemMethod } of scheduleStageDefinitions) {
            const method = system[systemMethod];

            if (method !== undefined) {
                this.scheduleRuntime.addSystemRunner(
                    stage,
                    createSystemRunner(method.bind(system), options)
                );
            }
        }
    }

    private runSchedule(stage: ScheduleStage, dt: number): void {
        this.scheduleRuntime.runSchedule(stage, dt, this.runScheduledSystems);
    }

    private runFixedUpdate(dt: number): void {
        this.scheduleRuntime.runFixedUpdate(dt, this.runScheduledSystems);
    }

    private runStartupSchedules(): void {
        for (const stage of ["preStartup", "startup", "postStartup"] as const) {
            this.runSchedule(stage, 0);
        }

        this.didStartup = true;
    }

    private runUpdateSchedules(dt: number): void {
        this.stateRuntime.runInitialEnters(dt, this.runUpdateStageSystems);
        this.runSchedule("first", dt);
        this.runSchedule("preUpdate", dt);
        this.runFixedUpdate(dt);
        this.stateRuntime.applyTransitions(dt, this.runUpdateStageSystems);
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
                if (!this.scheduleRuntime.shouldRunSystem(system, stage, this)) {
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
