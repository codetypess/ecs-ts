import type {
    ScheduleStage,
    SystemRunner,
    SystemSetConfig,
    SystemRunCondition,
    SystemSetLabel,
    SystemSetOptions,
} from "../scheduler";
import {
    createScheduleCacheEntries,
    createSchedules,
    createSystemSetConfig,
    createSystemSetStageConfigs,
    scheduleStages,
    sortSystemRunners,
} from "../scheduler";
import type { World } from "../world";

interface ScheduleCacheEntry {
    dirty: boolean;
    systems: readonly SystemRunner[] | undefined;
}

type ScheduleStageConfigs = ReturnType<typeof createSystemSetStageConfigs>;
type ScheduleCollections = ReturnType<typeof createSchedules>;

export interface ScheduleRuntimeContext {
    fixedTimeStep: number;
    fixedUpdateAccumulator: number;
    readonly systemSets: Map<SystemSetLabel, SystemSetConfig>;
    readonly systemSetsByStage: ScheduleStageConfigs;
    readonly schedules: ScheduleCollections;
    readonly sortedSchedules: Record<ScheduleStage, ScheduleCacheEntry>;
}

export function createScheduleRuntimeContext(): ScheduleRuntimeContext {
    return {
        fixedTimeStep: 1 / 60,
        fixedUpdateAccumulator: 0,
        systemSets: new Map(),
        systemSetsByStage: createSystemSetStageConfigs(),
        schedules: createSchedules(),
        sortedSchedules: createScheduleCacheEntries(),
    };
}

export function configureSet(
    context: ScheduleRuntimeContext,
    set: SystemSetLabel,
    options: SystemSetOptions
): void {
    context.systemSets.set(set, createSystemSetConfig(options));
    invalidateAllScheduleCaches(context);
}

export function configureSetForStage(
    context: ScheduleRuntimeContext,
    stage: ScheduleStage,
    set: SystemSetLabel,
    options: SystemSetOptions
): void {
    context.systemSetsByStage[stage].set(set, createSystemSetConfig(options));
    invalidateScheduleCache(context, stage);
}

export function setFixedTimeStep(context: ScheduleRuntimeContext, seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new Error("Fixed time step must be a positive finite number");
    }

    context.fixedTimeStep = seconds;
}

export function addSystemRunner(
    context: ScheduleRuntimeContext,
    stage: ScheduleStage,
    runner: SystemRunner
): void {
    context.schedules[stage].push(runner);
    invalidateScheduleCache(context, stage);
}

export function shouldRunSystem(
    context: ScheduleRuntimeContext,
    system: SystemRunner,
    stage: ScheduleStage,
    world: World
): boolean {
    for (const set of system.sets) {
        if (!matchesRunCondition(context.systemSets.get(set)?.runIf, world)) {
            return false;
        }

        if (!matchesRunCondition(context.systemSetsByStage[stage].get(set)?.runIf, world)) {
            return false;
        }
    }

    return matchesRunCondition(system.runIf, world);
}

export function runSchedule(
    context: ScheduleRuntimeContext,
    stage: ScheduleStage,
    dt: number,
    runSystems: (systems: readonly SystemRunner[], stage: ScheduleStage, dt: number) => void
): void {
    runSystems(resolveSortedSchedule(context, stage), stage, dt);
}

export function runFixedUpdate(
    context: ScheduleRuntimeContext,
    dt: number,
    runSystems: (systems: readonly SystemRunner[], stage: ScheduleStage, dt: number) => void
): void {
    context.fixedUpdateAccumulator += dt;

    while (context.fixedUpdateAccumulator >= context.fixedTimeStep) {
        runSchedule(context, "fixedUpdate", context.fixedTimeStep, runSystems);
        context.fixedUpdateAccumulator -= context.fixedTimeStep;
    }
}

function resolveSortedSchedule(
    context: ScheduleRuntimeContext,
    stage: ScheduleStage
): readonly SystemRunner[] {
    const cache = context.sortedSchedules[stage];

    if (cache.dirty || cache.systems === undefined) {
        cache.systems = sortSystemRunners(
            context.schedules[stage],
            stage,
            context.systemSets,
            context.systemSetsByStage[stage]
        );
        cache.dirty = false;
    }

    return cache.systems;
}

function invalidateScheduleCache(context: ScheduleRuntimeContext, stage: ScheduleStage): void {
    const cache = context.sortedSchedules[stage];
    cache.dirty = true;
    cache.systems = undefined;
}

function invalidateAllScheduleCaches(context: ScheduleRuntimeContext): void {
    for (const stage of scheduleStages) {
        invalidateScheduleCache(context, stage);
    }
}

function matchesRunCondition(runIf: SystemRunCondition | undefined, world: World): boolean {
    return runIf?.(world) !== false;
}
