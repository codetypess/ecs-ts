import type { Commands } from "./commands";
import type { Registry } from "./registry";
import type { World } from "./world";

declare const EventTypeBrand: unique symbol;

/** Runtime handle used for immediate observer-style events. */
export interface EventType<T> {
    readonly id: number;
    readonly key: string;
    readonly name: string;
    readonly registry: Registry;
    readonly [EventTypeBrand]?: T;
}

export type AnyEventType = EventType<unknown>;

/** Observer callback invoked immediately when an event is triggered. */
export type EventObserver<T> = (event: T, world: World, commands: Commands) => void;

/** Throws unless the event belongs to the expected registry. */
export function assertRegisteredEvent(
    registry: Registry,
    type: AnyEventType,
    action: string
): void {
    if (type.registry === registry) {
        return;
    }

    throw new Error(
        `Cannot ${action} event ${type.name}: it is registered in ${type.registry.name}, not ${registry.name}`
    );
}
