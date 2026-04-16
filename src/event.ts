import type { Commands } from "./commands";
import type { World } from "./world";

let nextEventTypeId = 0;

declare const EventTypeBrand: unique symbol;

/** Runtime handle used for immediate observer-style events. */
export interface EventType<T> {
    readonly id: number;
    readonly name: string;
    readonly [EventTypeBrand]?: T;
}

/** Observer callback invoked immediately when an event is triggered. */
export type EventObserver<T> = (event: T, world: World, commands: Commands) => void;

/** Defines an event channel for synchronous observer dispatch. */
export function defineEvent<T>(name: string): EventType<T> {
    return Object.freeze({
        id: nextEventTypeId++,
        name,
    });
}
