import type { EventObserver } from "../event.js";
import type { World } from "../world.js";
import { runEventObserverWithCommands } from "./command-execution.js";

interface EventObserverList {
    observers: EventObserver<unknown>[];
    dispatchDepth: number;
}

/** Observer registry keyed by event type id. */
export interface EventContext {
    readonly observers: Map<number, EventObserverList>;
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
    const list = ensureEventObserverList(context, typeId);
    const observers = mutableEventObservers(list);

    observers.push(observer as EventObserver<unknown>);

    return () => {
        const currentObservers = mutableEventObservers(list);
        const index = currentObservers.indexOf(observer as EventObserver<unknown>);

        if (index !== -1) {
            currentObservers.splice(index, 1);
        }

        if (currentObservers.length === 0 && context.observers.get(typeId) === list) {
            context.observers.delete(typeId);
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
    const list = context.observers.get(typeId);

    if (list === undefined || list.observers.length === 0) {
        return;
    }

    const observers = list.observers as EventObserver<T>[];
    list.dispatchDepth++;

    try {
        for (const observer of observers) {
            runEventObserverWithCommands(world, observer, value);
        }
    } finally {
        list.dispatchDepth--;
    }
}

function ensureEventObserverList(context: EventContext, typeId: number): EventObserverList {
    const existing = context.observers.get(typeId);

    if (existing !== undefined) {
        return existing;
    }

    const created: EventObserverList = {
        observers: [],
        dispatchDepth: 0,
    };

    context.observers.set(typeId, created);

    return created;
}

function mutableEventObservers(list: EventObserverList): EventObserver<unknown>[] {
    if (list.dispatchDepth > 0) {
        list.observers = [...list.observers];
    }

    return list.observers;
}
