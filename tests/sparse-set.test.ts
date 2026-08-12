import assert from "node:assert/strict";
import { test } from "node:test";
import type { Entity } from "../src";
import { SparseSet } from "../src/sparse-set";

test("sparse set compacts deferred holes without sorting deletion indices", () => {
    const store = new SparseSet<{ value: number }>();
    const first = 1 as Entity;
    const second = 2 as Entity;
    const third = 3 as Entity;
    const fourth = 4 as Entity;
    const firstValue = { value: 1 };
    const secondValue = { value: 2 };
    const thirdValue = { value: 3 };
    const fourthValue = { value: 4 };

    store.set(first, firstValue, 1);
    store.set(second, secondValue, 1);
    store.set(third, thirdValue, 1);
    store.set(fourth, fourthValue, 1);

    assert.equal(store.delete(fourth, true), true);
    assert.equal(store.delete(second, true), true);
    assert.equal(store.size, 2);
    assert.deepEqual(store.values, [firstValue, undefined, thirdValue, undefined]);
    assert.equal(store.get(second), undefined);
    assert.equal(store.get(fourth), undefined);

    store.compact();

    assert.equal(store.size, 2);
    assert.deepEqual(store.entities, [first, third]);
    assert.deepEqual(store.values, [firstValue, thirdValue]);
    assert.equal(store.get(first), firstValue);
    assert.equal(store.get(third), thirdValue);
});
