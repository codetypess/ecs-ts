# TODO

## Recently Addressed

- [x] Refresh cached `QueryState` / `OptionalQueryState` base-store selection when component store sizes drift so repeated queries keep scanning the current smallest candidate store.
- [x] Optimize `RemovedReader.read()` so empty reads jump directly to the unread tail instead of rescanning the full buffered removal history.
- [x] Compact `RemovedComponents` history to the minimum live `RemovedReader` cursor so long-running removed streams stop retaining fully-consumed prefixes.
- [x] Reduce query hot-path lookup overhead by reusing base-store membership/value information inside query execution and filter checks.
- [x] Batch physical `RemovedComponents` prefix compaction while keeping fully consumed history logically hidden from `drainRemoved()`.

## Open Performance And Design Follow-Ups

- [ ] Rework `despawn()` around an entity-to-component reverse index so it scales with the components actually attached to an entity instead of scanning every registered component store.
- [ ] Consider an array-backed component-store registry for numeric component ids after the current query hot-path cleanup is settled.

1. 拆分 World 这个“总入口类”：src/world.ts 同时管理 entity、component、query、scheduler、state、message、event、resource。建议内部至少拆成
   world-query、world-schedule、world-state、world-messaging 这几块，World 只保留门面 API。这样读代码和补测试都会轻很多。
2. 优先优化 despawn() 的复杂度：src/internal/component-ops.ts 里的 despawn() 现在是遍历所有 component store，再判断当前 entity
   是否有这个组件；组件类型一多就会退化成 O(全局组件类型数)。这里最值得加一个 entity -> component ids 的反向索引，改成只遍历实体实际挂载的组件。TODO.md
   里也已经把这件事列成性能 follow-up 了。
3. 把查询执行器改成“计划编译 + 执行复用”：src/internal/query-executor.ts 里 iterateResolvedQuery / eachResolvedQuery / optional
   这几套逻辑为了热路径性能复制了很多分支，尤其 1/2/3 组件的快路径。建议在 src/internal/query-plan.ts 解析 plan
   时，顺手生成对应的执行策略，后面直接复用；这样既能保住性能，也能显著降低实现重复。
4. 减少 World 和 component-ops 之间的重复读取逻辑：has/get/getMany/hasAll/hasAny/isAdded/isChanged 在 src/world.ts 和 src/internal/component-ops.ts
   里有两套近似实现。这里不建议直接把 World.has/get 去重掉，因为文件里已经明确写了这些热路径内联是 benchmark 驱动的；但可以把非热路径共用部分抽成小
   helper，避免两边逻辑逐渐漂移。
5. 把 component store 注册从 Map 评估成数组索引：src/internal/component-store.ts 里 store 用 Map<number, SparseSet>，但 component id
   本身是连续递增数字。查询和读组件是热点路径时，数组访问通常比 Map.get() 更便宜；这也是 TODO.md 里已经点到的方向，值得在 benchmark 下验证。
6. 压缩 App 的代理层：src/app.ts 大部分代码只是转发到 world。如果目标是简化实现，App 可以只保留 plugin 安装和生命周期入口，其他高级 API 直接让调用方走
   app.world。这样能少维护一套几乎等价的表面 API。
7. 命令队列改成结构化命令，而不是 closure 队列：src/commands.ts 每个命令都会生成一个闭包，runSystemWithCommands() 还会为每次系统执行新建
   Commands。如果命令量大，这里会有额外分配和 GC 压力。可以先用 benchmark 验证，再考虑改成 {kind, payload} 的紧凑命令缓冲区。
8. 把 scheduler 再按职责拆一下：src/scheduler.ts 里既有 stage 定义，也有 set 配置、排序、拓扑检测；src/internal/schedule-engine.ts
   才是运行时。把“声明/类型”和“排序/依赖解析”再拆开，scheduler 这块会明显更好读，也更容易单测。

如果只按收益/风险比排优先级：先做 2 + 1 + 3，然后做 6 + 8，最后再用 benchmark 决定 5 + 7。这套顺序基本能同时覆盖结构优化、可读性、实现简化和真实性能提升。
