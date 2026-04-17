import { Commands, Entity, World, createRegistry, formatEntity, withComponent } from "../src";

const registry = createRegistry("example-change-detection");
const Position = registry.defineComponent<{ x: number; y: number }>("Position");

class ChangeDetectionSystem {
    private entity: Entity | undefined;
    private frame = 0;

    onStartup(_world: World, _dt: number, commands: Commands): void {
        this.entity = commands.spawn(withComponent(Position, { x: 0, y: 0 }));
    }

    onUpdate(world: World, _dt: number, commands: Commands): void {
        world.eachAdded([Position], (entity, position) => {
            console.log(`added ${formatEntity(entity)} -> (${position.x}, ${position.y})`);
        });

        if (this.entity === undefined) {
            return;
        }

        const position = world.get(this.entity, Position);

        if (position === undefined) {
            return;
        }

        if (this.frame === 0) {
            position.x += 10;
            commands.markChanged(this.entity, Position);
        } else if (this.frame === 1) {
            commands.remove(this.entity, Position);
        }

        this.frame++;
    }

    onPostUpdate(world: World): void {
        world.eachChanged([Position], (entity, position) => {
            console.log(`changed ${formatEntity(entity)} -> (${position.x}, ${position.y})`);
        });

        for (const removed of world.drainRemoved(Position)) {
            console.log(
                `removed ${formatEntity(removed.entity)} -> (${removed.component.x}, ${removed.component.y})`
            );
        }
    }
}

const world = new World(registry);
world.addSystem(new ChangeDetectionSystem());

world.update(0);
world.update(0);
world.update(0);
