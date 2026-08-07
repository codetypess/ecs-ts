import type { AnyComponentType, ComponentType } from "./component.js";
import type { AnyEventType, EventType } from "./event.js";
import type { AnyMessageType, MessageType } from "./message.js";
import type { AnyResourceType, ResourceType } from "./resource.js";
import type { AnyStateType, StateType, StateValue } from "./state.js";

export type AnyRegistryType =
    | AnyComponentType
    | AnyResourceType
    | AnyStateType
    | AnyMessageType
    | AnyEventType;

export type RegistryTypeKind = "component" | "resource" | "state" | "message" | "event";

export type RegistryTypeKey = string;

/**
 * Registry that owns every typed ECS definition for one domain.
 */
export class Registry {
    private readonly componentTypeTable: AnyComponentType[] = [];
    private readonly resourceTypeTable: AnyResourceType[] = [];
    private readonly stateTypeTable: AnyStateType[] = [];
    private readonly messageTypeTable: AnyMessageType[] = [];
    private readonly eventTypeTable: AnyEventType[] = [];
    private readonly componentTypesByName = new Map<string, AnyComponentType>();
    private readonly resourceTypesByName = new Map<string, AnyResourceType>();
    private readonly stateTypesByName = new Map<string, AnyStateType>();
    private readonly messageTypesByName = new Map<string, AnyMessageType>();
    private readonly eventTypesByName = new Map<string, AnyEventType>();
    private readonly typesByKey = new Map<RegistryTypeKey, AnyRegistryType>();
    private sealed = false;

    constructor(readonly name: string) {
        assertRegistryName(name);
    }

    /** Returns whether this registry can still accept new type definitions. */
    get isSealed(): boolean {
        return this.sealed;
    }

    /** Freezes the registry schema so future definitions fail fast. */
    seal(): this {
        if (!this.sealed) {
            this.sealed = true;
        }

        return this;
    }

    registerComponent<T extends object>(component: ComponentType<T>): ComponentType<T> {
        this.assertCanRegister("component", component.name, this.componentTypesByName);

        for (const dep of component.deps) {
            if (!this.isRegisteredComponent(dep)) {
                throw new Error(
                    `Cannot register component ${component.name} in ${this.name}: dependency ${dep.name} is not registered in ${this.name}`
                );
            }
        }

        this.componentTypeTable.push(component);
        this.componentTypesByName.set(component.name, component);
        this.typesByKey.set(component.key, component);

        return component;
    }

    /** Registers a singleton resource type. */
    registerResource<T>(resource: ResourceType<T>): ResourceType<T> {
        this.assertCanRegister("resource", resource.name, this.resourceTypesByName);
        this.resourceTypeTable.push(resource);
        this.resourceTypesByName.set(resource.name, resource);
        this.typesByKey.set(resource.key, resource);
        return resource;
    }

    /** Registers a named state machine type. */
    registerState<T extends StateValue>(state: StateType<T>): StateType<T> {
        this.assertCanRegister("state", state.name, this.stateTypesByName);
        this.stateTypeTable.push(state);
        this.stateTypesByName.set(state.name, state);
        this.typesByKey.set(state.key, state);
        return state;
    }

    /** Registers a queued message channel. */
    registerMessage<T>(message: MessageType<T>): MessageType<T> {
        this.assertCanRegister("message", message.name, this.messageTypesByName);
        this.messageTypeTable.push(message);
        this.messageTypesByName.set(message.name, message);
        this.typesByKey.set(message.key, message);
        return message;
    }

    /** Registers an immediate observer-style event channel. */
    registerEvent<T>(event: EventType<T>): EventType<T> {
        this.assertCanRegister("event", event.name, this.eventTypesByName);
        this.eventTypeTable.push(event);
        this.eventTypesByName.set(event.name, event);
        this.typesByKey.set(event.key, event);
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
        return this.componentTypesByName.get(type.name) === type;
    }

    /** Returns whether the resource belongs to this registry. */
    isRegisteredResource(type: AnyResourceType): boolean {
        return this.resourceTypesByName.get(type.name) === type;
    }

    /** Returns whether the state machine belongs to this registry. */
    isRegisteredState(type: AnyStateType): boolean {
        return this.stateTypesByName.get(type.name) === type;
    }

    /** Returns whether the message channel belongs to this registry. */
    isRegisteredMessage(type: AnyMessageType): boolean {
        return this.messageTypesByName.get(type.name) === type;
    }

    /** Returns whether the event channel belongs to this registry. */
    isRegisteredEvent(type: AnyEventType): boolean {
        return this.eventTypesByName.get(type.name) === type;
    }

    /** Returns every registered component in definition order. */
    componentTypes(): readonly AnyComponentType[] {
        return [...this.componentTypeTable];
    }

    /** Looks up the component registered for the name. */
    componentTypeByName(name: string): AnyComponentType | undefined {
        return this.componentTypesByName.get(name);
    }

    /** Returns every registered resource in definition order. */
    resourceTypes(): readonly AnyResourceType[] {
        return [...this.resourceTypeTable];
    }

    /** Looks up the resource registered for the name. */
    resourceTypeByName(name: string): AnyResourceType | undefined {
        return this.resourceTypesByName.get(name);
    }

    /** Returns every registered state in definition order. */
    stateTypes(): readonly AnyStateType[] {
        return [...this.stateTypeTable];
    }

    /** Looks up the state machine registered for the name. */
    stateTypeByName(name: string): AnyStateType | undefined {
        return this.stateTypesByName.get(name);
    }

    /** Returns every registered message in definition order. */
    messageTypes(): readonly AnyMessageType[] {
        return [...this.messageTypeTable];
    }

    /** Looks up the message channel registered for the name. */
    messageTypeByName(name: string): AnyMessageType | undefined {
        return this.messageTypesByName.get(name);
    }

    /** Returns every registered event in definition order. */
    eventTypes(): readonly AnyEventType[] {
        return [...this.eventTypeTable];
    }

    /** Looks up the event channel registered for the name. */
    eventTypeByName(name: string): AnyEventType | undefined {
        return this.eventTypesByName.get(name);
    }

    /** Looks up any registry-owned type by its stable key. */
    typeByKey(key: RegistryTypeKey): AnyRegistryType | undefined {
        return this.typesByKey.get(key);
    }

    private assertCanRegister<TType>(
        kind: RegistryTypeKind,
        name: string,
        typesByName: ReadonlyMap<string, TType>
    ): void {
        assertTypeName(kind, name);

        if (this.sealed) {
            throw new Error(`Cannot register ${kind} ${name} in ${this.name}: registry is sealed`);
        }

        if (typesByName.has(name)) {
            throw new Error(
                `Cannot register ${kind} ${name} in ${this.name}: name is already used`
            );
        }
    }
}

/** Creates a registry for one ECS domain. */
export function createRegistry(name: string): Registry {
    return new Registry(name);
}

function assertRegistryName(name: string): void {
    if (name.trim().length === 0) {
        throw new Error("Registry name must be a non-empty string");
    }
}

function assertTypeName(kind: RegistryTypeKind, name: string): void {
    if (name.trim().length === 0) {
        throw new Error(`Cannot define ${kind}: name must be a non-empty string`);
    }
}
