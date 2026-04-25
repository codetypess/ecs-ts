# Change Detection

English: [Change Detection](../change-detection.md).

变更检测会使用活跃 system 的上次运行 tick 和 world 的当前 change tick。这样每个 system 都能观察到自上次运行以来发生的变更。

## Component

使用 `eachAdded(...)` 和 `eachChanged(...)` 运行受变更状态约束的 component query。在原地修改 component 值之后，使用 `markComponentChanged(...)` 标记变更。

```ts
world.eachChanged([Position], (entity, position) => {
    console.log(entity, position);
});

const position = world.mustGetComponent(entity, Position);
position.x += 1;
world.markComponentChanged(entity, Position);
```

运行 component 示例：

```sh
npm run example:changes
npm run example:per-system-changes
```

## Removed Component

Removed component 记录同时支持直接 drain 和独立 reader：

```ts
const removed = world.drainRemoved(Position);
const reader = world.removedReader(Position);
const records = reader.read();
```

当多个 system 需要查看同一个 removal stream，并且不能互相消费记录时，使用 `RemovedReader`。当不再需要它时，调用 `reader.close()`，这样已经完全消费的历史可以更快压缩掉。
`reader.read()` 每次都会复用同一个输出数组，所以不要在多次读取之间长期持有上一次返回值的引用。

```sh
npm run example:removed
```

## Resource

Resource 支持 added/changed 检测，也支持显式调用 `markResourceChanged(...)`。

```ts
if (world.isResourceChanged(Settings)) {
    reloadSettings(world.resource(Settings));
}
```

```sh
npm run example:resources
```

## Message

Message 是短生命周期、多 reader 的事件队列。Writer 可以直接调用 `writeMessage(...)`，也可以通过 `Commands` 排队写入。Reader 会维护独立 cursor。
`reader.read()` 每次都会复用同一个输出数组，所以不要在多次读取之间长期持有上一次返回值的引用。

```ts
const damageReader = world.messageReader(Damage);

for (const damage of damageReader.read()) {
    applyDamage(damage);
}
```

```sh
npm run example:messages
```
