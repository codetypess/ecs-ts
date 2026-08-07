/** Primitive values supported by the built-in state machine. */
export type StateValue = string | number | symbol | boolean;

/** Runtime handle used to register and query a named state machine. */
export interface StateType<T extends StateValue> {
    readonly key: string;
    readonly name: string;
    readonly initial: T;
}

export type AnyStateType = StateType<StateValue>;

/** Defines a named state machine independently from any registry. */
export function defineState<T extends StateValue>(name: string, initial: T): StateType<T> {
    assertStateName(name);

    return Object.freeze({
        key: `state/${name}`,
        name,
        initial,
    } satisfies StateType<T>);
}

/** Throws unless the state machine belongs to the expected registry. */
export function assertRegisteredState(
    registry: { readonly name: string; isRegisteredState(type: AnyStateType): boolean },
    type: AnyStateType,
    action: string
): void {
    if (registry.isRegisteredState(type)) {
        return;
    }

    throw new Error(
        `Cannot ${action} state ${type.name}: it is not registered in ${registry.name}`
    );
}

function assertStateName(name: string): void {
    if (name.trim().length === 0) {
        throw new Error("Cannot define state: name must be a non-empty string");
    }
}
