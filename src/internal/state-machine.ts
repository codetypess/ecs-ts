import { createSystemRunner } from "../scheduler";
import type { SystemCallback, SystemRunner } from "../scheduler";
import type { Commands } from "../commands";
import type { StateType, StateValue } from "../state";
import type { World } from "../world";

export interface StateRecord<T extends StateValue> {
    readonly type: StateType<T>;
    current: T;
    pending: T | undefined;
    didEnterInitial: boolean;
    readonly onEnter: Map<T, SystemRunner[]>;
    readonly onExit: Map<T, SystemRunner[]>;
    readonly onTransition: Map<T, Map<T, SystemRunner[]>>;
}

export interface StateMachineContext {
    readonly states: Map<number, StateRecord<StateValue>>;
}

export function createStateMachineContext(): StateMachineContext {
    return {
        states: new Map(),
    };
}

export function initState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>,
    initial = type.initial
): void {
    if (context.states.has(type.id)) {
        throw new Error(`State is already initialized: ${type.name}`);
    }

    context.states.set(type.id, createStateRecord(type, initial));
}

export function hasState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>
): boolean {
    return context.states.has(type.id);
}

export function currentState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>
): T {
    return requireState(context, type).current;
}

export function matchesState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>,
    predicate: (value: T, world: World) => boolean,
    world: World
): boolean {
    const state = context.states.get(type.id);

    return state !== undefined && predicate((state as StateRecord<T>).current, world);
}

export function setState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>,
    next: T
): void {
    const state = ensureState(context, type);
    state.pending = next;
}

export function onEnterState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>,
    value: T,
    system: SystemCallback
): void {
    getStateSystems(ensureState(context, type).onEnter, value).push(createSystemRunner(system));
}

export function onExitState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>,
    value: T,
    system: SystemCallback
): void {
    getStateSystems(ensureState(context, type).onExit, value).push(createSystemRunner(system));
}

export function onTransitionState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>,
    from: T,
    to: T,
    system: SystemCallback
): void {
    addTransitionRunner(context, type, from, to, system);
}

export function addStateSystem<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>,
    value: T,
    onEnter: ((world: World, dt: number, commands: Commands, value: T) => void) | undefined,
    onExit: ((world: World, dt: number, commands: Commands, value: T) => void) | undefined
): void {
    const state = ensureState(context, type);

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

export function addTransitionSystem<T extends StateValue>(
    context: StateMachineContext,
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

    addTransitionRunner(context, type, from, to, (world, dt, commands) => {
        onTransition(world, dt, commands, from, to);
    });
}

export function runInitialEnters(
    context: StateMachineContext,
    dt: number,
    runSystems: (systems: readonly SystemRunner[], dt: number) => void
): void {
    for (const state of context.states.values()) {
        if (state.didEnterInitial) {
            continue;
        }

        runSystems(state.onEnter.get(state.current) ?? [], dt);
        state.didEnterInitial = true;
    }
}

export function applyStateTransitions(
    context: StateMachineContext,
    dt: number,
    runSystems: (systems: readonly SystemRunner[], dt: number) => void
): void {
    for (const state of context.states.values()) {
        if (state.pending === undefined) {
            continue;
        }

        const from = state.current;
        const to = state.pending;

        state.pending = undefined;

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

function addTransitionRunner<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>,
    from: T,
    to: T,
    system: SystemCallback
): void {
    const state = ensureState(context, type);
    let transitionsFrom = state.onTransition.get(from);

    if (transitionsFrom === undefined) {
        transitionsFrom = new Map<T, SystemRunner[]>();
        state.onTransition.set(from, transitionsFrom);
    }

    getStateSystems(transitionsFrom, to).push(createSystemRunner(system));
}

function ensureState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>
): StateRecord<T> {
    const state = context.states.get(type.id);

    if (state !== undefined) {
        return state as StateRecord<T>;
    }

    const created = createStateRecord(type, type.initial);
    context.states.set(type.id, created);

    return created;
}

function requireState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>
): StateRecord<T> {
    const state = context.states.get(type.id);

    if (state === undefined) {
        throw new Error(`State is not initialized: ${type.name}`);
    }

    return state as StateRecord<T>;
}

function createStateRecord<T extends StateValue>(type: StateType<T>, initial: T): StateRecord<T> {
    return {
        type,
        current: initial,
        pending: undefined,
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
