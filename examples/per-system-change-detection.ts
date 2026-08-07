import {
    defineComponent,
    defineState,
    DeferredCommands,
    Entity,
    World,
    createRegistry,
    formatEntity,
    withComponent,
} from "../src";

const registry = createRegistry("example-per-system-change");
type Position = { x: number; y: number };
const Position = registry.registerComponent(defineComponent<Position>("Position"));
const Mode = registry.registerState(defineState<"editing" | "watching">("Mode", "editing"));

class MutationSystem {
    private entity: Entity | undefined;
    private frame = 0;

    onStartup(_world: World, _dt: number, commands: DeferredCommands): void {
        this.entity = commands.spawn(0, withComponent(Position, { x: 0, y: 0 }));
    }

    onUpdate(world: World, _dt: number, commands: DeferredCommands): void {
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
        world.each([Position], { changed: [Position] }, (entity, position) => {
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
