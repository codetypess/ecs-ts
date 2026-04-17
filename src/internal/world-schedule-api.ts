import type { System } from "../system";
import type { ScheduleStage, SystemOptions, SystemRunner } from "../scheduler";
import { createSystemRunner, scheduleStageDefinitions } from "../scheduler";
import { updateMessages as updateStoredMessages } from "./messages";
import {
    addSystemRunner as addScheduledSystemRunner,
    runFixedUpdate as runScheduledFixedUpdate,
    runSchedule as runScheduledStage,
} from "./schedule-engine";
import { applyStateTransitions, runInitialEnters } from "./state-machine";
import type { WorldRuntime } from "./world-runtime";

type ScheduledSystemRunner = (
    systems: readonly SystemRunner[],
    stage: ScheduleStage,
    dt: number
) => void;

type UpdateStageRunner = (systems: readonly SystemRunner[], dt: number) => void;

/** Registers every implemented lifecycle method from an object-style system. */
export function addSystem(
    runtime: WorldRuntime,
    system: System,
    options: SystemOptions = {}
): void {
    for (const { stage, systemMethod } of scheduleStageDefinitions) {
        const method = system[systemMethod];

        if (method !== undefined) {
            addScheduledSystemRunner(
                runtime.scheduleContext,
                stage,
                createSystemRunner(method.bind(system), options)
            );
        }
    }
}

/** Advances the world by one frame, running startup once and then update schedules. */
export function update(
    runtime: WorldRuntime,
    runScheduledSystems: ScheduledSystemRunner,
    runUpdateStageSystems: UpdateStageRunner,
    dt: number
): void {
    if (!runtime.didStartup) {
        runStartupSchedules(runtime, runScheduledSystems);
    }

    updateStoredMessages(runtime.messageContext);
    runUpdateSchedules(runtime, runScheduledSystems, runUpdateStageSystems, dt);
    runtime.changeTick++;
}

/** Runs shutdown systems once and ignores subsequent calls. */
export function shutdown(runtime: WorldRuntime, runScheduledSystems: ScheduledSystemRunner): void {
    if (runtime.didShutdown) {
        return;
    }

    runScheduledStage(runtime.scheduleContext, "shutdown", 0, runScheduledSystems);
    runtime.didShutdown = true;
}

function runStartupSchedules(
    runtime: WorldRuntime,
    runScheduledSystems: ScheduledSystemRunner
): void {
    for (const stage of ["preStartup", "startup", "postStartup"] as const) {
        runScheduledStage(runtime.scheduleContext, stage, 0, runScheduledSystems);
    }

    runtime.didStartup = true;
}

function runUpdateSchedules(
    runtime: WorldRuntime,
    runScheduledSystems: ScheduledSystemRunner,
    runUpdateStageSystems: UpdateStageRunner,
    dt: number
): void {
    runInitialEnters(runtime.stateContext, dt, runUpdateStageSystems);
    runScheduledStage(runtime.scheduleContext, "first", dt, runScheduledSystems);
    runScheduledStage(runtime.scheduleContext, "preUpdate", dt, runScheduledSystems);
    runScheduledFixedUpdate(runtime.scheduleContext, dt, runScheduledSystems);
    applyStateTransitions(runtime.stateContext, dt, runUpdateStageSystems);
    runScheduledStage(runtime.scheduleContext, "update", dt, runScheduledSystems);
    runScheduledStage(runtime.scheduleContext, "postUpdate", dt, runScheduledSystems);
    runScheduledStage(runtime.scheduleContext, "last", dt, runScheduledSystems);
}
