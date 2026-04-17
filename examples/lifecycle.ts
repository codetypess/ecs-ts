import { Commands, Entity, World, createRegistry, formatEntity, withComponent } from "../src";

const registry = createRegistry("example-lifecycle");
const Health = registry.defineComponent<{ value: number }>("Health", {
    onAdd(entity, health) {
        console.log(`component onAdd Health(${health.value}) -> ${formatEntity(entity)}`);
    },
    onInsert(entity, health) {
        console.log(`component onInsert Health(${health.value}) -> ${formatEntity(entity)}`);
    },
    onReplace(entity, health) {
        console.log(`component onReplace Health(${health.value}) -> ${formatEntity(entity)}`);
    },
    onRemove(entity, health) {
        console.log(`component onRemove Health(${health.value}) -> ${formatEntity(entity)}`);
    },
    onDespawn(entity, health) {
        console.log(`component onDespawn Health(${health.value}) -> ${formatEntity(entity)}`);
    },
});

class LifecycleDemoSystem {
    private entity: Entity | undefined;
    private frame = 0;

    onPreStartup(): void {
        console.log("system onPreStartup");
    }

    onStartup(_world: World, _dt: number, commands: Commands): void {
        console.log("system onStartup");
        this.entity = commands.spawn(withComponent(Health, { value: 100 }));
    }

    onPostStartup(): void {
        console.log("system onPostStartup");
    }

    onUpdate(_world: World, _dt: number, commands: Commands): void {
        console.log(`system onUpdate frame=${this.frame}`);

        if (this.entity === undefined) {
            return;
        }

        if (this.frame === 0) {
            commands.add(this.entity, Health, { value: 80 });
        } else if (this.frame === 1) {
            commands.remove(this.entity, Health);
        } else if (this.frame === 2) {
            commands.add(this.entity, Health, { value: 50 });
        } else if (this.frame === 3) {
            commands.despawn(this.entity);
        }

        this.frame++;
    }

    onPostUpdate(): void {
        console.log("system onPostUpdate");
    }

    onShutdown(): void {
        console.log("system onShutdown");
    }
}

const world = new World(registry);

world.addSystem(new LifecycleDemoSystem());

world.update(0);
world.update(0);
world.update(0);
world.update(0);
world.shutdown();
