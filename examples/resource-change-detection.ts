import { Commands, World, createRegistry } from "../src";

const registry = createRegistry("example-resource-change-detection");
const Settings = registry.defineResource<{ volume: number }>("Settings");

class SettingsMutationSystem {
    private frame = 0;

    onStartup(world: World): void {
        world.setResource(Settings, { volume: 1 });
    }

    onUpdate(world: World, _dt: number, commands: Commands): void {
        const settings = world.resource(Settings);

        if (this.frame === 0) {
            settings.volume = 0.5;
            commands.markResourceChanged(Settings);
        } else if (this.frame === 1) {
            commands.setResource(Settings, { volume: 0.25 });
        }

        this.frame++;
    }
}

class SettingsSyncSystem {
    onPostUpdate(world: World): void {
        if (world.isResourceAdded(Settings)) {
            console.log(`settings added: volume=${world.resource(Settings).volume}`);
        }

        if (world.isResourceChanged(Settings)) {
            console.log(`settings changed: volume=${world.resource(Settings).volume}`);
        }
    }
}

const world = new World(registry);
world.addSystem(new SettingsMutationSystem());
world.addSystem(new SettingsSyncSystem());

world.update(0);
world.update(0);
world.update(0);
