import {
    World,
    createRegistry,
    formatEntity,
    requireComponent,
    withComponent,
    withMarker,
} from "../src";

const registry = createRegistry("example-required-components");
const Transform = registry.defineComponent<{ x: number; y: number }>("Transform");
const Velocity = registry.defineComponent<{ x: number; y: number }>("Velocity", {
    require: [requireComponent(Transform, () => ({ x: 0, y: 0 }))],
});
const Mass = registry.defineComponent<number>("Mass");
const RigidBody = registry.defineComponent("RigidBody", {
    require: [requireComponent(Mass, () => 1), requireComponent(Velocity, () => ({ x: 0, y: 0 }))],
});

const world = new World(registry);

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
