import { World, createRegistry, formatEntity, queryState, withComponent, withMarker } from "../src";

const registry = createRegistry("example-query-state");
type Position = { x: number; y: number };
const Position = registry.defineComponent<Position>("Position");
type Velocity = { x: number; y: number };
const Velocity = registry.defineComponent<Velocity>("Velocity");
const Sleeping = registry.defineComponent("Sleeping");

class MovementSystem {
    private readonly moving = queryState([Position, Velocity], {
        without: [Sleeping],
    });

    onUpdate(world: World): void {
        this.moving.each(world, (entity, position, velocity) => {
            position.x += velocity.x;
            position.y += velocity.y;
            console.log(`moved ${formatEntity(entity)} -> (${position.x}, ${position.y})`);
        });
    }
}

const world = new World(registry);

world.spawn(0, withComponent(Position, { x: 0, y: 0 }), withComponent(Velocity, { x: 1, y: 0 }));

world.spawn(
    0,
    withComponent(Position, { x: 10, y: 0 }),
    withComponent(Velocity, { x: 0, y: 1 }),
    withMarker(Sleeping)
);

world.addSystem(new MovementSystem());
world.update(0);
