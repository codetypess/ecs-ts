import {
    App,
    Commands,
    Entity,
    Plugin,
    World,
    defineComponent,
    defineResource,
    formatEntity,
    withComponent,
} from "../src";

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

const Unit = defineComponent<{ serverId: number }>("Unit");
const Position = defineComponent<{ x: number; y: number }>("Position");
const Health = defineComponent<{ value: number }>("Health");

const NetEntities = defineResource<NetEntityMap>("NetEntities");
const SnapshotFrames = defineResource<UnitSnapshot[][]>("SnapshotFrames");
const Log = defineResource<string[]>("NetLog");

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

            const position = world.mustGet(entity, Position);
            const health = world.mustGet(entity, Health);

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

class NetReplicationPlugin implements Plugin {
    build(app: App): void {
        app.setResource(NetEntities, new NetEntityMap());
        app.setResource(Log, []);
        app.setResource(SnapshotFrames, [
            [
                { id: 1001, x: 10, y: 20, hp: 100 },
                { id: 1002, x: 30, y: 40, hp: 50 },
            ],
            [{ id: 1001, x: 12, y: 20, hp: 90 }],
        ]);
        app.addSystem(new NetSyncSystem(), { set: "net" });
        app.addSystem(new PrintLogSystem());
    }
}

const app = new App();

app.configureSet("net", { runIf: () => true });
app.addPlugin(new NetReplicationPlugin());
app.update(0);
app.update(0);
