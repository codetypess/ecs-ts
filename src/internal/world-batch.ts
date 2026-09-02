import {
    assertComponentValue,
    type AnyComponentEntry,
    type AnyComponentType,
    type ComponentAddReason,
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
    readonly componentStates: Map<AnyComponentType, BatchComponentState>;
}

interface BatchContext {
    readonly entityStates: Map<Entity, BatchEntityState>;
    closed: boolean;
}

export interface WorldBatch {
    spawn(etype: EntityType, ...entries: AnyComponentEntry[]): Entity;
    /** Stages a component insertion or replacement and returns the staged value. */
    addComponent<T extends object>(entity: Entity, type: ComponentType<T>, value: T): T;
    removeComponent<T extends object>(entity: Entity, type: ComponentType<T>): this;
    despawn(entity: Entity): this;
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
    readonly entityComponentTypes: (entity: Entity) => readonly AnyComponentType[];
    readonly insertComponent: <T extends object>(
        entity: Entity,
        type: ComponentType<T>,
        value: T,
        reason: ComponentAddReason
    ) => void;
    readonly removeComponent: <T extends object>(entity: Entity, type: ComponentType<T>) => boolean;
    readonly despawnEntity: (entity: Entity) => boolean;
}

export function runWorldBatch<T>(runtime: WorldBatchRuntime, run: (batch: WorldBatch) => T): T {
    const context: BatchContext = { entityStates: new Map(), closed: false };
    let result: T;

    try {
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

function createBatchWriter(runtime: WorldBatchRuntime, context: BatchContext): WorldBatch {
    function spawn(etype: EntityType, ...entries: AnyComponentEntry[]): Entity {
        ensureBatchContextOpen(context);
        return stageBatchSpawn(runtime, context, etype, entries);
    }

    const batch: WorldBatch = {
        spawn,
        addComponent<T extends object>(entity: Entity, type: ComponentType<T>, value: T) {
            ensureBatchContextOpen(context);
            stageBatchAddComponent(runtime, context, entity, type, value);
            return value;
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
        stageBatchAddKnownComponent(runtime, context, entity, entry.type, entry.value);
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
    stageBatchAddKnownComponent(runtime, context, entity, type, value);
}

function stageBatchAddKnownComponent<T extends object>(
    runtime: WorldBatchRuntime,
    context: BatchContext,
    entity: Entity,
    type: ComponentType<T>,
    value: T
): void {
    assertComponentValue(type, value);
    const entityState = ensureBatchEntityState(runtime, context, entity);

    if (entityState.despawned) {
        throw new Error(
            `Cannot add component ${type.name} to ${formatEntity(entity)}: entity is already marked for despawn in this batch`
        );
    }

    entityState.componentStates.set(type, {
        type,
        present: true,
        value,
    } satisfies BatchComponentState);
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
        entityState.componentStates.delete(type);
        return;
    }

    entityState.componentStates.set(type, {
        type,
        present: false,
        value: undefined,
    } satisfies BatchComponentState);
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
    if (existing !== undefined) return existing;
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
        if (entityState.isNew) runtime.releaseReservedEntity(entityState.entity);
    }
}

function assertBatchContextValid(runtime: WorldBatchRuntime, context: BatchContext): void {
    for (const entityState of context.entityStates.values()) {
        if (!entityState.despawned) {
            assertComponentSetDepsSatisfied(
                entityState.entity,
                collectFinalBatchComponentTypes(runtime, entityState),
                "commit batch"
            );
        }
    }
}

function collectFinalBatchComponentTypes(
    runtime: WorldBatchRuntime,
    entityState: BatchEntityState
): AnyComponentType[] {
    const finalTypes = new Map<AnyComponentType, AnyComponentType>();

    if (!entityState.isNew) {
        for (const type of currentEntityComponentTypes(
            runtime.entityComponentTypes(entityState.entity)
        )) {
            finalTypes.set(type, type);
        }
    }

    for (const state of entityState.componentStates.values()) {
        if (state.present) finalTypes.set(state.type, state.type);
        else finalTypes.delete(state.type);
    }

    return [...finalTypes.values()];
}

function commitBatchContext(runtime: WorldBatchRuntime, context: BatchContext): void {
    for (const entityState of context.entityStates.values()) {
        if (entityState.despawned) {
            if (entityState.isNew) runtime.releaseReservedEntity(entityState.entity);
            else runtime.despawnEntity(entityState.entity);
            continue;
        }

        if (entityState.isNew) {
            runtime.commitReservedEntity(entityState.entity);
            commitBatchNewEntity(runtime, entityState);
        } else {
            commitBatchExistingEntity(runtime, entityState);
        }
    }
}

function commitBatchNewEntity(runtime: WorldBatchRuntime, entityState: BatchEntityState): void {
    const additions = sortComponentTypesByDependencies(
        [...entityState.componentStates.values()]
            .filter((state) => state.present)
            .map((state) => state.type)
    );

    for (const type of additions) {
        const state = entityState.componentStates.get(type);
        if (state?.present) {
            runtime.insertComponent(entityState.entity, type, state.value as object, "spawned");
        }
    }
}

function commitBatchExistingEntity(
    runtime: WorldBatchRuntime,
    entityState: BatchEntityState
): void {
    const currentTypes = currentEntityComponentTypes(
        runtime.entityComponentTypes(entityState.entity)
    );
    const finalTypes = new Set(collectFinalBatchComponentTypes(runtime, entityState));
    const removals = sortComponentTypesByDependencies(
        currentTypes.filter((type) => !finalTypes.has(type)),
        "dependentsFirst"
    );
    const additions = sortComponentTypesByDependencies(
        [...entityState.componentStates.values()]
            .filter((state) => state.present)
            .map((state) => state.type)
    );

    for (const type of removals) {
        runtime.removeComponent(entityState.entity, type);
    }

    for (const type of additions) {
        const state = entityState.componentStates.get(type);
        if (state?.present) {
            runtime.insertComponent(entityState.entity, type, state.value as object, "added");
        }
    }
}
