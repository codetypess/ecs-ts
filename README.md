# ecs-ts

A small TypeScript ECS prototype based on the design discussion:

中文说明见 [README-zh.md](README-zh.md).

- Entities are numeric `index + generation` handles, so stale entity IDs do not accidentally hit recycled entities.
- Components are registered with `defineComponent<T>()`; marker components default to `{}` payloads and can use `withMarker(...)`, and component values cannot include `null` or `undefined`.
- Bundles group multiple component entries for spawn/insert/remove calls.
- Component storage uses `SparseSet`: O(1)-ish `get/has/add/remove`, dense iteration, and swap-remove deletion.
- Queries choose the smallest component store as the base loop, then check other component stores by entity.
- Queries can filter with `with`, `without`, `or`, `none`, `added`, and `changed`.
- Optional queries can return `undefined` for components that may or may not exist on a matched entity.
- Query ergonomics include `hasAll`, `hasAny`, `single`, and `trySingle`.
- `QueryState` caches query store resolution for systems that run the same query repeatedly.
- Change detection is per-system and supports `eachAdded`, `eachChanged`, `markChanged`, and `drainRemoved`.
- Messages provide short-lived, multi-reader event queues through `defineMessage`, `writeMessage`, and `MessageReader`.
- Removed component records support both explicit `drainRemoved` and multi-reader `RemovedReader`.
- Components can declare required components that are inserted automatically when missing.
- Resources support per-system added/changed detection.
- Systems can use `Commands` for deferred structural edits.
- `App` and `Plugin` provide a lightweight module layer above `World`.
- Components support lifecycle hooks: `onAdd`, `onInsert`, `onReplace`, `onRemove`, and `onDespawn`.
- Systems are lifecycle objects/classes with methods such as `onPreStartup`, `onStartup`, `onPostStartup`, `onFixedUpdate`, `onUpdate`, `onPostUpdate`, and `onShutdown`.
- Systems can use labels, system sets, stage-specific set config, `before`/`after` ordering, composable `runIf` predicates, and a fixed update stage.
- State transitions support object/class systems through `addStateSystem` and `addTransitionSystem`.
- Observers support immediate events through `defineEvent`, `observe`, and `trigger`.

## Basic Usage

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

## Bundle Demo

```sh
npm run example:bundle
```

This demo shows `bundle(...)`, `spawnBundle(...)`, and `removeBundle(...)`. Bundles are not components; they are just reusable groups of component entries.

## UI Lifecycle Example

```sh
npm run example:ui
```

This script runs the TypeScript example directly through `tsx`. The UI example shows an async loader that writes completion results into a runtime queue, then commits those results back into ECS on the next update. `UiLoading` aborts pending work on removal, and `UiInstance` destroys the real UI handle when the entity is despawned.

## Lifecycle Demo

```sh
npm run example:lifecycle
```

This demo prints component hook order (`onAdd`, `onInsert`, `onReplace`, `onRemove`, `onDespawn`) and class-based system lifecycle methods (`onPreStartup`, `onStartup`, `onPostStartup`, `onUpdate`, `onPostUpdate`, `onShutdown`).

## Scheduler Demo

```sh
npm run example:scheduler
```

This demo shows system labels, system sets through `configureSet(...)` and `configureSetForStage(...)`, `before`/`after` ordering, composable `runIf`, and `onFixedUpdate` with `setFixedTimeStep(...)`.

## Scheduler Showcase

```sh
npm run example:scheduler-showcase
```

This example runs a small multi-frame game loop and prints the full scheduler trace across startup, fixed update, update, last, and shutdown. It combines stage-specific set ordering, composable `runIf`, and query-backed `runIf` in one place.

## Scheduler Configuration

Use `configureSet(...)` for rules that should apply to a set in every stage, and `configureSetForStage(...)` when the same set needs different ordering or conditions in a specific stage.

```ts
world.configureSet("gameplay", {
    before: ["render"],
    runIf: runIfAll(
        stateIs(GameMode, "running"),
        resourceMatches(FeatureFlags, (flags) => flags.enabled)
    ),
});

world.configureSetForStage("startup", "gameplay", {
    after: ["boot"],
});

world.configureSetForStage("fixedUpdate", "gameplay", {
    after: ["physics-prepare"],
});
```

When a system belongs to multiple sets, ordering constraints are merged and all matching `runIf` conditions must pass.

`runIf` can also be driven by cached query state when a system should only run while matching entities exist:

```ts
const activeBodies = queryState([RigidBody, Transform]);

world.addSystem(new PhysicsSystem(), {
    runIf: anyMatch(activeBodies),
});
```

## Change Detection Demo

```sh
npm run example:changes
```

This demo shows `eachAdded`, manual `markChanged`, and `drainRemoved`.

## Per-System Change Detection Demo

```sh
npm run example:per-system-changes
```

This demo shows a state system seeing a component change that happened before that system ran, using its own last-run change tick.

## Message Demo

```sh
npm run example:messages
```

This demo shows a Bevy-style buffered message flow: one system writes `Damage` messages through `Commands`, while another system keeps a `MessageReader` cursor and reads only messages it has not seen yet.

## App / Plugin Example

```sh
npm run example:net-entity-map
```

This example shows modular registration through `App` and `Plugin`, using a local `NetEntityMap` resource to map server IDs to local ECS entities during snapshot sync.

## Observer Demo

```sh
npm run example:observer
```

This demo shows immediate event dispatch through `defineEvent`, `world.observe(...)`, `world.trigger(...)`, and `commands.trigger(...)`.

## Removed Reader Demo

```sh
npm run example:removed
```

This demo shows multiple systems reading the same removed component records through independent `RemovedReader` cursors.

## Required Components Demo

```sh
npm run example:required
```

This demo shows required component insertion: adding `RigidBody` automatically inserts missing `Mass`, `Velocity`, and transitive `Transform` components without overwriting components that were already present.

## Resource Change Detection Demo

```sh
npm run example:resources
```

This demo shows `isResourceAdded`, `isResourceChanged`, `markResourceChanged`, and resource replacement.

## State Demo

```sh
npm run example:state
```

This demo shows state-specific class systems through `addStateSystem(...)`, plus transition class systems through `addTransitionSystem(...)`.

## Query Filter Demo

```sh
npm run example:query
```

This demo shows `eachWhere([Position, Velocity], { with: [Player], without: [Sleeping] }, ...)`.

## Advanced Query Filter Demo

```sh
npm run example:query-advanced
```

This demo shows `or`, `none`, and `queryOptional(...)` for optional components.

## Query Ergonomics Demo

```sh
npm run example:query-ergonomics
```

This demo shows `hasAll`, `hasAny`, `single`, and `trySingle`.

## Query State Demo

```sh
npm run example:query-state
```

This demo shows `queryState(...)` as a reusable system field. `QueryState` and `optionalQueryState(...)` cache component/filter store resolution and invalidate when new component stores are created. Use `state.each(world, ...)` on hot paths to avoid the per-row arrays created by iterator rows.

## Tests And Benchmarks

```sh
npm test
npm run benchmark
npm run benchmark:json
```

Tests use Node's built-in `node:test` runner through `tsx`. The benchmark is a lightweight multi-sample micro-benchmark covering spawn, direct component get, query iteration, query state, filtered queries, optional queries, buffered messages, immediate observers, and scheduler `runIf` overhead. Use `npm run benchmark:json` for machine-readable output that can be redirected into comparison tooling or baseline files.

## Future Work

- Scheduler improvements: add query-backed run conditions and reusable condition groups.
- App / Plugin: add plugin dependencies, plugin ordering, and richer app lifecycle hooks.
- Tests and benchmarks: expand coverage for edge cases and add more stable benchmark baselines.
- Storage strategy experiments: keep SparseSet as the current baseline, then explore Archetype/Table or hybrid storage for faster multi-component queries.
