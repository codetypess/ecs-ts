import {
    Commands,
    Entity,
    World,
    defineComponent,
    defineEvent,
    formatEntity,
    withComponent,
} from "../src";

const Health = defineComponent<{ value: number }>("Health");
const Damage = defineEvent<{ target: Entity; amount: number }>("Damage");
const Died = defineEvent<{ entity: Entity }>("Died");

class AttackSystem {
    constructor(private readonly target: Entity) {}

    onUpdate(_world: World, _dt: number, commands: Commands): void {
        commands.trigger(Damage, { target: this.target, amount: 20 });
    }
}

const world = new World();
const enemy = world.spawn(withComponent(Health, { value: 15 }));

world.observe(Damage, (damage, currentWorld, commands) => {
    const health = currentWorld.get(damage.target, Health);

    if (health === undefined) {
        return;
    }

    health.value -= damage.amount;
    commands.markChanged(damage.target, Health);
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
