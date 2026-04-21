import { Commands, Entity, World, createRegistry, formatEntity, withComponent } from "../src";

const registry = createRegistry("example-observer");
const Health = registry.defineComponent<{ value: number }>("Health");
const Damage = registry.defineEvent<{ target: Entity; amount: number }>("Damage");
const Died = registry.defineEvent<{ entity: Entity }>("Died");

class AttackSystem {
    constructor(private readonly target: Entity) {}

    onUpdate(_world: World, _dt: number, commands: Commands): void {
        commands.trigger(Damage, { target: this.target, amount: 20 });
    }
}

const world = new World(registry);
const enemy = world.spawn(withComponent(Health, { value: 15 }));

world.observe(Damage, (damage, currentWorld, commands) => {
    const health = currentWorld.getComponent(damage.target, Health);

    if (health === undefined) {
        return;
    }

    health.value -= damage.amount;
    commands.markComponentChanged(damage.target, Health);
    console.log(`damage ${formatEntity(damage.target)} by ${damage.amount}; hp=${health.value}`);

    if (health.value <= 0) {
        commands.trigger(Died, { entity: damage.target });
    }
});

world.observe(Died, (event, _currentWorld, commands) => {
    console.log(`despawn ${formatEntity(event.entity)}`);
    commands.despawn(event.entity);
});

world.trigger(Damage, { target: enemy, amount: 5 });

world.addSystem(new AttackSystem(enemy));
world.update(0);

console.log(`alive=${world.isAlive(enemy)}`);
