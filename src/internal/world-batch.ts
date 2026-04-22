import {
    assertComponentValue,
    type AnyComponentEntry,
    type AnyComponentType,
    type ComponentType,
} from "../component";
import { formatEntity, type Entity, type EntityType } from "../entity";
import {
    assertComponentSetDepsSatisfied,
    currentEntityComponentTypes,
    sortComponentTypesByDependencies,
} from "./component-dependencies";

interface BatchComponentState {
    readonly type: AnyComponentType;
    present: boolean;
    value: object | undefined;
}

interface BatchEntityState {
    readonly entity: Entity;
    readonly isNew: boolean;
    despawned: boolean;
    readonly componentStates: Map<number, BatchComponentState>;
}

interface BatchContext {
    readonly entityStates: Map<Entity, BatchEntityState>;
    closed: boolean;
}

export interface WorldBatchRuntime {
    readonly assertEntriesRegistered: (
        entries: readonly AnyComponentEntry[],
        action: string
    ) => void;
    readonly assertComponentRegistered: (type: AnyComponentType, action: string) => void;
    readonly isAlive: (entity: Entity) => boolean;
    readonly reserveEntity: (etype: EntityType) => Entity;
    readonly releaseReservedEntity: (entity: Entity) => boolean;
    readonly commitReservedEntity: (entity: Entity) => void;
    readonly entityComponentIds: (entity: Entity) => readonly number[];
    readonly componentTypeById: (componentId: number) => AnyComponentType | undefined;
    readonly insertComponent: <T extends object>(
        entity: Entity,
        type: ComponentType<T>,
        value: T
    ) => void;
    readonly removeComponent: <T extends object>(entity: Entity, type: ComponentType<T>) => boolean;
    readonly despawnEntity: (entity: Entity) => boolean;
}

export interface WorldBatchWriter {
    spawn(...entries: AnyComponentEntry[]): Entity;
    spawn(etype: EntityType, ...entries: AnyComponentEntry[]): Entity;
    addComponent<T extends object>(entity: Entity, type: ComponentType<T>, value: T): this;
    removeComponent<T extends object>(entity: Entity, type: ComponentType<T>): this;
    despawn(entity: Entity): this;
}

export function runWorldBatch<T>(
    runtime: WorldBatchRuntime,
    run: (batch: WorldBatchWriter) => T
): T {
    const context: BatchContext = {
        entityStates: new Map(),
        closed: false,
    };

    let result: T;

    try {
        // The callback only stages writes. Live world mutation starts after validation passes.
        result = run(createBatchWriter(runtime, context));
    } catch (error) {
        closeBatchContext(context);
        releaseReservedBatchEntities(runtime, context);
        throw error;
    }

    closeBatchContext(context);

    try {
        assertBatchContextValid(runtime, context);
    } catch (error) {
        releaseReservedBatchEntities(runtime, context);
        throw error;
    }

    try {
        commitBatchContext(runtime, context);
    } catch (error) {
        releaseReservedBatchEntities(runtime, context);
        throw error;
    }

    return result;
}

function createBatchWriter(runtime: WorldBatchRuntime, context: BatchContext) {
    function spawn(...entries: AnyComponentEntry[]): Entity;
    function spawn(etype: EntityType, ...entries: AnyComponentEntry[]): Entity;
    function spawn(...args: [EntityType, ...AnyComponentEntry[]] | AnyComponentEntry[]): Entity {
        const [etype, entries] =
            args.length > 0 && typeof args[0] !== "object"
                ? [args[0] as EntityType, args.slice(1) as AnyComponentEntry[]]
                : [0, args as AnyComponentEntry[]];

        return stageBatchSpawn(runtime, context, etype, entries);
    }

    const batch: WorldBatchWriter = {
        spawn,
        addComponent<T extends object>(entity: Entity, type: ComponentType<T>, value: T) {
            ensureBatchContextOpen(context);
            stageBatchAddComponent(runtime, context, entity, type, value);

            return batch;
        },
        removeComponent<T extends object>(entity: Entity, type: ComponentType<T>) {
            ensureBatchContextOpen(context);
            stageBatchRemoveComponent(runtime, context, entity, type);

            return batch;
        },
        despawn(entity: Entity) {
            ensureBatchContextOpen(context);
            stageBatchDespawn(runtime, context, entity);

            return batch;
        },
    };

    return batch;
}

function ensureBatchContextOpen(context: BatchContext): void {
    if (context.closed) {
        throw new Error("Cannot use world.batch after the callback has already returned");
    }
}

function closeBatchContext(context: BatchContext): void {
    context.closed = true;
}

function stageBatchSpawn(
    runtime: WorldBatchRuntime,
    context: BatchContext,
    etype: EntityType,
    entries: readonly AnyComponentEntry[]
): Entity {
    runtime.assertEntriesRegistered(entries, "batch spawn");

    const entity = runtime.reserveEntity(etype);
    const entityState: BatchEntityState = {
        entity,
        isNew: true,
        despawned: false,
        componentStates: new Map(),
    };

    context.entityStates.set(entity, entityState);

    for (const entry of entries) {
        stageBatchAddComponent(runtime, context, entity, entry.type, entry.value);
    }

    return entity;
}

function stageBatchAddComponent<T extends object>(
    runtime: WorldBatchRuntime,
    context: BatchContext,
    entity: Entity,
    type: ComponentType<T>,
    value: T
): void {
    runtime.assertComponentRegistered(type, "add");
    assertComponentValue(type, value);

    const entityState = ensureBatchEntityState(runtime, context, entity);

    if (entityState.despawned) {
        throw new Error(
            `Cannot add component ${type.name} to ${formatEntity(entity)}: entity is already marked for despawn in this batch`
        );
    }

    entityState.componentStates.set(type.id, {
        type,
        present: true,
        value,
    });
}

function stageBatchRemoveComponent<T extends object>(
    runtime: WorldBatchRuntime,
    context: BatchContext,
    entity: Entity,
    type: ComponentType<T>
): void {
    runtime.assertComponentRegistered(type, "remove");

    const entityState = ensureBatchEntityState(runtime, context, entity);

    if (entityState.despawned) {
        throw new Error(
            `Cannot remove component ${type.name} from ${formatEntity(entity)}: entity is already marked for despawn in this batch`
        );
    }

    if (entityState.isNew) {
        // Removing from a batch-created entity simply cancels the staged addition.
        entityState.componentStates.delete(type.id);
        return;
    }

    entityState.componentStates.set(type.id, {
        type,
        present: false,
        value: undefined,
    });
}

function stageBatchDespawn(
    runtime: WorldBatchRuntime,
    context: BatchContext,
    entity: Entity
): void {
    const entityState = ensureBatchEntityState(runtime, context, entity);

    entityState.despawned = true;
    entityState.componentStates.clear();
}

function ensureBatchEntityState(
    runtime: WorldBatchRuntime,
    context: BatchContext,
    entity: Entity
): BatchEntityState {
    const existing = context.entityStates.get(entity);

    if (existing !== undefined) {
        return existing;
    }

    if (!runtime.isAlive(entity)) {
        throw new Error(`Entity is not alive: ${formatEntity(entity)}`);
    }

    const entityState: BatchEntityState = {
        entity,
        isNew: false,
        despawned: false,
        componentStates: new Map(),
    };

    context.entityStates.set(entity, entityState);

    return entityState;
}

function releaseReservedBatchEntities(runtime: WorldBatchRuntime, context: BatchContext): void {
    for (const entityState of context.entityStates.values()) {
        if (entityState.isNew) {
            runtime.releaseReservedEntity(entityState.entity);
        }
    }
}

function assertBatchContextValid(runtime: WorldBatchRuntime, context: BatchContext): void {
    for (const entityState of context.entityStates.values()) {
        if (entityState.despawned) {
            continue;
        }

        // Batch semantics validate the final component set, not the intermediate call order.
        assertComponentSetDepsSatisfied(
            entityState.entity,
            collectFinalBatchComponentTypes(runtime, entityState),
            "commit batch"
        );
    }
}

function collectFinalBatchComponentTypes(
    runtime: WorldBatchRuntime,
    entityState: BatchEntityState
): AnyComponentType[] {
    const finalTypes = new Map<number, AnyComponentType>();

    if (!entityState.isNew) {
        // Existing entities start from the live snapshot, then replay staged overrides on top.
        for (const type of currentEntityComponentTypes(
            runtime.entityComponentIds(entityState.entity),
            runtime.componentTypeById
        )) {
            finalTypes.set(type.id, type);
        }
    }

    for (const componentState of entityState.componentStates.values()) {
        if (componentState.present) {
            finalTypes.set(componentState.type.id, componentState.type);
        } else {
            finalTypes.delete(componentState.type.id);
        }
    }

    return [...finalTypes.values()];
}

function commitBatchContext(runtime: WorldBatchRuntime, context: BatchContext): void {
    for (const entityState of context.entityStates.values()) {
        if (entityState.despawned) {
            if (entityState.isNew) {
                runtime.releaseReservedEntity(entityState.entity);
            } else {
                runtime.despawnEntity(entityState.entity);
            }

            continue;
        }

        if (entityState.isNew) {
            runtime.commitReservedEntity(entityState.entity);
            commitBatchNewEntity(runtime, entityState);
            continue;
        }

        commitBatchExistingEntity(runtime, entityState);
    }
}

function commitBatchNewEntity(runtime: WorldBatchRuntime, entityState: BatchEntityState): void {
    const additions = sortComponentTypesByDependencies(
        [...entityState.componentStates.values()]
            .filter((componentState) => componentState.present)
            .map((componentState) => componentState.type)
    );

    for (const type of additions) {
        const componentState = entityState.componentStates.get(type.id);

        if (componentState?.present) {
            runtime.insertComponent(entityState.entity, type, componentState.value as object);
        }
    }
}

function commitBatchExistingEntity(
    runtime: WorldBatchRuntime,
    entityState: BatchEntityState
): void {
    const currentTypes = currentEntityComponentTypes(
        runtime.entityComponentIds(entityState.entity),
        runtime.componentTypeById
    );
    const finalTypeIds = new Set(
        collectFinalBatchComponentTypes(runtime, entityState).map((type) => type.id)
    );
    const removals = sortComponentTypesByDependencies(
        currentTypes.filter((type) => !finalTypeIds.has(type.id)),
        "dependentsFirst"
    );
    const additions = sortComponentTypesByDependencies(
        [...entityState.componentStates.values()]
            .filter((componentState) => componentState.present)
            .map((componentState) => componentState.type)
    );

    // Apply the net diff in dependency-safe order instead of replaying user call order.
    for (const type of removals) {
        runtime.removeComponent(entityState.entity, type);
    }

    for (const type of additions) {
        const componentState = entityState.componentStates.get(type.id);

        if (componentState?.present) {
            runtime.insertComponent(entityState.entity, type, componentState.value as object);
        }
    }
}
