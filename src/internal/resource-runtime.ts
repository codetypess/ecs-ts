import type { ChangeDetectionRange } from "../query";
import { isTickInRange } from "../query";
import type { ResourceType } from "../resource";

export interface ResourceEntry<T> {
    value: T;
    readonly addedTick: number;
    changedTick: number;
}

interface ResourceRuntimeOptions {
    readonly resources: Map<number, ResourceEntry<unknown>>;
    readonly getChangeTick: () => number;
    readonly getChangeDetectionRange: () => ChangeDetectionRange;
}

export class ResourceRuntime {
    constructor(private readonly options: ResourceRuntimeOptions) {}

    set<T>(type: ResourceType<T>, value: T): void {
        const existing = this.getEntry(type);

        if (existing !== undefined) {
            existing.value = value;
            existing.changedTick = this.options.getChangeTick();
            return;
        }

        this.options.resources.set(type.id, {
            value,
            addedTick: this.options.getChangeTick(),
            changedTick: this.options.getChangeTick(),
        } satisfies ResourceEntry<T> as ResourceEntry<unknown>);
    }

    has<T>(type: ResourceType<T>): boolean {
        return this.options.resources.has(type.id);
    }

    get<T>(type: ResourceType<T>): T | undefined {
        return this.getEntry(type)?.value;
    }

    remove<T>(type: ResourceType<T>): T | undefined {
        const value = this.getEntry(type)?.value;
        this.options.resources.delete(type.id);

        return value;
    }

    markChanged<T>(type: ResourceType<T>): boolean {
        const entry = this.getEntry(type);

        if (entry === undefined) {
            return false;
        }

        entry.changedTick = this.options.getChangeTick();

        return true;
    }

    isAdded<T>(type: ResourceType<T>): boolean {
        const entry = this.getEntry(type);

        return (
            entry !== undefined &&
            isTickInRange(entry.addedTick, this.options.getChangeDetectionRange())
        );
    }

    isChanged<T>(type: ResourceType<T>): boolean {
        const entry = this.getEntry(type);

        return (
            entry !== undefined &&
            isTickInRange(entry.changedTick, this.options.getChangeDetectionRange())
        );
    }

    private getEntry<T>(type: ResourceType<T>): ResourceEntry<T> | undefined {
        return this.options.resources.get(type.id) as ResourceEntry<T> | undefined;
    }
}
