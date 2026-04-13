import { World, defineComponent, formatEntity, withComponent } from "../src";

const Position = defineComponent<{ x: number; y: number }>("Position");
const Velocity = defineComponent<{ x: number; y: number }>("Velocity");
const Player = defineComponent("Player");
const Sleeping = defineComponent("Sleeping");

const world = new World();

world.spawn(
    withComponent(Position, { x: 0, y: 0 }),
    withComponent(Velocity, { x: 1, y: 0 }),
    withComponent(Player, {})
);

world.spawn(
    withComponent(Position, { x: 10, y: 0 }),
    withComponent(Velocity, { x: 0, y: 1 }),
    withComponent(Sleeping, {})
);

world.eachWhere(
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
