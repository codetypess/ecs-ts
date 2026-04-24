import { World, createRegistry, formatEntity, withComponent } from "../src";

const registry = createRegistry("example-component-deps");
const Transform = registry.defineComponent<{ x: number; y: number }>("Transform");
const Element = registry.defineComponent<{ name: string }>("Element", {
    deps: [Transform],
});

const world = new World(registry);

try {
    world.spawn(withComponent(Element, { name: "broken" }));
} catch (error) {
    console.log(`invalid spawn=${(error as Error).message}`);
}

const entity = world.spawn(
    withComponent(Element, { name: "button" }),
    withComponent(Transform, { x: 40, y: 80 })
);

const transform = world.mustGetComponent(entity, Transform);
console.log(
    `${formatEntity(entity)} element=${world.mustGetComponent(entity, Element).name} transform=${transform.x},${transform.y}`
);

try {
    world.removeComponent(entity, Transform);
} catch (error) {
    console.log(`invalid remove=${(error as Error).message}`);
}

world.removeComponent(entity, Element);
world.removeComponent(entity, Transform);

console.log(
    `after cleanup alive=${world.isAlive(entity)} hasElement=${world.hasComponent(entity, Element)} hasTransform=${world.hasComponent(entity, Transform)}`
);
