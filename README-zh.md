# ecs-ts

一个基于前面设计讨论实现的小型 TypeScript ECS 原型。

English README: [README.md](README.md).

- Entity 是数字形式的 `index + generation` 句柄，因此旧实体 ID 不会误命中新复用的实体。
- Component 通过 `defineComponent<T>()` 注册。
- Bundle 用来把多个 component entry 组合起来，供 spawn、insert、remove 调用复用。
- Component 存储使用 `SparseSet`：`get/has/add/remove` 接近 O(1)，迭代走 dense 数组，删除使用 swap-remove。
- Query 会选择最小的组件存储作为基础循环，再按 entity 检查其它组件存储。
- Query 支持 `with` 和 `without` 过滤。
- Change detection 是 per-system 语义，并支持 `eachAdded`、`eachChanged`、`markChanged` 和 `drainRemoved`。
- Messages 通过 `defineMessage`、`writeMessage` 和 `MessageReader` 提供短生命周期、多 reader 的事件队列。
- Removed component 记录同时支持显式 `drainRemoved` 和多 reader 的 `RemovedReader`。
- Component 可以声明 required components，在组件缺失时自动插入依赖组件。
- Resource 支持 per-system 的 added/changed 检测。
- System 可以使用 `Commands` 做延迟结构修改。
- Component 支持 lifecycle hooks：`onAdd`、`onInsert`、`onReplace`、`onRemove` 和 `onDespawn`。
- System 是带生命周期方法的 object/class，例如 `onPreStartup`、`onStartup`、`onPostStartup`、`onUpdate`、`onPostUpdate` 和 `onShutdown`。
- State transitions 支持通过 `addStateSystem` 和 `addTransitionSystem` 注册 object/class system。

## 基本用法

```ts
import { World, defineComponent } from "./src";

const Position = defineComponent<{ x: number; y: number }>("Position");
const Velocity = defineComponent<{ x: number; y: number }>("Velocity");
const Player = defineComponent<null>("Player");
const Sleeping = defineComponent<null>("Sleeping");

const world = new World();
const entity = world.spawn();

world.add(entity, Position, { x: 0, y: 0 });
world.add(entity, Velocity, { x: 1, y: 0 });
world.add(entity, Player, null);

world.each([Position, Velocity], (_entity, position, velocity) => {
    position.x += velocity.x;
    position.y += velocity.y;
});

world.eachWhere(
    [Position, Velocity],
    { with: [Player], without: [Sleeping] },
    (_entity, position, velocity) => {
        position.x += velocity.x;
        position.y += velocity.y;
    }
);

const position = world.get(entity, Position);
console.log(position);
```

## Bundle 演示

```sh
npm run example:bundle
```

这个示例展示 `bundle(...)`、`spawnBundle(...)` 和 `removeBundle(...)`。Bundle 不是组件，它只是可复用的一组 component entries。

## UI 生命周期示例

```sh
npm run example:ui
```

这个脚本通过 `tsx` 直接运行 TypeScript 示例。UI 示例展示了异步 loader 如何把完成结果写入运行时队列，然后在下一次 update 中提交回 ECS。`UiLoading` 会在移除时中止未完成任务，`UiInstance` 会在 entity despawn 时销毁真实 UI handle。

## 生命周期演示

```sh
npm run example:lifecycle
```

这个示例会打印 component hook 顺序（`onAdd`、`onInsert`、`onReplace`、`onRemove`、`onDespawn`）以及 class-based system 生命周期方法（`onPreStartup`、`onStartup`、`onPostStartup`、`onUpdate`、`onPostUpdate`、`onShutdown`）。

## 变更检测演示

```sh
npm run example:changes
```

这个示例展示 `eachAdded`、手动 `markChanged` 和 `drainRemoved`。

## Per-System 变更检测演示

```sh
npm run example:per-system-changes
```

这个示例展示 state system 通过自己的 last-run change tick，看到在该 system 运行前已经发生的 component change。

## Message 演示

```sh
npm run example:messages
```

这个示例展示类似 Bevy 的 buffered message 流程：一个系统通过 `Commands` 写入 `Damage` messages，另一个系统持有 `MessageReader` cursor 并只读取自己还没见过的消息。

## Removed Reader 演示

```sh
npm run example:removed
```

这个示例展示多个系统如何通过独立的 `RemovedReader` cursor 读取同一批 removed component 记录。

## Required Components 演示

```sh
npm run example:required
```

这个示例展示 required component 插入：添加 `RigidBody` 时会自动插入缺失的 `Mass`、`Velocity` 以及传递依赖 `Transform`，但不会覆盖已经存在的组件。

## Resource 变更检测演示

```sh
npm run example:resources
```

这个示例展示 `isResourceAdded`、`isResourceChanged`、`markResourceChanged` 和 resource 替换。

## State 演示

```sh
npm run example:state
```

这个示例展示通过 `addStateSystem(...)` 注册 state-specific class systems，以及通过 `addTransitionSystem(...)` 注册 transition class systems。

## Query Filter 演示

```sh
npm run example:query
```

这个示例展示 `eachWhere([Position, Velocity], { with: [Player], without: [Sleeping] }, ...)`。

## 后续可做

- Query API 增强：增加 `single`、`trySingle`、`hasAll`、`hasAny`、更复杂的 `or/none/optional` 查询能力。
- Scheduler 增强：增加 system label、`before/after` 排序、`runIf`、system set、fixed update。
- Observer / immediate event：在 `Messages` 之外增加立即触发型事件，用于 UI 冒泡、点击事件或 entity-local 事件。
- App / Plugin：在 `World` 之上增加 `App` 和 `Plugin`，让系统、资源、消息、状态注册更模块化。
- 测试和 benchmark：把现有 examples 中的语义沉淀成自动化测试，并加入 SparseSet/query/message 的性能基准。
- 存储策略扩展：当前是 SparseSet；后续可以探索 Archetype/Table 存储或混合存储，用于优化多组件 query。
