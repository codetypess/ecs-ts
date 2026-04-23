import type { EventObserver } from "../event";
import type { SystemRunner } from "../scheduler";
import type { World } from "../world";

/** Runs a system with a fresh deferred command queue and flushes afterward. */
export function runSystemWithCommands(world: World, system: SystemRunner, dt: number): void {
    const commands = world.commands();

    system.run(world, dt, commands);
    commands.flush();
}

/** Runs an event observer with its own deferred command queue and flushes afterward. */
export function runEventObserverWithCommands<T>(
    world: World,
    observer: EventObserver<T>,
    value: T
): void {
    const commands = world.commands();

    observer(value, world, commands);
    commands.flush();
}
