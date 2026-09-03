# Structural Writes

中文：[结构修改](zh/structural-writes.md).

Structural writes are the operations that change visible world state: spawning and despawning entities, adding or removing components, changing singleton resources and states, and publishing queued messages or events.

`ecs-ts` keeps three write paths because they solve different timing problems, but they do not cover exactly the same surface area. `world.batch(...)` is intentionally limited to entity/component structure edits; resources, states, messages, and events stay on direct `World` writes or `DeferredCommands`.

## Direct World Writes

Use direct world methods when you want changes to become visible immediately:

- `world.spawn(etype, ...)`
- `world.addComponent(...)`
- `world.removeComponent(...)`
- `world.despawn(...)`
- `world.setResource(...)`
- `world.setState(...)`

```ts
const entity = world.spawn(0, withComponent(Position, { x: 0, y: 0 }));
world.addComponent(entity, Velocity, { x: 1, y: 1 });
```

All three spawn paths require `etype` as the first argument. Pass `0` explicitly when the application does not distinguish entity types.

This is the simplest path for setup code, tests, import tools, and one-off scripts.

## DeferredCommands

`DeferredCommands` is the World-owned deferred command buffer.

- Each World has one shared command buffer; repeated `world.commands()` calls and scheduled systems
  receive the same object.
- The World flushes externally queued commands at the next `update()` or `shutdown()` boundary.
- Each scheduled system starts after pending commands have flushed, and its commands flush after it
  returns successfully.
- `update()` performs one final managed flush after all schedules and before advancing the change
  tick.
- Event observers enqueue into the same buffer, so their commands follow the surrounding managed
  boundary. An observer triggered outside the scheduler leaves its commands pending until the next
  `update()` or `shutdown()`.

```ts
const commands = world.commands();
const entity = commands.spawn(0, withComponent(Position, { x: 1, y: 2 }));

commands.addComponent(entity, Velocity, { x: 3, y: 4 });
commands.mustGetComponent(entity, Velocity).x = 5;
commands.setState(GameMode, "running");

world.update(0); // commits pending commands before scheduled systems run
```

Important details:

- `commands.spawn(etype, ...)` returns a reserved entity handle immediately.
- That entity is not live until a World-managed boundary commits the queued work.
- Component reads check the queue's projected pending view before committed `World` state, so
  reserved spawn components and queued additions are readable before the managed flush.
- Queued component removal or despawn becomes visible to command reads immediately, while direct
  `World` reads continue to expose committed state until the managed flush.
- The pending view is a projection, not validation. Dependency checks and lifecycle hooks can
  still make command execution fail, and arbitrary `commands.run(...)` effects are not projected.
- DeferredCommands run in insertion order.
- Each managed flush executes one queue snapshot. Commands queued during that execution go into the
  alternate buffer and wait for the next managed boundary.
- If execution fails, already executed commands stay applied while unexecuted commands are
  discarded and their reserved entity handles are released.
- If a system throws, commands it queued are discarded instead of leaking into the next system.

Run the example:

```sh
npm run example:commands
```

## `world.batch(...)`

`world.batch(...)` is the transactional write path for entity/component structure.

It stages structural edits, validates the final component topology, then commits the net diff in one shot.

```ts
world.batch((batch) => {
    const position = batch.mustGetComponent(entity, Position);

    batch.removeComponent(entity, Selected);
    batch.addComponent(entity, Hovered, {});
    batch.addComponent(entity, Position, { ...position, x: position.x + 1 });
});
```

Use it when:

- multiple structural edits must become visible together
- intermediate invalid states are acceptable inside the callback but not outside it
- you want all-or-nothing behavior when validation fails or the callback throws

Important details:

- Nested `world.batch(...)` calls are rejected.
- The batch writer becomes invalid once the callback returns.
- Batch writers support `spawn(etype, ...)`, `addComponent(...)`, `removeComponent(...)`, `getComponent(...)`, `hasComponent(...)`, `mustGetComponent(...)`, and `despawn(...)`.
- Component reads use the projected batch view: staged additions and replacements are visible, while staged removals and despawns are hidden. Components untouched by the batch are read from committed World state.
- Component reads return the actual object reference. Mutating a committed value in place changes the World immediately and is not rolled back if the batch fails.
- Resource, state, message, and event writes still go through direct `World` calls or `DeferredCommands`.
- Component hooks observe the committed final diff, not every temporary step inside the callback.

Run the example:

```sh
npm run example:batch
```

## Dependencies With `deps`

Component dependencies are hard runtime constraints, not hints.

```ts
type Transform = { x: number; y: number };
type Element = { name: string };

const Transform = defineComponent<Transform>("Transform");
const Element = defineComponent<Element>("Element", {
    deps: [Transform],
});

registry.registerComponent(Transform);
registry.registerComponent(Element);
```

That gives you these guarantees:

- direct writes fail fast if a dependency is missing
- direct removals fail fast if another visible component still depends on the target
- `spawn(etype, ...)` and `commands.spawn(etype, ...)` sort entries so dependencies are inserted first
- `world.batch(...)` validates the final component set before commit

Once a dependent component is visible, its dependencies are visible too. That is why `mustGetComponent(...)` is safe after checking the dependent component.

Run the example:

```sh
npm run example:deps
```

## Choosing The Write Path

- Use direct world writes for immediate setup and imperative code that wants instant visibility.
- Use `DeferredCommands` inside systems and observers, or to queue work for the next World-managed
  update boundary.
- Use `world.batch(...)` when structure changes must publish atomically.
