import type { ChangeDetectionRange } from "../query";
import { isTickInRange } from "../query";
import type { ResourceType } from "../resource";
import type { World } from "../world";

export interface ResourceEntry<T> {
    value: T;
    readonly addedTick: number;
    changedTick: number;
}

interface ResourceRuntimeOptions {
    readonly getChangeTick: () => number;
    readonly getChangeDetectionRange: () => ChangeDetectionRange;
}

export class ResourceRuntime {
    private readonly resources = new Map<number, ResourceEntry<unknown>>();

    constructor(private readonly options: ResourceRuntimeOptions) {}

    set<T>(type: ResourceType<T>, value: T): void {
        const existing = this.getEntry(type);

        if (existing !== undefined) {
            existing.value = value;
            existing.changedTick = this.options.getChangeTick();
            return;
        }

        this.resources.set(type.id, {
            value,
            addedTick: this.options.getChangeTick(),
            changedTick: this.options.getChangeTick(),
        } satisfies ResourceEntry<T> as ResourceEntry<unknown>);
    }

    has<T>(type: ResourceType<T>): boolean {
        return this.resources.has(type.id);
    }

    get<T>(type: ResourceType<T>): T | undefined {
        return this.getEntry(type)?.value;
    }

    matches<T>(
        type: ResourceType<T>,
        predicate: (value: T, world: World) => boolean,
        world: World
    ): boolean {
        const entry = this.getEntry(type);

        return entry !== undefined && predicate(entry.value, world);
    }

    remove<T>(type: ResourceType<T>): T | undefined {
        const value = this.getEntry(type)?.value;
        this.resources.delete(type.id);

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
        return this.resources.get(type.id) as ResourceEntry<T> | undefined;
    }
}
