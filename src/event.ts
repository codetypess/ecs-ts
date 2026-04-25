import type { Commands } from "./commands.js";
import type { Registry } from "./registry.js";
import type { World } from "./world.js";

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
    if (registry.isRegisteredEvent(type)) {
        return;
    }

    if (type.registry === registry) {
        throw new Error(
            `Cannot ${action} event ${type.name}: it is not registered in ${registry.name}`
        );
    }

    throw new Error(
        `Cannot ${action} event ${type.name}: it is registered in ${type.registry.name}, not ${registry.name}`
    );
}
