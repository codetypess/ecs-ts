# ecs-ts

A small TypeScript ECS prototype based on the design discussion:

中文说明见 [README-zh.md](README-zh.md).

- Entities are numeric `index + generation` handles, so stale entity IDs do not accidentally hit recycled entities; entities can also carry a numeric `etype` that defaults to `0`.
- Components, resources, states, messages, and events are owned by a `createRegistry(...)` registry; marker components default to `{}` payloads and can use `withMarker(...)`, and component values must be non-null objects.
- Each `World` is bound to one registry, and using types from a different registry throws immediately.
- Component storage uses `SparseSet`: O(1)-ish `get/has/add/remove`, dense iteration, and swap-remove deletion.
- Queries choose the smallest component store as the base loop, then check other component stores by entity.
- Queries can filter with `with`, `without`, `or`, `added`, and `changed`.
- Optional queries can return `undefined` for components that may or may not exist on a matched entity.
- Query ergonomics include `hasAll`, `hasAny`, `single`, and `trySingle`.
- `QueryState` caches query store resolution for systems that run the same query repeatedly.
- Change detection is per-system and supports `eachAdded`, `eachChanged`, `markChanged`, and `drainRemoved`.
- Messages provide short-lived, multi-reader event queues through `registry.defineMessage`, `writeMessage`, and `MessageReader`.
- Removed component records support both explicit `drainRemoved` and multi-reader `RemovedReader`.
- Resources support per-system added/changed detection.
- Systems can use `Commands` for deferred structural edits.
- Components support lifecycle hooks: `onAdd`, `onInsert`, `onReplace`, `onRemove`, and `onDespawn`.
- Systems are lifecycle objects/classes with methods such as `onPreStartup`, `onStartup`, `onPostStartup`, `onFixedUpdate`, `onUpdate`, `onPostUpdate`, and `onShutdown`.
- Systems can use labels, system sets, stage-specific set config, `before`/`after` ordering, composable `runIf` predicates, and a fixed update stage.
- State transitions support object/class systems through `addStateSystem` and `addTransitionSystem`.
- Observers support immediate events through `registry.defineEvent`, `observe`, and `trigger`.

## Basic Usage

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

## Guides

- [Queries](docs/queries.md): filters, optional components, single-entity helpers, and `QueryState`.
- [Scheduler](docs/scheduler.md): lifecycle stages, labels, system sets, ordering, fixed update, and `runIf`.
- [Change Detection](docs/change-detection.md): component/resource added and changed checks, removed readers, and messages.

## Examples

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

## Tests And Benchmarks

```sh
npm test
npm run examples:check
npm run benchmark:smoke
npm run benchmark
npm run benchmark:json
npm run benchmark:compare -- --baseline /tmp/ecs-baseline.json --current /tmp/ecs-current.json
```

Tests use Node's built-in `node:test` runner through `tsx`. `npm run examples:check` smoke-tests every example entrypoint. `npm run benchmark:smoke` runs a reduced benchmark profile suitable for CI, while `npm run benchmark` keeps the full multi-sample workload. Use `npm --silent run benchmark:json > /tmp/ecs-baseline.json` for machine-readable output, then compare same-machine reports with `npm run benchmark:compare -- --baseline <baseline.json> --current <current.json> --threshold 15%`.

## Future Work

- Scheduler improvements: add more direct scheduler unit tests and richer diagnostics.
- Tests and benchmarks: expand coverage for edge cases and add more stable benchmark baselines.
- Storage strategy experiments: keep SparseSet as the current baseline, then explore Archetype/Table or hybrid storage for faster multi-component queries.
