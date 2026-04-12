# ecs-ts

一个基于前面设计讨论实现的小型 TypeScript ECS 原型。

English README: [README.md](README.md).

- Entity 是数字形式的 `index + generation` 句柄，因此旧实体 ID 不会误命中新复用的实体。
- Component 通过 `defineComponent<T>()` 注册。
- Bundle 用来把多个 component entry 组合起来，供 spawn、insert、remove 调用复用。
- Component 存储使用 `SparseSet`：`get/has/add/remove` 接近 O(1)，迭代走 dense 数组，删除使用 swap-remove。
- Query 会选择最小的组件存储作为基础循环，再按 entity 检查其它组件存储。
- Query 支持 `with`、`without`、`or`、`none`、`added` 和 `changed` 过滤。
- Optional query 可以为匹配到的 entity 返回可能不存在的组件，此时组件值是 `undefined`。
- Query 易用 API 包括 `hasAll`、`hasAny`、`single` 和 `trySingle`。
- `QueryState` 会缓存 query 的 store 解析结果，适合 system 反复运行同一个 query。
- Change detection 是 per-system 语义，并支持 `eachAdded`、`eachChanged`、`markChanged` 和 `drainRemoved`。
- Messages 通过 `defineMessage`、`writeMessage` 和 `MessageReader` 提供短生命周期、多 reader 的事件队列。
- Removed component 记录同时支持显式 `drainRemoved` 和多 reader 的 `RemovedReader`。
- Component 可以声明 required components，在组件缺失时自动插入依赖组件。
- Resource 支持 per-system 的 added/changed 检测。
- System 可以使用 `Commands` 做延迟结构修改。
- Component 支持 lifecycle hooks：`onAdd`、`onInsert`、`onReplace`、`onRemove` 和 `onDespawn`。
- System 是带生命周期方法的 object/class，例如 `onPreStartup`、`onStartup`、`onPostStartup`、`onFixedUpdate`、`onUpdate`、`onPostUpdate` 和 `onShutdown`。
- System 支持 label、system set、`before`/`after` 排序、`runIf` 条件以及 fixed update 阶段。
- State transitions 支持通过 `addStateSystem` 和 `addTransitionSystem` 注册 object/class system。
- Observer 支持通过 `defineEvent`、`observe` 和 `trigger` 触发立即事件。

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

## Scheduler 演示

```sh
npm run example:scheduler
```

这个示例展示 system label、通过 `configureSet(...)` 配置的 system set、`before`/`after` 排序、`runIf` 以及配合 `setFixedTimeStep(...)` 使用的 `onFixedUpdate`。

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

## Observer 演示

```sh
npm run example:observer
```

这个示例展示通过 `defineEvent`、`world.observe(...)`、`world.trigger(...)` 和 `commands.trigger(...)` 触发立即事件。

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

## 高级 Query Filter 演示

```sh
npm run example:query-advanced
```

这个示例展示 `or`、`none` 以及用于可选组件的 `queryOptional(...)`。

## Query 易用 API 演示

```sh
npm run example:query-ergonomics
```

这个示例展示 `hasAll`、`hasAny`、`single` 和 `trySingle`。

## Query State 演示

```sh
npm run example:query-state
```

这个示例展示把 `queryState(...)` 作为可复用的 system 字段。`QueryState` 和 `optionalQueryState(...)` 会缓存 component/filter store 解析结果，并在新 component store 创建时失效。热路径优先用 `state.each(world, ...)`，避免 iterator row 每行创建数组。

## 测试和 Benchmark

```sh
npm test
npm run benchmark
```

测试通过 `tsx` 使用 Node 内置的 `node:test` runner。Benchmark 是轻量微基准，覆盖 spawn、按 entity 直接取组件、query 迭代、query state、filtered query、optional query、buffered messages 和 immediate observers。

## 后续可做

- Scheduler 增强：增加更丰富的 run condition 组合能力，以及按 stage 配置 set 的能力。
- App / Plugin：在 `World` 之上增加 `App` 和 `Plugin`，让系统、资源、消息、状态注册更模块化。
- 测试和 benchmark：继续扩展边界场景覆盖，并增加更稳定的 benchmark 基线。
- 存储策略扩展：当前是 SparseSet；后续可以探索 Archetype/Table 存储或混合存储，用于优化多组件 query。
