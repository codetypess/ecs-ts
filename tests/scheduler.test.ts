import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createSystemRunner,
    createSystemSetConfig,
    sortSystemRunners,
    type ScheduleStage,
    type SystemOptions,
    type SystemRunner,
    type SystemSetConfig,
    type SystemSetLabel,
} from "../src/scheduler";

function runner(options: SystemOptions): SystemRunner {
    return createSystemRunner(() => {}, options);
}

function labels(systems: readonly SystemRunner[]): readonly (string | symbol | undefined)[] {
    return systems.map((system) => system.label);
}

function sort(
    systems: readonly SystemRunner[],
    systemSets: ReadonlyMap<SystemSetLabel, SystemSetConfig> = new Map(),
    stageSystemSets: ReadonlyMap<SystemSetLabel, SystemSetConfig> = new Map(),
    stage: ScheduleStage = "update"
): readonly SystemRunner[] {
    return sortSystemRunners(systems, stage, systemSets, stageSystemSets);
}

test("sortSystemRunners applies direct label ordering", () => {
    const render = runner({ label: "render", after: ["physics"] });
    const physics = runner({ label: "physics", after: ["prepare"] });
    const prepare = runner({ label: "prepare" });

    assert.deepEqual(labels(sort([render, physics, prepare])), ["prepare", "physics", "render"]);
});

test("sortSystemRunners applies global and stage-specific set ordering", () => {
    const prepare = runner({ label: "prepare" });
    const gameplay = runner({ set: "gameplay" });
    const render = runner({ label: "render" });
    const systemSets = new Map<SystemSetLabel, SystemSetConfig>([
        ["gameplay", createSystemSetConfig({ after: ["prepare"] })],
    ]);
    const stageSystemSets = new Map<SystemSetLabel, SystemSetConfig>([
        ["gameplay", createSystemSetConfig({ before: ["render"] })],
    ]);

    assert.deepEqual(sort([render, gameplay, prepare], systemSets, stageSystemSets), [
        prepare,
        gameplay,
        render,
    ]);
});

test("sortSystemRunners keeps stage-specific set ordering scoped to one stage", () => {
    const prepare = runner({ label: "prepare" });
    const gameplay = runner({ set: "gameplay" });
    const stageSystemSets = new Map<SystemSetLabel, SystemSetConfig>([
        ["gameplay", createSystemSetConfig({ after: ["prepare"] })],
    ]);

    assert.deepEqual(sort([gameplay, prepare], new Map(), stageSystemSets, "startup"), [
        prepare,
        gameplay,
    ]);
    assert.deepEqual(sort([gameplay, prepare], new Map(), new Map(), "update"), [
        gameplay,
        prepare,
    ]);
});

test("sortSystemRunners rejects duplicate system labels", () => {
    assert.throws(
        () => sort([runner({ label: "duplicate" }), runner({ label: "duplicate" })]),
        /Duplicate system label in update: duplicate/
    );
});

test("sortSystemRunners rejects duplicate system and set labels", () => {
    assert.throws(
        () => sort([runner({ label: "gameplay" }), runner({ set: "gameplay" })]),
        /Duplicate system\/set label in update: gameplay/
    );
});

test("sortSystemRunners rejects ordering cycles", () => {
    assert.throws(
        () => sort([runner({ label: "a", after: ["b"] }), runner({ label: "b", after: ["a"] })]),
        /System ordering cycle detected in update/
    );
});
