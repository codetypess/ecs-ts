import type { EventObserver } from "../event";
import type { World } from "../world";
import { runEventObserverWithCommands } from "./command-execution";

/** Observer registry keyed by event type id. */
export interface EventContext {
    readonly observers: Map<number, EventObserver<unknown>[]>;
}

/** Creates the event context used by a world. */
export function createEventContext(): EventContext {
    return {
        observers: new Map(),
    };
}

/** Registers an observer and returns an unsubscribe callback. */
export function observeEvent<T>(
    context: EventContext,
    typeId: number,
    observer: EventObserver<T>
): () => void {
    const observers = context.observers.get(typeId) ?? [];

    observers.push(observer as EventObserver<unknown>);
    context.observers.set(typeId, observers);

    return () => {
        const index = observers.indexOf(observer as EventObserver<unknown>);

        if (index !== -1) {
            observers.splice(index, 1);
        }
    };
}

/** Triggers observers immediately, isolating each one behind a fresh command queue. */
export function triggerEvent<T>(
    context: EventContext,
    typeId: number,
    value: T,
    world: World
): void {
    const observers = getEventObservers<T>(context, typeId);

    if (observers.length === 0) {
        return;
    }

    // Snapshot the observer list so observers can safely unsubscribe during dispatch.
    for (const observer of [...observers]) {
        runEventObserverWithCommands(world, observer, value);
    }
}

function getEventObservers<T>(context: EventContext, typeId: number): readonly EventObserver<T>[] {
    return (context.observers.get(typeId) ?? []) as readonly EventObserver<T>[];
}
