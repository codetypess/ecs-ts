# Structural Writes

中文：[结构修改](zh/structural-writes.md).

Structural writes are the operations that change visible world state: spawning and despawning entities, adding or removing components, changing singleton resources and states, and publishing queued messages or events.

`ecs-ts` keeps three write paths because they solve different timing problems, but they do not cover exactly the same surface area. `world.batch(...)` is intentionally limited to entity/component structure edits; resources, states, messages, and events stay on direct `World` writes or `Commands`.

## Direct World Writes

Use direct world methods when you want changes to become visible immediately:

- `world.spawn(...)`
- `world.addComponent(...)`
- `world.removeComponent(...)`
- `world.despawn(...)`
- `world.setResource(...)`
- `world.setState(...)`

```ts
const entity = world.spawn(withComponent(Position, { x: 0, y: 0 }));
world.addComponent(entity, Velocity, { x: 1, y: 1 });
```

This is the simplest path for setup code, tests, import tools, and one-off scripts.

## Commands

`Commands` is a deferred queue.

- Systems and event observers automatically get a fresh command queue.
- The queue flushes after the system or observer returns.
- Outside the scheduler, you can call `world.commands()` and flush it manually.

```ts
const commands = world.commands();
const entity = commands.spawn(withComponent(Position, { x: 1, y: 2 }));

commands.addComponent(entity, Velocity, { x: 3, y: 4 });
commands.setState(GameMode, "running");
commands.flush();
```

Important details:

- `commands.spawn(...)` returns a reserved entity handle immediately.
- That entity is not live until `flush()` commits the queued work.
- Commands run in insertion order.
- If `flush()` throws, already executed commands stay applied and unexecuted commands stay queued.

Run the example:

```sh
npm run example:commands
```

## `world.batch(...)`

`world.batch(...)` is the transactional write path for entity/component structure.

It stages structural edits, validates the final component topology, then commits the net diff in one shot.

```ts
world.batch((batch) => {
    batch.removeComponent(entity, Selected);
    batch.addComponent(entity, Hovered, {});
});
```

Use it when:

- multiple structural edits must become visible together
- intermediate invalid states are acceptable inside the callback but not outside it
- you want all-or-nothing behavior when validation fails or the callback throws

Important details:

- Nested `world.batch(...)` calls are rejected.
- The batch writer becomes invalid once the callback returns.
- Batch writers only support `spawn(...)`, `addComponent(...)`, `removeComponent(...)`, and `despawn(...)`.
- Resource, state, message, and event writes still go through direct `World` calls or `Commands`.
- Component hooks observe the committed final diff, not every temporary step inside the callback.

Run the example:

```sh
npm run example:batch
```

## Dependencies With `deps`

Component dependencies are hard runtime constraints, not hints.

```ts
const Transform = registry.defineComponent<{ x: number; y: number }>("Transform");
const Element = registry.defineComponent<{ name: string }>("Element", {
    deps: [Transform],
});
```

That gives you these guarantees:

- direct writes fail fast if a dependency is missing
- direct removals fail fast if another visible component still depends on the target
- `spawn(...)` and `commands.spawn(...)` sort entries so dependencies are inserted first
- `world.batch(...)` validates the final component set before commit

Once a dependent component is visible, its dependencies are visible too. That is why `mustGetComponent(...)` is safe after checking the dependent component.

Run the example:

```sh
npm run example:deps
```

## Choosing The Write Path

- Use direct world writes for immediate setup and imperative code that wants instant visibility.
- Use `Commands` inside systems and observers, or when you want a deferred queue with explicit flush timing.
- Use `world.batch(...)` when structure changes must publish atomically.
