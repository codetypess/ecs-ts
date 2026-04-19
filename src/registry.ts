import type {
    AnyComponentType,
    ComponentDataWithTemplate,
    ComponentOptions,
    ComponentType,
} from "./component";
import type { AnyEventType, EventType } from "./event";
import type { AnyMessageType, MessageType } from "./message";
import type { AnyResourceType, ResourceType } from "./resource";
import type { AnyStateType, StateType, StateValue } from "./state";

export type AnyRegistryType =
    | AnyComponentType
    | AnyResourceType
    | AnyStateType
    | AnyMessageType
    | AnyEventType;

type DefineComponentArgs<T extends object> = [name: string, options?: ComponentOptions<T>];

/**
 * Registry that owns every typed ECS definition for one domain.
 */
export class Registry {
    private nextComponentId = 0;
    private nextResourceId = 0;
    private nextStateId = 0;
    private nextMessageId = 0;
    private nextEventId = 0;
    private readonly componentTypes: AnyComponentType[] = [];
    private readonly resourceTypes: AnyResourceType[] = [];
    private readonly stateTypes: AnyStateType[] = [];
    private readonly messageTypes: AnyMessageType[] = [];
    private readonly eventTypes: AnyEventType[] = [];

    constructor(readonly name: string) {}

    /** Defines a marker component whose payload is always `{}`. */
    defineComponent(
        name: string,
        options?: ComponentOptions<Record<string, never>>
    ): ComponentType<Record<string, never>>;

    /** Defines a component whose payload type reuses another object component's payload. */
    defineComponent<TOwn extends object, TTemplate extends ComponentType<object>>(
        ...args: DefineComponentArgs<ComponentDataWithTemplate<TOwn, TTemplate>>
    ): ComponentType<ComponentDataWithTemplate<TOwn, TTemplate>>;

    /** Defines a component type and freezes its runtime metadata. */
    defineComponent<T extends object>(...args: DefineComponentArgs<T>): ComponentType<T>;
    defineComponent<T extends object>(
        name: string,
        options: ComponentOptions<T> = {} as ComponentOptions<T>
    ): ComponentType<T> {
        const { require = [], ...lifecycle } = options;
        const normalizedRequired = Object.freeze([...require]);

        for (const dependency of normalizedRequired) {
            if (!this.isRegisteredComponent(dependency.type)) {
                throw new Error(
                    `Component ${dependency.type.name} is not registered in ${this.name}`
                );
            }
        }

        const component = Object.freeze({
            id: this.nextComponentId++,
            name,
            registry: this,
            lifecycle: Object.freeze({ ...lifecycle }),
            required: normalizedRequired,
        }) satisfies ComponentType<T>;

        this.componentTypes[component.id] = component;

        return component;
    }

    /** Defines a singleton resource slot. */
    defineResource<T>(name: string): ResourceType<T> {
        const resource = Object.freeze({
            id: this.nextResourceId++,
            name,
            registry: this,
        }) satisfies ResourceType<T>;

        this.resourceTypes[resource.id] = resource;

        return resource;
    }

    /** Defines a named state machine slot with its default value. */
    defineState<T extends StateValue>(name: string, initial: T): StateType<T> {
        const state = Object.freeze({
            id: this.nextStateId++,
            name,
            registry: this,
            initial,
        }) satisfies StateType<T>;

        this.stateTypes[state.id] = state;

        return state;
    }

    /** Defines a queued message channel. */
    defineMessage<T>(name: string): MessageType<T> {
        const message = Object.freeze({
            id: this.nextMessageId++,
            name,
            registry: this,
        }) satisfies MessageType<T>;

        this.messageTypes[message.id] = message;

        return message;
    }

    /** Defines an immediate observer-style event channel. */
    defineEvent<T>(name: string): EventType<T> {
        const event = Object.freeze({
            id: this.nextEventId++,
            name,
            registry: this,
        }) satisfies EventType<T>;

        this.eventTypes[event.id] = event;

        return event;
    }

    /** Returns whether the type belongs to this registry. */
    isRegistered(type: AnyRegistryType): boolean {
        return (
            this.isRegisteredComponent(type as AnyComponentType) ||
            this.isRegisteredResource(type as AnyResourceType) ||
            this.isRegisteredState(type as AnyStateType) ||
            this.isRegisteredMessage(type as AnyMessageType) ||
            this.isRegisteredEvent(type as AnyEventType)
        );
    }

    /** Returns whether the component belongs to this registry. */
    isRegisteredComponent(type: AnyComponentType): boolean {
        return type.registry === this && this.componentTypes[type.id] === type;
    }

    /** Returns whether the resource belongs to this registry. */
    isRegisteredResource(type: AnyResourceType): boolean {
        return type.registry === this && this.resourceTypes[type.id] === type;
    }

    /** Returns whether the state machine belongs to this registry. */
    isRegisteredState(type: AnyStateType): boolean {
        return type.registry === this && this.stateTypes[type.id] === type;
    }

    /** Returns whether the message channel belongs to this registry. */
    isRegisteredMessage(type: AnyMessageType): boolean {
        return type.registry === this && this.messageTypes[type.id] === type;
    }

    /** Returns whether the event channel belongs to this registry. */
    isRegisteredEvent(type: AnyEventType): boolean {
        return type.registry === this && this.eventTypes[type.id] === type;
    }

    /** Looks up the component registered for the numeric id. */
    componentType(id: number): AnyComponentType | undefined {
        return this.componentTypes[id];
    }

    /** Looks up the resource registered for the numeric id. */
    resourceType(id: number): AnyResourceType | undefined {
        return this.resourceTypes[id];
    }

    /** Looks up the state machine registered for the numeric id. */
    stateType(id: number): AnyStateType | undefined {
        return this.stateTypes[id];
    }

    /** Looks up the message channel registered for the numeric id. */
    messageType(id: number): AnyMessageType | undefined {
        return this.messageTypes[id];
    }

    /** Looks up the event channel registered for the numeric id. */
    eventType(id: number): AnyEventType | undefined {
        return this.eventTypes[id];
    }
}

/** Creates a registry for one ECS domain. */
export function createRegistry(name: string): Registry {
    return new Registry(name);
}
