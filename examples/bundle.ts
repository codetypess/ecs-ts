import {
    World,
    bundle,
    defineComponent,
    formatEntity,
    requireComponent,
    withComponent,
    withMarker,
} from "../src";

const Position = defineComponent<{ x: number; y: number }>("Position");
const Velocity = defineComponent<{ x: number; y: number }>("Velocity", {
    require: [requireComponent(Position, () => ({ x: 0, y: 0 }))],
});
const Health = defineComponent<{ value: number }>("Health");
const Player = defineComponent("Player");

function playerBundle(x: number, y: number) {
    return bundle(
        withComponent(Position, { x, y }),
        withComponent(Velocity, { x: 0, y: 0 }),
        withComponent(Health, { value: 100 }),
        withMarker(Player)
    );
}

const world = new World();
const player = world.spawnBundle(playerBundle(10, 20));

world.each([Position, Velocity, Health, Player], (entity, position, velocity, health) => {
    console.log(
        `${formatEntity(entity)} position=(${position.x}, ${position.y}) velocity=(${velocity.x}, ${velocity.y}) hp=${health.value}`
    );
});

world.removeBundle(player, bundle(withMarker(Player), withComponent(Health, { value: 0 })));

console.log(
    `after remove bundle: hasPlayer=${world.has(player, Player)} hasHealth=${world.has(player, Health)}`
);
