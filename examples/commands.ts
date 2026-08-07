import {
    defineComponent,
    defineMessage,
    defineResource,
    defineState,
    type Entity,
    World,
    createRegistry,
    formatEntity,
    withComponent,
} from "../src";

const registry = createRegistry("example-commands");
type Position = { x: number; y: number };
const Position = registry.registerComponent(defineComponent<Position>("Position"));
const Log = registry.registerResource(defineResource<string[]>("Log"));
const Mode = registry.registerState(defineState<"boot" | "running">("Mode", "boot"));
const Damage = registry.registerMessage(
    defineMessage<{ target: Entity; amount: number }>("Damage")
);

const world = new World(registry);

world.addMessage(Damage);

const commands = world.commands();
const entity = commands.spawn(0, withComponent(Position, { x: 4, y: 8 }));

commands.setResource(Log, ["spawn queued", "resource queued"]);
commands.setState(Mode, "running");
commands.writeMessage(Damage, { target: entity, amount: 5 });

console.log(
    `before flush ${formatEntity(entity)} alive=${world.isAlive(entity)} pending=${commands.pending}`
);

commands.flush();

const damageReader = world.messageReader(Damage);
const damageMessages = damageReader.read();

console.log(
    `after flush ${formatEntity(entity)} alive=${world.isAlive(entity)} state=${world.mustGetState(Mode)}`
);
console.log(`position=${JSON.stringify(world.mustGetComponent(entity, Position))}`);
console.log(
    `log=${world.mustGetResource(Log).join(", ")} damageMessages=${JSON.stringify(damageMessages)}`
);
