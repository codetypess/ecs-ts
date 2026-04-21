import { Commands, Entity, World, createRegistry, formatEntity, withComponent } from "../src";

const registry = createRegistry("example-per-system-change");
const Position = registry.defineComponent<{ x: number; y: number }>("Position");
const Mode = registry.defineState<"editing" | "watching">("Mode", "editing");

class MutationSystem {
    private entity: Entity | undefined;
    private frame = 0;

    onStartup(_world: World, _dt: number, commands: Commands): void {
        this.entity = commands.spawn(withComponent(Position, { x: 0, y: 0 }));
    }

    onUpdate(world: World, _dt: number, commands: Commands): void {
        if (this.entity === undefined || this.frame !== 0) {
            this.frame++;
            return;
        }

        const position = world.mustGetComponent(this.entity, Position);
        position.x = 10;
        commands.markComponentChanged(this.entity, Position);
        commands.setState(Mode, "watching");
        console.log(`changed ${formatEntity(this.entity)} while Mode=editing`);
        this.frame++;
    }
}

class WatchingEnterSystem {
    onEnter(world: World): void {
        world.eachChanged([Position], (entity, position) => {
            console.log(
                `watching system saw changed ${formatEntity(entity)} -> (${position.x}, ${position.y})`
            );
        });
    }
}

const world = new World(registry);
world.initState(Mode);
world.addSystem(new MutationSystem());
world.addStateSystem(Mode, "watching", new WatchingEnterSystem());

world.update(0);
world.update(0);
