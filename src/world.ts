import type {
    AnyComponentType,
    Bundle,
    ComponentData,
    ComponentEntry,
    ComponentHook,
    ComponentLifecycleStage,
    ComponentType,
} from "./component";
import { Entity, EntityManager, formatEntity } from "./entity";
import type { MessageId, MessageReader, MessageType } from "./message";
import { Messages } from "./message";
import type { RemovedComponent, RemovedReader } from "./removed";
import { RemovedComponents } from "./removed";
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

type SystemCallback = (world: World, dt: number, commands: Commands) => void;

interface SystemRunner {
    readonly run: SystemCallback;
    lastRunTick: number;
}

interface ChangeDetectionRange {
    readonly lastRunTick: number;
    readonly thisRunTick: number;
}

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
    private readonly removedComponents = new Map<number, RemovedComponents<unknown>>();
    private readonly messageStores = new Map<number, Messages<unknown>>();
    private readonly schedules = createSchedules();
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
        return this.iterateQuery(types, {}, this.changeDetectionRange());
    }

    queryWhere<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents,
        filter: QueryFilter
    ): IterableIterator<QueryRow<TComponents>> {
        return this.iterateQuery(types, filter, this.changeDetectionRange());
    }

    queryAdded<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents
    ): IterableIterator<QueryRow<TComponents>> {
        return this.iterateQuery(types, { added: types }, this.changeDetectionRange());
    }

    queryChanged<const TComponents extends readonly AnyComponentType[]>(
        types: TComponents
    ): IterableIterator<QueryRow<TComponents>> {
        return this.iterateQuery(types, { changed: types }, this.changeDetectionRange());
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
        return this.getRemovedComponents(type)?.drain() ?? [];
    }

    readRemoved<T>(reader: RemovedReader<T>): readonly RemovedComponent<T>[] {
        return this.getRemovedComponents(reader.type)?.read(reader) ?? [];
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

        const changeDetection = this.changeDetectionRange();
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

            if (!matchesFilter(entity, filterStores, changeDetection)) {
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
        system: SystemCallback
    ): this {
        getStateSystems(this.ensureState(type).onEnter, value).push(createSystemRunner(system));

        return this;
    }

    onExit<T extends StateValue>(
        type: StateType<T>,
        value: T,
        system: SystemCallback
    ): this {
        getStateSystems(this.ensureState(type).onExit, value).push(createSystemRunner(system));

        return this;
    }

    onTransition<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: SystemCallback
    ): this {
        this.addTransitionRunner(type, from, to, system);

        return this;
    }

    private addTransitionRunner<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: SystemCallback
    ): void {
        const state = this.ensureState(type);
        let transitionsFrom = state.onTransition.get(from);

        if (transitionsFrom === undefined) {
            transitionsFrom = new Map<T, SystemRunner[]>();
            state.onTransition.set(from, transitionsFrom);
        }

        getStateSystems(transitionsFrom, to).push(createSystemRunner(system));
    }

    addStateSystem<T extends StateValue>(
        type: StateType<T>,
        value: T,
        system: StateSystem<T>
    ): this {
        const state = this.ensureState(type);

        if (system.onEnter !== undefined) {
            getStateSystems(state.onEnter, value).push(
                createSystemRunner((world, dt, commands) => {
                    system.onEnter?.(world, dt, commands, value);
                })
            );
        }

        if (system.onExit !== undefined) {
            getStateSystems(state.onExit, value).push(
                createSystemRunner((world, dt, commands) => {
                    system.onExit?.(world, dt, commands, value);
                })
            );
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
        filter: QueryFilter,
        changeDetection: ChangeDetectionRange
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

            if (!matchesFilter(entity, filterStores, changeDetection)) {
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

    private changeDetectionRange(): ChangeDetectionRange {
        return (
            this.activeChangeDetection ?? {
                lastRunTick: this.changeTick - 1,
                thisRunTick: this.changeTick,
            }
        );
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

    private ensureRemovedComponents<T>(type: ComponentType<T>): RemovedComponents<T> {
        const existing = this.removedComponents.get(type.id);

        if (existing !== undefined) {
            return existing as RemovedComponents<T>;
        }

        const removed = new RemovedComponents<T>();
        this.removedComponents.set(type.id, removed as RemovedComponents<unknown>);

        return removed;
    }

    private getRemovedComponents<T>(type: ComponentType<T>): RemovedComponents<T> | undefined {
        return this.removedComponents.get(type.id) as RemovedComponents<T> | undefined;
    }

    private updateMessages(): void {
        for (const messages of this.messageStores.values()) {
            messages.update();
        }
    }

    private recordRemoved<T>(type: ComponentType<T>, entity: Entity, component: T): void {
        this.ensureRemovedComponents(type).push(entity, component, this.changeTick);
    }

    private registerSystem(system: System): void {
        for (const stage of scheduleStages) {
            const methodName = lifecycleSystemMethods[stage];
            const method = system[methodName];

            if (method !== undefined) {
                this.schedules[stage].push(createSystemRunner(method.bind(system)));
            }
        }
    }

    private runSchedule(stage: ScheduleStage, dt: number): void {
        this.runSystems(this.schedules[stage], dt);
    }

    private runSystems(systems: readonly SystemRunner[], dt: number): void {
        for (const system of systems) {
            const commands = new Commands(this);
            const previousChangeDetection = this.activeChangeDetection;
            const thisRunTick = this.changeTick;

            this.activeChangeDetection = {
                lastRunTick: system.lastRunTick,
                thisRunTick,
            };

            try {
                system.run(this, dt, commands);
                commands.flush();
                system.lastRunTick = thisRunTick;
                this.changeTick++;
            } finally {
                this.activeChangeDetection = previousChangeDetection;
            }
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

function createSystemRunner(run: SystemCallback): SystemRunner {
    return {
        run,
        lastRunTick: 0,
    };
}

function matchesFilter(
    entity: Entity,
    filter: ResolvedQueryFilter,
    changeDetection: ChangeDetectionRange
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

    if (!matchesAddedStore(entity, filter.added, changeDetection)) {
        return false;
    }

    if (!matchesChangedStore(entity, filter.changed, changeDetection)) {
        return false;
    }

    return true;
}

function matchesChangedStore(
    entity: Entity,
    stores: readonly SparseSet<unknown>[],
    changeDetection: ChangeDetectionRange
): boolean {
    if (stores.length === 0) {
        return true;
    }

    for (const store of stores) {
        const tick = store.getChangedTick(entity);

        if (tick !== undefined && isTickInRange(tick, changeDetection)) {
            return true;
        }
    }

    return false;
}

function matchesAddedStore(
    entity: Entity,
    stores: readonly SparseSet<unknown>[],
    changeDetection: ChangeDetectionRange
): boolean {
    if (stores.length === 0) {
        return true;
    }

    for (const store of stores) {
        const tick = store.getAddedTick(entity);

        if (tick !== undefined && isTickInRange(tick, changeDetection)) {
            return true;
        }
    }

    return false;
}

function isTickInRange(tick: number, changeDetection: ChangeDetectionRange): boolean {
    return tick > changeDetection.lastRunTick && tick <= changeDetection.thisRunTick;
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
