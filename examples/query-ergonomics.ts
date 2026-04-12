import { World, defineComponent, formatEntity, withComponent } from "../src";

const Position = defineComponent<{ x: number; y: number }>("Position");
const Velocity = defineComponent<{ x: number; y: number }>("Velocity");
const Player = defineComponent<null>("Player");
const Enemy = defineComponent<null>("Enemy");

const world = new World();
const player = world.spawn(
    withComponent(Position, { x: 0, y: 0 }),
    withComponent(Velocity, { x: 1, y: 0 }),
    withComponent(Player, null)
);

world.spawn(withComponent(Position, { x: 10, y: 0 }), withComponent(Enemy, null));

console.log(`player has movement=${world.hasAll(player, [Position, Velocity])}`);
console.log(`player has role=${world.hasAny(player, [Player, Enemy])}`);

const [playerEntity, position, velocity] = world.single([Position, Velocity], {
    with: [Player],
});

console.log(
    `single player ${formatEntity(playerEntity)} -> position=(${position.x}, ${position.y}) velocity=(${velocity.x}, ${velocity.y})`
);

const enemyWithVelocity = world.trySingle([Position, Velocity], { with: [Enemy] });

console.log(`enemy with velocity=${enemyWithVelocity === undefined ? "none" : "found"}`);
