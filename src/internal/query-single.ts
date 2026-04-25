/** Returns the only row from an iterator, or `undefined` when there are no rows. */
export function getSingleResult<TRow>(iterator: Iterator<TRow>): TRow | undefined {
    const first = iterator.next();

    if (first.done === true) {
        return undefined;
    }

    const second = iterator.next();

    if (second.done !== true) {
        throw new Error("Expected at most one query result");
    }

    return first.value;
}

/** Returns the only row or throws when the iterator had zero or multiple rows. */
export function mustGetSingleResult<TRow>(row: TRow | undefined): TRow {
    if (row === undefined) {
        throw new Error("Expected exactly one query result");
    }

    return row;
}
