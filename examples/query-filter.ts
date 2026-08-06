import { World, createRegistry, formatEntity, withComponent, withMarker } from "../src";

const registry = createRegistry("example-query-filter");
type Position = { x: number; y: number };
const Position = registry.defineComponent<Position>("Position");
type Velocity = { x: number; y: number };
const Velocity = registry.defineComponent<Velocity>("Velocity");
const Player = registry.defineComponent("Player");
const Sleeping = registry.defineComponent("Sleeping");

const world = new World(registry);

world.spawn(
    withComponent(Position, { x: 0, y: 0 }),
    withComponent(Velocity, { x: 1, y: 0 }),
    withMarker(Player)
);

world.spawn(
    withComponent(Position, { x: 10, y: 0 }),
    withComponent(Velocity, { x: 0, y: 1 }),
    withMarker(Sleeping)
);

world.each(
    [Position, Velocity],
    { with: [Player], without: [Sleeping] },
    (entity, position, velocity) => {
        position.x += velocity.x;
        position.y += velocity.y;
        console.log(
            `moved active player ${formatEntity(entity)} -> (${position.x}, ${position.y})`
        );
    }
);
