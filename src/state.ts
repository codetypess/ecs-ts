import type { Registry } from "./registry";

/** Primitive values supported by the built-in state machine. */
export type StateValue = string | number | symbol | boolean;

/** Runtime handle used to register and query a named state machine. */
export interface StateType<T extends StateValue> {
    readonly id: number;
    readonly key: string;
    readonly name: string;
    readonly registry: Registry;
    readonly initial: T;
}

export type AnyStateType = StateType<StateValue>;

/** Defines a state machine slot in the provided registry. */
export function defineState<T extends StateValue>(
    registry: Registry,
    name: string,
    initial: T
): StateType<T> {
    return registry.defineState(name, initial);
}

/** Throws unless the state machine belongs to the expected registry. */
export function assertRegisteredState(
    registry: Registry,
    type: AnyStateType,
    action: string
): void {
    if (type.registry === registry) {
        return;
    }

    throw new Error(
        `Cannot ${action} state ${type.name}: it is registered in ${type.registry.name}, not ${registry.name}`
    );
}
