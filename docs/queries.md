# Queries

中文：[Queries](zh/queries.md).

Queries are the main way to iterate matching entities and component values.

## Basic Queries

```ts
world.each([Position, Velocity], (_entity, position, velocity) => {
    position.x += velocity.x;
    position.y += velocity.y;
});
```

Use `world.query(...)` when you want iterator rows, or `world.each(...)` on hot paths to avoid allocating a row array per match.

## Filters

`query(...)` and `each(...)` support these filters:

- `with`: entity must have all listed components.
- `without`: entity must not have any listed components.
- `or`: entity must have at least one listed component. Empty `or` matches everything.
- `added`: at least one listed component must have been added in the active change-detection range.
- `changed`: at least one listed component must have changed in the active change-detection range.

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

Run the filter examples with:

```sh
npm run example:query
npm run example:query-advanced
```

## Optional Components

Use `queryOptional(...)` when matching should require one set of components while returning another set as possibly `undefined`.

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

## Single-Entity Helpers

Use `trySingle(...)` when zero matches are allowed, and `single(...)` when exactly one match is required.

```ts
const player = world.single([Position, Velocity], { with: [Player] });
const enemyWithVelocity = world.trySingle([Position, Velocity], { with: [Enemy] });
```

`trySingle(...)` throws when more than one match exists. `single(...)` throws when zero or multiple matches exist.

## Query State

`queryState(...)` and `optionalQueryState(...)` cache component/filter store resolution for systems that run the same query repeatedly. Caches invalidate when new component stores are created.

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

Run the query-state example with:

```sh
npm run example:query-state
```
