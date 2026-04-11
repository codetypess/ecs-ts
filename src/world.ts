import type {
    AnyComponentType,
    ComponentData,
    ComponentEntry,
    ComponentHook,
    ComponentLifecycleStage,
    ComponentType,
} from "./component";
import { Entity, EntityManager, formatEntity } from "./entity";
import type { MessageId, MessageReader, MessageType } from "./message";
import { Messages } from "./message";
import type { ResourceType } from "./resource";
import { SparseSet } from "./sparse-set";
import type { StateType, StateValue } from "./state";

export type ComponentTuple<TComponents extends readonly AnyComponentType[]> = {
    [TIndex in keyof TComponents]: ComponentData<TComponents[TIndex]>;
};

export type QueryRow<TComponents extends readonly AnyComponentType[]> = [
    Entity,
    ...ComponentTuple<TComponents>,
];

export interface QueryFilter {
    readonly with?: readonly AnyComponentType[];
    readonly without?: readonly AnyComponentType[];
    readonly added?: readonly AnyComponentType[];
    readonly changed?: readonly AnyComponentType[];
}

export const scheduleStages = [
    "preStartup",
    "startup",
    "postStartup",
    "first",
    "preUpdate",
    "update",
    "postUpdate",
    "last",
    "shutdown",
] as const;

export type ScheduleStage = (typeof scheduleStages)[number];

type SystemRunner = (world: World, dt: number, commands: Commands) => void;

export interface System {
    onPreStartup?(world: World, dt: number, commands: Commands): void;
    onStartup?(world: World, dt: number, commands: Commands): void;
    onPostStartup?(world: World, dt: number, commands: Commands): void;
    onFirst?(world: World, dt: number, commands: Commands): void;
    onPreUpdate?(world: World, dt: number, commands: Commands): void;
    onUpdate?(world: World, dt: number, commands: Commands): void;
    onPostUpdate?(world: World, dt: number, commands: Commands): void;
    onLast?(world: World, dt: number, commands: Commands): void;
    onShutdown?(world: World, dt: number, commands: Commands): void;
}

type CommandRunner = (world: World) => void;

type ComponentHookRegistry = {
    [TStage in ComponentLifecycleStage]?: ComponentHook<unknown>[];
};

interface StateRecord<T extends StateValue> {
    readonly type: StateType<T>;
    current: T;
    next: T | undefined;
    hasNext: boolean;
    didEnterInitial: boolean;
    readonly onEnter: Map<T, SystemRunner[]>;
    readonly onExit: Map<T, SystemRunner[]>;
    readonly onTransition: Map<T, Map<T, SystemRunner[]>>;
}

interface ResolvedQueryFilter {
    readonly with: readonly SparseSet<unknown>[];
    readonly without: readonly SparseSet<unknown>[];
    readonly added: readonly SparseSet<unknown>[];
    readonly changed: readonly SparseSet<unknown>[];
}

export interface RemovedComponent<T> {
    readonly entity: Entity;
    readonly component: T;
    readonly tick: number;
}

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
        const entity = this.world.spawn();

        for (const entry of entries) {
            this.add(entity, entry.type, entry.value);
        }

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
    private readonly entities = new EntityManager();
    private readonly stores = new Map<number, SparseSet<unknown>>();
    private readonly componentTypes = new Map<number, AnyComponentType>();
    private readonly resources = new Map<number, unknown>();
    private readonly states = new Map<number, StateRecord<StateValue>>();
    private readonly componentHooks = new Map<number, ComponentHookRegistry>();
    private readonly removedComponents = new Map<number, RemovedComponent<unknown>[]>();
    private readonly messageStores = new Map<number, Messages<unknown>>();
    private readonly schedules = createSchedules();
    private changeTick = 1;
    private didStartup = false;
    private didShutdown = false;

    spawn(...entries: ComponentEntry<unknown>[]): Entity {
        const entity = this.entities.create();

        for (const entry of entries) {
            this.add(entity, entry.type, entry.value);
        }

        return entity;
    }

    isAlive(entity: Entity): boolean {
        return this.entities.isAlive(entity);
    }

    add<T>(entity: Entity, type: ComponentType<T>, value: T): this {
        this.assertAlive(entity);

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

        return this;
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

    get<T>(entity: Entity, type: ComponentType<T>): T | undefined {
        if (!this.isAlive(entity)) {
            return undefined;
        }

        return this.getStore(type)?.get(entity);
    }

    mustGet<T>(entity: Entity, type: ComponentType<T>): T {
        if (!this.has(entity, type)) {
            throw new Error(`Entity ${formatEntity(entity)} does not have ${type.name}`);
        }

        return this.get(entity, type)!;
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

        return this.getStore(type)?.getAddedTick(entity) === this.changeTick;
    }

    isChanged<T>(entity: Entity, type: ComponentType<T>): boolean {
        if (!this.isAlive(entity)) {
            return false;
        }

        return this.getStore(type)?.getChangedTick(entity) === this.changeTick;
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
        return this.iterateQuery(types, {});
    }

    queryWhere<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter
    ): IterableIterator<QueryRow<TComponents>> {
        return this.iterateQuery(types, filter);
    }

    queryAdded<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents
    ): IterableIterator<QueryRow<TComponents>> {
        return this.iterateQuery(types, { added: types });
    }

    queryChanged<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents
    ): IterableIterator<QueryRow<TComponents>> {
        return this.iterateQuery(types, { changed: types });
    }

    each<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        this.eachWithFilter(types, {}, visitor);
    }

    eachWhere<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        this.eachWithFilter(types, filter, visitor);
    }

    eachAdded<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        this.eachWithFilter(types, { added: types }, visitor);
    }

    eachChanged<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        this.eachWithFilter(types, { changed: types }, visitor);
    }

    drainRemoved<T>(type: ComponentType<T>): RemovedComponent<T>[] {
        const removed = this.removedComponents.get(type.id);

        if (removed === undefined || removed.length === 0) {
            return [];
        }

        this.removedComponents.set(type.id, []);

        return removed as RemovedComponent<T>[];
    }

    private eachWithFilter<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter,
        visitor: (entity: Entity, ...components: ComponentTuple<TComponents>) => void
    ): void {
        const stores = this.resolveQueryStores(types);

        if (stores === undefined) {
            return;
        }

        const filterStores = this.resolveFilterStores(filter);

        if (filterStores === undefined) {
            return;
        }

        const baseStore = chooseSmallestStore([
            ...stores,
            ...filterStores.with,
            ...filterStores.added,
            ...filterStores.changed,
        ]);
        const components: unknown[] = new Array(stores.length);

        for (const entity of baseStore.entities) {
            if (!this.isAlive(entity)) {
                continue;
            }

            if (!matchesFilter(entity, filterStores, this.changeTick)) {
                continue;
            }

            if (!this.fillComponents(entity, stores, components)) {
                continue;
            }

            visitor(entity, ...(components as ComponentTuple<TComponents>));
        }
    }

    addSystem(system: System): this {
        this.registerSystem(system);

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
        this.runInitialStateEnters(dt);
        this.runSchedule("first", dt);
        this.runSchedule("preUpdate", dt);
        this.applyStateTransitions(dt);
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
        return this.ensureMessages(type).write(value);
    }

    readMessages<T>(reader: MessageReader<T>): readonly T[] {
        return this.getMessages(reader.type)?.read(reader) ?? [];
    }

    drainMessages<T>(type: MessageType<T>): T[] {
        return this.getMessages(type)?.drain() ?? [];
    }

    clearMessages<T>(type: MessageType<T>): this {
        this.getMessages(type)?.clear();

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
        const registry = this.componentHooks.get(type.id) ?? {};
        const hooks = registry[stage] ?? [];

        hooks.push(hook);
        registry[stage] = hooks;
        this.componentHooks.set(type.id, registry);

        return () => {
            const index = hooks.indexOf(hook);

            if (index !== -1) {
                hooks.splice(index, 1);
            }
        };
    }

    initState<T extends StateValue>(type: StateType<T>, initial = type.initial): this {
        if (this.states.has(type.id)) {
            throw new Error(`State is already initialized: ${type.name}`);
        }

        this.states.set(type.id, createStateRecord(type, initial));

        return this;
    }

    state<T extends StateValue>(type: StateType<T>): T {
        return this.requireState(type).current;
    }

    setState<T extends StateValue>(type: StateType<T>, next: T): this {
        const state = this.ensureState(type);
        state.next = next;
        state.hasNext = true;

        return this;
    }

    onEnter<T extends StateValue>(
        type: StateType<T>,
        value: T,
        system: (world: World, dt: number, commands: Commands) => void
    ): this {
        getStateSystems(this.ensureState(type).onEnter, value).push(system);

        return this;
    }

    onExit<T extends StateValue>(
        type: StateType<T>,
        value: T,
        system: (world: World, dt: number, commands: Commands) => void
    ): this {
        getStateSystems(this.ensureState(type).onExit, value).push(system);

        return this;
    }

    onTransition<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: (world: World, dt: number, commands: Commands) => void
    ): this {
        this.addTransitionRunner(type, from, to, system);

        return this;
    }

    private addTransitionRunner<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: SystemRunner
    ): void {
        const state = this.ensureState(type);
        let transitionsFrom = state.onTransition.get(from);

        if (transitionsFrom === undefined) {
            transitionsFrom = new Map<T, SystemRunner[]>();
            state.onTransition.set(from, transitionsFrom);
        }

        getStateSystems(transitionsFrom, to).push(system);
    }

    addStateSystem<T extends StateValue>(
        type: StateType<T>,
        value: T,
        system: StateSystem<T>
    ): this {
        const state = this.ensureState(type);

        if (system.onEnter !== undefined) {
            getStateSystems(state.onEnter, value).push((world, dt, commands) => {
                system.onEnter?.(world, dt, commands, value);
            });
        }

        if (system.onExit !== undefined) {
            getStateSystems(state.onExit, value).push((world, dt, commands) => {
                system.onExit?.(world, dt, commands, value);
            });
        }

        return this;
    }

    addTransitionSystem<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: TransitionSystem<T>
    ): this {
        if (system.onTransition === undefined) {
            return this;
        }

        this.addTransitionRunner(type, from, to, (world, dt, commands) => {
            system.onTransition?.(world, dt, commands, from, to);
        });

        return this;
    }

    setResource<T>(type: ResourceType<T>, value: T): this {
        this.resources.set(type.id, value);

        return this;
    }

    getResource<T>(type: ResourceType<T>): T | undefined {
        return this.resources.get(type.id) as T | undefined;
    }

    resource<T>(type: ResourceType<T>): T {
        if (!this.resources.has(type.id)) {
            throw new Error(`Resource not found: ${type.name}`);
        }

        return this.resources.get(type.id) as T;
    }

    removeResource<T>(type: ResourceType<T>): T | undefined {
        const value = this.resources.get(type.id) as T | undefined;
        this.resources.delete(type.id);

        return value;
    }

    private *iterateQuery<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter
    ): IterableIterator<QueryRow<TComponents>> {
        const stores = this.resolveQueryStores(types);

        if (stores === undefined) {
            return;
        }

        const filterStores = this.resolveFilterStores(filter);

        if (filterStores === undefined) {
            return;
        }

        const baseStore = chooseSmallestStore([
            ...stores,
            ...filterStores.with,
            ...filterStores.added,
            ...filterStores.changed,
        ]);
        const components: unknown[] = new Array(stores.length);

        for (const entity of baseStore.entities) {
            if (!this.isAlive(entity)) {
                continue;
            }

            if (!matchesFilter(entity, filterStores, this.changeTick)) {
                continue;
            }

            if (!this.fillComponents(entity, stores, components)) {
                continue;
            }

            yield [entity, ...components] as unknown as QueryRow<TComponents>;
        }
    }

    private fillComponents(
        entity: Entity,
        stores: readonly SparseSet<unknown>[],
        output: unknown[]
    ): boolean {
        for (let index = 0; index < stores.length; index++) {
            const store = stores[index]!;

            if (!store.has(entity)) {
                return false;
            }

            output[index] = store.get(entity);
        }

        return true;
    }

    private resolveQueryStores(
        types: readonly AnyComponentType[]
    ): SparseSet<unknown>[] | undefined {
        if (types.length === 0) {
            throw new Error("Query requires at least one component type");
        }

        const stores: SparseSet<unknown>[] = new Array(types.length);

        for (let index = 0; index < types.length; index++) {
            const store = this.stores.get(types[index]!.id);

            if (store === undefined) {
                return undefined;
            }

            stores[index] = store;
        }

        return stores;
    }

    private resolveFilterStores(filter: QueryFilter): ResolvedQueryFilter | undefined {
        const withStores: SparseSet<unknown>[] = [];
        const withoutStores: SparseSet<unknown>[] = [];
        const addedStores: SparseSet<unknown>[] = [];
        const changedStores: SparseSet<unknown>[] = [];

        for (const type of filter.with ?? []) {
            const store = this.stores.get(type.id);

            if (store === undefined) {
                return undefined;
            }

            withStores.push(store);
        }

        for (const type of filter.without ?? []) {
            const store = this.stores.get(type.id);

            if (store !== undefined) {
                withoutStores.push(store);
            }
        }

        for (const type of filter.added ?? []) {
            const store = this.stores.get(type.id);

            if (store === undefined) {
                return undefined;
            }

            addedStores.push(store);
        }

        for (const type of filter.changed ?? []) {
            const store = this.stores.get(type.id);

            if (store === undefined) {
                return undefined;
            }

            changedStores.push(store);
        }

        return {
            with: withStores,
            without: withoutStores,
            added: addedStores,
            changed: changedStores,
        };
    }

    private ensureStore<T>(type: ComponentType<T>): SparseSet<T> {
        this.componentTypes.set(type.id, type);

        const existing = this.stores.get(type.id);

        if (existing !== undefined) {
            return existing as SparseSet<T>;
        }

        const store = new SparseSet<T>();
        this.stores.set(type.id, store as SparseSet<unknown>);

        return store;
    }

    private getStore<T>(type: ComponentType<T>): SparseSet<T> | undefined {
        return this.stores.get(type.id) as SparseSet<T> | undefined;
    }

    private ensureMessages<T>(type: MessageType<T>): Messages<T> {
        const existing = this.messageStores.get(type.id);

        if (existing !== undefined) {
            return existing as Messages<T>;
        }

        const messages = new Messages<T>();
        this.messageStores.set(type.id, messages as Messages<unknown>);

        return messages;
    }

    private getMessages<T>(type: MessageType<T>): Messages<T> | undefined {
        return this.messageStores.get(type.id) as Messages<T> | undefined;
    }

    private updateMessages(): void {
        for (const messages of this.messageStores.values()) {
            messages.update();
        }
    }

    private recordRemoved<T>(type: ComponentType<T>, entity: Entity, component: T): void {
        const removed = this.removedComponents.get(type.id) ?? [];
        removed.push({
            entity,
            component,
            tick: this.changeTick,
        });
        this.removedComponents.set(type.id, removed);
    }

    private registerSystem(system: System): void {
        for (const stage of scheduleStages) {
            const methodName = lifecycleSystemMethods[stage];
            const method = system[methodName];

            if (method !== undefined) {
                this.schedules[stage].push(method.bind(system));
            }
        }
    }

    private runSchedule(stage: ScheduleStage, dt: number): void {
        this.runSystems(this.schedules[stage], dt);
    }

    private runSystems(systems: readonly SystemRunner[], dt: number): void {
        for (const system of systems) {
            const commands = new Commands(this);
            system(this, dt, commands);
            commands.flush();
        }
    }

    private runInitialStateEnters(dt: number): void {
        for (const state of this.states.values()) {
            if (state.didEnterInitial) {
                continue;
            }

            this.runSystems(state.onEnter.get(state.current) ?? [], dt);
            state.didEnterInitial = true;
        }
    }

    private applyStateTransitions(dt: number): void {
        for (const state of this.states.values()) {
            if (!state.hasNext) {
                continue;
            }

            const from = state.current;
            const to = state.next as typeof state.current;

            state.next = undefined;
            state.hasNext = false;

            if (Object.is(from, to)) {
                continue;
            }

            state.didEnterInitial = true;
            this.runSystems(state.onExit.get(from) ?? [], dt);
            this.runSystems(state.onTransition.get(from)?.get(to) ?? [], dt);
            state.current = to;
            this.runSystems(state.onEnter.get(to) ?? [], dt);
        }
    }

    private runComponentHooks<T>(
        type: ComponentType<T>,
        stage: ComponentLifecycleStage,
        entity: Entity,
        component: T
    ): void {
        type.lifecycle[stage]?.(entity, component, this);

        const registeredHooks = this.componentHooks.get(type.id)?.[stage] ?? [];

        for (const hook of registeredHooks) {
            hook(entity, component, this);
        }
    }

    private assertAlive(entity: Entity): void {
        if (!this.isAlive(entity)) {
            throw new Error(`Entity is not alive: ${formatEntity(entity)}`);
        }
    }

    private ensureState<T extends StateValue>(type: StateType<T>): StateRecord<T> {
        const state = this.states.get(type.id);

        if (state !== undefined) {
            return state as StateRecord<T>;
        }

        const created = createStateRecord(type, type.initial);
        this.states.set(type.id, created);

        return created;
    }

    private requireState<T extends StateValue>(type: StateType<T>): StateRecord<T> {
        const state = this.states.get(type.id);

        if (state === undefined) {
            throw new Error(`State is not initialized: ${type.name}`);
        }

        return state as StateRecord<T>;
    }
}

function createStateRecord<T extends StateValue>(type: StateType<T>, initial: T): StateRecord<T> {
    return {
        type,
        current: initial,
        next: undefined,
        hasNext: false,
        didEnterInitial: false,
        onEnter: new Map(),
        onExit: new Map(),
        onTransition: new Map(),
    };
}

function getStateSystems<T extends StateValue>(
    systemsByValue: Map<T, SystemRunner[]>,
    value: T
): SystemRunner[] {
    const existing = systemsByValue.get(value);

    if (existing !== undefined) {
        return existing;
    }

    const systems: SystemRunner[] = [];
    systemsByValue.set(value, systems);

    return systems;
}

function matchesFilter(
    entity: Entity,
    filter: ResolvedQueryFilter,
    currentTick: number
): boolean {
    for (const store of filter.with) {
        if (!store.has(entity)) {
            return false;
        }
    }

    for (const store of filter.without) {
        if (store.has(entity)) {
            return false;
        }
    }

    if (!matchesAddedStore(entity, filter.added, currentTick)) {
        return false;
    }

    if (!matchesChangedStore(entity, filter.changed, currentTick)) {
        return false;
    }

    return true;
}

function matchesChangedStore(
    entity: Entity,
    stores: readonly SparseSet<unknown>[],
    currentTick: number
): boolean {
    if (stores.length === 0) {
        return true;
    }

    for (const store of stores) {
        if (store.getChangedTick(entity) === currentTick) {
            return true;
        }
    }

    return false;
}

function matchesAddedStore(
    entity: Entity,
    stores: readonly SparseSet<unknown>[],
    currentTick: number
): boolean {
    if (stores.length === 0) {
        return true;
    }

    for (const store of stores) {
        if (store.getAddedTick(entity) === currentTick) {
            return true;
        }
    }

    return false;
}

function createSchedules(): Record<ScheduleStage, SystemRunner[]> {
    return {
        preStartup: [],
        startup: [],
        postStartup: [],
        first: [],
        preUpdate: [],
        update: [],
        postUpdate: [],
        last: [],
        shutdown: [],
    };
}

function chooseSmallestStore(stores: readonly SparseSet<unknown>[]): SparseSet<unknown> {
    let smallest = stores[0]!;

    for (let index = 1; index < stores.length; index++) {
        const store = stores[index]!;

        if (store.size < smallest.size) {
            smallest = store;
        }
    }

    return smallest;
}
