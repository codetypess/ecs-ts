import {
    Entity,
    World,
    anyMatch,
    defineComponent,
    defineEvent,
    defineMessage,
    defineResource,
    defineState,
    messageReader,
    queryState,
    resourceMatches,
    runIfAll,
    runIfNot,
    stateIs,
    withComponent,
    withMarker,
} from "../src";

interface BenchmarkResult {
    readonly name: string;
    readonly operations: number;
    readonly samplesMs: readonly number[];
    readonly minMs: number;
    readonly medianMs: number;
    readonly maxMs: number;
    readonly opsPerSecond: number;
}

interface MovementWorld {
    readonly world: World;
    readonly entities: readonly Entity[];
}

interface BenchmarkConfig {
    readonly entityCount: number;
    readonly queryLoops: number;
    readonly directGetLoops: number;
    readonly eventCount: number;
    readonly schedulerUpdates: number;
    readonly schedulerSystems: number;
    readonly warmupRounds: number;
    readonly sampleRounds: number;
}

interface BenchmarkReport {
    readonly formatVersion: 1;
    readonly config: BenchmarkConfig;
    readonly checksum: number;
    readonly results: readonly BenchmarkResult[];
}

interface BenchmarkOptions {
    readonly json: boolean;
    readonly config: BenchmarkConfig;
    readonly only: readonly string[];
}

const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
    entityCount: 50_000,
    queryLoops: 20,
    directGetLoops: 20,
    eventCount: 100_000,
    schedulerUpdates: 5_000,
    schedulerSystems: 16,
    warmupRounds: 1,
    sampleRounds: 5,
};

const SMOKE_BENCHMARK_CONFIG: BenchmarkConfig = {
    entityCount: 2_000,
    queryLoops: 4,
    directGetLoops: 4,
    eventCount: 5_000,
    schedulerUpdates: 250,
    schedulerSystems: 6,
    warmupRounds: 0,
    sampleRounds: 2,
};

const Position = defineComponent<{ x: number; y: number }>("BenchPosition");
const Velocity = defineComponent<{ x: number; y: number }>("BenchVelocity");
const Player = defineComponent("BenchPlayer");
const Sleeping = defineComponent("BenchSleeping");
const Health = defineComponent<{ value: number }>("BenchHealth");
const DamageMessage = defineMessage<{ target: Entity; amount: number }>("BenchDamageMessage");
const DamageEvent = defineEvent<{ target: Entity; amount: number }>("BenchDamageEvent");
const FeatureFlags = defineResource<{ enabled: boolean; paused: boolean }>("BenchFeatureFlags");
const Mode = defineState<"running" | "paused">("BenchMode", "running");
const QueryRunIf = queryState([Position, Velocity], { without: [Sleeping] });

let checksum = 0;
const options = parseOptions(process.argv.slice(2));
const ENTITY_COUNT = options.config.entityCount;
const QUERY_LOOPS = options.config.queryLoops;
const DIRECT_GET_LOOPS = options.config.directGetLoops;
const EVENT_COUNT = options.config.eventCount;
const SCHEDULER_UPDATES = options.config.schedulerUpdates;
const SCHEDULER_SYSTEMS = options.config.schedulerSystems;
const WARMUP_ROUNDS = options.config.warmupRounds;
const SAMPLE_ROUNDS = options.config.sampleRounds;

function measure(name: string, run: () => number): BenchmarkResult {
    for (let warmup = 0; warmup < WARMUP_ROUNDS; warmup++) {
        run();
    }

    const samples: number[] = [];
    let operations = 0;

    for (let sample = 0; sample < SAMPLE_ROUNDS; sample++) {
        const start = globalThis.performance.now();
        const currentOperations = run();
        const elapsedMs = globalThis.performance.now() - start;

        samples.push(elapsedMs);
        operations = currentOperations;
    }

    const minMs = Math.min(...samples);
    const maxMs = Math.max(...samples);
    const medianMs = median(samples);
    const opsPerSecond = operations / (medianMs / 1000);

    return {
        name,
        operations,
        samplesMs: Object.freeze([...samples]),
        minMs,
        medianMs,
        maxMs,
        opsPerSecond,
    };
}

function createMovementWorld(count: number): MovementWorld {
    const world = new World();
    const entities: Entity[] = [];

    for (let index = 0; index < count; index++) {
        const position = withComponent(Position, { x: index, y: index });
        const velocity = withComponent(Velocity, { x: 1, y: -1 });
        const isPlayer = index % 3 === 0;
        const isSleeping = index % 10 === 0;

        if (isPlayer && isSleeping) {
            entities.push(
                world.spawn(position, velocity, withMarker(Player), withMarker(Sleeping))
            );
        } else if (isPlayer) {
            entities.push(world.spawn(position, velocity, withMarker(Player)));
        } else if (isSleeping) {
            entities.push(world.spawn(position, velocity, withMarker(Sleeping)));
        } else {
            entities.push(world.spawn(position, velocity));
        }
    }

    return { world, entities };
}

function createSchedulerWorld(enabled: boolean): World {
    class NoopSystem {
        onUpdate(): void {
            checksum += 1;
        }
    }

    const world = new World();

    world.setResource(FeatureFlags, { enabled, paused: false });
    world.initState(Mode);

    for (let index = 0; index < SCHEDULER_SYSTEMS; index++) {
        world.addSystem(new NoopSystem(), {
            runIf: runIfAll(
                stateIs(Mode, "running"),
                resourceMatches(FeatureFlags, (flags) => flags.enabled),
                runIfNot(resourceMatches(FeatureFlags, (flags) => flags.paused))
            ),
        });
    }

    return world;
}

function createQueryRunIfSchedulerWorld(matching: boolean): World {
    class NoopSystem {
        onUpdate(): void {
            checksum += 1;
        }
    }

    const world = new World();

    if (matching) {
        world.spawn(
            withComponent(Position, { x: 0, y: 0 }),
            withComponent(Velocity, { x: 1, y: 0 })
        );
    } else {
        world.spawn(
            withComponent(Position, { x: 0, y: 0 }),
            withComponent(Velocity, { x: 1, y: 0 }),
            withMarker(Sleeping)
        );
    }

    for (let index = 0; index < SCHEDULER_SYSTEMS; index++) {
        world.addSystem(new NoopSystem(), {
            runIf: anyMatch(QueryRunIf),
        });
    }

    return world;
}

function formatNumber(value: number): string {
    return Math.round(value).toLocaleString("en-US");
}

function median(values: readonly number[]): number {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1]! + sorted[middle]!) / 2;
    }

    return sorted[middle]!;
}

function printResults(results: readonly BenchmarkResult[]): void {
    console.log(`entities=${formatNumber(ENTITY_COUNT)}`);
    console.log(`samples=${SAMPLE_ROUNDS}, warmup=${WARMUP_ROUNDS}`);
    console.log(
        "benchmark".padEnd(36),
        "ops".padStart(12),
        "min".padStart(10),
        "median".padStart(10),
        "max".padStart(10),
        "ops/sec".padStart(14)
    );

    for (const result of results) {
        console.log(
            result.name.padEnd(36),
            formatNumber(result.operations).padStart(12),
            result.minMs.toFixed(2).padStart(10),
            result.medianMs.toFixed(2).padStart(10),
            result.maxMs.toFixed(2).padStart(10),
            formatNumber(result.opsPerSecond).padStart(14)
        );
    }

    console.log(`checksum=${Math.round(checksum)}`);
}

function createReport(results: readonly BenchmarkResult[]): BenchmarkReport {
    return {
        formatVersion: 1,
        config: options.config,
        checksum: Math.round(checksum),
        results,
    };
}

function parseOptions(args: readonly string[]): BenchmarkOptions {
    let json = false;
    let profile = "default";
    const only: string[] = [];

    for (let index = 0; index < args.length; index++) {
        const arg = args[index]!;

        if (arg === "--json") {
            json = true;
            continue;
        }

        if (arg === "--profile") {
            const value = args[index + 1];

            if (value === undefined) {
                throw new Error("Missing value for --profile.");
            }

            profile = value;
            index++;
            continue;
        }

        if (arg.startsWith("--profile=")) {
            profile = arg.slice("--profile=".length);
            continue;
        }

        if (arg === "--only") {
            const value = args[index + 1];

            if (value === undefined) {
                throw new Error("Missing value for --only.");
            }

            only.push(...parseOnlyPatterns(value));
            index++;
            continue;
        }

        if (arg.startsWith("--only=")) {
            only.push(...parseOnlyPatterns(arg.slice("--only=".length)));
            continue;
        }

        if (arg === "--help" || arg === "-h") {
            printUsage();
            process.exit(0);
        }

        throw new Error(`Unknown option: ${arg}`);
    }

    return {
        json,
        config: resolveConfig(profile),
        only,
    };
}

function parseOnlyPatterns(value: string): string[] {
    return value
        .split(",")
        .map((pattern) => pattern.trim().toLowerCase())
        .filter((pattern) => pattern.length > 0);
}

function shouldRunBenchmark(name: string): boolean {
    if (options.only.length === 0) {
        return true;
    }

    const normalizedName = name.toLowerCase();

    return options.only.some((pattern) => normalizedName.includes(pattern));
}

function pushBenchmark(results: BenchmarkResult[], name: string, run: () => number): void {
    if (!shouldRunBenchmark(name)) {
        return;
    }

    results.push(measure(name, run));
}

function resolveConfig(profile: string): BenchmarkConfig {
    if (profile === "default") {
        return DEFAULT_BENCHMARK_CONFIG;
    }

    if (profile === "smoke") {
        return SMOKE_BENCHMARK_CONFIG;
    }

    throw new Error(`Unknown benchmark profile: ${profile}`);
}

function printUsage(): void {
    console.log(
        "Usage: tsx benchmarks/ecs-benchmark.ts [--json] [--profile default|smoke] [--only pattern[,pattern...]]"
    );
}

const movement = createMovementWorld(ENTITY_COUNT);
const movingQuery = queryState([Position, Velocity]);
const results: BenchmarkResult[] = [];

pushBenchmark(results, "spawn position+velocity", () => {
    createMovementWorld(ENTITY_COUNT);
    checksum += ENTITY_COUNT;

    return ENTITY_COUNT;
});

pushBenchmark(results, "direct get(Position)", () => {
    let operations = 0;

    for (let loop = 0; loop < DIRECT_GET_LOOPS; loop++) {
        for (const entity of movement.entities) {
            checksum += movement.world.get(entity, Position)?.x ?? 0;
            operations++;
        }
    }

    return operations;
});

pushBenchmark(results, "query Position+Velocity", () => {
    let operations = 0;

    for (let loop = 0; loop < QUERY_LOOPS; loop++) {
        for (const [, position, velocity] of movement.world.query(Position, Velocity)) {
            position.x += velocity.x * 0.001;
            checksum += position.y;
            operations++;
        }
    }

    return operations;
});

pushBenchmark(results, "queryState.iter Position+Velocity", () => {
    let operations = 0;

    for (let loop = 0; loop < QUERY_LOOPS; loop++) {
        for (const [, position, velocity] of movingQuery.iter(movement.world)) {
            position.x += velocity.x * 0.001;
            checksum += position.y;
            operations++;
        }
    }

    return operations;
});

pushBenchmark(results, "queryState.each Position+Velocity", () => {
    let operations = 0;

    for (let loop = 0; loop < QUERY_LOOPS; loop++) {
        movingQuery.each(movement.world, (entity, position, velocity) => {
            position.x += velocity.x * 0.001;
            checksum += position.y + (entity % 2);
            operations++;
        });
    }

    return operations;
});

pushBenchmark(results, "filtered query Player not Sleeping", () => {
    let operations = 0;

    for (let loop = 0; loop < QUERY_LOOPS; loop++) {
        for (const [, position] of movement.world.queryWhere([Position], {
            with: [Player],
            without: [Sleeping],
        })) {
            checksum += position.x;
            operations++;
        }
    }

    return operations;
});

pushBenchmark(results, "optional query Velocity", () => {
    let operations = 0;

    for (let loop = 0; loop < QUERY_LOOPS; loop++) {
        for (const [, position, velocity] of movement.world.queryOptional([Position], [Velocity], {
            without: [Sleeping],
        })) {
            checksum += position.x + (velocity?.x ?? 0);
            operations++;
        }
    }

    return operations;
});

pushBenchmark(results, "message write+read", () => {
    const world = new World();
    const target = world.spawn(withComponent(Health, { value: 100 }));
    const reader = messageReader(DamageMessage);

    world.addMessage(DamageMessage);

    for (let index = 0; index < EVENT_COUNT; index++) {
        world.writeMessage(DamageMessage, { target, amount: 1 });
    }

    checksum += reader.read(world).length;

    return EVENT_COUNT;
});

pushBenchmark(results, "observer trigger", () => {
    const world = new World();
    const target = world.spawn(withComponent(Health, { value: 100 }));

    world.observe(DamageEvent, (damage, currentWorld) => {
        checksum += currentWorld.mustGet(damage.target, Health).value;
    });

    for (let index = 0; index < EVENT_COUNT; index++) {
        world.trigger(DamageEvent, { target, amount: 1 });
    }

    return EVENT_COUNT;
});

pushBenchmark(results, "scheduler runIf composed (pass)", () => {
    const world = createSchedulerWorld(true);

    for (let index = 0; index < SCHEDULER_UPDATES; index++) {
        world.update(0);
    }

    return SCHEDULER_UPDATES * SCHEDULER_SYSTEMS;
});

pushBenchmark(results, "scheduler runIf composed (skip)", () => {
    const world = createSchedulerWorld(false);

    for (let index = 0; index < SCHEDULER_UPDATES; index++) {
        world.update(0);
    }

    return SCHEDULER_UPDATES * SCHEDULER_SYSTEMS;
});

pushBenchmark(results, "scheduler runIf anyMatch query (pass)", () => {
    const world = createQueryRunIfSchedulerWorld(true);

    for (let index = 0; index < SCHEDULER_UPDATES; index++) {
        world.update(0);
    }

    return SCHEDULER_UPDATES * SCHEDULER_SYSTEMS;
});

pushBenchmark(results, "scheduler runIf anyMatch query (skip)", () => {
    const world = createQueryRunIfSchedulerWorld(false);

    for (let index = 0; index < SCHEDULER_UPDATES; index++) {
        world.update(0);
    }

    return SCHEDULER_UPDATES * SCHEDULER_SYSTEMS;
});

if (results.length === 0) {
    throw new Error(`No benchmark matched --only filters: ${options.only.join(", ")}`);
}

const report = createReport(results);

if (options.json) {
    console.log(JSON.stringify(report, null, 2));
} else {
    printResults(report.results);
}
