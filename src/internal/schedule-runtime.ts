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

export class ScheduleRuntime {
    private fixedTimeStep = 1 / 60;
    private fixedUpdateAccumulator = 0;
    private readonly systemSets = new Map<SystemSetLabel, SystemSetConfig>();
    private readonly systemSetsByStage = createSystemSetStageConfigs();
    private readonly schedules = createSchedules();
    private readonly sortedSchedules: Record<ScheduleStage, ScheduleCacheEntry> =
        createScheduleCacheEntries();

    configureSet(set: SystemSetLabel, options: SystemSetOptions): void {
        this.systemSets.set(set, createSystemSetConfig(options));
        this.invalidateAllScheduleCaches();
    }

    configureSetForStage(
        stage: ScheduleStage,
        set: SystemSetLabel,
        options: SystemSetOptions
    ): void {
        this.systemSetsByStage[stage].set(set, createSystemSetConfig(options));
        this.invalidateScheduleCache(stage);
    }

    setFixedTimeStep(seconds: number): void {
        if (!Number.isFinite(seconds) || seconds <= 0) {
            throw new Error("Fixed time step must be a positive finite number");
        }

        this.fixedTimeStep = seconds;
    }

    addSystemRunner(stage: ScheduleStage, runner: SystemRunner): void {
        this.schedules[stage].push(runner);
        this.invalidateScheduleCache(stage);
    }

    shouldRunSystem(system: SystemRunner, stage: ScheduleStage, world: World): boolean {
        for (const set of system.sets) {
            if (!this.matchesRunCondition(this.systemSets.get(set)?.runIf, world)) {
                return false;
            }

            if (!this.matchesRunCondition(this.systemSetsByStage[stage].get(set)?.runIf, world)) {
                return false;
            }
        }

        return this.matchesRunCondition(system.runIf, world);
    }

    runSchedule(
        stage: ScheduleStage,
        dt: number,
        runSystems: (systems: readonly SystemRunner[], stage: ScheduleStage, dt: number) => void
    ): void {
        runSystems(this.resolveSortedSchedule(stage), stage, dt);
    }

    runFixedUpdate(
        dt: number,
        runSystems: (systems: readonly SystemRunner[], stage: ScheduleStage, dt: number) => void
    ): void {
        this.fixedUpdateAccumulator += dt;

        while (this.fixedUpdateAccumulator >= this.fixedTimeStep) {
            this.runSchedule("fixedUpdate", this.fixedTimeStep, runSystems);
            this.fixedUpdateAccumulator -= this.fixedTimeStep;
        }
    }

    private resolveSortedSchedule(stage: ScheduleStage): readonly SystemRunner[] {
        const cache = this.sortedSchedules[stage];

        if (cache.dirty || cache.systems === undefined) {
            cache.systems = sortSystemRunners(
                this.schedules[stage],
                stage,
                this.systemSets,
                this.systemSetsByStage[stage]
            );
            cache.dirty = false;
        }

        return cache.systems;
    }

    private invalidateScheduleCache(stage: ScheduleStage): void {
        const cache = this.sortedSchedules[stage];
        cache.dirty = true;
        cache.systems = undefined;
    }

    private invalidateAllScheduleCaches(): void {
        for (const stage of scheduleStages) {
            this.invalidateScheduleCache(stage);
        }
    }

    private matchesRunCondition(runIf: SystemRunCondition | undefined, world: World): boolean {
        return runIf?.(world) !== false;
    }
}
