import type { ComponentType } from "./component";
import type { Entity } from "./entity";

declare const RemovedComponentIdBrand: unique symbol;

export type RemovedComponentId<T> = number & { readonly [RemovedComponentIdBrand]: T };

export interface RemovedComponent<T> {
    readonly id: RemovedComponentId<T>;
    readonly entity: Entity;
    readonly component: T;
    readonly tick: number;
}

export interface RemovedWorld {
    readRemoved<T>(reader: RemovedReader<T>): readonly RemovedComponent<T>[];
}

export interface RemovedReaderOptions {
    readonly startAt?: number;
}

export class RemovedReader<T> {
    private nextRemovedId: number;

    constructor(
        readonly type: ComponentType<T>,
        options: RemovedReaderOptions = {}
    ) {
        this.nextRemovedId = options.startAt ?? 0;
    }

    get cursor(): number {
        return this.nextRemovedId;
    }

    read(world: RemovedWorld): readonly RemovedComponent<T>[] {
        return world.readRemoved(this);
    }

    advanceTo(nextRemovedId: number): void {
        this.nextRemovedId = nextRemovedId;
    }
}

export class RemovedComponents<T> {
    private readonly removed: RemovedComponent<T>[] = [];
    private nextRemovedId = 0;

    get nextId(): number {
        return this.nextRemovedId;
    }

    get length(): number {
        return this.removed.length;
    }

    push(entity: Entity, component: T, tick: number): RemovedComponentId<T> {
        const id = this.nextRemovedId as RemovedComponentId<T>;
        this.nextRemovedId++;
        this.removed.push({ id, entity, component, tick });

        return id;
    }

    read(reader: RemovedReader<T>): readonly RemovedComponent<T>[] {
        const cursor = reader.cursor;
        const output: RemovedComponent<T>[] = [];

        for (const removed of this.removed) {
            if (removed.id >= cursor) {
                output.push(removed);
            }
        }

        reader.advanceTo(this.nextRemovedId);

        return output;
    }

    drain(): RemovedComponent<T>[] {
        return this.removed.splice(0);
    }
}

export function removedReader<T>(type: ComponentType<T>): RemovedReader<T> {
    return new RemovedReader(type);
}
