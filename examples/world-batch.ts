import { defineComponent, World, createRegistry, withComponent } from "../src";

const registry = createRegistry("example-world-batch");
const history: string[] = [];
type Value = { value: number };
const Value = registry.registerComponent(
    defineComponent<Value>("Value", {
        onAdd(_entity, value) {
            history.push(`onAdd:${value.value}`);
        },
        onUnset(_entity, value) {
            history.push(`onUnset:${value.value}`);
        },
        onReplace(_entity, previous, next) {
            history.push(`onReplace:${previous.value}->${next.value}`);
        },
        onInsert(_entity, value) {
            history.push(`onInsert:${value.value}`);
        },
        onRemove(_entity, value) {
            history.push(`onRemove:${value.value}`);
        },
    })
);

const world = new World(registry);
const entity = world.spawn(0, withComponent(Value, { value: 1 }));

history.length = 0;

world.batch((batch) => {
    batch.removeComponent(entity, Value);
    batch.addComponent(entity, Value, { value: 2 });
});

console.log(`after successful batch value=${world.mustGetComponent(entity, Value).value}`);
console.log(`hooks=${history.join(", ")}`);

history.length = 0;

try {
    world.batch((batch) => {
        batch.removeComponent(entity, Value);
        throw new Error("abort batch");
    });
} catch (error) {
    console.log(`rollback=${(error as Error).message}`);
}

console.log(`after rollback value=${world.mustGetComponent(entity, Value).value}`);
console.log(`rollback hooks=${history.length}`);
