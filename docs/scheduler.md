# Scheduler

Systems are lifecycle objects/classes. `World` discovers these methods when a system is registered:

- `onPreStartup`
- `onStartup`
- `onPostStartup`
- `onFirst`
- `onPreUpdate`
- `onFixedUpdate`
- `onUpdate`
- `onPostUpdate`
- `onLast`
- `onShutdown`

Startup stages run once before the first update. `onFixedUpdate` runs according to the fixed timestep accumulator. Shutdown runs once through `world.shutdown()`.

## Labels And Ordering

System options can assign labels and ordering edges:

```ts
world.addSystem(new PrepareSystem(), { label: "prepare" });
world.addSystem(new PhysicsSystem(), {
    label: "physics",
    after: ["prepare"],
});
world.addSystem(new RenderSystem(), {
    after: ["physics"],
});
```

Ordering cycles, duplicate system labels, and duplicate system/set labels in the same stage are rejected.

## System Sets

Use `configureSet(...)` for rules that should apply to a set in every stage. Use `configureSetForStage(...)` when the same set needs different ordering or conditions in a specific stage.

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

## Run Conditions

Run conditions are composable with `runIfAll(...)`, `runIfAny(...)`, and `runIfNot(...)`. Built-in helpers cover resources, states, and query-backed conditions.

```ts
const activeBodies = queryState([RigidBody, Transform]);

world.addSystem(new PhysicsSystem(), {
    runIf: anyMatch(activeBodies),
});
```

## Examples

```sh
npm run example:scheduler
npm run example:scheduler-showcase
```

`example:scheduler` focuses on labels, sets, ordering, run conditions, and fixed updates. `example:scheduler-showcase` runs a small multi-frame loop and prints the trace across startup, fixed update, update, last, and shutdown.
