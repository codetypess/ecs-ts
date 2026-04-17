/** Returns the existing indexed entry or creates and stores it once. */
export function ensureIndexedEntry<T>(
    entries: (T | undefined)[],
    index: number,
    create: () => T
): T {
    const existing = entries[index];

    if (existing !== undefined) {
        return existing;
    }

    const created = create();
    entries[index] = created;

    return created;
}

/** Returns the existing map entry or creates and stores it once. */
export function ensureMapEntry<TKey, TValue>(
    map: Map<TKey, TValue>,
    key: TKey,
    create: () => TValue
): TValue {
    const existing = map.get(key);

    if (existing !== undefined) {
        return existing;
    }

    const created = create();
    map.set(key, created);

    return created;
}
