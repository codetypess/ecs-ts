/** Shared state for guarding callback queries and detecting iterator invalidation. */
export interface QueryMutationContext {
    activeEachDepth: number;
    structuralVersion: number;
}

/** Creates mutation tracking state owned by one world. */
export function createQueryMutationContext(): QueryMutationContext {
    return {
        activeEachDepth: 0,
        structuralVersion: 0,
    };
}

/** Runs a callback query while direct structural writes are forbidden. */
export function runWithQueryMutationGuard<T>(context: QueryMutationContext, run: () => T): T {
    context.activeEachDepth++;

    try {
        return run();
    } finally {
        context.activeEachDepth--;
    }
}

/** Rejects structural writes made synchronously from an `each` visitor. */
export function assertStructuralWriteAllowed(context: QueryMutationContext, action: string): void {
    if (context.activeEachDepth === 0) {
        return;
    }

    throw new Error(
        `Cannot ${action} during query iteration; queue structural changes with DeferredCommands instead`
    );
}

/** Records a successful entity/component membership change. */
export function recordStructuralChange(context: QueryMutationContext): void {
    context.structuralVersion++;
}

/** Rejects continued use of a lazy iterator after a structural change. */
export function assertStructuralVersion(
    context: QueryMutationContext,
    expectedVersion: number
): void {
    if (context.structuralVersion === expectedVersion) {
        return;
    }

    throw new Error(
        "World structure changed during query iteration; queue structural changes with DeferredCommands instead"
    );
}
