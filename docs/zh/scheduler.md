# Scheduler

English: [Scheduler](../scheduler.md).

System 是带生命周期方法的 object/class。注册 system 时，`World` 会发现这些方法：

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

Startup 阶段会在第一次 update 前运行一次。`onFixedUpdate` 会按 fixed timestep accumulator 运行。Shutdown 会通过 `world.shutdown()` 运行一次。

## Label 和排序

System 选项可以指定 label 和排序边：

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

排序循环、重复的 system label，以及同一阶段内重复的 system/set label 都会被拒绝。

## System Set

需要让规则应用到每个阶段中的同一个 set 时，使用 `configureSet(...)`。当同一个 set 需要在特定阶段使用不同的排序或条件时，使用 `configureSetForStage(...)`。

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

当一个 system 属于多个 set 时，排序约束会被合并，并且所有匹配的 `runIf` 条件都必须通过。

## 运行条件

运行条件可以通过 `runIfAll(...)`、`runIfAny(...)` 和 `runIfNot(...)` 组合。内置辅助方法覆盖 resource、state 以及由 query 支持的条件。

```ts
const activeBodies = queryState([RigidBody, Transform]);

world.addSystem(new PhysicsSystem(), {
    runIf: anyMatch(activeBodies),
});
```

## 示例

```sh
npm run example:scheduler
npm run example:scheduler-showcase
```

`example:scheduler` 聚焦 label、set、排序、运行条件和 fixed update。`example:scheduler-showcase` 会运行一个小型多帧循环，并打印 startup、fixed update、update、last 和 shutdown 之间的 trace。
