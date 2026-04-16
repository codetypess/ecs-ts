let nextResourceId = 0;

declare const ResourceTypeBrand: unique symbol;

/** Runtime handle used to store a singleton resource value in the world. */
export interface ResourceType<T> {
    readonly id: number;
    readonly name: string;
    readonly [ResourceTypeBrand]?: T;
}

export type ResourceData<TResource extends ResourceType<unknown>> =
    TResource extends ResourceType<infer TData> ? TData : never;

/** Defines a resource slot keyed by a stable numeric id. */
export function defineResource<T>(name: string): ResourceType<T> {
    return Object.freeze({
        id: nextResourceId++,
        name,
    });
}
