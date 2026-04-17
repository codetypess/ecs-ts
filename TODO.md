# TODO

## Recently Addressed

- [x] Compile query execution strategies during `query-plan` resolution so iterator / each / optional paths reuse preselected executors instead of re-branching on arity every run.
- [x] Move the component-store registry to array indexing for registry-local numeric component ids instead of `Map<number, SparseSet>`.
- [x] Refresh cached `QueryState` / `OptionalQueryState` base-store selection when component store sizes drift so repeated queries keep scanning the current smallest candidate store.
- [x] Optimize `RemovedReader.read()` so empty reads jump directly to the unread tail instead of rescanning the full buffered removal history.
- [x] Compact `RemovedComponents` history to the minimum live `RemovedReader` cursor so long-running removed streams stop retaining fully-consumed prefixes.
- [x] Reduce query hot-path lookup overhead by reusing base-store membership/value information inside query execution and filter checks.
- [x] Batch physical `RemovedComponents` prefix compaction while keeping fully consumed history logically hidden from `drainRemoved()`.

## Open Performance And Design Follow-Ups

- [ ] Rework `despawn()` around an entity-to-component reverse index so it scales with the components actually attached to an entity instead of scanning every registered component store.
- [ ] 减少 World 和 component-ops 之间的重复读取逻辑：has/get/getMany/hasAll/hasAny/isAdded/isChanged 在 src/world.ts 和 src/internal/component-ops.ts
      里有两套近似实现。这里不建议直接把 World.has/get 去重掉，因为文件里已经明确写了这些热路径内联是 benchmark 驱动的；但可以把非热路径共用部分抽成小
      helper，避免两边逻辑逐渐漂移。
- [ ] 压缩 App 的代理层：src/app.ts 大部分代码只是转发到 world。如果目标是简化实现，App 可以只保留 plugin 安装和生命周期入口，其他高级 API 直接让调用方走
      app.world。这样能少维护一套几乎等价的表面 API。
- [ ] 命令队列改成结构化命令，而不是 closure 队列：src/commands.ts 每个命令都会生成一个闭包，runSystemWithCommands() 还会为每次系统执行新建
      Commands。如果命令量大，这里会有额外分配和 GC 压力。可以先用 benchmark 验证，再考虑改成 {kind, payload} 的紧凑命令缓冲区。
- [ ] 把 scheduler 再按职责拆一下：src/scheduler.ts 里既有 stage 定义，也有 set 配置、排序、拓扑检测；src/internal/schedule-engine.ts
      才是运行时。把“声明/类型”和“排序/依赖解析”再拆开，scheduler 这块会明显更好读，也更容易单测。

如果只按收益/风险比排优先级：先做 `despawn()` 反向索引 + 查询执行器“计划编译/执行复用”，再做 App / scheduler 的职责压缩，最后再用 benchmark 决定命令队列是否值得结构化。
