import type { Registry } from "./registry.js";
import { assertRegisteredType } from "./registry.js";

declare const ResourceTypeBrand: unique symbol;

/** Runtime handle used to store a singleton resource value in the world. */
export interface ResourceType<T> {
    readonly id: number;
    readonly key: string;
    readonly name: string;
    readonly registry: Registry;
    readonly [ResourceTypeBrand]?: T;
}

export type AnyResourceType = ResourceType<unknown>;

export type ResourceData<TResource extends ResourceType<unknown>> =
    TResource extends ResourceType<infer TData> ? TData : never;

/** Throws unless the resource belongs to the expected registry. */
export function assertRegisteredResource(
    registry: Registry,
    type: AnyResourceType,
    action: string
): void {
    assertRegisteredType(registry, type, "resource", action);
}
