let nextStateId = 0;

export type StateValue = string | number | symbol | boolean;

export interface StateType<T extends StateValue> {
    readonly id: number;
    readonly name: string;
    readonly initial: T;
}

export function defineState<T extends StateValue>(name: string, initial: T): StateType<T> {
    return Object.freeze({
        id: nextStateId++,
        name,
        initial,
    });
}
