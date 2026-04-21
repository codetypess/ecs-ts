# ecs-ts

一个基于前面设计讨论实现的小型 TypeScript ECS 原型。

English README: [README.md](README.md).

- Entity 是数字形式的 `index + generation` 句柄，因此旧实体 ID 不会误命中新复用的实体；entity 也可以携带数字 `etype`，默认值为 `0`。
- Component、resource、state、message 和 event 都通过 `createRegistry(...)` 创建的 registry 注册；marker component 默认使用 `{}` payload，并可通过 `withMarker(...)` 添加；component value 必须是非空 object。
- 每个 `World` 都绑定到单一 registry，误用其它 registry 的类型会立刻抛错。
- Component 存储使用 `SparseSet`：`get/has/add/remove` 接近 O(1)，迭代走 dense 数组，删除使用 swap-remove。
- Query 会选择最小的组件存储作为基础循环，再按 entity 检查其它组件存储。
- Query 支持 `with`、`without`、`or`、`added` 和 `changed` 过滤。
- Optional query 可以为匹配到的 entity 返回可能不存在的组件，此时组件值是 `undefined`。
- Query 易用 API 包括 `hasAll`、`hasAny`、`single` 和 `trySingle`。
- `QueryState` 会缓存 query 的 store 解析结果，适合 system 反复运行同一个 query。
- Change detection 是 per-system 语义，并支持 `eachAdded`、`eachChanged`、`markChanged` 和 `drainRemoved`。
- Messages 通过 `registry.defineMessage`、`writeMessage` 和 `MessageReader` 提供短生命周期、多 reader 的事件队列。
- Removed component 记录同时支持显式 `drainRemoved` 和多 reader 的 `RemovedReader`。
- Resource 支持 per-system 的 added/changed 检测。
- System 可以使用 `Commands` 做延迟结构修改。
- Component 支持 lifecycle hooks：`onAdd`、`onInsert`、`onReplace`、`onRemove` 和 `onDespawn`。
- System 是带生命周期方法的 object/class，例如 `onPreStartup`、`onStartup`、`onPostStartup`、`onFixedUpdate`、`onUpdate`、`onPostUpdate` 和 `onShutdown`。
- System 支持 label、system set、按 stage 配置 set、`before`/`after` 排序、可组合的 `runIf` 条件以及 fixed update 阶段。
- State transitions 支持通过 `addStateSystem` 和 `addTransitionSystem` 注册 object/class system。
- Observer 支持通过 `registry.defineEvent`、`observe` 和 `trigger` 触发立即事件。

## 基本用法

```ts
import { World, createRegistry, withComponent, withMarker } from "./src";

const registry = createRegistry("game");
const Position = registry.defineComponent<{ x: number; y: number }>("Position");
const Velocity = registry.defineComponent<{ x: number; y: number }>("Velocity");
const Player = registry.defineComponent("Player");
const Sleeping = registry.defineComponent("Sleeping");

const world = new World(registry);
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

const position = world.getComponent(entity, Position);
console.log(position);
```

## 指南

- [Queries](docs/zh/queries.md)：filters、optional components、single-entity helpers 和 `QueryState`。
- [Scheduler](docs/zh/scheduler.md)：生命周期阶段、labels、system sets、排序、fixed update 和 `runIf`。
- [Change Detection](docs/zh/change-detection.md)：component/resource added 和 changed 检测、removed readers 以及 messages。

## 示例

```sh
npm run examples:check
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
npm run example:state
npm run example:observer
npm run example:net-entity-map
npm run example:ui
```

## 测试和 Benchmark

```sh
npm test
npm run examples:check
npm run benchmark:smoke
npm run benchmark
npm run benchmark:json
npm run benchmark:compare -- --baseline /tmp/ecs-baseline.json --current /tmp/ecs-current.json
```

测试通过 `tsx` 使用 Node 内置的 `node:test` runner。`npm run examples:check` 会对所有 example 入口做 smoke test。`npm run benchmark:smoke` 使用适合 CI 的精简 benchmark 配置，而 `npm run benchmark` 保留完整的多轮采样负载。需要机器可读输出时可以用 `npm --silent run benchmark:json > /tmp/ecs-baseline.json`，然后用 `npm run benchmark:compare -- --baseline <baseline.json> --current <current.json> --threshold 15%` 对比同一台机器上的报告。

## 后续可做

- Scheduler 增强：增加更直接的 scheduler 单元测试和更丰富的诊断信息。
- 测试和 benchmark：继续扩展边界场景覆盖，并增加更稳定的 benchmark 基线。
- 存储策略扩展：当前是 SparseSet；后续可以探索 Archetype/Table 存储或混合存储，用于优化多组件 query。
