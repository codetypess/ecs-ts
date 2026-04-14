import { World, defineComponent, formatEntity, queryState, withComponent, withMarker } from "../src";

const Position = defineComponent<{ x: number; y: number }>("Position");
const Velocity = defineComponent<{ x: number; y: number }>("Velocity");
const Sleeping = defineComponent("Sleeping");

class MovementSystem {
    private readonly moving = queryState([Position, Velocity], {
        none: [Sleeping],
    });

    onUpdate(world: World): void {
        this.moving.each(world, (entity, position, velocity) => {
            position.x += velocity.x;
            position.y += velocity.y;
            console.log(`moved ${formatEntity(entity)} -> (${position.x}, ${position.y})`);
        });
    }
}

const world = new World();

world.spawn(
    withComponent(Position, { x: 0, y: 0 }),
    withComponent(Velocity, { x: 1, y: 0 })
);

world.spawn(
    withComponent(Position, { x: 10, y: 0 }),
    withComponent(Velocity, { x: 0, y: 1 }),
    withMarker(Sleeping)
);

world.addSystem(new MovementSystem());
world.update(0);
