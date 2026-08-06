# Queries

English: [Queries](../queries.md).

Query 是遍历匹配 entity 和 component 值的主要方式。

## 基本 Query

```ts
world.each([Position, Velocity], (_entity, position, velocity) => {
    position.x += velocity.x;
    position.y += velocity.y;
});
```

需要 iterator row 时使用 `world.query(...)`；在热路径上可以使用 `world.each(...)`，避免为每个匹配结果分配 row 数组。

## 迭代期间删除

在活跃 query 中移除 component 或 despawn entity 时，删除会立即在逻辑上生效。尚未访问且不再匹配的 entity 会被跳过；删除已经访问过的 entity 不会立刻重排 dense storage，因此不会导致后续 row 意外消失。嵌套 query 也会看到这次删除。

物理 compact 会等到最外层 query 结束。手动消费 iterator 时，应将其消费完，或者在提前停止时调用 `return()`。该稳定性保证只覆盖删除；结构添加继续保持现有的立即生效语义。

## 过滤器

`query(...)` 和 `each(...)` 支持这些过滤器：

- `with`：entity 必须拥有列出的全部 component。
- `without`：entity 不能拥有列出的任何 component。
- `or`：entity 必须至少拥有列出的一个 component。空 `or` 会匹配所有 entity。
- `added`：列出的至少一个 component 必须在当前活跃的变更检测范围内被添加过。
- `changed`：列出的至少一个 component 必须在当前活跃的变更检测范围内发生过变化。

```ts
world.each(
    [Position, Velocity],
    { with: [Player], without: [Sleeping] },
    (_entity, position, velocity) => {
        position.x += velocity.x;
        position.y += velocity.y;
    }
);
```

运行过滤器示例：

```sh
npm run example:query
npm run example:query-advanced
```

## Optional Component

当匹配条件需要一组 component，而返回值还需要包含另一组可能不存在的 component 时，使用 `queryOptional(...)`。

```ts
for (const [entity, position, velocity, name] of world.queryOptional([Position], [Velocity, Name], {
    or: [Player, Npc],
    without: [Sleeping, Frozen],
})) {
    if (velocity !== undefined) {
        position.x += velocity.x;
        position.y += velocity.y;
    }
}
```

## 单 Entity 辅助方法

允许零个匹配结果时使用 `getSingle(...)`；要求恰好一个匹配结果时使用 `mustGetSingle(...)`。

```ts
const player = world.mustGetSingle([Position, Velocity], { with: [Player] });
const enemyWithVelocity = world.getSingle([Position, Velocity], { with: [Enemy] });
```

`getSingle(...)` 会在存在多个匹配结果时抛错。`mustGetSingle(...)` 会在没有匹配结果或存在多个匹配结果时抛错。

## Query State

`queryState(...)` 和 `optionalQueryState(...)` 会缓存 component/filter 的 store 解析结果，适合在 system 中反复运行同一个 query。创建新的 component store 时缓存会失效。

它们也是公开的构造入口。拿到 state 对象之后，使用 `state.iter(world)`、`state.each(world)`、`state.matches*(world)`、`state.getSingle(world)` 和 `state.mustGetSingle(world)` 作为 cached query 的调用方式。

```ts
const activeBodies = queryState([Transform, Velocity, RigidBody], {
    without: [Sleeping],
});

class PhysicsSystem {
    onFixedUpdate(world: World): void {
        activeBodies.each(world, (_entity, transform, velocity) => {
            transform.x += velocity.x;
            transform.y += velocity.y;
        });
    }
}
```

运行 query-state 示例：

```sh
npm run example:query-state
```
