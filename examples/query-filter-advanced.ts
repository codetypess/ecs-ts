import { World, createRegistry, formatEntity, withComponent, withMarker } from "../src";

const registry = createRegistry("example-query-filter-advanced");
type Position = { x: number; y: number };
const Position = registry.defineComponent<Position>("Position");
type Velocity = { x: number; y: number };
const Velocity = registry.defineComponent<Velocity>("Velocity");
const Player = registry.defineComponent("Player");
const Npc = registry.defineComponent("Npc");
const Sleeping = registry.defineComponent("Sleeping");
const Frozen = registry.defineComponent("Frozen");
type Name = { value: string };
const Name = registry.defineComponent<Name>("Name");

const world = new World(registry);

world.spawn(
    0,
    withComponent(Position, { x: 0, y: 0 }),
    withComponent(Velocity, { x: 1, y: 0 }),
    withMarker(Player),
    withComponent(Name, { value: "player" })
);

world.spawn(
    0,
    withComponent(Position, { x: 10, y: 0 }),
    withMarker(Npc),
    withComponent(Name, { value: "idle-npc" })
);

world.spawn(
    0,
    withComponent(Position, { x: 20, y: 0 }),
    withComponent(Velocity, { x: 0, y: 1 }),
    withMarker(Npc),
    withMarker(Sleeping)
);

world.spawn(
    0,
    withComponent(Position, { x: 30, y: 0 }),
    withComponent(Velocity, { x: -1, y: 0 }),
    withMarker(Player),
    withMarker(Frozen)
);

for (const [entity, position, velocity, name] of world.queryOptional([Position], [Velocity, Name], {
    or: [Player, Npc],
    without: [Sleeping, Frozen],
})) {
    if (velocity !== undefined) {
        position.x += velocity.x;
        position.y += velocity.y;
    }

    console.log(
        `${name?.value ?? "unnamed"} ${formatEntity(entity)} -> (${position.x}, ${position.y})`
    );
}
