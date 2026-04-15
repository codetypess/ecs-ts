import type {
    ScheduleStage,
    SystemRunner,
    SystemSetConfig,
    SystemSetLabel,
    SystemSetOptions,
} from "../scheduler";
import {
    createSystemSetConfig,
    scheduleStages,
    sortSystemRunners,
} from "../scheduler";

interface ScheduleCacheEntry {
    dirty: boolean;
    systems: readonly SystemRunner[] | undefined;
}

interface ScheduleRuntimeOptions {
    readonly systemSets: Map<SystemSetLabel, SystemSetConfig>;
    readonly systemSetsByStage: Record<ScheduleStage, Map<SystemSetLabel, SystemSetConfig>>;
    readonly schedules: Record<ScheduleStage, SystemRunner[]>;
    readonly sortedSchedules: Record<ScheduleStage, ScheduleCacheEntry>;
}

export class ScheduleRuntime {
    private fixedTimeStep = 1 / 60;
    private fixedUpdateAccumulator = 0;

    constructor(private readonly options: ScheduleRuntimeOptions) {}

    configureSet(set: SystemSetLabel, options: SystemSetOptions): void {
        this.options.systemSets.set(set, createSystemSetConfig(options));
        this.invalidateAllScheduleCaches();
    }

    configureSetForStage(
        stage: ScheduleStage,
        set: SystemSetLabel,
        options: SystemSetOptions
    ): void {
        this.options.systemSetsByStage[stage].set(set, createSystemSetConfig(options));
        this.invalidateScheduleCache(stage);
    }

    setFixedTimeStep(seconds: number): void {
        if (!Number.isFinite(seconds) || seconds <= 0) {
            throw new Error("Fixed time step must be a positive finite number");
        }

        this.fixedTimeStep = seconds;
    }

    addSystemRunner(stage: ScheduleStage, runner: SystemRunner): void {
        this.options.schedules[stage].push(runner);
        this.invalidateScheduleCache(stage);
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
        const cache = this.options.sortedSchedules[stage];

        if (cache.dirty || cache.systems === undefined) {
            cache.systems = sortSystemRunners(
                this.options.schedules[stage],
                stage,
                this.options.systemSets,
                this.options.systemSetsByStage[stage]
            );
            cache.dirty = false;
        }

        return cache.systems;
    }

    private invalidateScheduleCache(stage: ScheduleStage): void {
        const cache = this.options.sortedSchedules[stage];
        cache.dirty = true;
        cache.systems = undefined;
    }

    private invalidateAllScheduleCaches(): void {
        for (const stage of scheduleStages) {
            this.invalidateScheduleCache(stage);
        }
    }
}
