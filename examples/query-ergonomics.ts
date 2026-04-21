import { World, createRegistry, formatEntity, withComponent, withMarker } from "../src";

const registry = createRegistry("example-query-ergonomics");
const Position = registry.defineComponent<{ x: number; y: number }>("Position");
const Velocity = registry.defineComponent<{ x: number; y: number }>("Velocity");
const Player = registry.defineComponent("Player");
const Enemy = registry.defineComponent("Enemy");

const world = new World(registry);
const player = world.spawn(
    withComponent(Position, { x: 0, y: 0 }),
    withComponent(Velocity, { x: 1, y: 0 }),
    withMarker(Player)
);

world.spawn(withComponent(Position, { x: 10, y: 0 }), withMarker(Enemy));

console.log(`player has movement=${world.hasAllComponents(player, [Position, Velocity])}`);
console.log(`player has role=${world.hasAnyComponents(player, [Player, Enemy])}`);

const [playerEntity, position, velocity] = world.single([Position, Velocity], {
    with: [Player],
});

console.log(
    `single player ${formatEntity(playerEntity)} -> position=(${position.x}, ${position.y}) velocity=(${velocity.x}, ${velocity.y})`
);

const enemyWithVelocity = world.trySingle([Position, Velocity], { with: [Enemy] });

console.log(`enemy with velocity=${enemyWithVelocity === undefined ? "none" : "found"}`);
