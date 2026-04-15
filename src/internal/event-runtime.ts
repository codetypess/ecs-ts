import { Commands } from "../commands";
import type { EventObserver } from "../event";
import type { World } from "../world";

export class EventRuntime {
    private readonly observers = new Map<number, EventObserver<unknown>[]>();

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

    trigger<T>(typeId: number, value: T, world: World): void {
        const observers = this.get<T>(typeId);

        if (observers.length === 0) {
            return;
        }

        for (const observer of [...observers]) {
            const commands = new Commands(world);

            observer(value, world, commands);
            commands.flush();
        }
    }
}
