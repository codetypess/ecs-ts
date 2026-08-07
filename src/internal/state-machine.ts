import { createSystemRunner } from "../scheduler.js";
import type { SystemRunner } from "../scheduler.js";
import type { AnyStateType, StateType, StateValue } from "../state.js";
import type { StateSystem, TransitionSystem } from "../system.js";
import type { World } from "../world.js";
import { ensureMapEntry } from "./collection-utils.js";

/** Runtime record for a single registered state machine. */
export interface StateRecord<T extends StateValue> {
    readonly type: StateType<T>;
    current: T;
    pending: T | undefined;
    activeTransition: { readonly from: T; readonly to: T } | undefined;
    didEnterInitial: boolean;
    readonly onEnter: Map<T, SystemRunner[]>;
    readonly onExit: Map<T, SystemRunner[]>;
    readonly onTransition: SystemRunner[];
}

/** Collection of all registered state machines for a world. */
export interface StateMachineContext {
    readonly states: Map<AnyStateType, StateRecord<StateValue>>;
}

/** Creates the state-machine context used by a world. */
export function createStateMachineContext(): StateMachineContext {
    return {
        states: new Map(),
    } satisfies StateMachineContext;
}

/** Ensures a state machine exists and applies the provided initial value on first creation only. */
export function initState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>,
    initial = type.initial
): void {
    ensureState(context, type, initial);
}

/** Returns whether the state machine has been initialized. */
export function hasState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>
): boolean {
    return context.states.has(type as AnyStateType);
}

/** Returns the current value of an initialized state machine. */
export function currentState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>
): T {
    return requireState(context, type).current;
}

/** Evaluates a predicate against the current state value when initialized. */
export function matchesState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>,
    predicate: (value: T, world: World) => boolean,
    world: World
): boolean {
    const state = context.states.get(type as AnyStateType);

    return state !== undefined && predicate((state as StateRecord<T>).current, world);
}

/** Schedules a transition to be applied during the next update cycle. */
export function setState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>,
    next: T
): void {
    const state = ensureState(context, type);
    state.pending = next;
}

/** Adapts object-style enter/exit handlers into scheduler runners. */
export function addStateSystem<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>,
    value: T,
    system: StateSystem<T>
): void {
    const state = ensureState(context, type);

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
}

/** Adapts an object-style transition handler into a scheduler runner. */
export function addTransitionSystem<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>,
    system: TransitionSystem<T>
): void {
    if (system.onTransition === undefined) {
        return;
    }

    const state = ensureState(context, type);

    state.onTransition.push(
        createSystemRunner((world, dt, commands) => {
            const transition = state.activeTransition!;

            system.onTransition?.(world, dt, commands, transition.from, transition.to);
        })
    );
}

/** Runs initial enter callbacks exactly once per initialized state machine. */
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

/** Applies queued transitions in exit -> transition -> enter order. */
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

        state.activeTransition = { from, to };
        try {
            runSystems(state.onTransition, dt);
        } finally {
            state.activeTransition = undefined;
        }

        state.current = to;
        runSystems(state.onEnter.get(to) ?? [], dt);
    }
}

function ensureState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>,
    initial = type.initial
): StateRecord<T> {
    return ensureMapEntry(context.states, type as AnyStateType, () =>
        createStateRecord(type, initial)
    ) as StateRecord<T>;
}

function requireState<T extends StateValue>(
    context: StateMachineContext,
    type: StateType<T>
): StateRecord<T> {
    const state = context.states.get(type as AnyStateType);

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
        activeTransition: undefined,
        didEnterInitial: false,
        onEnter: new Map(),
        onExit: new Map(),
        onTransition: [],
    } satisfies StateRecord<T>;
}

function getStateSystems<T extends StateValue>(
    systemsByValue: Map<T, SystemRunner[]>,
    value: T
): SystemRunner[] {
    return ensureMapEntry(systemsByValue, value, () => []);
}
