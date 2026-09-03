# 结构修改

English: [Structural Writes](../structural-writes.md).

结构修改指的是会改变 world 可见状态的操作：spawn / despawn entity、添加或移除 component、修改 singleton resource / state，以及发布排队的 message / event。

`ecs-ts` 保留了三条写路径，因为它们解决的是不同的时序问题，但三条路径并不覆盖完全相同的能力面。`world.batch(...)` 会刻意限制在 entity/component 结构修改上；resource、state、message 和 event 仍然走直接 `World` 写入或 `DeferredCommands`。

## 直接写 World

当你希望修改立刻可见时，直接使用 world 方法：

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

三条 spawn 路径都要求把 `etype` 作为第一个参数传入。如果业务不区分 entity type，也应显式传入 `0`。

这条路径最适合初始化代码、测试、导入工具和一次性的脚本。

## DeferredCommands

`DeferredCommands` 是由 World 持有的 deferred command buffer。

- 每个 World 只有一个共享 command buffer；重复调用 `world.commands()` 以及 scheduled system
  拿到的都是同一个对象。
- 在 system 外排入的命令会在下一次 `update()` 或 `shutdown()` 边界由 World 自动提交。
- 每个 scheduled system 都会在 pending command 提交后开始执行；system 成功返回后，其命令
  会自动提交。
- 所有 schedule 结束后、change tick 前进之前，`update()` 还会执行一次最终托管 flush。
- Event observer 也写入同一个 buffer，其命令跟随外围的托管提交边界。在 scheduler 外直接
  触发的 observer 会让命令保持 pending，直到下一次 `update()` 或 `shutdown()`。

```ts
const commands = world.commands();
const entity = commands.spawn(0, withComponent(Position, { x: 1, y: 2 }));

commands.addComponent(entity, Velocity, { x: 3, y: 4 });
commands.mustGetComponent(entity, Velocity).x = 5;
commands.setState(GameMode, "running");

world.update(0); // 在 scheduled system 执行前提交 pending command
```

几个关键点：

- `commands.spawn(etype, ...)` 会立即返回一个保留的 entity handle。
- 在 World 托管的提交边界之前，这个 entity 还不是 live entity。
- Component 读取会先查询 command queue 的 pending view，再回退到已提交的 `World` 状态，
  因此 reserved spawn 的初始 component 和 queued add 在托管提交前即可读取。
- Queued remove 或 despawn 会立即反映在 command 读取中，但直接 `World` 读取在托管提交前
  仍看到已提交状态。
- Pending view 是预期投影而不是验证结果；dependency 检查和 lifecycle hook 仍可能使命令执行
  失败，并且任意 `commands.run(...)` 的影响不会被投影。
- command 会按入队顺序执行。
- 每次托管 flush 只执行当时的 queue snapshot；执行过程中排入的新命令会进入备用 buffer，
  等待下一个托管边界。
- 如果执行失败，已经执行过的 command 会保留，尚未执行的 command 会被丢弃，其 reserved
  entity handle 也会被释放。
- 如果 system 抛错，它排入的 command 会被丢弃，不会泄漏到下一个 system。

运行示例：

```sh
npm run example:commands
```

## `world.batch(...)`

`world.batch(...)` 是面向 entity/component 结构的 transactional 写路径。

它会先暂存结构修改，验证最终 component 拓扑，再一次性提交净变化。

```ts
world.batch((batch) => {
    const position = batch.mustGetComponent(entity, Position);

    batch.removeComponent(entity, Selected);
    batch.addComponent(entity, Hovered, {});
    batch.addComponent(entity, Position, { ...position, x: position.x + 1 });
});
```

适合这些场景：

- 多个结构修改必须同时对外可见
- callback 内部允许经过临时无效状态，但外部绝不能看到
- 当验证失败或 callback 抛错时，需要 all-or-nothing 行为

几个关键点：

- 不支持嵌套 `world.batch(...)`。
- callback 返回后，batch writer 就失效了。
- batch writer 支持 `spawn(etype, ...)`、`addComponent(...)`、`removeComponent(...)`、`getComponent(...)`、`hasComponent(...)`、`mustGetComponent(...)` 和 `despawn(...)`。
- Component 读取使用 batch 的投影视图：暂存的新增和替换立即可见，暂存的移除和 despawn 则被隐藏；batch 未修改的 component 从已提交的 World 状态读取。
- Component 读取返回实际对象引用。原地修改已提交的值会立即改变 World，且 batch 失败时不会回滚。
- resource、state、message 和 event 的写入仍然通过直接 `World` 调用或 `DeferredCommands` 完成。
- component hook 看到的是最终提交的净变化，而不是 callback 内部的每个临时步骤。

运行示例：

```sh
npm run example:batch
```

## `deps` 依赖约束

component 依赖是硬性的运行时约束，不是提示信息。

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

这会带来几条明确保证：

- 直接写入时如果依赖缺失，会立刻失败
- 如果还有可见 dependent component，直接移除 dependency 会立刻失败
- `spawn(etype, ...)` 和 `commands.spawn(etype, ...)` 会先插入依赖，再插入 dependent
- `world.batch(...)` 会在 commit 前验证最终 component 集合

一旦 dependent component 对外可见，它的依赖也一定可见。所以在先确认 dependent 存在之后，使用 `mustGetComponent(...)` 是安全的。

运行示例：

```sh
npm run example:deps
```

## 怎么选写路径

- 需要立刻生效的初始化或命令式代码，用直接 world 写入。
- 在 system / observer 里，或者需要把工作推迟到下一个 World 托管的 update 边界时，用
  `DeferredCommands`。
- 结构修改必须原子发布时，用 `world.batch(...)`。
