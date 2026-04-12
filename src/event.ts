import type { Commands, World } from "./world";

let nextEventTypeId = 0;

declare const EventTypeBrand: unique symbol;

export interface EventType<T> {
    readonly id: number;
    readonly name: string;
    readonly [EventTypeBrand]?: T;
}

export type EventObserver<T> = (event: T, world: World, commands: Commands) => void;

export function defineEvent<T>(name: string): EventType<T> {
    return Object.freeze({
        id: nextEventTypeId++,
        name,
    });
}
