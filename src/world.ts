import type {
    AnyComponentType,
    Bundle,
    ComponentEntry,
    ComponentHook,
    ComponentLifecycleStage,
    ComponentType,
} from "./component";
import { assertComponentValue } from "./component";
import { Entity, EntityManager, formatEntity } from "./entity";
import type { EventObserver, EventType } from "./event";
import { QueryRuntime } from "./internal/query-runtime";
import { ScheduleRuntime } from "./internal/schedule-runtime";
import type { ComponentHookRegistry, ResourceEntry, StateRecord } from "./internal/world-support";
import {
    ComponentHookRuntime,
    EventRuntime,
    RemovedRuntime,
    ResourceRuntime,
    StateRuntime,
} from "./internal/world-support";
import type { MessageId, MessageReader, MessageType } from "./message";
import { Messages } from "./message";
import type {
    ChangeDetectionRange,
    ComponentTuple,
    OptionalComponentTuple,
    OptionalQueryRow,
    OptionalQueryState,
    OptionalQueryStateCache,
    QueryFilter,
    QueryRow,
    QueryState,
    QueryStateCache,
} from "./query";
import { isTickInRange, optionalQueryState, queryState } from "./query";
import type { RemovedComponent, RemovedComponents, RemovedReader } from "./removed";
import type { ResourceType } from "./resource";
import type {
    ScheduleStage,
    SystemCallback,
    SystemOptions,
    SystemRunner,
    SystemSetConfig,
    SystemSetLabel,
    SystemSetOptions,
} from "./scheduler";
import {
    createScheduleCacheEntries,
    createSchedules,
    createSystemRunner,
    createSystemSetStageConfigs,
    scheduleStages,
} from "./scheduler";
import { SparseSet } from "./sparse-set";
import type { StateType, StateValue } from "./state";

export { OptionalQueryState, optionalQueryState, QueryState, queryState } from "./query";
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

export interface System {
    onPreStartup?(world: World, dt: number, commands: Commands): void;
    onStartup?(world: World, dt: number, commands: Commands): void;
    onPostStartup?(world: World, dt: number, commands: Commands): void;
    onFirst?(world: World, dt: number, commands: Commands): void;
    onPreUpdate?(world: World, dt: number, commands: Commands): void;
    onFixedUpdate?(world: World, dt: number, commands: Commands): void;
    onUpdate?(world: World, dt: number, commands: Commands): void;
    onPostUpdate?(world: World, dt: number, commands: Commands): void;
    onLast?(world: World, dt: number, commands: Commands): void;
    onShutdown?(world: World, dt: number, commands: Commands): void;
}

type CommandRunner = (world: World) => void;

export interface StateSystem<T extends StateValue> {
    onEnter?(world: World, dt: number, commands: Commands, value: T): void;
    onExit?(world: World, dt: number, commands: Commands, value: T): void;
}

export interface TransitionSystem<T extends StateValue> {
    onTransition?(world: World, dt: number, commands: Commands, from: T, to: T): void;
}

const lifecycleSystemMethods = {
    preStartup: "onPreStartup",
    startup: "onStartup",
    postStartup: "onPostStartup",
    first: "onFirst",
    preUpdate: "onPreUpdate",
    fixedUpdate: "onFixedUpdate",
    update: "onUpdate",
    postUpdate: "onPostUpdate",
    last: "onLast",
    shutdown: "onShutdown",
} as const satisfies Record<ScheduleStage, keyof System>;

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

export class World {
    private readonly runScheduledSystems = (
        systems: readonly SystemRunner[],
        stage: ScheduleStage,
        dt: number
    ): void => {
        this.runSystems(systems, stage, dt);
    };
    private readonly entities = new EntityManager();
    private readonly stores = new Map<number, SparseSet<unknown>>();
    private readonly componentTypes = new Map<number, AnyComponentType>();
    private readonly resources = new Map<number, ResourceEntry<unknown>>();
    private readonly states = new Map<number, StateRecord<StateValue>>();
    private readonly componentHooks = new Map<number, ComponentHookRegistry>();
    private readonly removedComponents = new Map<number, RemovedComponents<unknown>>();
    private readonly messageStores: (Messages<unknown> | undefined)[] = [];
    private readonly eventObservers = new Map<number, EventObserver<unknown>[]>();
    private readonly queryStateCaches = new WeakMap<
        QueryState<readonly AnyComponentType[]>,
        QueryStateCache
    >();
    private readonly optionalQueryStateCaches = new WeakMap<
        OptionalQueryState<readonly AnyComponentType[], readonly AnyComponentType[]>,
        OptionalQueryStateCache
    >();
    private readonly systemSets = new Map<SystemSetLabel, SystemSetConfig>();
    private readonly systemSetsByStage = createSystemSetStageConfigs();
    private readonly schedules = createSchedules();
    private readonly sortedSchedules = createScheduleCacheEntries();
    private readonly resourceRuntime = new ResourceRuntime({
        resources: this.resources,
        getChangeTick: () => this.changeTick,
        getChangeDetectionRange: () => this.changeDetectionRange(),
    });
    private readonly removedRuntime = new RemovedRuntime({
        removedComponents: this.removedComponents,
        getChangeTick: () => this.changeTick,
    });
    private readonly componentHookRuntime = new ComponentHookRuntime({
        hooks: this.componentHooks,
    });
    private readonly stateRuntime = new StateRuntime({
        states: this.states,
    });
    private readonly eventRuntime = new EventRuntime(this.eventObservers);
    private readonly queryRuntime = new QueryRuntime({
        stores: this.stores,
        queryStateCaches: this.queryStateCaches,
        optionalQueryStateCaches: this.optionalQueryStateCaches,
        isAlive: (entity) => this.entities.isAlive(entity),
        getStoreVersion: () => this.componentStoreVersion,
    });
    private readonly scheduleRuntime = new ScheduleRuntime({
        systemSets: this.systemSets,
        systemSetsByStage: this.systemSetsByStage,
        schedules: this.schedules,
        sortedSchedules: this.sortedSchedules,
    });
    private activeChangeDetection: ChangeDetectionRange | undefined;
    private componentStoreVersion = 0;
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
        this.assertAlive(entity);

        for (const entry of bundle.entries) {
            this.add(entity, entry.type, entry.value);
        }

        return this;
    }

    removeBundle(entity: Entity, bundle: Bundle): boolean {
        let removedAny = false;

        for (const entry of bundle.entries) {
            removedAny = this.remove(entity, entry.type) || removedAny;
        }

        return removedAny;
    }

    isAlive(entity: Entity): boolean {
        return this.entities.isAlive(entity);
    }

    add<T>(entity: Entity, type: ComponentType<T>, value: T): this {
        this.assertAlive(entity);
        this.addWithRequired(entity, type, value, []);

        return this;
    }

    private addWithRequired<T>(
        entity: Entity,
        type: ComponentType<T>,
        value: T,
        resolving: readonly AnyComponentType[]
    ): void {
        assertComponentValue(type, value);
        this.addRequiredComponents(entity, type, resolving);
        this.insertComponentOnly(entity, type, value);
    }

    private addRequiredComponents(
        entity: Entity,
        type: AnyComponentType,
        resolving: readonly AnyComponentType[]
    ): void {
        if (type.required.length === 0) {
            return;
        }

        const cycleStart = resolving.findIndex((resolvedType) => resolvedType.id === type.id);

        if (cycleStart !== -1) {
            const cycle = [...resolving.slice(cycleStart), type]
                .map((resolvedType) => resolvedType.name)
                .join(" -> ");
            throw new Error(`Circular required component dependency: ${cycle}`);
        }

        const nextResolving = [...resolving, type];

        for (const required of type.required) {
            if (this.has(entity, required.type)) {
                continue;
            }

            this.addWithRequired(entity, required.type, required.create(), nextResolving);
        }
    }

    private insertComponentOnly<T>(entity: Entity, type: ComponentType<T>, value: T): void {
        assertComponentValue(type, value);
        const store = this.ensureStore(type);
        const hadComponent = store.has(entity);

        if (hadComponent) {
            this.runComponentHooks(type, "onReplace", entity, store.get(entity) as T);
        }

        store.set(entity, value, this.changeTick);

        if (!hadComponent) {
            this.runComponentHooks(type, "onAdd", entity, value);
        }

        this.runComponentHooks(type, "onInsert", entity, value);
    }

    markChanged<T>(entity: Entity, type: ComponentType<T>): boolean {
        if (!this.isAlive(entity)) {
            return false;
        }

        return this.getStore(type)?.markChanged(entity, this.changeTick) ?? false;
    }

    has<T>(entity: Entity, type: ComponentType<T>): boolean {
        return this.isAlive(entity) && (this.getStore(type)?.has(entity) ?? false);
    }

    hasAll(entity: Entity, types: readonly AnyComponentType[]): boolean {
        if (!this.isAlive(entity)) {
            return false;
        }

        for (const type of types) {
            if (!this.getStore(type)?.has(entity)) {
                return false;
            }
        }

        return true;
    }

    hasAny(entity: Entity, types: readonly AnyComponentType[]): boolean {
        if (!this.isAlive(entity)) {
            return false;
        }

        for (const type of types) {
            if (this.getStore(type)?.has(entity)) {
                return true;
            }
        }

        return false;
    }

    get<T>(entity: Entity, type: ComponentType<T>): T | undefined {
        if (!this.isAlive(entity)) {
            return undefined;
        }

        return this.getStore(type)?.get(entity);
    }

    mustGet<T>(entity: Entity, type: ComponentType<T>): T {
        const value = this.get(entity, type);

        if (value === undefined) {
            throw new Error(`Entity ${formatEntity(entity)} does not have ${type.name}`);
        }

        return value;
    }

    getMany<const TComponents extends readonly AnyComponentType[]>(
        entity: Entity,
        ...types: TComponents
    ): ComponentTuple<TComponents> | undefined {
        if (!this.isAlive(entity)) {
            return undefined;
        }

        const components: unknown[] = new Array(types.length);

        for (let index = 0; index < types.length; index++) {
            const type = types[index]!;
            const store = this.getStore(type);

            if (!store?.has(entity)) {
                return undefined;
            }

            components[index] = store.get(entity);
        }

        return components as ComponentTuple<TComponents>;
    }

    isAdded<T>(entity: Entity, type: ComponentType<T>): boolean {
        if (!this.isAlive(entity)) {
            return false;
        }

        const tick = this.getStore(type)?.getAddedTick(entity);

        return tick !== undefined && isTickInRange(tick, this.changeDetectionRange());
    }

    isChanged<T>(entity: Entity, type: ComponentType<T>): boolean {
        if (!this.isAlive(entity)) {
            return false;
        }

        const tick = this.getStore(type)?.getChangedTick(entity);

        return tick !== undefined && isTickInRange(tick, this.changeDetectionRange());
    }

    remove<T>(entity: Entity, type: ComponentType<T>): boolean {
        const store = this.getStore(type);

        if (!this.isAlive(entity) || !store?.has(entity)) {
            return false;
        }

        const component = store.get(entity) as T;
        this.runComponentHooks(type, "onReplace", entity, component);
        this.runComponentHooks(type, "onRemove", entity, component);
        this.recordRemoved(type, entity, component);
        store.delete(entity);

        return true;
    }

    despawn(entity: Entity): boolean {
        if (!this.isAlive(entity)) {
            return false;
        }

        for (const [componentId, store] of this.stores) {
            if (!store.has(entity)) {
                continue;
            }

            const type = this.componentTypes.get(componentId);
            const component = store.get(entity);

            if (type !== undefined) {
                this.runComponentHooks(type, "onReplace", entity, component);
                this.runComponentHooks(type, "onRemove", entity, component);
                this.runComponentHooks(type, "onDespawn", entity, component);
                this.recordRemoved(type, entity, component);
            }

            store.delete(entity);
        }

        return this.entities.destroy(entity);
    }

    query<const TComponents extends readonly AnyComponentType[]>(
        ...types: TComponents
    ): IterableIterator<QueryRow<TComponents>> {
        return this.queryRuntime.query(types, {}, this.changeDetectionRange());
    }

    queryWhere<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter
    ): IterableIterator<QueryRow<TComponents>> {
        return this.queryRuntime.query(types, filter, this.changeDetectionRange());
    }

    queryAdded<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents
    ): IterableIterator<QueryRow<TComponents>> {
        return this.queryRuntime.query(types, { added: types }, this.changeDetectionRange());
    }

    queryChanged<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents
    ): IterableIterator<QueryRow<TComponents>> {
        return this.queryRuntime.query(types, { changed: types }, this.changeDetectionRange());
    }

    queryOptional<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        required: TRequiredComponents,
        optional: TOptionalComponents,
        filter: QueryFilter = {}
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        return this.queryRuntime.queryOptional(
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
        return this.queryRuntime.queryWithState(state, this.changeDetectionRange());
    }

    matchesAnyWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): boolean {
        return this.queryRuntime.matchesAnyWithState(state, this.changeDetectionRange());
    }

    matchesNoneWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): boolean {
        return !this.matchesAnyWithState(state);
    }

    matchesSingleWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>
    ): boolean {
        return this.queryRuntime.matchesSingleWithState(state, this.changeDetectionRange());
    }

    queryOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(
        state: OptionalQueryState<TRequiredComponents, TOptionalComponents>
    ): IterableIterator<OptionalQueryRow<TRequiredComponents, TOptionalComponents>> {
        return this.queryRuntime.queryOptionalWithState(state, this.changeDetectionRange());
    }

    matchesAnyOptionalWithState<
        const TRequiredComponents extends readonly AnyComponentType[],
        const TOptionalComponents extends readonly AnyComponentType[],
    >(state: OptionalQueryState<TRequiredComponents, TOptionalComponents>): boolean {
        return this.queryRuntime.matchesAnyOptionalWithState(state, this.changeDetectionRange());
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
        return this.queryRuntime.matchesSingleOptionalWithState(state, this.changeDetectionRange());
    }

    eachWithState<const TComponents extends readonly AnyComponentType[]>(
        state: QueryState<TComponents>,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        this.queryRuntime.eachWithState(state, this.changeDetectionRange(), visitor);
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
        this.queryRuntime.eachOptionalWithState(state, this.changeDetectionRange(), visitor);
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
        this.queryRuntime.each(types, {}, this.changeDetectionRange(), visitor);
    }

    eachWhere<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        this.queryRuntime.each(types, filter, this.changeDetectionRange(), visitor);
    }

    eachAdded<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        this.queryRuntime.each(types, { added: types }, this.changeDetectionRange(), visitor);
    }

    eachChanged<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        this.queryRuntime.each(types, { changed: types }, this.changeDetectionRange(), visitor);
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
        this.queryRuntime.eachOptional(
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
            for (const stage of ["preStartup", "startup", "postStartup"] as const) {
                this.runSchedule(stage, 0);
            }

            this.didStartup = true;
        }

        this.updateMessages();
        this.stateRuntime.runInitialEnters(dt, (systems, systemDt) => {
            this.runSystems(systems, "update", systemDt);
        });
        this.runSchedule("first", dt);
        this.runSchedule("preUpdate", dt);
        this.runFixedUpdate(dt);
        this.stateRuntime.applyTransitions(dt, (systems, systemDt) => {
            this.runSystems(systems, "update", systemDt);
        });
        this.runSchedule("update", dt);
        this.runSchedule("postUpdate", dt);
        this.runSchedule("last", dt);
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
        this.ensureMessages(type);

        return this;
    }

    writeMessage<T>(type: MessageType<T>, value: T): MessageId<T> {
        const existing = this.messageStores[type.id] as Messages<T> | undefined;

        if (existing !== undefined) {
            return existing.write(value);
        }

        return this.ensureMessages(type).write(value);
    }

    readMessages<T>(reader: MessageReader<T>): readonly T[] {
        const messages = this.messageStores[reader.type.id] as Messages<T> | undefined;

        return messages?.read(reader) ?? [];
    }

    drainMessages<T>(type: MessageType<T>): T[] {
        const messages = this.messageStores[type.id] as Messages<T> | undefined;

        return messages?.drain() ?? [];
    }

    clearMessages<T>(type: MessageType<T>): this {
        (this.messageStores[type.id] as Messages<T> | undefined)?.clear();

        return this;
    }

    observe<T>(type: EventType<T>, observer: EventObserver<T>): () => void {
        return this.eventRuntime.observe(type.id, observer);
    }

    trigger<T>(type: EventType<T>, value: T): this {
        const observers = this.eventRuntime.get<T>(type.id);

        if (observers === undefined || observers.length === 0) {
            return this;
        }

        for (const observer of [...observers]) {
            const commands = new Commands(this);

            observer(value, this, commands);
            commands.flush();
        }

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
        const state = this.states.get(type.id) as StateRecord<T> | undefined;

        return state !== undefined && predicate(state.current, this);
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
        const entry = this.resources.get(type.id) as ResourceEntry<T> | undefined;

        return entry !== undefined && predicate(entry.value, this);
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

    private ensureStore<T>(type: ComponentType<T>): SparseSet<T> {
        this.componentTypes.set(type.id, type);

        const existing = this.stores.get(type.id);

        if (existing !== undefined) {
            return existing as SparseSet<T>;
        }

        const store = new SparseSet<T>();
        this.stores.set(type.id, store as SparseSet<unknown>);
        this.componentStoreVersion++;

        return store;
    }

    private getStore<T>(type: ComponentType<T>): SparseSet<T> | undefined {
        return this.stores.get(type.id) as SparseSet<T> | undefined;
    }

    private changeDetectionRange(): ChangeDetectionRange {
        return (
            this.activeChangeDetection ?? {
                lastRunTick: this.changeTick - 1,
                thisRunTick: this.changeTick,
            }
        );
    }

    private ensureMessages<T>(type: MessageType<T>): Messages<T> {
        const existing = this.messageStores[type.id];

        if (existing !== undefined) {
            return existing as Messages<T>;
        }

        const messages = new Messages<T>();
        this.messageStores[type.id] = messages as Messages<unknown>;

        return messages;
    }

    private updateMessages(): void {
        for (const messages of this.messageStores) {
            messages?.update();
        }
    }

    private recordRemoved<T>(type: ComponentType<T>, entity: Entity, component: T): void {
        this.removedRuntime.record(type, entity, component);
    }

    private registerSystem(system: System, options: SystemOptions): void {
        for (const stage of scheduleStages) {
            const methodName = lifecycleSystemMethods[stage];
            const method = system[methodName];

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

    private runSystems(systems: readonly SystemRunner[], stage: ScheduleStage, dt: number): void {
        for (const system of systems) {
            const previousChangeDetection = this.activeChangeDetection;
            const thisRunTick = this.changeTick;

            this.activeChangeDetection = {
                lastRunTick: system.lastRunTick,
                thisRunTick,
            };

            try {
                if (!this.shouldRunSystem(system, stage)) {
                    continue;
                }

                const commands = new Commands(this);
                system.run(this, dt, commands);
                commands.flush();
                system.lastRunTick = thisRunTick;
                this.changeTick++;
            } finally {
                this.activeChangeDetection = previousChangeDetection;
            }
        }
    }

    private shouldRunSystem(system: SystemRunner, stage: ScheduleStage): boolean {
        for (const set of system.sets) {
            if (this.systemSets.get(set)?.runIf?.(this) === false) {
                return false;
            }

            if (this.systemSetsByStage[stage].get(set)?.runIf?.(this) === false) {
                return false;
            }
        }

        return system.runIf?.(this) !== false;
    }

    private runComponentHooks<T>(
        type: ComponentType<T>,
        stage: ComponentLifecycleStage,
        entity: Entity,
        component: T
    ): void {
        this.componentHookRuntime.run(type, stage, entity, component, this);
    }

    private assertAlive(entity: Entity): void {
        if (!this.isAlive(entity)) {
            throw new Error(`Entity is not alive: ${formatEntity(entity)}`);
        }
    }
}
