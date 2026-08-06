# 组件生命周期

English: [Component Lifecycle](../lifecycle.md).

component lifecycle hook 是可选的，而且是按操作路径触发的。一次 component 修改不会把所有阶段全部执行一遍，运行时会根据最终提交的操作选择对应阶段。

## 对照表

| 操作               | 触发顺序                               | 不会触发的阶段                     |
| ------------------ | -------------------------------------- | ---------------------------------- |
| 首次添加           | `onAdd` -> `onInsert`                  | `onUnset`、`onReplace`、`onRemove` |
| 覆盖已有值         | `onUnset` -> `onReplace` -> `onInsert` | `onAdd`、`onRemove`                |
| 删除单个 component | `onUnset` -> `onRemove("removed")`     | `onAdd`、`onInsert`、`onReplace`   |
| despawn entity     | `onUnset` -> `onRemove("despawned")`   | `onAdd`、`onInsert`、`onReplace`   |

无论修改来自直接 `World` 写入、`DeferredCommands`，还是 `world.batch(...)` 最终提交的净变化，触发规则都是这一套。

## 怎么理解这几个阶段

- `onAdd`：component 第一次对该 entity 可见；`reason` 是 `"added"` 或 `"spawned"`。
- `onInsert`：component slot 被写入了一个值，不管这个 slot 之前是空的还是已有旧值。
- `onUnset`：之前那个可见值即将不再是当前 slot 的值。
- `onReplace`：之前那个可见值正在被另一个新值替换，并且会同时拿到 `previous` 和 `next`。
- `onRemove`：component 正在从 entity 上被摘掉；`reason` 是 `"removed"` 或 `"despawned"`。

这样命名就更字面：`onReplace` 只表示真正的替换；更宽泛的“旧值退出 slot”语义则交给 `onUnset`，它也会在 `removeComponent(...)` 和 `despawn(...)` 之前运行。

## 定义方式

生命周期 hook 是传给 `defineComponent(...)` 的 component 元数据的一部分。

```ts
const Health = registry.defineComponent<{ value: number }>("Health", {
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
```

运行示例：

```sh
npm run example:lifecycle
```
