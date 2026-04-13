import type { ResourceType } from "./resource";
import type { StateType, StateValue } from "./state";
import type { SystemRunCondition, World } from "./world";

export type RunIfPredicate<T> = (value: T, world: World) => boolean;

export function runIfAll(...conditions: readonly SystemRunCondition[]): SystemRunCondition {
    return (world) => {
        for (const condition of conditions) {
            if (!condition(world)) {
                return false;
            }
        }

        return true;
    };
}

export function runIfAny(...conditions: readonly SystemRunCondition[]): SystemRunCondition {
    return (world) => {
        for (const condition of conditions) {
            if (condition(world)) {
                return true;
            }
        }

        return false;
    };
}

export function runIfNot(condition: SystemRunCondition): SystemRunCondition {
    return (world) => !condition(world);
}

export function resourceExists<T>(type: ResourceType<T>): SystemRunCondition {
    return (world) => world.hasResource(type);
}

export function resourceAdded<T>(type: ResourceType<T>): SystemRunCondition {
    return (world) => world.isResourceAdded(type);
}

export function resourceChanged<T>(type: ResourceType<T>): SystemRunCondition {
    return (world) => world.isResourceChanged(type);
}

export function resourceMatches<T>(
    type: ResourceType<T>,
    predicate: RunIfPredicate<T>
): SystemRunCondition {
    return (world) => {
        if (!world.hasResource(type)) {
            return false;
        }

        return predicate(world.resource(type), world);
    };
}

export function stateIs<T extends StateValue>(type: StateType<T>, value: T): SystemRunCondition {
    return (world) => world.hasState(type) && Object.is(world.state(type), value);
}

export function stateMatches<T extends StateValue>(
    type: StateType<T>,
    predicate: RunIfPredicate<T>
): SystemRunCondition {
    return (world) => {
        if (!world.hasState(type)) {
            return false;
        }

        return predicate(world.state(type), world);
    };
}
