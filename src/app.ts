import type { EventObserver, EventType } from "./event";
import type { MessageType } from "./message";
import type { ResourceType } from "./resource";
import type { ScheduleStage, SystemOptions, SystemSetLabel, SystemSetOptions } from "./scheduler";
import type { StateType, StateValue } from "./state";
import type { StateSystem, System, TransitionSystem } from "./system";
import type { Commands } from "./commands";
import { World } from "./world";

/** Small extension unit that can register systems, resources, and observers on an app. */
export interface Plugin {
    build(app: App): void;
}

type AppSystemCallback = (world: World, dt: number, commands: Commands) => void;

/** Thin convenience wrapper around a `World` with plugin-oriented helpers. */
export class App {
    private readonly installedPlugins = new Set<Plugin>();
    readonly world: World;

    constructor(world = new World()) {
        this.world = world;
    }

    /** Installs a plugin once and lets it mutate the app during `build()`. */
    addPlugin(plugin: Plugin): this {
        if (this.installedPlugins.has(plugin)) {
            return this;
        }

        this.installedPlugins.add(plugin);
        plugin.build(this);

        return this;
    }

    /** Installs multiple plugins in order. */
    addPlugins(...plugins: Plugin[]): this {
        for (const plugin of plugins) {
            this.addPlugin(plugin);
        }

        return this;
    }

    /** Proxies `World.addSystem` for plugin-friendly chaining. */
    addSystem(system: System, options: SystemOptions = {}): this {
        return this.useWorld((world) => world.addSystem(system, options));
    }

    /** Proxies global set configuration. */
    configureSet(set: SystemSetLabel, options: SystemSetOptions): this {
        return this.useWorld((world) => world.configureSet(set, options));
    }

    /** Proxies stage-local set configuration. */
    configureSetForStage(
        stage: ScheduleStage,
        set: SystemSetLabel,
        options: SystemSetOptions
    ): this {
        return this.useWorld((world) => world.configureSetForStage(stage, set, options));
    }

    /** Proxies fixed-step configuration. */
    setFixedTimeStep(seconds: number): this {
        return this.useWorld((world) => world.setFixedTimeStep(seconds));
    }

    /** Registers a message channel up front. */
    addMessage<T>(type: MessageType<T>): this {
        return this.useWorld((world) => world.addMessage(type));
    }

    /** Proxies resource insertion or replacement. */
    setResource<T>(type: ResourceType<T>, value: T): this {
        return this.useWorld((world) => world.setResource(type, value));
    }

    /** Proxies resource removal. */
    removeResource<T>(type: ResourceType<T>): this {
        return this.useWorld((world) => world.removeResource(type));
    }

    /** Initializes a state machine if it has not been created already. */
    initState<T extends StateValue>(type: StateType<T>, initial = type.initial): this {
        return this.useWorld((world) => world.initState(type, initial));
    }

    /** Adds enter/exit callbacks for a concrete state value. */
    addStateSystem<T extends StateValue>(
        type: StateType<T>,
        value: T,
        system: StateSystem<T>
    ): this {
        return this.useWorld((world) => world.addStateSystem(type, value, system));
    }

    /** Adds a callback for a concrete state transition pair. */
    addTransitionSystem<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: TransitionSystem<T>
    ): this {
        return this.useWorld((world) => world.addTransitionSystem(type, from, to, system));
    }

    /** Registers an `onEnter` callback without requiring a `StateSystem` object. */
    onEnter<T extends StateValue>(type: StateType<T>, value: T, system: AppSystemCallback): this {
        return this.useWorld((world) => world.onEnter(type, value, system));
    }

    /** Registers an `onExit` callback without requiring a `StateSystem` object. */
    onExit<T extends StateValue>(type: StateType<T>, value: T, system: AppSystemCallback): this {
        return this.useWorld((world) => world.onExit(type, value, system));
    }

    /** Registers an `onTransition` callback without requiring a `TransitionSystem` object. */
    onTransition<T extends StateValue>(
        type: StateType<T>,
        from: T,
        to: T,
        system: AppSystemCallback
    ): this {
        return this.useWorld((world) => world.onTransition(type, from, to, system));
    }

    /** Registers an immediate observer and returns an unsubscribe callback. */
    observe<T>(type: EventType<T>, observer: EventObserver<T>): () => void {
        return this.world.observe(type, observer);
    }

    /** Creates a deferred command queue bound to the underlying world. */
    commands(): Commands {
        return this.world.commands();
    }

    /** Advances the world by one frame. */
    update(dt: number): this {
        return this.useWorld((world) => world.update(dt));
    }

    /** Runs shutdown systems once. */
    shutdown(): this {
        return this.useWorld((world) => world.shutdown());
    }

    private useWorld(visitor: (world: World) => void): this {
        visitor(this.world);
        return this;
    }
}
