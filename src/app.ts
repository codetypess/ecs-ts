import type { EventObserver, EventType } from "./event";
import type { MessageType } from "./message";
import type { ResourceType } from "./resource";
import type { StateType, StateValue } from "./state";
import type {
    Commands,
    StateSystem,
    System,
    SystemOptions,
    SystemSetLabel,
    SystemSetOptions,
    TransitionSystem,
} from "./world";
import { World } from "./world";

export interface Plugin {
    build(app: App): void;
}

type AppSystemCallback = (world: World, dt: number, commands: Commands) => void;

export class App {
    private readonly installedPlugins = new Set<Plugin>();
    readonly world: World;

    constructor(world = new World()) {
        this.world = world;
    }

    addPlugin(plugin: Plugin): this {
        if (this.installedPlugins.has(plugin)) {
            return this;
        }

        this.installedPlugins.add(plugin);
        plugin.build(this);

        return this;
    }

    addPlugins(...plugins: Plugin[]): this {
        for (const plugin of plugins) {
            this.addPlugin(plugin);
        }

        return this;
    }

    addSystem(system: System, options: SystemOptions = {}): this {
        this.world.addSystem(system, options);

        return this;
    }

    configureSet(set: SystemSetLabel, options: SystemSetOptions): this {
        this.world.configureSet(set, options);

        return this;
    }

    setFixedTimeStep(seconds: number): this {
        this.world.setFixedTimeStep(seconds);

        return this;
    }

    addMessage<T>(type: MessageType<T>): this {
        this.world.addMessage(type);

        return this;
    }

    setResource<T>(type: ResourceType<T>, value: T): this {
        this.world.setResource(type, value);

        return this;
    }

    removeResource<T>(type: ResourceType<T>): this {
        this.world.removeResource(type);

        return this;
    }

    initState<T extends StateValue>(type: StateType<T>, initial = type.initial): this {
        this.world.initState(type, initial);

        return this;
    }

    addStateSystem<T extends StateValue>(
        type: StateType<T>,
        value: T,
        system: StateSystem<T>
    ): this {
        this.world.addStateSystem(type, value, system);

        return this;
    }

    addTransitionSystem<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: TransitionSystem<T>
    ): this {
        this.world.addTransitionSystem(type, from, to, system);

        return this;
    }

    onEnter<T extends StateValue>(type: StateType<T>, value: T, system: AppSystemCallback): this {
        this.world.onEnter(type, value, system);

        return this;
    }

    onExit<T extends StateValue>(type: StateType<T>, value: T, system: AppSystemCallback): this {
        this.world.onExit(type, value, system);

        return this;
    }

    onTransition<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: AppSystemCallback
    ): this {
        this.world.onTransition(type, from, to, system);

        return this;
    }

    observe<T>(type: EventType<T>, observer: EventObserver<T>): () => void {
        return this.world.observe(type, observer);
    }

    commands(): Commands {
        return this.world.commands();
    }

    update(dt: number): this {
        this.world.update(dt);

        return this;
    }

    shutdown(): this {
        this.world.shutdown();

        return this;
    }
}
