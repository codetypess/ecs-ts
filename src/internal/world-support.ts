import type {
    ComponentHook,
    ComponentLifecycleStage,
    ComponentType,
} from "../component";
import type { Entity } from "../entity";
import type { EventObserver } from "../event";
import type { RemovedComponent, RemovedReader } from "../removed";
import { RemovedComponents } from "../removed";
import type { ResourceType } from "../resource";
import type { SystemCallback, SystemRunner } from "../scheduler";
import { createSystemRunner } from "../scheduler";
import type { StateType, StateValue } from "../state";
import type { ChangeDetectionRange } from "../query";
import { isTickInRange } from "../query";
import type { Commands, World } from "../world";

export interface ResourceEntry<T> {
    value: T;
    readonly addedTick: number;
    changedTick: number;
}

export type ComponentHookRegistry = {
    [TStage in ComponentLifecycleStage]?: ComponentHook<unknown>[];
};

export interface StateRecord<T extends StateValue> {
    readonly type: StateType<T>;
    current: T;
    next: T | undefined;
    hasNext: boolean;
    didEnterInitial: boolean;
    readonly onEnter: Map<T, SystemRunner[]>;
    readonly onExit: Map<T, SystemRunner[]>;
    readonly onTransition: Map<T, Map<T, SystemRunner[]>>;
}

interface ResourceRuntimeOptions {
    readonly resources: Map<number, ResourceEntry<unknown>>;
    readonly getChangeTick: () => number;
    readonly getChangeDetectionRange: () => ChangeDetectionRange;
}

export class ResourceRuntime {
    constructor(private readonly options: ResourceRuntimeOptions) {}

    set<T>(type: ResourceType<T>, value: T): void {
        const existing = this.getEntry(type);

        if (existing !== undefined) {
            existing.value = value;
            existing.changedTick = this.options.getChangeTick();
            return;
        }

        this.options.resources.set(type.id, {
            value,
            addedTick: this.options.getChangeTick(),
            changedTick: this.options.getChangeTick(),
        } satisfies ResourceEntry<T> as ResourceEntry<unknown>);
    }

    has<T>(type: ResourceType<T>): boolean {
        return this.options.resources.has(type.id);
    }

    get<T>(type: ResourceType<T>): T | undefined {
        return this.getEntry(type)?.value;
    }

    remove<T>(type: ResourceType<T>): T | undefined {
        const value = this.getEntry(type)?.value;
        this.options.resources.delete(type.id);

        return value;
    }

    markChanged<T>(type: ResourceType<T>): boolean {
        const entry = this.getEntry(type);

        if (entry === undefined) {
            return false;
        }

        entry.changedTick = this.options.getChangeTick();

        return true;
    }

    isAdded<T>(type: ResourceType<T>): boolean {
        const entry = this.getEntry(type);

        return (
            entry !== undefined &&
            isTickInRange(entry.addedTick, this.options.getChangeDetectionRange())
        );
    }

    isChanged<T>(type: ResourceType<T>): boolean {
        const entry = this.getEntry(type);

        return (
            entry !== undefined &&
            isTickInRange(entry.changedTick, this.options.getChangeDetectionRange())
        );
    }

    private getEntry<T>(type: ResourceType<T>): ResourceEntry<T> | undefined {
        return this.options.resources.get(type.id) as ResourceEntry<T> | undefined;
    }
}

interface RemovedRuntimeOptions {
    readonly removedComponents: Map<number, RemovedComponents<unknown>>;
    readonly getChangeTick: () => number;
}

export class RemovedRuntime {
    constructor(private readonly options: RemovedRuntimeOptions) {}

    read<T>(reader: RemovedReader<T>): readonly RemovedComponent<T>[] {
        return this.get(reader.type)?.read(reader) ?? [];
    }

    drain<T>(type: ComponentType<T>): RemovedComponent<T>[] {
        return this.get(type)?.drain() ?? [];
    }

    record<T>(type: ComponentType<T>, entity: Entity, component: T): void {
        this.ensure(type).push(entity, component, this.options.getChangeTick());
    }

    private ensure<T>(type: ComponentType<T>): RemovedComponents<T> {
        const existing = this.options.removedComponents.get(type.id);

        if (existing !== undefined) {
            return existing as RemovedComponents<T>;
        }

        const removed = new RemovedComponents<T>();
        this.options.removedComponents.set(type.id, removed as RemovedComponents<unknown>);

        return removed;
    }

    private get<T>(type: ComponentType<T>): RemovedComponents<T> | undefined {
        return this.options.removedComponents.get(type.id) as RemovedComponents<T> | undefined;
    }
}

interface ComponentHookRuntimeOptions {
    readonly hooks: Map<number, ComponentHookRegistry>;
}

export class ComponentHookRuntime {
    constructor(private readonly options: ComponentHookRuntimeOptions) {}

    add<T>(
        type: ComponentType<T>,
        stage: ComponentLifecycleStage,
        hook: ComponentHook<T>
    ): () => void {
        const registry = this.options.hooks.get(type.id) ?? {};
        const hooks = registry[stage] ?? [];

        hooks.push(hook);
        registry[stage] = hooks;
        this.options.hooks.set(type.id, registry);

        return () => {
            const index = hooks.indexOf(hook);

            if (index !== -1) {
                hooks.splice(index, 1);
            }
        };
    }

    run<T>(
        type: ComponentType<T>,
        stage: ComponentLifecycleStage,
        entity: Entity,
        component: T,
        world: World
    ): void {
        type.lifecycle[stage]?.(entity, component, world);

        const registeredHooks = this.options.hooks.get(type.id)?.[stage] ?? [];

        for (const hook of registeredHooks) {
            hook(entity, component, world);
        }
    }
}

interface StateRuntimeOptions {
    readonly states: Map<number, StateRecord<StateValue>>;
}

export class StateRuntime {
    constructor(private readonly options: StateRuntimeOptions) {}

    init<T extends StateValue>(type: StateType<T>, initial = type.initial): void {
        if (this.options.states.has(type.id)) {
            throw new Error(`State is already initialized: ${type.name}`);
        }

        this.options.states.set(type.id, createStateRecord(type, initial));
    }

    has<T extends StateValue>(type: StateType<T>): boolean {
        return this.options.states.has(type.id);
    }

    current<T extends StateValue>(type: StateType<T>): T {
        return this.require(type).current;
    }

    set<T extends StateValue>(type: StateType<T>, next: T): void {
        const state = this.ensure(type);
        state.next = next;
        state.hasNext = true;
    }

    onEnter<T extends StateValue>(type: StateType<T>, value: T, system: SystemCallback): void {
        getStateSystems(this.ensure(type).onEnter, value).push(createSystemRunner(system));
    }

    onExit<T extends StateValue>(type: StateType<T>, value: T, system: SystemCallback): void {
        getStateSystems(this.ensure(type).onExit, value).push(createSystemRunner(system));
    }

    onTransition<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: SystemCallback
    ): void {
        this.addTransitionRunner(type, from, to, system);
    }

    addStateSystem<T extends StateValue>(
        type: StateType<T>,
        value: T,
        onEnter: ((world: World, dt: number, commands: Commands, value: T) => void) | undefined,
        onExit: ((world: World, dt: number, commands: Commands, value: T) => void) | undefined
    ): void {
        const state = this.ensure(type);

        if (onEnter !== undefined) {
            getStateSystems(state.onEnter, value).push(
                createSystemRunner((world, dt, commands) => {
                    onEnter(world, dt, commands, value);
                })
            );
        }

        if (onExit !== undefined) {
            getStateSystems(state.onExit, value).push(
                createSystemRunner((world, dt, commands) => {
                    onExit(world, dt, commands, value);
                })
            );
        }
    }

    addTransitionSystem<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        onTransition:
            | ((world: World, dt: number, commands: Commands, from: T, to: T) => void)
            | undefined
    ): void {
        if (onTransition === undefined) {
            return;
        }

        this.addTransitionRunner(type, from, to, (world, dt, commands) => {
            onTransition(world, dt, commands, from, to);
        });
    }

    runInitialEnters(
        dt: number,
        runSystems: (systems: readonly SystemRunner[], dt: number) => void
    ): void {
        for (const state of this.options.states.values()) {
            if (state.didEnterInitial) {
                continue;
            }

            runSystems(state.onEnter.get(state.current) ?? [], dt);
            state.didEnterInitial = true;
        }
    }

    applyTransitions(
        dt: number,
        runSystems: (systems: readonly SystemRunner[], dt: number) => void
    ): void {
        for (const state of this.options.states.values()) {
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
            runSystems(state.onExit.get(from) ?? [], dt);
            runSystems(state.onTransition.get(from)?.get(to) ?? [], dt);
            state.current = to;
            runSystems(state.onEnter.get(to) ?? [], dt);
        }
    }

    private addTransitionRunner<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: SystemCallback
    ): void {
        const state = this.ensure(type);
        let transitionsFrom = state.onTransition.get(from);

        if (transitionsFrom === undefined) {
            transitionsFrom = new Map<T, SystemRunner[]>();
            state.onTransition.set(from, transitionsFrom);
        }

        getStateSystems(transitionsFrom, to).push(createSystemRunner(system));
    }

    private ensure<T extends StateValue>(type: StateType<T>): StateRecord<T> {
        const state = this.options.states.get(type.id);

        if (state !== undefined) {
            return state as StateRecord<T>;
        }

        const created = createStateRecord(type, type.initial);
        this.options.states.set(type.id, created);

        return created;
    }

    private require<T extends StateValue>(type: StateType<T>): StateRecord<T> {
        const state = this.options.states.get(type.id);

        if (state === undefined) {
            throw new Error(`State is not initialized: ${type.name}`);
        }

        return state as StateRecord<T>;
    }
}

export class EventRuntime {
    constructor(private readonly observers: Map<number, EventObserver<unknown>[]>) {}

    observe<T>(typeId: number, observer: EventObserver<T>): () => void {
        const observers = this.observers.get(typeId) ?? [];

        observers.push(observer as EventObserver<unknown>);
        this.observers.set(typeId, observers);

        return () => {
            const index = observers.indexOf(observer as EventObserver<unknown>);

            if (index !== -1) {
                observers.splice(index, 1);
            }
        };
    }

    get<T>(typeId: number): readonly EventObserver<T>[] {
        return (this.observers.get(typeId) ?? []) as readonly EventObserver<T>[];
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
