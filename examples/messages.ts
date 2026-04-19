import {
    Commands,
    Entity,
    World,
    createRegistry,
    formatEntity,
    messageReader,
    withComponent,
    withMarker,
} from "../src";

const registry = createRegistry("example-messages");
const Enemy = registry.defineComponent("Enemy");
const Health = registry.defineComponent<{ value: number }>("Health");
const Damage = registry.defineMessage<{ target: Entity; amount: number }>("Damage");

class AttackSystem {
    onStartup(_world: World, _dt: number, commands: Commands): void {
        commands.spawn(withMarker(Enemy), withComponent(Health, { value: 100 }));
    }

    onUpdate(world: World, _dt: number, commands: Commands): void {
        world.each([Enemy], (entity) => {
            commands.writeMessage(Damage, { target: entity, amount: 10 });
        });
    }
}

class DamageSystem {
    private readonly damageReader = messageReader(Damage);

    onUpdate(world: World): void {
        for (const damage of this.damageReader.read(world)) {
            const health = world.get(damage.target, Health);

            if (health === undefined) {
                continue;
            }

            health.value -= damage.amount;
            world.markChanged(damage.target, Health);
            console.log(
                `damage ${formatEntity(damage.target)} by ${damage.amount}; hp=${health.value}`
            );
        }
    }
}

const world = new World(registry);
world.addMessage(Damage);
world.addSystem(new AttackSystem());
world.addSystem(new DamageSystem());

world.update(0);
world.update(0);
