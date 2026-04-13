import {
    Commands,
    Entity,
    World,
    defineComponent,
    defineMessage,
    formatEntity,
    messageReader,
    withComponent,
} from "../src";

const Enemy = defineComponent("Enemy");
const Health = defineComponent<{ value: number }>("Health");
const Damage = defineMessage<{ target: Entity; amount: number }>("Damage");

class AttackSystem {
    onStartup(_world: World, _dt: number, commands: Commands): void {
        commands.spawn(withComponent(Enemy, {}), withComponent(Health, { value: 100 }));
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

const world = new World();
world.addMessage(Damage);
world.addSystem(new AttackSystem());
world.addSystem(new DamageSystem());

world.update(0);
world.update(0);
