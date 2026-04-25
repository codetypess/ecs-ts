# Change Detection

中文：[Change Detection](zh/change-detection.md).

Change detection uses the active system's last-run tick and the world's current change tick. This lets each system observe changes that happened since that system last ran.

## Components

Use `eachAdded(...)` and `eachChanged(...)` for component queries constrained by change state. Use `markComponentChanged(...)` after mutating component values in place.

```ts
world.eachChanged([Position], (entity, position) => {
    console.log(entity, position);
});

const position = world.mustGetComponent(entity, Position);
position.x += 1;
world.markComponentChanged(entity, Position);
```

Run the component examples with:

```sh
npm run example:changes
npm run example:per-system-changes
```

## Removed Components

Removed component records support both direct draining and independent readers:

```ts
const removed = world.drainRemoved(Position);
const reader = world.removedReader(Position);
const records = reader.read();
```

Use `RemovedReader` when multiple systems need to inspect the same removal stream without consuming each other's records. Call `reader.close()` when you no longer need it so fully consumed history can compact promptly.

```sh
npm run example:removed
```

## Resources

Resources have added/changed detection and explicit `markResourceChanged(...)` support.

```ts
if (world.isResourceChanged(Settings)) {
    reloadSettings(world.resource(Settings));
}
```

```sh
npm run example:resources
```

## Messages

Messages are short-lived, multi-reader event queues. Writers can call `writeMessage(...)` directly or queue writes through `Commands`. Readers keep independent cursors.

```ts
const damageReader = world.messageReader(Damage);

for (const damage of damageReader.read()) {
    applyDamage(damage);
}
```

```sh
npm run example:messages
```
