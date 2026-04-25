import {
    World,
    createRegistry,
    matchesAny,
    matchesNone,
    matchesSingle,
    optionalQueryState,
    queryState,
    resourceAdded,
    resourceChanged,
    resourceExists,
    resourceMatches,
    runIfAll,
    runIfAny,
    runIfNot,
    stateIs,
    stateMatches,
    withComponent,
    withMarker,
    type Entity,
    type MessageReader,
    type OptionalQueryRow,
    type OptionalQueryState,
    type QueryRow,
    type QueryState,
    type SystemRunCondition,
} from "../src";

function expectType<T>(value: T): void {
    void value;
}

const registry = createRegistry("query-runif-typecheck");
const Position = registry.defineComponent<{ x: number; y: number }>("Position");
const Velocity = registry.defineComponent<{ x: number; y: number }>("Velocity");
const Name = registry.defineComponent<{ value: string }>("Name");
const Player = registry.defineComponent("Player");
const Flags = registry.defineResource<{ enabled: boolean; paused: boolean }>("Flags");
const Mode = registry.defineState<"boot" | "running" | "paused">("Mode", "boot");
const Damage = registry.defineMessage<{ target: Entity; amount: number }>("Damage");

const world = new World(registry);
const player = world.spawn(
    withMarker(Player),
    withComponent(Position, { x: 1, y: 2 }),
    withComponent(Velocity, { x: 3, y: 4 }),
    withComponent(Name, { value: "alpha" })
);

expectType<IterableIterator<QueryRow<readonly [typeof Position, typeof Velocity]>>>(
    world.query([Position, Velocity])
);
expectType<IterableIterator<QueryRow<readonly [typeof Position, typeof Velocity]>>>(
    world.query([Position, Velocity], { with: [Player] })
);
expectType<
    IterableIterator<
        OptionalQueryRow<readonly [typeof Position], readonly [typeof Velocity, typeof Name]>
    >
>(world.queryOptional([Position], [Velocity, Name], { with: [Player] }));

for (const [entity, position, velocity] of world.query([Position, Velocity])) {
    expectType<Entity>(entity);
    expectType<{ x: number; y: number }>(position);
    expectType<{ x: number; y: number }>(velocity);
}

for (const [entity, position, velocity, name] of world.queryOptional(
    [Position],
    [Velocity, Name]
)) {
    expectType<Entity>(entity);
    expectType<{ x: number; y: number }>(position);
    expectType<{ x: number; y: number } | undefined>(velocity);
    expectType<{ value: string } | undefined>(name);
}

const moving = queryState([Position, Velocity], { with: [Player] });
const named = optionalQueryState([Position], [Velocity, Name], { with: [Player] });

expectType<QueryState<readonly [typeof Position, typeof Velocity]>>(moving);
expectType<OptionalQueryState<readonly [typeof Position], readonly [typeof Velocity, typeof Name]>>(
    named
);

expectType<IterableIterator<QueryRow<readonly [typeof Position, typeof Velocity]>>>(
    moving.iter(world)
);
expectType<
    IterableIterator<
        OptionalQueryRow<readonly [typeof Position], readonly [typeof Velocity, typeof Name]>
    >
>(named.iter(world));
expectType<QueryRow<readonly [typeof Position, typeof Velocity]> | undefined>(
    moving.getSingle(world)
);
expectType<QueryRow<readonly [typeof Position, typeof Velocity]>>(moving.mustGetSingle(world));
expectType<OptionalQueryRow<readonly [typeof Position], readonly [typeof Velocity, typeof Name]>>(
    named.mustGetSingle(world)
);

moving.each(world, (entity, position, velocity) => {
    expectType<Entity>(entity);
    expectType<{ x: number; y: number }>(position);
    expectType<{ x: number; y: number }>(velocity);
});

named.each(world, (entity, position, velocity, name) => {
    expectType<Entity>(entity);
    expectType<{ x: number; y: number }>(position);
    expectType<{ x: number; y: number } | undefined>(velocity);
    expectType<{ value: string } | undefined>(name);
});

world.addSystem(
    "update",
    (currentWorld, dt, commands) => {
        expectType<World>(currentWorld);
        expectType<number>(dt);
        commands.spawn(withMarker(Player));
    },
    { runIf: matchesAny(moving) }
);

world.setResource(Flags, { enabled: true, paused: false });
expectType<{ enabled: boolean; paused: boolean }>(world.mustGetResource(Flags));
expectType<{ enabled: boolean; paused: boolean } | undefined>(world.getResource(Flags));
expectType<boolean>(
    world.resourceMatches(Flags, (flags, currentWorld) => {
        expectType<{ enabled: boolean; paused: boolean }>(flags);
        expectType<World>(currentWorld);

        return flags.enabled && currentWorld.hasResource(Flags);
    })
);

world.setState(Mode, "running");
expectType<"boot" | "running" | "paused">(world.mustGetState(Mode));
expectType<"boot" | "running" | "paused" | undefined>(world.getState(Mode));
expectType<boolean>(
    world.stateMatches(Mode, (mode, currentWorld) => {
        expectType<"boot" | "running" | "paused">(mode);
        expectType<World>(currentWorld);

        return mode === "running" && currentWorld.isAlive(player);
    })
);

world.addMessage(Damage);
world.writeMessage(Damage, { target: player, amount: 10 });

const damageReader = world.messageReader(Damage);

expectType<MessageReader<{ target: Entity; amount: number }>>(damageReader);
expectType<readonly { target: Entity; amount: number }[]>(damageReader.read());
expectType<{ target: Entity; amount: number }[]>(world.drainMessages(Damage));

expectType<SystemRunCondition>(resourceExists(Flags));
expectType<SystemRunCondition>(resourceAdded(Flags));
expectType<SystemRunCondition>(resourceChanged(Flags));
expectType<SystemRunCondition>(
    resourceMatches(
        Flags,
        (flags, currentWorld) => flags.enabled && currentWorld.hasResource(Flags)
    )
);
expectType<SystemRunCondition>(stateIs(Mode, "running"));
expectType<SystemRunCondition>(
    stateMatches(Mode, (mode, currentWorld) => mode !== "paused" && currentWorld.isAlive(player))
);
expectType<SystemRunCondition>(matchesAny(moving));
expectType<SystemRunCondition>(matchesNone(named));
expectType<SystemRunCondition>(matchesSingle(named));
expectType<SystemRunCondition>(runIfNot(matchesNone(moving)));
expectType<SystemRunCondition>(
    runIfAny(resourceExists(Flags), stateIs(Mode, "paused"), matchesAny(moving))
);
expectType<SystemRunCondition>(
    runIfAll(
        resourceMatches(Flags, (flags) => flags.enabled),
        stateMatches(Mode, (mode) => mode === "running"),
        runIfNot(matchesNone(moving))
    )
);

// @ts-expect-error resources only expose declared fields
const _missingResourceField = world.mustGetResource(Flags).missing;

// @ts-expect-error state values keep their declared union
expectType<"stopped">(world.mustGetState(Mode));

named.each(world, (_entity, _position, velocity, _name) => {
    // @ts-expect-error optional query rows keep optional components as possibly undefined
    expectType<{ x: number; y: number }>(velocity);
});

const firstDamage = damageReader.read()[0];

if (firstDamage !== undefined) {
    // @ts-expect-error messages only expose declared fields
    const _missingLabel = firstDamage.label;
}
