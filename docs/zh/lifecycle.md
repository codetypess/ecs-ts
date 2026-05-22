# 组件生命周期

English: [Component Lifecycle](../lifecycle.md).

component lifecycle hook 是可选的，而且是按操作路径触发的。一次 component 修改不会把所有阶段全部执行一遍，运行时会根据最终提交的操作选择对应阶段。

## 对照表

| 操作               | 触发顺序                               | 不会触发的阶段                                  |
| ------------------ | -------------------------------------- | ----------------------------------------------- |
| 首次添加           | `onAdd` -> `onInsert`                  | `onUnset`、`onReplace`、`onRemove`、`onDespawn` |
| 覆盖已有值         | `onUnset` -> `onReplace` -> `onInsert` | `onAdd`、`onRemove`、`onDespawn`                |
| 删除单个 component | `onUnset` -> `onRemove`                | `onAdd`、`onInsert`、`onReplace`、`onDespawn`   |
| despawn entity     | `onUnset` -> `onRemove` -> `onDespawn` | `onAdd`、`onInsert`、`onReplace`                |

无论修改来自直接 `World` 写入、`Commands`，还是 `world.batch(...)` 最终提交的净变化，触发规则都是这一套。

## 怎么理解这几个阶段

- `onAdd`：component 第一次对该 entity 可见。
- `onInsert`：component slot 被写入了一个值，不管这个 slot 之前是空的还是已有旧值。
- `onUnset`：之前那个可见值即将不再是当前 slot 的值。
- `onReplace`：之前那个可见值正在被另一个新值替换，并且会同时拿到 `previous` 和 `next`。
- `onRemove`：这个 component 正在从 entity 上被摘掉。
- `onDespawn`：这个 component 是因为整个 entity 被销毁而一起移除。

这样命名就更字面：`onReplace` 只表示真正的替换；更宽泛的“旧值退出 slot”语义则交给 `onUnset`，它也会在 `removeComponent(...)` 和 `despawn(...)` 之前运行。

## 定义与注册方式

生命周期 hook 可以来自两处：

- `defineComponent(...)` 里的 component 元数据
- `World` 上的运行时注册方法，比如 `world.onAddComponent(...)` 或 `world.onUnsetComponent(...)`

内置的 component lifecycle 回调会先执行，然后才是运行时注册的 hook。

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

运行示例：

```sh
npm run example:lifecycle
```
