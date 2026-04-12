import { World, defineComponent, formatEntity, withComponent } from "../src";

const Position = defineComponent<{ x: number; y: number }>("Position");
const Velocity = defineComponent<{ x: number; y: number }>("Velocity");
const Player = defineComponent<null>("Player");
const Npc = defineComponent<null>("Npc");
const Sleeping = defineComponent<null>("Sleeping");
const Frozen = defineComponent<null>("Frozen");
const Name = defineComponent<{ value: string }>("Name");

const world = new World();

world.spawn(
    withComponent(Position, { x: 0, y: 0 }),
    withComponent(Velocity, { x: 1, y: 0 }),
    withComponent(Player, null),
    withComponent(Name, { value: "player" })
);

world.spawn(
    withComponent(Position, { x: 10, y: 0 }),
    withComponent(Npc, null),
    withComponent(Name, { value: "idle-npc" })
);

world.spawn(
    withComponent(Position, { x: 20, y: 0 }),
    withComponent(Velocity, { x: 0, y: 1 }),
    withComponent(Npc, null),
    withComponent(Sleeping, null)
);

world.spawn(
    withComponent(Position, { x: 30, y: 0 }),
    withComponent(Velocity, { x: -1, y: 0 }),
    withComponent(Player, null),
    withComponent(Frozen, null)
);

for (const [entity, position, velocity, name] of world.queryOptional(
    [Position],
    [Velocity, Name],
    {
        or: [Player, Npc],
        none: [Sleeping, Frozen],
    }
)) {
    if (velocity !== undefined) {
        position.x += velocity.x;
        position.y += velocity.y;
    }

    console.log(
        `${name?.value ?? "unnamed"} ${formatEntity(entity)} -> (${position.x}, ${position.y})`
    );
}
