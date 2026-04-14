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

## 过滤器

`queryWhere(...)` 和 `eachWhere(...)` 支持这些过滤器：

- `with`：entity 必须拥有列出的全部 component。
- `without`：entity 不能拥有列出的任何 component。
- `or`：entity 必须至少拥有列出的一个 component。空 `or` 会匹配所有 entity。
- `none`：entity 必须不拥有列出的任何 component。
- `added`：列出的至少一个 component 必须在当前活跃的变更检测范围内被添加过。
- `changed`：列出的至少一个 component 必须在当前活跃的变更检测范围内发生过变化。

```ts
world.eachWhere(
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
    none: [Sleeping, Frozen],
})) {
    if (velocity !== undefined) {
        position.x += velocity.x;
        position.y += velocity.y;
    }
}
```

## 单 Entity 辅助方法

允许零个匹配结果时使用 `trySingle(...)`；要求恰好一个匹配结果时使用 `single(...)`。

```ts
const player = world.single([Position, Velocity], { with: [Player] });
const enemyWithVelocity = world.trySingle([Position, Velocity], { with: [Enemy] });
```

`trySingle(...)` 会在存在多个匹配结果时抛错。`single(...)` 会在没有匹配结果或存在多个匹配结果时抛错。

## Query State

`queryState(...)` 和 `optionalQueryState(...)` 会缓存 component/filter 的 store 解析结果，适合在 system 中反复运行同一个 query。创建新的 component store 时缓存会失效。

```ts
const activeBodies = queryState([Transform, Velocity, RigidBody], {
    none: [Sleeping],
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
