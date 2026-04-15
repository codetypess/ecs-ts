import type { ComponentType } from "../component";
import type { Entity } from "../entity";
import type { RemovedComponent, RemovedReader } from "../removed";
import { RemovedComponents } from "../removed";

interface RemovedRuntimeOptions {
    readonly removedComponents: Map<number, RemovedComponents<unknown>>;
    readonly getChangeTick: () => number;
}

export class RemovedRuntime {
    constructor(private readonly options: RemovedRuntimeOptions) {}

    read<T>(reader: RemovedReader<T>): readonly RemovedComponent<T>[] {
        return this.get(reader.type)?.read(reader) ?? [];
    }

    drain<T>(type: ComponentType<T>): RemovedComponent<T>[] {
        return this.get(type)?.drain() ?? [];
    }

    record<T>(type: ComponentType<T>, entity: Entity, component: T): void {
        this.ensure(type).push(entity, component, this.options.getChangeTick());
    }

    private ensure<T>(type: ComponentType<T>): RemovedComponents<T> {
        const existing = this.options.removedComponents.get(type.id);

        if (existing !== undefined) {
            return existing as RemovedComponents<T>;
        }

        const removed = new RemovedComponents<T>();
        this.options.removedComponents.set(type.id, removed as RemovedComponents<unknown>);

        return removed;
    }

    private get<T>(type: ComponentType<T>): RemovedComponents<T> | undefined {
        return this.options.removedComponents.get(type.id) as RemovedComponents<T> | undefined;
    }
}
