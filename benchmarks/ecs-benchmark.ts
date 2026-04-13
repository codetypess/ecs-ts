import {
    Entity,
    World,
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
} from "../src";

interface BenchmarkResult {
    readonly name: string;
    readonly operations: number;
    readonly elapsedMs: number;
    readonly opsPerSecond: number;
}

interface MovementWorld {
    readonly world: World;
    readonly entities: readonly Entity[];
}

const ENTITY_COUNT = 50_000;
const QUERY_LOOPS = 20;
const DIRECT_GET_LOOPS = 20;
const EVENT_COUNT = 100_000;
const SCHEDULER_UPDATES = 5_000;
const SCHEDULER_SYSTEMS = 16;

const Position = defineComponent<{ x: number; y: number }>("BenchPosition");
const Velocity = defineComponent<{ x: number; y: number }>("BenchVelocity");
const Player = defineComponent<null>("BenchPlayer");
const Sleeping = defineComponent<null>("BenchSleeping");
const Health = defineComponent<{ value: number }>("BenchHealth");
const DamageMessage = defineMessage<{ target: Entity; amount: number }>("BenchDamageMessage");
const DamageEvent = defineEvent<{ target: Entity; amount: number }>("BenchDamageEvent");
const FeatureFlags = defineResource<{ enabled: boolean; paused: boolean }>("BenchFeatureFlags");
const Mode = defineState<"running" | "paused">("BenchMode", "running");

let checksum = 0;

function measure(name: string, run: () => number): BenchmarkResult {
    const start = globalThis.performance.now();
    const operations = run();

    const elapsedMs = globalThis.performance.now() - start;
    const opsPerSecond = operations / (elapsedMs / 1000);

    return {
        name,
        operations,
        elapsedMs,
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
                world.spawn(
                    position,
                    velocity,
                    withComponent(Player, null),
                    withComponent(Sleeping, null)
                )
            );
        } else if (isPlayer) {
            entities.push(world.spawn(position, velocity, withComponent(Player, null)));
        } else if (isSleeping) {
            entities.push(world.spawn(position, velocity, withComponent(Sleeping, null)));
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

function formatNumber(value: number): string {
    return Math.round(value).toLocaleString("en-US");
}

function printResults(results: readonly BenchmarkResult[]): void {
    console.log(`entities=${formatNumber(ENTITY_COUNT)}`);
    console.log("benchmark".padEnd(36), "ops".padStart(12), "ms".padStart(10), "ops/sec".padStart(14));

    for (const result of results) {
        console.log(
            result.name.padEnd(36),
            formatNumber(result.operations).padStart(12),
            result.elapsedMs.toFixed(2).padStart(10),
            formatNumber(result.opsPerSecond).padStart(14)
        );
    }

    console.log(`checksum=${Math.round(checksum)}`);
}

const movement = createMovementWorld(ENTITY_COUNT);
const movingQuery = queryState([Position, Velocity]);
const results: BenchmarkResult[] = [];

results.push(
    measure("spawn position+velocity", () => {
        createMovementWorld(ENTITY_COUNT);
        checksum += ENTITY_COUNT;

        return ENTITY_COUNT;
    })
);

results.push(
    measure("direct get(Position)", () => {
        let operations = 0;

        for (let loop = 0; loop < DIRECT_GET_LOOPS; loop++) {
            for (const entity of movement.entities) {
                checksum += movement.world.get(entity, Position)?.x ?? 0;
                operations++;
            }
        }

        return operations;
    })
);

results.push(
    measure("query Position+Velocity", () => {
        let operations = 0;

        for (let loop = 0; loop < QUERY_LOOPS; loop++) {
            for (const [, position, velocity] of movement.world.query(Position, Velocity)) {
                position.x += velocity.x * 0.001;
                checksum += position.y;
                operations++;
            }
        }

        return operations;
    })
);

results.push(
    measure("queryState.iter Position+Velocity", () => {
        let operations = 0;

        for (let loop = 0; loop < QUERY_LOOPS; loop++) {
            for (const [, position, velocity] of movingQuery.iter(movement.world)) {
                position.x += velocity.x * 0.001;
                checksum += position.y;
                operations++;
            }
        }

        return operations;
    })
);

results.push(
    measure("queryState.each Position+Velocity", () => {
        let operations = 0;

        for (let loop = 0; loop < QUERY_LOOPS; loop++) {
            movingQuery.each(movement.world, (entity, position, velocity) => {
                position.x += velocity.x * 0.001;
                checksum += position.y + (entity % 2);
                operations++;
            });
        }

        return operations;
    })
);

results.push(
    measure("filtered query Player not Sleeping", () => {
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
    })
);

results.push(
    measure("optional query Velocity", () => {
        let operations = 0;

        for (let loop = 0; loop < QUERY_LOOPS; loop++) {
            for (const [, position, velocity] of movement.world.queryOptional(
                [Position],
                [Velocity],
                { none: [Sleeping] }
            )) {
                checksum += position.x + (velocity?.x ?? 0);
                operations++;
            }
        }

        return operations;
    })
);

results.push(
    measure("message write+read", () => {
        const world = new World();
        const target = world.spawn(withComponent(Health, { value: 100 }));
        const reader = messageReader(DamageMessage);

        world.addMessage(DamageMessage);

        for (let index = 0; index < EVENT_COUNT; index++) {
            world.writeMessage(DamageMessage, { target, amount: 1 });
        }

        checksum += reader.read(world).length;

        return EVENT_COUNT;
    })
);

results.push(
    measure("observer trigger", () => {
        const world = new World();
        const target = world.spawn(withComponent(Health, { value: 100 }));

        world.observe(DamageEvent, (damage, currentWorld) => {
            checksum += currentWorld.mustGet(damage.target, Health).value;
        });

        for (let index = 0; index < EVENT_COUNT; index++) {
            world.trigger(DamageEvent, { target, amount: 1 });
        }

        return EVENT_COUNT;
    })
);

results.push(
    measure("scheduler runIf composed (pass)", () => {
        const world = createSchedulerWorld(true);

        for (let index = 0; index < SCHEDULER_UPDATES; index++) {
            world.update(0);
        }

        return SCHEDULER_UPDATES * SCHEDULER_SYSTEMS;
    })
);

results.push(
    measure("scheduler runIf composed (skip)", () => {
        const world = createSchedulerWorld(false);

        for (let index = 0; index < SCHEDULER_UPDATES; index++) {
            world.update(0);
        }

        return SCHEDULER_UPDATES * SCHEDULER_SYSTEMS;
    })
);

printResults(results);
