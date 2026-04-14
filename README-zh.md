# ecs-ts

一个基于前面设计讨论实现的小型 TypeScript ECS 原型。

English README: [README.md](README.md).

- Entity 是数字形式的 `index + generation` 句柄，因此旧实体 ID 不会误命中新复用的实体。
- Component 通过 `defineComponent<T>()` 注册；marker component 默认使用 `{}` payload，并可通过 `withMarker(...)` 添加；component value 不能包含 `null` 或 `undefined`。
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
- `App` 和 `Plugin` 在 `World` 之上提供了轻量的模块化注册层。
- Component 支持 lifecycle hooks：`onAdd`、`onInsert`、`onReplace`、`onRemove` 和 `onDespawn`。
- System 是带生命周期方法的 object/class，例如 `onPreStartup`、`onStartup`、`onPostStartup`、`onFixedUpdate`、`onUpdate`、`onPostUpdate` 和 `onShutdown`。
- System 支持 label、system set、按 stage 配置 set、`before`/`after` 排序、可组合的 `runIf` 条件以及 fixed update 阶段。
- State transitions 支持通过 `addStateSystem` 和 `addTransitionSystem` 注册 object/class system。
- Observer 支持通过 `defineEvent`、`observe` 和 `trigger` 触发立即事件。

## 基本用法

```ts
import { World, defineComponent, withComponent, withMarker } from "./src";

const Position = defineComponent<{ x: number; y: number }>("Position");
const Velocity = defineComponent<{ x: number; y: number }>("Velocity");
const Player = defineComponent("Player");
const Sleeping = defineComponent("Sleeping");

const world = new World();
const entity = world.spawn(
    withComponent(Position, { x: 0, y: 0 }),
    withComponent(Velocity, { x: 1, y: 0 }),
    withMarker(Player)
);

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

## 指南

- [Queries](docs/queries.md)：filters、optional components、single-entity helpers 和 `QueryState`。
- [Scheduler](docs/scheduler.md)：生命周期阶段、labels、system sets、排序、fixed update 和 `runIf`。
- [Change Detection](docs/change-detection.md)：component/resource added 和 changed 检测、removed readers 以及 messages。

## 示例

```sh
npm run example:bundle
npm run example:lifecycle
npm run example:scheduler
npm run example:scheduler-showcase
npm run example:query
npm run example:query-advanced
npm run example:query-ergonomics
npm run example:query-state
npm run example:changes
npm run example:per-system-changes
npm run example:messages
npm run example:removed
npm run example:resources
npm run example:required
npm run example:state
npm run example:observer
npm run example:net-entity-map
npm run example:ui
```

## 测试和 Benchmark

```sh
npm test
npm run benchmark
npm run benchmark:json
```

测试通过 `tsx` 使用 Node 内置的 `node:test` runner。Benchmark 是带多轮采样的轻量微基准，覆盖 spawn、按 entity 直接取组件、query 迭代、query state、filtered query、optional query、buffered messages、immediate observers 以及 scheduler `runIf` 开销。需要机器可读输出时可以用 `npm run benchmark:json`，然后重定向到对比工具或基线文件。

## 后续可做

- Scheduler 增强：增加更直接的 scheduler 单元测试和更丰富的诊断信息。
- App / Plugin：增加 plugin 依赖、plugin 排序以及更丰富的 app 生命周期钩子。
- 测试和 benchmark：继续扩展边界场景覆盖，并增加更稳定的 benchmark 基线。
- 存储策略扩展：当前是 SparseSet；后续可以探索 Archetype/Table 存储或混合存储，用于优化多组件 query。
