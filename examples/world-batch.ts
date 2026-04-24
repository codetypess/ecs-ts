import { World, createRegistry, withComponent } from "../src";

const registry = createRegistry("example-world-batch");
const history: string[] = [];
const Value = registry.defineComponent<{ value: number }>("Value", {
    onAdd(_entity, value) {
        history.push(`onAdd:${value.value}`);
    },
    onReplace(_entity, value) {
        history.push(`onReplace:${value.value}`);
    },
    onInsert(_entity, value) {
        history.push(`onInsert:${value.value}`);
    },
    onRemove(_entity, value) {
        history.push(`onRemove:${value.value}`);
    },
});

const world = new World(registry);
const entity = world.spawn(withComponent(Value, { value: 1 }));

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
