import {
    defineComponent,
    World,
    createRegistry,
    formatEntity,
    withComponent,
    withMarker,
} from "../src";

const registry = createRegistry("example-query-filter");
type Position = { x: number; y: number };
const Position = registry.registerComponent(defineComponent<Position>("Position"));
type Velocity = { x: number; y: number };
const Velocity = registry.registerComponent(defineComponent<Velocity>("Velocity"));
const Player = registry.registerComponent(defineComponent("Player"));
const Sleeping = registry.registerComponent(defineComponent("Sleeping"));

const world = new World(registry);

world.spawn(
    0,
    withComponent(Position, { x: 0, y: 0 }),
    withComponent(Velocity, { x: 1, y: 0 }),
    withMarker(Player)
);

world.spawn(
    0,
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
