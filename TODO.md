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
