# TODO

## Recently Addressed

- [x] Rework `despawn()` around an entity-to-component reverse index so it scales with the components actually attached to an entity instead of scanning every registered component store.
- [x] Add benchmarks for noisy-store `despawn()` and batched `Commands.flush()` so structural performance changes have direct coverage.
- [x] Partially dedupe non-hot component read helpers between `World` and `component-ops` while keeping `World.has/get` inlined for benchmark-sensitive paths.
- [x] Compile query execution strategies during `query-plan` resolution so iterator / each / optional paths reuse preselected executors instead of re-branching on arity every run.
- [x] Move the component-store registry to array indexing for registry-local numeric component ids instead of `Map<number, SparseSet>`.
- [x] Refresh cached `QueryState` / `OptionalQueryState` base-store selection when component store sizes drift so repeated queries keep scanning the current smallest candidate store.
- [x] Optimize `RemovedReader.read()` so empty reads jump directly to the unread tail instead of rescanning the full buffered removal history.
- [x] Compact `RemovedComponents` history to the minimum live `RemovedReader` cursor so long-running removed streams stop retaining fully-consumed prefixes.
- [x] Reduce query hot-path lookup overhead by reusing base-store membership/value information inside query execution and filter checks.
- [x] Batch physical `RemovedComponents` prefix compaction while keeping fully consumed history logically hidden from `drainRemoved()`.

## Open Performance And Design Follow-Ups

- [ ] 命令队列改成结构化命令，而不是 closure 队列：src/commands.ts 每个命令都会生成一个闭包，runSystemWithCommands() 还会为每次系统执行新建
      Commands。这次已经补了 benchmark，但暂时还没有拿到足够确定的收益证据，因此先保留现状，后续再评估 {kind, payload} 的紧凑命令缓冲区是否值得。
- [ ] 把 scheduler 再按职责拆一下：src/scheduler.ts 里既有 stage 定义，也有 set 配置、排序、拓扑检测；src/internal/schedule-engine.ts
      才是运行时。把“声明/类型”和“排序/依赖解析”再拆开，scheduler 这块会明显更好读，也更容易单测。

如果只按收益/风险比排优先级：先做 scheduler 的职责压缩，最后继续用 benchmark 决定命令队列是否值得结构化。
