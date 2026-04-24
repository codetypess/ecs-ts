# ecs-ts

`ecs-ts` 是一个偏重运行时语义清晰、结构修改可预测、同时保留足够易用性的 TypeScript ECS。

它想解决的问题不是“把所有能力都塞进一个巨大框架里”，而是给你一个足够扎实的 ECS runtime：组件存储和查询有合理性能，world 的结构修改时机明确，常见业务代码写起来也不会太别扭。

English README: [README-en.md](README-en.md).

## 这个项目想做什么

它不是引擎，不是编辑器，也不是一份堆满类型技巧的 API 展示。

它更像一个有明确边界的 runtime core：

- Schema 是显式的。Component、resource、state、message 和 event 都归属于一个 registry。
- World 修改是显式的。`spawn`、`addComponent`、`removeComponent`、`despawn`、`Commands` 和 `world.batch(...)` 都有明确语义。
- 运行时不变量是认真的。跨 registry 误用会立刻失败，component 依赖可以被强约束，非法 batch 结果不会对外可见。
- 易用性也要保留。常见 query、change detection、scheduler 和 lifecycle 场景不该写得很累。

## API 背后的设计

这个项目更想先讲清楚“这些方法背后的模型是什么”，而不只是把方法名平铺出来。

这里的核心取向有几条：

- `Registry` 负责 schema。你先定义世界里有哪些类型，再创建绑定这个 schema 的 `World`。
- `World` 是运行时边界。查询、调度、资源、状态、事件和结构修改都围绕它展开。
- Component payload 就是普通对象。语义直观，也更方便序列化和调试。
- 结构安全是可选但真实存在的。组件一旦声明 `deps`，运行时就把它当成硬约束。

这最后一点尤其重要。  
如果 `Element` 依赖 `Transform`，那么只要一个 entity 上的 `Element` 已经对外可见，`Transform` 就一定存在。也就是说，`deps` 不只是用来报错，它还建立了一个可以放心依赖的运行时不变量，因此你可以安全地写 `mustGetComponent(...)`。

## 快速示例

```ts
import { World, createRegistry, withComponent, withMarker } from "@codetypess/ecs-ts";

const registry = createRegistry("ui");

const Transform = registry.defineComponent<{ x: number; y: number }>("Transform");
const Element = registry.defineComponent<{ name: string }>("Element", {
    deps: [Transform],
});
const Selected = registry.defineComponent("Selected");

const world = new World(registry);

const entity = world.spawn(
    withComponent(Element, { name: "button" }),
    withComponent(Transform, { x: 40, y: 80 }),
    withMarker(Selected)
);

world.each([Transform], { with: [Element] }, (_entity, transform) => {
    transform.x += 10;
});

if (world.hasComponent(entity, Element)) {
    // 因为 Element 声明了对 Transform 的硬依赖，所以这里可以放心 mustGet。
    const transform = world.mustGetComponent(entity, Transform);
    console.log(transform.x, transform.y);
}
```

## 核心能力

- 基于 SparseSet 的 component 存储，dense iteration，swap-remove 删除。
- `with`、`without`、`or`、`added`、`changed` 等 query 过滤。
- Optional query，以及 `hasAll`、`hasAny`、`single`、`trySingle` 这些常用 helper。
- `QueryState`，用于缓存重复 query 的解析结果。
- Per-system 语义的 component/resource change detection。
- Removed reader 和显式 `drainRemoved`。
- 通过 `Commands` 做延迟结构修改。
- Component lifecycle hooks：`onAdd`、`onInsert`、`onReplace`、`onRemove`、`onDespawn`。
- 通过 `deps` 表达硬依赖。
- 通过 `world.batch(...)` 做 deferred structural validation。
- Scheduler：stage、label、system set、排序、fixed update、可组合 `runIf`。
- State machine、message、observer-style immediate event。

## 包导出边界

- 对外支持的入口只有包根：`import { ... } from "@codetypess/ecs-ts"`。
- `dist/internal/*` 会作为运行时实现细节一起打包，但它们不是公开 API，也不承诺 semver 稳定。
- 如果你要写应用代码、示例代码或第三方封装，应该只依赖根导出。

## 结构修改语义

- `Commands` 是 deferred queue。命令会在 `flush()` 或 system/observer 结束后统一执行。
- `world.batch(...)` 会先验证最终结构状态，再一次性提交净变化；它更接近一次 transactional commit。
- `commands.spawn(...)` 在 flush 前只返回一个保留的 entity handle，不会立刻变成 live entity。
- `world.shutdown()` 是终态。shutdown 后再次 `update()` 不会继续跑 startup 或 update。

## 推荐的阅读顺序

如果你是第一次看这个项目，建议把它当成“几个工作流”来理解，而不是一口气扫完整个 API 表面：

- [Queries](docs/zh/queries.md)：query、filter、optional component 和 `QueryState`。
- [Scheduler](docs/zh/scheduler.md)：system 什么时候跑、怎么排序、怎么组合条件。
- [Change Detection](docs/zh/change-detection.md)：`added`、`changed`、removed readers 和 message 的行为。
- [结构修改](docs/zh/structural-writes.md)：直接写 world、`Commands`、`world.batch(...)` 和 `deps` 的区别。

如果你更想先看代码而不是说明，examples 是更好的入口：

```sh
npm run examples:check
npm run example:commands
npm run example:batch
npm run example:deps
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

## 开发与验证

```sh
npm test
npm run examples:check
npm run benchmark:smoke
npm run benchmark
npm run benchmark:json
npm run benchmark:compare -- --baseline /tmp/ecs-baseline.json --current /tmp/ecs-current.json
npm run benchmark:paired -- --baseline-dir /tmp/ecs-baseline --current-dir . --rounds 6 -- --profile smoke
npm run build
npm run package:smoke
npm run release:check
```

测试通过 `tsx` 使用 Node 内置的 `node:test` runner。benchmark 同时提供更快的 smoke profile、适合同机对比的完整 profile，以及用 ABBA/交替顺序减小版本顺序偏差的 paired compare。

如果你正在准备对外发布，可以参考 [发布说明](docs/zh/releasing.md)。

## 当前状态

这个项目已经有一套比较明确的设计方向，但仍然是一个持续打磨中的小型 ECS runtime。API 基本方向已经比较清楚，不过在文档、ergonomics 和部分内部性能权衡上，仍然会继续调整。
