import type { ResourceType } from "./resource";
import type { SystemRunCondition } from "./scheduler";
import type { StateType, StateValue } from "./state";
import type { World } from "./world";

/** Predicate used by `runIf` helpers that need access to a concrete value and the world. */
export type RunIfPredicate<T> = (value: T, world: World) => boolean;

/** Minimal query-like source consumed by scheduler run conditions. */
export interface QueryRunIfSource {
    iter(world: World): Iterator<unknown>;
    matchesAny?(world: World): boolean;
    matchesNone?(world: World): boolean;
    matchesSingle?(world: World): boolean;
}

/** Runs only when every nested condition returns `true`. */
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

/** Runs when any nested condition returns `true`. */
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

/** Inverts another run condition. */
export function runIfNot(condition: SystemRunCondition): SystemRunCondition {
    return (world) => !condition(world);
}

/** Runs when the source matches at least one entity. */
export function anyMatch(source: QueryRunIfSource): SystemRunCondition {
    return (world) => source.matchesAny?.(world) ?? source.iter(world).next().done !== true;
}

/** Runs when the source matches no entities. */
export function noMatch(source: QueryRunIfSource): SystemRunCondition {
    return (world) => source.matchesNone?.(world) ?? source.iter(world).next().done === true;
}

/** Runs when the source matches exactly one entity. */
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

/** Runs when the resource has been inserted into the world. */
export function resourceExists<T>(type: ResourceType<T>): SystemRunCondition {
    return (world) => world.hasResource(type);
}

/** Runs when the resource was added since the current system last ran. */
export function resourceAdded<T>(type: ResourceType<T>): SystemRunCondition {
    return (world) => world.isResourceAdded(type);
}

/** Runs when the resource changed since the current system last ran. */
export function resourceChanged<T>(type: ResourceType<T>): SystemRunCondition {
    return (world) => world.isResourceChanged(type);
}

/** Runs when the resource exists and matches the supplied predicate. */
export function resourceMatches<T>(
    type: ResourceType<T>,
    predicate: RunIfPredicate<T>
): SystemRunCondition {
    return (world) => world.resourceMatches(type, predicate);
}

/** Runs when the state currently equals the requested value. */
export function stateIs<T extends StateValue>(type: StateType<T>, value: T): SystemRunCondition {
    return (world) => world.stateMatches(type, (current) => Object.is(current, value));
}

/** Runs when the state exists and matches the supplied predicate. */
export function stateMatches<T extends StateValue>(
    type: StateType<T>,
    predicate: RunIfPredicate<T>
): SystemRunCondition {
    return (world) => world.stateMatches(type, predicate);
}
