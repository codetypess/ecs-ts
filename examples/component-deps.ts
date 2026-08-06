import { World, createRegistry, formatEntity, withComponent } from "../src";

const registry = createRegistry("example-component-deps");
type Transform = { x: number; y: number };
const Transform = registry.defineComponent<Transform>("Transform");
type Element = { name: string };
const Element = registry.defineComponent<Element>("Element", {
    deps: [Transform],
});

const world = new World(registry);

try {
    world.spawn(0, withComponent(Element, { name: "broken" }));
} catch (error) {
    console.log(`invalid spawn=${(error as Error).message}`);
}

const entity = world.spawn(
    0,
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
