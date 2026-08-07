declare const ResourceTypeBrand: unique symbol;

/** Runtime handle used to store a singleton resource value in the world. */
export interface ResourceType<T> {
    readonly key: string;
    readonly name: string;
    readonly [ResourceTypeBrand]?: T;
}

export type AnyResourceType = ResourceType<unknown>;

export type ResourceData<TResource extends ResourceType<unknown>> =
    TResource extends ResourceType<infer TData> ? TData : never;

/** Defines a singleton resource type independently from any registry. */
export function defineResource<T>(name: string): ResourceType<T> {
    assertResourceName(name);

    return Object.freeze({
        key: `resource/${name}`,
        name,
    } satisfies ResourceType<T>);
}

/** Throws unless the resource belongs to the expected registry. */
export function assertRegisteredResource(
    registry: { readonly name: string; isRegisteredResource(type: AnyResourceType): boolean },
    type: AnyResourceType,
    action: string
): void {
    if (registry.isRegisteredResource(type)) {
        return;
    }

    throw new Error(
        `Cannot ${action} resource ${type.name}: it is not registered in ${registry.name}`
    );
}

function assertResourceName(name: string): void {
    if (name.trim().length === 0) {
        throw new Error("Cannot define resource: name must be a non-empty string");
    }
}
