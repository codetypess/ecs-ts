import type { AnyEventType, EventObserver, EventType } from "../event.js";
import type { World } from "../world.js";
import { runEventObserverWithDeferredCommands } from "./command-execution.js";

interface EventObserverList {
    observers: EventObserver<unknown>[];
    dispatchDepth: number;
}

/** Observer registry keyed by event type identity. */
export interface EventContext {
    readonly observers: Map<AnyEventType, EventObserverList>;
}

/** Creates the event context used by a world. */
export function createEventContext(): EventContext {
    return {
        observers: new Map(),
    } satisfies EventContext;
}

/** Registers an observer and returns an unsubscribe callback. */
export function observeEvent<T>(
    context: EventContext,
    type: EventType<T>,
    observer: EventObserver<T>
): () => void {
    const list = ensureEventObserverList(context, type);
    const observers = mutableEventObservers(list);

    observers.push(observer as EventObserver<unknown>);

    return () => {
        const currentObservers = mutableEventObservers(list);
        const index = currentObservers.indexOf(observer as EventObserver<unknown>);

        if (index !== -1) {
            currentObservers.splice(index, 1);
        }

        if (currentObservers.length === 0 && context.observers.get(type as AnyEventType) === list) {
            context.observers.delete(type as AnyEventType);
        }
    };
}

/** Triggers observers immediately, isolating each one behind a fresh command queue. */
export function triggerEvent<T>(
    context: EventContext,
    type: EventType<T>,
    value: T,
    world: World
): void {
    const list = context.observers.get(type as AnyEventType);

    if (list === undefined || list.observers.length === 0) {
        return;
    }

    const observers = list.observers as EventObserver<T>[];
    list.dispatchDepth++;

    try {
        for (const observer of observers) {
            runEventObserverWithDeferredCommands(world, observer, value);
        }
    } finally {
        list.dispatchDepth--;
    }
}

function ensureEventObserverList(
    context: EventContext,
    type: EventType<unknown>
): EventObserverList {
    const existing = context.observers.get(type);

    if (existing !== undefined) {
        return existing;
    }

    const created: EventObserverList = {
        observers: [],
        dispatchDepth: 0,
    };

    context.observers.set(type, created);

    return created;
}

function mutableEventObservers(list: EventObserverList): EventObserver<unknown>[] {
    if (list.dispatchDepth > 0) {
        list.observers = [...list.observers];
    }

    return list.observers;
}
