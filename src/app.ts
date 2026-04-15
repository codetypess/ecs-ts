import type { EventObserver, EventType } from "./event";
import type { MessageType } from "./message";
import type { ResourceType } from "./resource";
import type { ScheduleStage, SystemOptions, SystemSetLabel, SystemSetOptions } from "./scheduler";
import type { StateType, StateValue } from "./state";
import type { StateSystem, System, TransitionSystem } from "./system";
import type { Commands } from "./commands";
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
        return this.useWorld((world) => world.addSystem(system, options));
    }

    configureSet(set: SystemSetLabel, options: SystemSetOptions): this {
        return this.useWorld((world) => world.configureSet(set, options));
    }

    configureSetForStage(
        stage: ScheduleStage,
        set: SystemSetLabel,
        options: SystemSetOptions
    ): this {
        return this.useWorld((world) => world.configureSetForStage(stage, set, options));
    }

    setFixedTimeStep(seconds: number): this {
        return this.useWorld((world) => world.setFixedTimeStep(seconds));
    }

    addMessage<T>(type: MessageType<T>): this {
        return this.useWorld((world) => world.addMessage(type));
    }

    setResource<T>(type: ResourceType<T>, value: T): this {
        return this.useWorld((world) => world.setResource(type, value));
    }

    removeResource<T>(type: ResourceType<T>): this {
        return this.useWorld((world) => world.removeResource(type));
    }

    initState<T extends StateValue>(type: StateType<T>, initial = type.initial): this {
        return this.useWorld((world) => world.initState(type, initial));
    }

    addStateSystem<T extends StateValue>(
        type: StateType<T>,
        value: T,
        system: StateSystem<T>
    ): this {
        return this.useWorld((world) => world.addStateSystem(type, value, system));
    }

    addTransitionSystem<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: TransitionSystem<T>
    ): this {
        return this.useWorld((world) => world.addTransitionSystem(type, from, to, system));
    }

    onEnter<T extends StateValue>(type: StateType<T>, value: T, system: AppSystemCallback): this {
        return this.useWorld((world) => world.onEnter(type, value, system));
    }

    onExit<T extends StateValue>(type: StateType<T>, value: T, system: AppSystemCallback): this {
        return this.useWorld((world) => world.onExit(type, value, system));
    }

    onTransition<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: AppSystemCallback
    ): this {
        return this.useWorld((world) => world.onTransition(type, from, to, system));
    }

    observe<T>(type: EventType<T>, observer: EventObserver<T>): () => void {
        return this.world.observe(type, observer);
    }

    commands(): Commands {
        return this.world.commands();
    }

    update(dt: number): this {
        return this.useWorld((world) => world.update(dt));
    }

    shutdown(): this {
        return this.useWorld((world) => world.shutdown());
    }

    private useWorld(visitor: (world: World) => void): this {
        visitor(this.world);
        return this;
    }
}
