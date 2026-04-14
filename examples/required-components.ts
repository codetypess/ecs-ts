import {
    World,
    defineComponent,
    formatEntity,
    requireComponent,
    withComponent,
    withMarker,
} from "../src";

const Transform = defineComponent<{ x: number; y: number }>("Transform");
const Velocity = defineComponent<{ x: number; y: number }>("Velocity", {
    require: [requireComponent(Transform, () => ({ x: 0, y: 0 }))],
});
const Mass = defineComponent<number>("Mass");
const RigidBody = defineComponent("RigidBody", {
    require: [
        requireComponent(Mass, () => 1),
        requireComponent(Velocity, () => ({ x: 0, y: 0 })),
    ],
});

const world = new World();

const defaultBody = world.spawn(withMarker(RigidBody));
const customBody = world.spawn(
    withComponent(Mass, 10),
    withComponent(Transform, { x: 5, y: 5 }),
    withMarker(RigidBody)
);

for (const [entity, rigidBody, mass, velocity, transform] of world.query(
    RigidBody,
    Mass,
    Velocity,
    Transform
)) {
    console.log(
        `${formatEntity(entity)} rigidBody=${rigidBody} mass=${mass} velocity=(${velocity.x}, ${velocity.y}) transform=(${transform.x}, ${transform.y})`
    );
}

console.log(`default=${formatEntity(defaultBody)} custom=${formatEntity(customBody)}`);
