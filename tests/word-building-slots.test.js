import assert from "node:assert/strict";
import test from "node:test";
import {
	normalizeSlotTileIds,
	placeTileInSlot,
} from "../src/game/word-building-slots.js";

const question = {
	answerParts: ["c", "a", "t"],
	tiles: [
		{ id: "c", value: "c" },
		{ id: "a", value: "a" },
		{ id: "t", value: "t" },
	],
};

test("normalizes legacy compact answers from the first slot", () => {
	assert.deepEqual(normalizeSlotTileIds(question, ["c"]), ["c", null, null]);
	assert.deepEqual(normalizeSlotTileIds(question, undefined), [
		null,
		null,
		null,
	]);
});

test("preserves empty positions and truncates excess saved slots", () => {
	assert.deepEqual(normalizeSlotTileIds(question, [null, "a", "t"]), [
		null,
		"a",
		"t",
	]);
	assert.deepEqual(normalizeSlotTileIds(question, ["c", null, "t", "a"]), [
		"c",
		null,
		"t",
	]);
});

test("clears unknown and duplicate saved tile IDs without shifting neighbors", () => {
	assert.deepEqual(normalizeSlotTileIds(question, ["c", "unknown", "c"]), [
		"c",
		null,
		null,
	]);
});

test("places a known unused tile in the requested empty slot without mutating input", () => {
	const empty = [null, null, null];

	assert.deepEqual(placeTileInSlot(question, empty, "t", 2), [null, null, "t"]);
	assert.deepEqual(empty, [null, null, null]);
});

test("rejects occupied slots, already-used tiles, and unknown tile IDs", () => {
	assert.equal(placeTileInSlot(question, [null, null, "t"], "c", 2), null);
	assert.equal(placeTileInSlot(question, [null, null, "t"], "t", 0), null);
	assert.equal(
		placeTileInSlot(question, [null, null, null], "missing", 0),
		null,
	);
});

test("rejects malformed slot arrays and invalid slot indices", () => {
	assert.equal(placeTileInSlot(question, [null, null], "c", 0), null);
	assert.equal(placeTileInSlot(question, [null, null, null], "c", -1), null);
	assert.equal(placeTileInSlot(question, [null, null, null], "c", 3), null);
	assert.equal(placeTileInSlot(question, [null, null, null], "c", 0.5), null);
});

test("preserves repeated letter identity and nulls through JSON progress round trips", () => {
	const repeatedLetters = {
		answerParts: ["l", "l", "p"],
		tiles: [
			{ id: "first-l", value: "l" },
			{ id: "second-l", value: "l" },
			{ id: "p", value: "p" },
		],
	};
	const placed = placeTileInSlot(
		repeatedLetters,
		[null, null, null],
		"second-l",
		1,
	);
	const restored = normalizeSlotTileIds(
		repeatedLetters,
		JSON.parse(JSON.stringify(placed)),
	);

	assert.deepEqual(placed, [null, "second-l", null]);
	assert.deepEqual(restored, [null, "second-l", null]);
	assert.deepEqual(placeTileInSlot(repeatedLetters, restored, "first-l", 0), [
		"first-l",
		"second-l",
		null,
	]);
});
