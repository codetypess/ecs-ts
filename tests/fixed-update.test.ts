import assert from "node:assert/strict";
import { test } from "node:test";
import { World, createRegistry } from "../src";

const registry = createRegistry("fixed-update-test");

test("fixedUpdate runs the correct number of steps for a given dt", () => {
    let steps = 0;

    class Counter {
        onFixedUpdate(): void {
            steps++;
        }
    }

    const world = new World(registry);

    world.setFixedTimeStep(0.5);
    world.addSystem(new Counter());
    world.update(1.5);

    assert.equal(steps, 3);
});

test("fixedUpdate does not run when dt is less than one step", () => {
    let steps = 0;

    class Counter {
        onFixedUpdate(): void {
            steps++;
        }
    }

    const world = new World(registry);

    world.setFixedTimeStep(0.5);
    world.addSystem(new Counter());
    world.update(0.1);

    assert.equal(steps, 0);
});

test("fixedUpdate accumulates fractional dt across frames", () => {
    let steps = 0;

    class Counter {
        onFixedUpdate(): void {
            steps++;
        }
    }

    const world = new World(registry);

    world.setFixedTimeStep(0.5);
    world.addSystem(new Counter());

    // Three frames of 0.2s each = 0.6s total → 1 step (0.5), 0.1s remainder
    world.update(0.2);
    world.update(0.2);
    world.update(0.2);

    assert.equal(steps, 1);

    // One more frame to push past 0.6s remainder
    world.update(0.5);

    assert.equal(steps, 2);
});

test("fixedUpdate caps steps and drains accumulator on large dt", () => {
    let steps = 0;

    class Counter {
        onFixedUpdate(): void {
            steps++;
        }
    }

    const world = new World(registry);

    world.setFixedTimeStep(0.016);
    world.setMaxFixedStepsPerFrame(4);
    world.addSystem(new Counter());

    // A very large dt that would require many steps; should stop at the cap
    world.update(10.0);

    assert.equal(steps, 4);

    // After draining the accumulator the next normal frame should run 1 step
    steps = 0;
    world.update(0.016);

    assert.equal(steps, 1);
});

test("setMaxFixedStepsPerFrame rejects invalid values", () => {
    const world = new World(registry);

    assert.throws(() => world.setMaxFixedStepsPerFrame(0), /positive integer/);
    assert.throws(() => world.setMaxFixedStepsPerFrame(-1), /positive integer/);
    assert.throws(() => world.setMaxFixedStepsPerFrame(1.5), /positive integer/);
    assert.throws(() => world.setMaxFixedStepsPerFrame(Infinity), /positive integer/);
    assert.throws(() => world.setMaxFixedStepsPerFrame(NaN), /positive integer/);
});

test("setFixedTimeStep rejects non-positive and non-finite values", () => {
    const world = new World(registry);

    assert.throws(() => world.setFixedTimeStep(0), /positive finite/);
    assert.throws(() => world.setFixedTimeStep(-0.1), /positive finite/);
    assert.throws(() => world.setFixedTimeStep(Infinity), /positive finite/);
    assert.throws(() => world.setFixedTimeStep(NaN), /positive finite/);
});

test("fixedUpdate systems receive the configured timestep as dt", () => {
    const dts: number[] = [];

    class Recorder {
        onFixedUpdate(_world: unknown, dt: number): void {
            dts.push(dt);
        }
    }

    const world = new World(registry);

    world.setFixedTimeStep(0.25);
    world.addSystem(new Recorder());
    world.update(0.75);

    assert.deepEqual(dts, [0.25, 0.25, 0.25]);
});
