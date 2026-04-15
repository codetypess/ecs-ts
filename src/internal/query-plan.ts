import type { SparseSet } from "../sparse-set";

export type QueryFilterMode = "unfiltered" | "structural" | "change";

export interface ResolvedQueryFilter {
    readonly with: readonly SparseSet<unknown>[];
    readonly without: readonly SparseSet<unknown>[];
    readonly or: readonly SparseSet<unknown>[];
    readonly added: readonly SparseSet<unknown>[];
    readonly changed: readonly SparseSet<unknown>[];
}

export interface ResolvedQueryPlan {
    readonly stores: readonly SparseSet<unknown>[];
    readonly filterStores: ResolvedQueryFilter;
    readonly baseStore: SparseSet<unknown>;
    readonly filterMode: QueryFilterMode;
}

export interface ResolvedOptionalQueryPlan {
    readonly requiredStores: readonly SparseSet<unknown>[];
    readonly optionalStores: readonly (SparseSet<unknown> | undefined)[];
    readonly filterStores: ResolvedQueryFilter;
    readonly baseStore: SparseSet<unknown>;
    readonly filterMode: QueryFilterMode;
}

export interface QueryStateCache {
    readonly storeVersion: number;
    readonly plan?: ResolvedQueryPlan;
}

export interface OptionalQueryStateCache {
    readonly storeVersion: number;
    readonly plan?: ResolvedOptionalQueryPlan;
}
