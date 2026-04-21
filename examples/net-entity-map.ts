import { Commands, Entity, World, createRegistry, formatEntity, withComponent } from "../src";

const registry = createRegistry("example-net-entity-map");

interface UnitSnapshot {
    readonly id: number;
    readonly x: number;
    readonly y: number;
    readonly hp: number;
}

class NetEntityMap {
    private readonly byServerId = new Map<number, Entity>();

    get(serverId: number): Entity | undefined {
        return this.byServerId.get(serverId);
    }

    set(serverId: number, entity: Entity): void {
        this.byServerId.set(serverId, entity);
    }

    delete(serverId: number): void {
        this.byServerId.delete(serverId);
    }

    entries(): IterableIterator<[number, Entity]> {
        return this.byServerId.entries();
    }
}

const Unit = registry.defineComponent<{ serverId: number }>("Unit");
const Position = registry.defineComponent<{ x: number; y: number }>("Position");
const Health = registry.defineComponent<{ value: number }>("Health");

const NetEntities = registry.defineResource<NetEntityMap>("NetEntities");
const SnapshotFrames = registry.defineResource<UnitSnapshot[][]>("SnapshotFrames");
const Log = registry.defineResource<string[]>("NetLog");

class NetSyncSystem {
    onUpdate(world: World, _dt: number, commands: Commands): void {
        const snapshots = world.resource(SnapshotFrames).shift();

        if (snapshots === undefined) {
            return;
        }

        const map = world.resource(NetEntities);
        const visible = new Set<number>();

        for (const snapshot of snapshots) {
            visible.add(snapshot.id);

            let entity = map.get(snapshot.id);

            if (entity === undefined || !world.isAlive(entity)) {
                entity = commands.spawn(
                    withComponent(Unit, { serverId: snapshot.id }),
                    withComponent(Position, { x: snapshot.x, y: snapshot.y }),
                    withComponent(Health, { value: snapshot.hp })
                );
                map.set(snapshot.id, entity);
                world.resource(Log).push(`spawn server#${snapshot.id} -> ${formatEntity(entity)}`);
                continue;
            }

            const position = world.mustGetComponent(entity, Position);
            const health = world.mustGetComponent(entity, Health);

            position.x = snapshot.x;
            position.y = snapshot.y;
            health.value = snapshot.hp;
            world.resource(Log).push(`update server#${snapshot.id} -> hp=${snapshot.hp}`);
        }

        for (const [serverId, entity] of Array.from(map.entries())) {
            if (visible.has(serverId)) {
                continue;
            }

            commands.despawn(entity);
            map.delete(serverId);
            world.resource(Log).push(`despawn server#${serverId}`);
        }
    }
}

class PrintLogSystem {
    onPostUpdate(world: World): void {
        const log = world.resource(Log);

        while (log.length > 0) {
            console.log(log.shift());
        }
    }
}

function setupNetReplication(world: World): void {
    world.setResource(NetEntities, new NetEntityMap());
    world.setResource(Log, []);
    world.setResource(SnapshotFrames, [
        [
            { id: 1001, x: 10, y: 20, hp: 100 },
            { id: 1002, x: 30, y: 40, hp: 50 },
        ],
        [{ id: 1001, x: 12, y: 20, hp: 90 }],
    ]);
    world.addSystem(new NetSyncSystem(), { set: "net" });
    world.addSystem(new PrintLogSystem());
}

const world = new World(registry);

world.configureSet("net", { runIf: () => true });
setupNetReplication(world);
world.update(0);
world.update(0);
