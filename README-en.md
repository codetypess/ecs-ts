# ecs-ts

`ecs-ts` is a small TypeScript ECS focused on explicit runtime behavior, predictable structure changes, and practical ergonomics.

It is built for codebases that want the usual ECS benefits, such as dense iteration and data-oriented composition, without turning the public surface into a wall of type-level machinery.

中文说明见 [README.md](README.md).

## What It Tries To Be

This project is not trying to be a giant engine framework or a maximalist “everything and the kitchen sink” ECS.

It is trying to be a solid runtime core with a clear mental model:

- Schema is explicit. Components, resources, states, messages, and events all belong to a registry.
- World mutations are explicit. `spawn`, `addComponent`, `removeComponent`, `despawn`, `Commands`, and `world.batch(...)` each have clear timing semantics.
- Runtime invariants matter. Cross-registry misuse fails fast. Component dependencies can be enforced. Invalid batch results never become visible.
- Query ergonomics matter too. Common tasks should feel lightweight in application code.

## Why The API Looks This Way

The API is organized around a few decisions:

- `Registry` owns the schema. You define your world shape once, then bind a `World` to that registry.
- `World` is the runtime boundary. Queries, resources, scheduling, state, events, and structural writes all hang off one place.
- Components are plain objects. That keeps payloads obvious and serializable.
- Structural safety is opt-in but real. If a component declares `deps`, the runtime treats them as hard constraints.

That last point is especially important: if `Element` depends on `Transform`, then once `Element` is visible on an entity, `Transform` is guaranteed to exist too. In other words, dependency metadata is not just validation, it establishes a runtime invariant you can rely on with `mustGetComponent(...)`.

## Quick Example

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
    // Safe because Element declares Transform as a hard dependency.
    const transform = world.mustGetComponent(entity, Transform);
    console.log(transform.x, transform.y);
}
```

## Core Capabilities

- Sparse-set component storage with dense iteration and swap-remove deletion.
- Query filters such as `with`, `without`, `or`, `added`, and `changed`.
- Optional queries plus helpers like `hasAll`, `hasAny`, `single`, and `trySingle`.
- `QueryState` for caching repeated query plans.
- Per-system change detection for components and resources.
- Removed-component readers and explicit `drainRemoved`.
- Deferred command queues through `Commands`.
- Lifecycle hooks on components: `onAdd`, `onInsert`, `onReplace`, `onRemove`, and `onDespawn`.
- Hard component dependencies through `deps`.
- Deferred structural validation with `world.batch(...)`.
- Scheduler support for stages, labels, system sets, ordering, fixed update, and composable `runIf`.
- State machines, messages, and immediate observer-style events.

## Package Surface

- The supported public entry point is the package root only: `import { ... } from "@codetypess/ecs-ts"`.
- `dist/internal/*` is bundled because the runtime uses it internally, but those files are implementation details, not public API, and not covered by semver guarantees.
- Application code, examples, and third-party wrappers should depend on root exports only.

## Structural Timing Semantics

- `Commands` is a deferred queue. Work runs on `flush()` or after a system/observer completes.
- `world.batch(...)` validates the final structural state first, then commits the net diff; it is the transactional option.
- `commands.spawn(...)` returns a reserved entity handle and does not publish a live entity before flush.
- `world.shutdown()` is terminal. Calling `update()` afterward will not run startup or update stages again.

## A Better Way To Read The Project

If you open the docs first, the project is easier to understand as a set of workflows rather than as a list of methods:

- [Queries](docs/queries.md): how querying, optional components, filters, and `QueryState` fit together.
- [Scheduler](docs/scheduler.md): how systems are ordered and when they run.
- [Change Detection](docs/change-detection.md): how `added`, `changed`, removed readers, and message flow behave.
- [Structural Writes](docs/structural-writes.md): when to use direct world writes, `Commands`, `world.batch(...)`, and `deps`.

If you want code instead of prose, the examples are the next best entry point:

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

## Development

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

Tests use Node's built-in `node:test` runner through `tsx`. The benchmark scripts support a smoke profile for quick checks, a fuller multi-sample profile for same-machine comparisons, and a paired compare mode that alternates run order to reduce version-order bias.

If you are preparing a public release, see [Releasing](docs/releasing.md).

## Status

This is still a small, evolving ECS runtime. The design is already opinionated, but the project is still a prototype in the sense that ergonomics, docs, and some internal performance tradeoffs are still actively being refined.
