import { EntityManager } from "../entity";
import type { ChangeDetectionRange } from "../query";
import type { Registry } from "../registry";
import { createComponentOpsContext, type ComponentOpsContext } from "./component-ops";
import { createComponentStoreContext, type ComponentStoreContext } from "./component-store";
import {
    createEntityComponentIndexContext,
    type EntityComponentIndexContext,
} from "./entity-component-index";
import type { QueryExecutorContext } from "./query-executor";
import { createQueryPlanContext } from "./query-plan";
import { createResourceContext, type ResourceContext } from "./resources";

/** Core ECS storage and execution contexts owned by a world. */
export interface EcsContext {
    readonly entities: EntityManager;
    readonly componentStores: ComponentStoreContext;
    readonly entityComponents: EntityComponentIndexContext;
    readonly components: ComponentOpsContext;
    readonly queries: QueryExecutorContext;
    readonly resources: ResourceContext;
}

interface EcsContextOptions {
    readonly registry: Registry;
    readonly getChangeTick: () => number;
    readonly getChangeDetectionRange: () => ChangeDetectionRange;
    readonly runComponentHooks: ComponentOpsContext["runComponentHooks"];
}

/** Builds the mutually dependent contexts for core ECS operations. */
export function createEcsContext(options: EcsContextOptions): EcsContext {
    const { registry, getChangeTick, getChangeDetectionRange, runComponentHooks } = options;
    const entities = new EntityManager();
    const componentStores = createComponentStoreContext(registry);
    const entityComponents = createEntityComponentIndexContext();
    const resources = createResourceContext({ getChangeTick, getChangeDetectionRange });

    const components = createComponentOpsContext({
        entities,
        componentStores,
        entityComponents,
        getChangeTick,
        getChangeDetectionRange,
        runComponentHooks,
    });
    const queries: QueryExecutorContext = {
        planContext: createQueryPlanContext({
            registry,
            stores: componentStores.stores,
            getStoreVersion: () => componentStores.storeVersion,
        }),
    };

    return {
        entities,
        componentStores,
        entityComponents,
        components,
        queries,
        resources,
    } satisfies EcsContext;
}
