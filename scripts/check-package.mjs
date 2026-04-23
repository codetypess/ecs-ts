import assert from "node:assert/strict";
import { World, createRegistry, queryState, withComponent, withMarker } from "ecs-ts";

const registry = createRegistry("package-smoke");

const Position = registry.defineComponent("Position");
const Velocity = registry.defineComponent("Velocity");
const Selected = registry.defineComponent("Selected");

const world = new World(registry);
const entity = world.spawn(
    withComponent(Position, { x: 1, y: 2 }),
    withComponent(Velocity, { x: 3, y: 4 }),
    withMarker(Selected)
);
const movingSelected = queryState([Position, Velocity], { with: [Selected] });

const rows = Array.from(movingSelected.iter(world));

assert.equal(rows.length, 1);
assert.equal(rows[0]?.[0], entity);
assert.deepEqual(rows[0]?.[1], { x: 1, y: 2 });
assert.deepEqual(rows[0]?.[2], { x: 3, y: 4 });

world.eachWhere([Position], { with: [Selected] }, (_entity, position) => {
    position.x += 10;
});

assert.deepEqual(world.getComponent(entity, Position), { x: 11, y: 2 });

console.log("ok package self-reference");
