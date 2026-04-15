import type { EventObserver } from "../event";

export class EventRuntime {
    constructor(private readonly observers: Map<number, EventObserver<unknown>[]>) {}

    observe<T>(typeId: number, observer: EventObserver<T>): () => void {
        const observers = this.observers.get(typeId) ?? [];

        observers.push(observer as EventObserver<unknown>);
        this.observers.set(typeId, observers);

        return () => {
            const index = observers.indexOf(observer as EventObserver<unknown>);

            if (index !== -1) {
                observers.splice(index, 1);
            }
        };
    }

    get<T>(typeId: number): readonly EventObserver<T>[] {
        return (this.observers.get(typeId) ?? []) as readonly EventObserver<T>[];
    }
}
