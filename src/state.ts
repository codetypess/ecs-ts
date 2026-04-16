let nextStateId = 0;

/** Primitive values supported by the built-in state machine. */
export type StateValue = string | number | symbol | boolean;

/** Runtime handle used to register and query a named state machine. */
export interface StateType<T extends StateValue> {
    readonly id: number;
    readonly name: string;
    readonly initial: T;
}

/** Defines a state machine slot with its default value. */
export function defineState<T extends StateValue>(name: string, initial: T): StateType<T> {
    return Object.freeze({
        id: nextStateId++,
        name,
        initial,
    });
}
