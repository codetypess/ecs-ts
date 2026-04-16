import {
    Commands,
    Entity,
    RemovedReader,
    World,
    defineComponent,
    formatEntity,
    withComponent,
} from "../src";

const Position = defineComponent<{ x: number; y: number }>("Position");

class RemovePositionSystem {
    private entity: Entity | undefined;

    onStartup(_world: World, _dt: number, commands: Commands): void {
        this.entity = commands.spawn(withComponent(Position, { x: 1, y: 2 }));
    }

    onUpdate(_world: World, _dt: number, commands: Commands): void {
        if (this.entity !== undefined) {
            commands.remove(this.entity, Position);
            this.entity = undefined;
        }
    }
}

class RemovedLogSystem {
    constructor(
        private readonly removedPositions: RemovedReader<{ x: number; y: number }>
    ) {}

    onPostUpdate(): void {
        for (const removed of this.removedPositions.read()) {
            console.log(
                `log removed ${formatEntity(removed.entity)} at (${removed.component.x}, ${removed.component.y})`
            );
        }
    }
}

class RemovedCleanupSystem {
    constructor(
        private readonly removedPositions: RemovedReader<{ x: number; y: number }>
    ) {}

    onPostUpdate(): void {
        for (const removed of this.removedPositions.read()) {
            console.log(`cleanup removed ${formatEntity(removed.entity)}`);
        }
    }
}

const world = new World();
world.addSystem(new RemovePositionSystem());
world.addSystem(new RemovedLogSystem(world.removedReader(Position)));
world.addSystem(new RemovedCleanupSystem(world.removedReader(Position)));

world.update(0);
world.update(0);
