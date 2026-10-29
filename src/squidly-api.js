export async function callSquidly(method, ...args) {
	try {
		const api = globalThis.SquidlyAPI;
		const callback = api?.[method];
		if (typeof callback !== "function") return false;

		await callback.apply(api, args);
		return true;
	} catch (error) {
		console.warn(`SquidlyAPI.${method} failed; continuing locally.`, error);
		return false;
	}
}
