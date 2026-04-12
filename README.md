# ecs-ts

A small TypeScript ECS prototype based on the design discussion:

- Entities are numeric `index + generation` handles, so stale entity IDs do not accidentally hit recycled entities.
- Components are registered with `defineComponent<T>()`.
- Bundles group multiple component entries for spawn/insert/remove calls.
- Component storage uses `SparseSet`: O(1)-ish `get/has/add/remove`, dense iteration, and swap-remove deletion.
- Queries choose the smallest component store as the base loop, then check other component stores by entity.
- Queries can filter with `with` and `without`.
- Change detection supports `eachAdded`, `eachChanged`, `markChanged`, and `drainRemoved`.
- Messages provide short-lived, multi-reader event queues through `defineMessage`, `writeMessage`, and `MessageReader`.
- Removed component records support both explicit `drainRemoved` and multi-reader `RemovedReader`.
- Components can declare required components that are inserted automatically when missing.
- Systems can use `Commands` for deferred structural edits.
- Components support lifecycle hooks: `onAdd`, `onInsert`, `onReplace`, `onRemove`, and `onDespawn`.
- Systems are lifecycle objects/classes with methods such as `onPreStartup`, `onStartup`, `onPostStartup`, `onUpdate`, `onPostUpdate`, and `onShutdown`.
- State transitions support object/class systems through `addStateSystem` and `addTransitionSystem`.

## Basic Usage

```ts
import { World, defineComponent } from "./src";

const Position = defineComponent<{ x: number; y: number }>("Position");
const Velocity = defineComponent<{ x: number; y: number }>("Velocity");
const Player = defineComponent<null>("Player");
const Sleeping = defineComponent<null>("Sleeping");

const world = new World();
const entity = world.spawn();

world.add(entity, Position, { x: 0, y: 0 });
world.add(entity, Velocity, { x: 1, y: 0 });
world.add(entity, Player, null);

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
  },
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

## Change Detection Demo

```sh
npm run example:changes
```

This demo shows `eachAdded`, manual `markChanged`, and `drainRemoved`.

## Message Demo

```sh
npm run example:messages
```

This demo shows a Bevy-style buffered message flow: one system writes `Damage` messages through `Commands`, while another system keeps a `MessageReader` cursor and reads only messages it has not seen yet.

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
