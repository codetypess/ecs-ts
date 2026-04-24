import {
    type Entity,
    World,
    createRegistry,
    formatEntity,
    messageReader,
    withComponent,
} from "../src";

const registry = createRegistry("example-commands");
const Position = registry.defineComponent<{ x: number; y: number }>("Position");
const Log = registry.defineResource<string[]>("Log");
const Mode = registry.defineState<"boot" | "running">("Mode", "boot");
const Damage = registry.defineMessage<{ target: Entity; amount: number }>("Damage");

const world = new World(registry);

world.addMessage(Damage);

const commands = world.commands();
const entity = commands.spawn(withComponent(Position, { x: 4, y: 8 }));

commands.setResource(Log, ["spawn queued", "resource queued"]);
commands.setState(Mode, "running");
commands.writeMessage(Damage, { target: entity, amount: 5 });

console.log(
    `before flush ${formatEntity(entity)} alive=${world.isAlive(entity)} pending=${commands.pending}`
);

commands.flush();

const damageReader = messageReader(Damage);
const damageMessages = damageReader.read(world);

console.log(
    `after flush ${formatEntity(entity)} alive=${world.isAlive(entity)} state=${world.state(Mode)}`
);
console.log(`position=${JSON.stringify(world.mustGetComponent(entity, Position))}`);
console.log(
    `log=${world.resource(Log).join(", ")} damageMessages=${JSON.stringify(damageMessages)}`
);
