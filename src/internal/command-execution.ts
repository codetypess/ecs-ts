import { Commands } from "../commands";
import type { EventObserver } from "../event";
import type { SystemRunner } from "../scheduler";
import type { World } from "../world";

/** Runs a system with a fresh deferred command queue and flushes afterward. */
export function runSystemWithCommands(world: World, system: SystemRunner, dt: number): void {
    const commands = new Commands(world);

    system.run(world, dt, commands);
    commands.flush();
}

/** Runs an event observer with its own deferred command queue and flushes afterward. */
export function runEventObserverWithCommands<T>(
    world: World,
    observer: EventObserver<T>,
    value: T
): void {
    const commands = new Commands(world);

    observer(value, world, commands);
    commands.flush();
}
