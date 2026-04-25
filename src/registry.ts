import type {
    AnyComponentType,
    ComponentDataWithTemplate,
    ComponentLifecycle,
    ComponentOptions,
    ComponentType,
} from "./component.js";
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
    private nextComponentId = 0;
    private nextResourceId = 0;
    private nextStateId = 0;
    private nextMessageId = 0;
    private nextEventId = 0;
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

    /** Defines a marker component whose payload is always `{}`. */
    defineComponent(
        name: string,
        options?: ComponentOptions<Record<string, never>>
    ): ComponentType<Record<string, never>>;

    /** Defines a component whose payload type reuses another object component's payload. */
    defineComponent<TOwn extends object, TTemplate extends ComponentType<object>>(
        name: string,
        options?: ComponentOptions<ComponentDataWithTemplate<TOwn, TTemplate>>
    ): ComponentType<ComponentDataWithTemplate<TOwn, TTemplate>>;

    /** Defines a component type and freezes its runtime metadata. */
    defineComponent<T extends object>(
        name: string,
        options?: ComponentOptions<T>
    ): ComponentType<T>;
    defineComponent<T extends object>(
        name: string,
        options: ComponentOptions<T> = {} as ComponentOptions<T>
    ): ComponentType<T> {
        this.assertCanDefine("component", name, this.componentTypesByName);
        const deps = this.normalizeComponentDeps(name, options.deps);
        const lifecycle = this.createComponentLifecycle(options);

        const component = Object.freeze({
            id: this.nextComponentId++,
            key: this.typeKey("component", name),
            name,
            registry: this,
            deps,
            lifecycle,
        }) satisfies ComponentType<T>;

        this.componentTypeTable[component.id] = component;
        this.componentTypesByName.set(component.name, component);
        this.typesByKey.set(component.key, component);

        return component;
    }

    /** Defines a singleton resource slot. */
    defineResource<T>(name: string): ResourceType<T> {
        this.assertCanDefine("resource", name, this.resourceTypesByName);
        const resource = Object.freeze({
            id: this.nextResourceId++,
            key: this.typeKey("resource", name),
            name,
            registry: this,
        }) satisfies ResourceType<T>;

        this.resourceTypeTable[resource.id] = resource;
        this.resourceTypesByName.set(resource.name, resource);
        this.typesByKey.set(resource.key, resource);

        return resource;
    }

    /** Defines a named state machine slot with its default value. */
    defineState<T extends StateValue>(name: string, initial: T): StateType<T> {
        this.assertCanDefine("state", name, this.stateTypesByName);
        const state = Object.freeze({
            id: this.nextStateId++,
            key: this.typeKey("state", name),
            name,
            registry: this,
            initial,
        }) satisfies StateType<T>;

        this.stateTypeTable[state.id] = state;
        this.stateTypesByName.set(state.name, state);
        this.typesByKey.set(state.key, state);

        return state;
    }

    /** Defines a queued message channel. */
    defineMessage<T>(name: string): MessageType<T> {
        this.assertCanDefine("message", name, this.messageTypesByName);
        const message = Object.freeze({
            id: this.nextMessageId++,
            key: this.typeKey("message", name),
            name,
            registry: this,
        }) satisfies MessageType<T>;

        this.messageTypeTable[message.id] = message;
        this.messageTypesByName.set(message.name, message);
        this.typesByKey.set(message.key, message);

        return message;
    }

    /** Defines an immediate observer-style event channel. */
    defineEvent<T>(name: string): EventType<T> {
        this.assertCanDefine("event", name, this.eventTypesByName);
        const event = Object.freeze({
            id: this.nextEventId++,
            key: this.typeKey("event", name),
            name,
            registry: this,
        }) satisfies EventType<T>;

        this.eventTypeTable[event.id] = event;
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
        return type.registry === this && this.componentTypeTable[type.id] === type;
    }

    /** Returns whether the resource belongs to this registry. */
    isRegisteredResource(type: AnyResourceType): boolean {
        return type.registry === this && this.resourceTypeTable[type.id] === type;
    }

    /** Returns whether the state machine belongs to this registry. */
    isRegisteredState(type: AnyStateType): boolean {
        return type.registry === this && this.stateTypeTable[type.id] === type;
    }

    /** Returns whether the message channel belongs to this registry. */
    isRegisteredMessage(type: AnyMessageType): boolean {
        return type.registry === this && this.messageTypeTable[type.id] === type;
    }

    /** Returns whether the event channel belongs to this registry. */
    isRegisteredEvent(type: AnyEventType): boolean {
        return type.registry === this && this.eventTypeTable[type.id] === type;
    }

    /** Looks up the component registered for the numeric id. */
    componentType(id: number): AnyComponentType | undefined {
        return this.componentTypeTable[id];
    }

    /** Returns every registered component in definition order. */
    componentTypes(): readonly AnyComponentType[] {
        return [...this.componentTypeTable];
    }

    /** Looks up the component registered for the name. */
    componentTypeByName(name: string): AnyComponentType | undefined {
        return this.componentTypesByName.get(name);
    }

    /** Looks up the resource registered for the numeric id. */
    resourceType(id: number): AnyResourceType | undefined {
        return this.resourceTypeTable[id];
    }

    /** Returns every registered resource in definition order. */
    resourceTypes(): readonly AnyResourceType[] {
        return [...this.resourceTypeTable];
    }

    /** Looks up the resource registered for the name. */
    resourceTypeByName(name: string): AnyResourceType | undefined {
        return this.resourceTypesByName.get(name);
    }

    /** Looks up the state machine registered for the numeric id. */
    stateType(id: number): AnyStateType | undefined {
        return this.stateTypeTable[id];
    }

    /** Returns every registered state in definition order. */
    stateTypes(): readonly AnyStateType[] {
        return [...this.stateTypeTable];
    }

    /** Looks up the state machine registered for the name. */
    stateTypeByName(name: string): AnyStateType | undefined {
        return this.stateTypesByName.get(name);
    }

    /** Looks up the message channel registered for the numeric id. */
    messageType(id: number): AnyMessageType | undefined {
        return this.messageTypeTable[id];
    }

    /** Returns every registered message in definition order. */
    messageTypes(): readonly AnyMessageType[] {
        return [...this.messageTypeTable];
    }

    /** Looks up the message channel registered for the name. */
    messageTypeByName(name: string): AnyMessageType | undefined {
        return this.messageTypesByName.get(name);
    }

    /** Looks up the event channel registered for the numeric id. */
    eventType(id: number): AnyEventType | undefined {
        return this.eventTypeTable[id];
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

    private assertCanDefine<TType>(
        kind: RegistryTypeKind,
        name: string,
        typesByName: ReadonlyMap<string, TType>
    ): void {
        assertTypeName(kind, name);

        if (this.sealed) {
            throw new Error(`Cannot define ${kind} ${name} in ${this.name}: registry is sealed`);
        }

        if (typesByName.has(name)) {
            throw new Error(`Cannot define ${kind} ${name} in ${this.name}: name is already used`);
        }
    }

    private typeKey(kind: RegistryTypeKind, name: string): RegistryTypeKey {
        return `${this.name}/${kind}/${name}`;
    }

    private normalizeComponentDeps(
        componentName: string,
        deps: readonly AnyComponentType[] | undefined
    ): readonly AnyComponentType[] {
        if (deps === undefined || deps.length === 0) {
            return Object.freeze([]);
        }

        const seen = new Set<number>();
        const normalized: AnyComponentType[] = [];

        for (const dep of deps) {
            if (!this.isRegisteredComponent(dep)) {
                throw new Error(
                    `Cannot define component ${componentName} in ${this.name}: dependency ${dep.name} is not registered in ${this.name}`
                );
            }

            if (seen.has(dep.id)) {
                throw new Error(
                    `Cannot define component ${componentName} in ${this.name}: dependency ${dep.name} is duplicated`
                );
            }

            seen.add(dep.id);
            normalized.push(dep);
        }

        return Object.freeze(normalized);
    }

    private createComponentLifecycle<T extends object>(
        options: ComponentOptions<T>
    ): Readonly<ComponentLifecycle<T>> {
        return Object.freeze({
            onAdd: options.onAdd,
            onInsert: options.onInsert,
            onReplace: options.onReplace,
            onRemove: options.onRemove,
            onDespawn: options.onDespawn,
        });
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
