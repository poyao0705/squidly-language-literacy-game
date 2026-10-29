import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { callSquidly } from "../src/squidly-api.js";

const originalApi = Object.getOwnPropertyDescriptor(globalThis, "SquidlyAPI");
afterEach(() => {
	if (originalApi) Object.defineProperty(globalThis, "SquidlyAPI", originalApi);
	else delete globalThis.SquidlyAPI;
});

test("missing API and unavailable methods are optional", async () => {
	for (const api of [undefined, null, {}, { speak: true }]) {
		globalThis.SquidlyAPI = api;
		assert.equal(await callSquidly("speak", "cat"), false);
	}
});

test("successful calls preserve the API receiver and arguments", async () => {
	const api = {
		values: {},
		firebaseSet(key, value) {
			this.values[key] = value;
		},
	};
	globalThis.SquidlyAPI = api;
	assert.equal(await callSquidly("firebaseSet", "wordBuildingUnit", "1"), true);
	assert.deepEqual(api.values, { wordBuildingUnit: "1" });
});

test("asynchronous calls finish before reporting success", async () => {
	const spoken = [];
	globalThis.SquidlyAPI = {
		async speak(text) {
			await Promise.resolve();
			spoken.push(text);
		},
	};
	assert.equal(await callSquidly("speak", "cat"), true);
	assert.deepEqual(spoken, ["cat"]);
});

test("synchronous API failures return false rather than throwing", async (t) => {
	t.mock.method(console, "warn", () => {});
	globalThis.SquidlyAPI = {
		firebaseSet() {
			throw new Error("Squidly unavailable");
		},
	};
	assert.equal(await callSquidly("firebaseSet", "state", "menu"), false);
});

test("rejected API promises return false rather than rejecting", async (t) => {
	t.mock.method(console, "warn", () => {});
	globalThis.SquidlyAPI = {
		async speak() {
			throw new Error("Squidly unavailable");
		},
	};
	assert.equal(await callSquidly("speak", "cat"), false);
});

test("API lookup failures are contained at the optional boundary", async (t) => {
	t.mock.method(console, "warn", () => {});
	Object.defineProperty(globalThis, "SquidlyAPI", {
		configurable: true,
		get() {
			throw new Error("SDK failed to initialize");
		},
	});
	assert.equal(await callSquidly("speak", "cat"), false);
});

test("each call uses the currently available API", async () => {
	delete globalThis.SquidlyAPI;
	assert.equal(await callSquidly("speak", "cat"), false);
	const spoken = [];
	globalThis.SquidlyAPI = { speak: (text) => spoken.push(text) };
	assert.equal(await callSquidly("speak", "cat"), true);
	assert.deepEqual(spoken, ["cat"]);
});
