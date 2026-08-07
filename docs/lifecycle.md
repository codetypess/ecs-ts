# Component Lifecycle

中文：[组件生命周期](zh/lifecycle.md).

Component lifecycle hooks are optional and operation-scoped. A single component mutation does not run all stages. The runtime chooses stages based on the committed operation.

## Hook Table

| Operation              | Trigger order                          | Stages that do not run             |
| ---------------------- | -------------------------------------- | ---------------------------------- |
| First add              | `onAdd` -> `onInsert`                  | `onUnset`, `onReplace`, `onRemove` |
| Replace existing value | `onUnset` -> `onReplace` -> `onInsert` | `onAdd`, `onRemove`                |
| Remove one component   | `onUnset` -> `onRemove("removed")`     | `onAdd`, `onInsert`, `onReplace`   |
| Despawn entity         | `onUnset` -> `onRemove("despawned")`   | `onAdd`, `onInsert`, `onReplace`   |

The same dispatch rules apply whether the change came from direct `World` writes, `DeferredCommands`, or the final committed diff of `world.batch(...)`.

## Mental Model

- `onAdd` means a component became visible on an entity for the first time; its `reason` is `"added"` or `"spawned"`.
- `onInsert` means a value was written into the component slot, whether that slot was new or already occupied.
- `onUnset` means the previous visible value is about to stop being the current slot value.
- `onReplace` means the previous visible value is being replaced by another value, and it receives both `previous` and `next`.
- `onRemove` means the component is being removed from the entity; its `reason` is `"removed"` or `"despawned"`.

That split keeps the names literal: `onReplace` is replace-only, while `onUnset` carries the broader "old value is leaving the slot" semantics that also apply to `removeComponent(...)` and `despawn(...)`.

## Defining Hooks

Lifecycle hooks are part of the component metadata passed to `defineComponent(...)`.

```ts
type Health = { value: number };

const Health = defineComponent<Health>("Health", {
    onUnset(entity, health) {
        console.log("unset", entity, health.value);
    },
    onAdd(entity, health, _world, reason) {
        console.log(reason, entity, health.value);
    },
    onRemove(entity, health, _world, reason) {
        console.log(reason, entity, health.value);
    },
});
registry.registerComponent(Health);
```

Run the example:

```sh
npm run example:lifecycle
```
