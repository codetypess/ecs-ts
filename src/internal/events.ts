import type { AnyEventType, EventObserver, EventType } from "../event";
import type { World } from "../world";
import { runEventObserverWithDeferredCommands } from "./command-execution";

interface EventObserverList {
    observers: EventObserver<unknown>[];
    dispatchDepth: number;
}

/** Observer registry keyed by event type identity. */
export interface EventContext {
    readonly observers: Map<AnyEventType, EventObserverList>;
    readonly dispatchStack: AnyEventType[];
}

/** Creates the event context used by a world. */
export function createEventContext(): EventContext {
    return {
        observers: new Map(),
        dispatchStack: [],
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

/** Triggers observers immediately and rejects cycles in the active dispatch chain. */
export function triggerEvent<T>(
    context: EventContext,
    type: EventType<T>,
    value: T,
    world: World
): void {
    const eventType = type as AnyEventType;
    const list = context.observers.get(eventType);

    if (list === undefined || list.observers.length === 0) {
        return;
    }

    const cycleStart = context.dispatchStack.indexOf(eventType);

    if (cycleStart !== -1) {
        const cycle = [...context.dispatchStack.slice(cycleStart), eventType]
            .map((current) => current.name)
            .join(" -> ");

        throw new Error(`Event dispatch cycle detected: ${cycle}`);
    }

    const observers = list.observers as EventObserver<T>[];
    context.dispatchStack.push(eventType);
    list.dispatchDepth++;

    try {
        for (const observer of observers) {
            runEventObserverWithDeferredCommands(world, observer, value);
        }
    } finally {
        list.dispatchDepth--;
        context.dispatchStack.pop();
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
