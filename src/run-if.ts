import type { ResourceType } from "./resource";
import type { StateType, StateValue } from "./state";
import type { SystemRunCondition, World } from "./world";

export type RunIfPredicate<T> = (value: T, world: World) => boolean;
export interface QueryRunIfSource {
    iter(world: World): Iterator<unknown>;
    matchesAny?(world: World): boolean;
    matchesNone?(world: World): boolean;
    matchesSingle?(world: World): boolean;
}

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

export function anyMatch(source: QueryRunIfSource): SystemRunCondition {
    return (world) => source.matchesAny?.(world) ?? source.iter(world).next().done !== true;
}

export function noMatch(source: QueryRunIfSource): SystemRunCondition {
    return (world) => source.matchesNone?.(world) ?? source.iter(world).next().done === true;
}

export function singleMatch(source: QueryRunIfSource): SystemRunCondition {
    return (world) => {
        if (source.matchesSingle !== undefined) {
            return source.matchesSingle(world);
        }

        const iterator = source.iter(world);
        const first = iterator.next();

        if (first.done === true) {
            return false;
        }

        return iterator.next().done === true;
    };
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
    return (world) => world.resourceMatches(type, predicate);
}

export function stateIs<T extends StateValue>(type: StateType<T>, value: T): SystemRunCondition {
    return (world) => world.stateMatches(type, (current) => Object.is(current, value));
}

export function stateMatches<T extends StateValue>(
    type: StateType<T>,
    predicate: RunIfPredicate<T>
): SystemRunCondition {
    return (world) => world.stateMatches(type, predicate);
}
