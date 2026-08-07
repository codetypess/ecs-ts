import type { DeferredCommands } from "./deferred-commands.js";
import type { World } from "./world.js";

declare const EventTypeBrand: unique symbol;

/** Runtime handle used for immediate observer-style events. */
export interface EventType<T> {
    readonly key: string;
    readonly name: string;
    readonly [EventTypeBrand]?: T;
}

export type AnyEventType = EventType<unknown>;

/** Defines an immediate event channel independently from any registry. */
export function defineEvent<T>(name: string): EventType<T> {
    assertEventName(name);

    return Object.freeze({
        key: `event/${name}`,
        name,
    } satisfies EventType<T>);
}

/** Observer callback invoked immediately when an event is triggered. */
export type EventObserver<T> = (event: T, world: World, commands: DeferredCommands) => void;

/** Throws unless the event belongs to the expected registry. */
export function assertRegisteredEvent(
    registry: { readonly name: string; isRegisteredEvent(type: AnyEventType): boolean },
    type: AnyEventType,
    action: string
): void {
    if (registry.isRegisteredEvent(type)) {
        return;
    }

    throw new Error(
        `Cannot ${action} event ${type.name}: it is not registered in ${registry.name}`
    );
}

function assertEventName(name: string): void {
    if (name.trim().length === 0) {
        throw new Error("Cannot define event: name must be a non-empty string");
    }
}
