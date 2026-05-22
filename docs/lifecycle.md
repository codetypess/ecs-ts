# Component Lifecycle

中文：[组件生命周期](zh/lifecycle.md).

Component lifecycle hooks are optional and operation-scoped. A single component mutation does not run all stages. The runtime chooses stages based on the committed operation.

## Hook Table

| Operation              | Trigger order                          | Stages that do not run                          |
| ---------------------- | -------------------------------------- | ----------------------------------------------- |
| First add              | `onAdd` -> `onInsert`                  | `onUnset`, `onReplace`, `onRemove`, `onDespawn` |
| Replace existing value | `onUnset` -> `onReplace` -> `onInsert` | `onAdd`, `onRemove`, `onDespawn`                |
| Remove one component   | `onUnset` -> `onRemove`                | `onAdd`, `onInsert`, `onReplace`, `onDespawn`   |
| Despawn entity         | `onUnset` -> `onRemove` -> `onDespawn` | `onAdd`, `onInsert`, `onReplace`                |

The same dispatch rules apply whether the change came from direct `World` writes, `Commands`, or the final committed diff of `world.batch(...)`.

## Mental Model

- `onAdd` means a component became visible on an entity for the first time.
- `onInsert` means a value was written into the component slot, whether that slot was new or already occupied.
- `onUnset` means the previous visible value is about to stop being the current slot value.
- `onReplace` means the previous visible value is being replaced by another value, and it receives both `previous` and `next`.
- `onRemove` means the component is being removed from the entity.
- `onDespawn` means the component is being removed because the whole entity is being destroyed.

That split keeps the names literal: `onReplace` is replace-only, while `onUnset` carries the broader "old value is leaving the slot" semantics that also apply to `removeComponent(...)` and `despawn(...)`.

## Defining And Registering Hooks

You can attach lifecycle hooks in two places:

- component metadata passed to `defineComponent(...)`
- runtime registration on `World`, such as `world.onAddComponent(...)` or `world.onUnsetComponent(...)`

Built-in component lifecycle callbacks run first. Runtime-registered hooks run after them.

```ts
const Health = registry.defineComponent<{ value: number }>("Health", {
    onUnset(entity, health) {
        console.log("unset", entity, health.value);
    },
    onAdd(entity, health) {
        console.log("added", entity, health.value);
    },
    onRemove(entity, health) {
        console.log("removed", entity, health.value);
    },
});

world.onReplaceComponent(Health, (entity, previous, next) => {
    console.log("replaced", entity, previous.value, next.value);
});
```

Run the example:

```sh
npm run example:lifecycle
```
