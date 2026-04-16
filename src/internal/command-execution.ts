import { Commands } from "../commands";
import type { EventObserver } from "../event";
import type { SystemRunner } from "../scheduler";
import type { World } from "../world";

export function runSystemWithCommands(world: World, system: SystemRunner, dt: number): void {
    const commands = new Commands(world);

    system.run(world, dt, commands);
    commands.flush();
}

export function runEventObserverWithCommands<T>(
    world: World,
    observer: EventObserver<T>,
    value: T
): void {
    const commands = new Commands(world);

    observer(value, world, commands);
    commands.flush();
}
