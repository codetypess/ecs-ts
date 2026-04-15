import type { Commands, World } from "./world";

export const scheduleStages = [
    "preStartup",
    "startup",
    "postStartup",
    "first",
    "preUpdate",
    "fixedUpdate",
    "update",
    "postUpdate",
    "last",
    "shutdown",
] as const;

export type ScheduleStage = (typeof scheduleStages)[number];

export type SystemLabel = string | symbol;
export type SystemSetLabel = SystemLabel;
export type SystemRunCondition = (world: World) => boolean;

export interface SystemSetOptions {
    readonly before?: readonly SystemLabel[];
    readonly after?: readonly SystemLabel[];
    readonly runIf?: SystemRunCondition;
}

export interface SystemOptions {
    readonly label?: SystemLabel;
    readonly set?: SystemSetLabel | readonly SystemSetLabel[];
    readonly before?: readonly SystemLabel[];
    readonly after?: readonly SystemLabel[];
    readonly runIf?: SystemRunCondition;
}

export type SystemCallback = (world: World, dt: number, commands: Commands) => void;

export interface SystemRunner {
    readonly run: SystemCallback;
    readonly label: SystemLabel | undefined;
    readonly sets: readonly SystemSetLabel[];
    readonly before: readonly SystemLabel[];
    readonly after: readonly SystemLabel[];
    readonly runIf: SystemRunCondition | undefined;
    lastRunTick: number;
}

export interface SystemSetConfig {
    readonly before: readonly SystemLabel[];
    readonly after: readonly SystemLabel[];
    readonly runIf: SystemRunCondition | undefined;
}

interface ScheduleCacheEntry {
    dirty: boolean;
    systems: readonly SystemRunner[] | undefined;
}

export function createSystemRunner(run: SystemCallback, options: SystemOptions = {}): SystemRunner {
    return {
        run,
        label: options.label,
        sets: normalizeSystemSets(options.set),
        before: options.before ?? [],
        after: options.after ?? [],
        runIf: options.runIf,
        lastRunTick: 0,
    };
}

function normalizeSystemSets(
    set: SystemSetLabel | readonly SystemSetLabel[] | undefined
): readonly SystemSetLabel[] {
    if (set === undefined) {
        return [];
    }

    if (Array.isArray(set)) {
        return Object.freeze([...set]);
    }

    return [set as SystemSetLabel];
}

export function createSystemSetConfig(options: SystemSetOptions): SystemSetConfig {
    return {
        before: options.before ?? [],
        after: options.after ?? [],
        runIf: options.runIf,
    };
}

function createStageRecord<T>(createValue: () => T): Record<ScheduleStage, T> {
    return Object.fromEntries(
        scheduleStages.map((stage) => [stage, createValue()] as const)
    ) as Record<ScheduleStage, T>;
}

export function createSystemSetStageConfigs(): Record<
    ScheduleStage,
    Map<SystemSetLabel, SystemSetConfig>
> {
    return createStageRecord(() => new Map<SystemSetLabel, SystemSetConfig>());
}

export function sortSystemRunners(
    systems: readonly SystemRunner[],
    stage: ScheduleStage,
    systemSets: ReadonlyMap<SystemSetLabel, SystemSetConfig>,
    stageSystemSets: ReadonlyMap<SystemSetLabel, SystemSetConfig>
): readonly SystemRunner[] {
    if (!systemsNeedSorting(systems, systemSets, stageSystemSets)) {
        return systems;
    }

    const labels = new Map<SystemLabel, SystemRunner>();
    const setMembers = new Map<SystemSetLabel, SystemRunner[]>();

    for (const system of systems) {
        if (system.label === undefined) {
            // Keep collecting set members below.
        } else {
            if (labels.has(system.label)) {
                throw new Error(`Duplicate system label in ${stage}: ${String(system.label)}`);
            }

            labels.set(system.label, system);
        }

        for (const set of system.sets) {
            const systemsInSet = setMembers.get(set);

            if (systemsInSet === undefined) {
                setMembers.set(set, [system]);
            } else {
                systemsInSet.push(system);
            }
        }
    }

    for (const set of setMembers.keys()) {
        if (labels.has(set)) {
            throw new Error(`Duplicate system/set label in ${stage}: ${String(set)}`);
        }
    }

    const edges = new Map<SystemRunner, SystemRunner[]>();

    for (const system of systems) {
        edges.set(system, []);
    }

    for (const system of systems) {
        for (const label of system.before) {
            addBeforeEdges(system, label, labels, setMembers, edges);
        }

        for (const label of system.after) {
            addAfterEdges(system, label, labels, setMembers, edges);
        }

        for (const set of system.sets) {
            addSystemSetEdges(system, systemSets.get(set), labels, setMembers, edges);
            addSystemSetEdges(system, stageSystemSets.get(set), labels, setMembers, edges);
        }
    }

    return topologicalSortSystems(systems, edges, stage);
}

function systemsNeedSorting(
    systems: readonly SystemRunner[],
    systemSets: ReadonlyMap<SystemSetLabel, SystemSetConfig>,
    stageSystemSets: ReadonlyMap<SystemSetLabel, SystemSetConfig>
): boolean {
    for (const system of systems) {
        if (system.label !== undefined || system.before.length > 0 || system.after.length > 0) {
            return true;
        }

        for (const set of system.sets) {
            if (
                hasSystemSetOrdering(systemSets.get(set)) ||
                hasSystemSetOrdering(stageSystemSets.get(set))
            ) {
                return true;
            }
        }
    }

    return false;
}

function addSystemSetEdges(
    system: SystemRunner,
    config: SystemSetConfig | undefined,
    labels: ReadonlyMap<SystemLabel, SystemRunner>,
    setMembers: ReadonlyMap<SystemSetLabel, readonly SystemRunner[]>,
    edges: ReadonlyMap<SystemRunner, SystemRunner[]>
): void {
    if (config === undefined) {
        return;
    }

    for (const label of config.before) {
        addBeforeEdges(system, label, labels, setMembers, edges);
    }

    for (const label of config.after) {
        addAfterEdges(system, label, labels, setMembers, edges);
    }
}

function hasSystemSetOrdering(config: SystemSetConfig | undefined): boolean {
    return config !== undefined && (config.before.length > 0 || config.after.length > 0);
}

function addBeforeEdges(
    system: SystemRunner,
    targetLabel: SystemLabel,
    systemLabels: ReadonlyMap<SystemLabel, SystemRunner>,
    setMembers: ReadonlyMap<SystemSetLabel, readonly SystemRunner[]>,
    edges: ReadonlyMap<SystemRunner, SystemRunner[]>
): void {
    for (const target of systemsForOrderLabel(targetLabel, systemLabels, setMembers)) {
        addDependency(target, system, edges);
    }
}

function addAfterEdges(
    system: SystemRunner,
    targetLabel: SystemLabel,
    systemLabels: ReadonlyMap<SystemLabel, SystemRunner>,
    setMembers: ReadonlyMap<SystemSetLabel, readonly SystemRunner[]>,
    edges: ReadonlyMap<SystemRunner, SystemRunner[]>
): void {
    for (const target of systemsForOrderLabel(targetLabel, systemLabels, setMembers)) {
        addDependency(system, target, edges);
    }
}

function addDependency(
    dependent: SystemRunner,
    dependency: SystemRunner,
    edges: ReadonlyMap<SystemRunner, SystemRunner[]>
): void {
    if (dependent === dependency) {
        return;
    }

    edges.get(dependent)?.push(dependency);
}

function systemsForOrderLabel(
    label: SystemLabel,
    systemLabels: ReadonlyMap<SystemLabel, SystemRunner>,
    setMembers: ReadonlyMap<SystemSetLabel, readonly SystemRunner[]>
): readonly SystemRunner[] {
    const system = systemLabels.get(label);

    if (system !== undefined) {
        return [system];
    }

    return setMembers.get(label) ?? [];
}

function topologicalSortSystems(
    systems: readonly SystemRunner[],
    edges: ReadonlyMap<SystemRunner, readonly SystemRunner[]>,
    stage: ScheduleStage
): readonly SystemRunner[] {
    const ordered: SystemRunner[] = [];
    const permanent = new Set<SystemRunner>();
    const temporary = new Set<SystemRunner>();
    const stack: SystemRunner[] = [];

    function visit(system: SystemRunner): void {
        if (permanent.has(system)) {
            return;
        }

        if (temporary.has(system)) {
            const cycleStart = stack.indexOf(system);
            const cycleSystems =
                cycleStart === -1 ? [system] : [...stack.slice(cycleStart), system];
            const cycle = cycleSystems.map(formatSystemRunner).join(" -> ");

            throw new Error(`System ordering cycle detected in ${stage}: ${cycle}`);
        }

        temporary.add(system);
        stack.push(system);

        for (const dependency of edges.get(system) ?? []) {
            visit(dependency);
        }

        stack.pop();
        temporary.delete(system);
        permanent.add(system);
        ordered.push(system);
    }

    for (const system of systems) {
        visit(system);
    }

    return ordered;
}

function formatSystemRunner(system: SystemRunner): string {
    const label = system.label === undefined ? undefined : `label:${String(system.label)}`;

    if (system.sets.length === 0) {
        return label ?? "<anonymous>";
    }

    const sets = `sets:${system.sets.map(String).join(",")}`;

    return label === undefined ? sets : `${label} (${sets})`;
}

export function createSchedules(): Record<ScheduleStage, SystemRunner[]> {
    return createStageRecord<SystemRunner[]>(() => []);
}

export function createScheduleCacheEntries(): Record<ScheduleStage, ScheduleCacheEntry> {
    return createStageRecord(() => ({ dirty: true, systems: undefined }));
}
