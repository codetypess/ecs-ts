import type { ComponentRegistry } from "../component";
import type { ChangeDetectionRange } from "../query";
import type { World } from "../world";
import { EntityManager } from "../entity";
import {
    createComponentHookContext,
    runComponentHooks as dispatchComponentHooks,
    type ComponentHookContext,
} from "./component-hooks";
import { createComponentOpsContext, type ComponentOpsContext } from "./component-ops";
import { createComponentStoreContext, type ComponentStoreContext } from "./component-store";
import { createEntityComponentIndexContext } from "./entity-component-index";
import { createEventContext, type EventContext } from "./events";
import { createMessageContext, type MessageContext } from "./messages";
import type { QueryExecutorContext } from "./query-executor";
import { createQueryPlanContext } from "./query-plan";
import {
    createRemovedStoreContext,
    recordRemoved as recordRemovedComponent,
    type RemovedStoreContext,
} from "./removed-store";
import { createResourceContext, type ResourceContext } from "./resources";
import { createScheduleEngineContext, type ScheduleEngineContext } from "./schedule-engine";
import { createStateMachineContext, type StateMachineContext } from "./state-machine";

/** Internal mutable runtime owned by a world instance. */
export interface WorldRuntime {
    readonly entities: EntityManager;
    readonly componentStoreContext: ComponentStoreContext;
    readonly resourceContext: ResourceContext;
    readonly removedContext: RemovedStoreContext;
    readonly componentHookContext: ComponentHookContext;
    readonly componentContext: ComponentOpsContext;
    readonly stateContext: StateMachineContext;
    readonly eventContext: EventContext;
    readonly messageContext: MessageContext;
    readonly queryContext: QueryExecutorContext;
    readonly scheduleContext: ScheduleEngineContext;
    activeChangeDetection: ChangeDetectionRange | undefined;
    changeTick: number;
    didStartup: boolean;
    didShutdown: boolean;
}

/** Creates the internal runtime graph used by a world. */
export function createWorldRuntime(world: World, registry: ComponentRegistry): WorldRuntime {
    const entities = new EntityManager();
    const componentStoreContext = createComponentStoreContext(registry);
    const entityComponents = createEntityComponentIndexContext();
    const removedContext = createRemovedStoreContext({
        getChangeTick: () => runtime.changeTick,
    });
    const componentHookContext = createComponentHookContext();
    const resourceContext = createResourceContext({
        getChangeTick: () => runtime.changeTick,
        getChangeDetectionRange: () => currentChangeDetectionRange(runtime),
    });
    const componentContext = createComponentOpsContext({
        entities,
        componentStores: componentStoreContext,
        entityComponents,
        getChangeTick: () => runtime.changeTick,
        getChangeDetectionRange: () => currentChangeDetectionRange(runtime),
        runComponentHooks: (type, stage, entity, component) => {
            dispatchComponentHooks(componentHookContext, type, stage, entity, component, world);
        },
        recordRemoved: (type, entity, component) => {
            recordRemovedComponent(removedContext, type, entity, component);
        },
    });
    const queryContext: QueryExecutorContext = {
        planContext: createQueryPlanContext({
            registry,
            stores: componentStoreContext.stores,
            getStoreVersion: () => componentStoreContext.storeVersion,
        }),
    };
    const runtime: WorldRuntime = {
        entities,
        componentStoreContext,
        resourceContext,
        removedContext,
        componentHookContext,
        componentContext,
        stateContext: createStateMachineContext(),
        eventContext: createEventContext(),
        messageContext: createMessageContext(),
        queryContext,
        scheduleContext: createScheduleEngineContext(),
        activeChangeDetection: undefined,
        changeTick: 1,
        didStartup: false,
        didShutdown: false,
    };

    return runtime;
}

/** Resolves the active change-detection range for the current world context. */
export function currentChangeDetectionRange(
    runtime: Pick<WorldRuntime, "activeChangeDetection" | "changeTick">
): ChangeDetectionRange {
    return (
        runtime.activeChangeDetection ?? {
            lastRunTick: runtime.changeTick - 1,
            thisRunTick: runtime.changeTick,
        }
    );
}
