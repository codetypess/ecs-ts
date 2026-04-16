# TODO

## Recently Addressed

- [x] Refresh cached `QueryState` / `OptionalQueryState` base-store selection when component store sizes drift so repeated queries keep scanning the current smallest candidate store.
- [x] Optimize `RemovedReader.read()` so empty reads jump directly to the unread tail instead of rescanning the full buffered removal history.
- [x] Compact `RemovedComponents` history to the minimum live `RemovedReader` cursor so long-running removed streams stop retaining fully-consumed prefixes.

## Open Performance And Design Follow-Ups

- [ ] Make `despawn()` scale with the components actually attached to an entity instead of scanning every registered component store.
- [ ] Reduce query hot-path lookup overhead by trimming repeated membership/value lookups and considering an array-backed component-store registry for numeric component ids.
