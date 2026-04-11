let nextResourceId = 0;

declare const ResourceTypeBrand: unique symbol;

export interface ResourceType<T> {
    readonly id: number;
    readonly name: string;
    readonly [ResourceTypeBrand]?: T;
}

export type ResourceData<TResource extends ResourceType<unknown>> =
    TResource extends ResourceType<infer TData> ? TData : never;

export function defineResource<T>(name: string): ResourceType<T> {
    return Object.freeze({
        id: nextResourceId++,
        name,
    });
}
