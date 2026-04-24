# 结构修改

English: [Structural Writes](../structural-writes.md).

结构修改指的是会改变 world 可见状态的操作：spawn / despawn entity、添加或移除 component、修改 singleton resource / state，以及发布排队的 message / event。

`ecs-ts` 保留了三条写路径，因为它们解决的是不同的时序问题。

## 直接写 World

当你希望修改立刻可见时，直接使用 world 方法：

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

这条路径最适合初始化代码、测试、导入工具和一次性的脚本。

## Commands

`Commands` 是 deferred queue。

- system 和 event observer 会自动拿到一个新的 command queue。
- callback 返回后，这个 queue 会自动 flush。
- 在 scheduler 之外，你也可以手动调用 `world.commands()` 并自行 `flush()`。

```ts
const commands = world.commands();
const entity = commands.spawn(withComponent(Position, { x: 1, y: 2 }));

commands.addComponent(entity, Velocity, { x: 3, y: 4 });
commands.setState(GameMode, "running");
commands.flush();
```

几个关键点：

- `commands.spawn(...)` 会立即返回一个保留的 entity handle。
- 在 `flush()` 提交之前，这个 entity 还不是 live entity。
- command 会按入队顺序执行。
- 如果 `flush()` 抛错，已经执行过的 command 会保留，未执行的 command 会继续留在队列里。

运行示例：

```sh
npm run example:commands
```

## `world.batch(...)`

`world.batch(...)` 是 transactional 的写路径。

它会先暂存结构修改，验证最终 component 拓扑，再一次性提交净变化。

```ts
world.batch((batch) => {
    batch.removeComponent(entity, Selected);
    batch.addComponent(entity, Hovered, {});
});
```

适合这些场景：

- 多个结构修改必须同时对外可见
- callback 内部允许经过临时无效状态，但外部绝不能看到
- 当验证失败或 callback 抛错时，需要 all-or-nothing 行为

几个关键点：

- 不支持嵌套 `world.batch(...)`。
- callback 返回后，batch writer 就失效了。
- component hook 看到的是最终提交的净变化，而不是 callback 内部的每个临时步骤。

运行示例：

```sh
npm run example:batch
```

## `deps` 依赖约束

component 依赖是硬性的运行时约束，不是提示信息。

```ts
const Transform = registry.defineComponent<{ x: number; y: number }>("Transform");
const Element = registry.defineComponent<{ name: string }>("Element", {
    deps: [Transform],
});
```

这会带来几条明确保证：

- 直接写入时如果依赖缺失，会立刻失败
- 如果还有可见 dependent component，直接移除 dependency 会立刻失败
- `spawn(...)` 和 `commands.spawn(...)` 会先插入依赖，再插入 dependent
- `world.batch(...)` 会在 commit 前验证最终 component 集合

一旦 dependent component 对外可见，它的依赖也一定可见。所以在先确认 dependent 存在之后，使用 `mustGetComponent(...)` 是安全的。

运行示例：

```sh
npm run example:deps
```

## 怎么选写路径

- 需要立刻生效的初始化或命令式代码，用直接 world 写入。
- 在 system / observer 里，或者需要 deferred queue 和明确 flush 时机时，用 `Commands`。
- 结构修改必须原子发布时，用 `world.batch(...)`。
