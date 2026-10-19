export function normalizeSlotTileIds(question, rawIds) {
	const slotCount = Array.isArray(question?.answerParts)
		? question.answerParts.length
		: 0;
	const tileIds = new Set(question?.tiles?.map((tile) => tile.id) ?? []);
	const selected = new Set();
	const slotIds = Array(slotCount).fill(null);

	if (!Array.isArray(rawIds)) return slotIds;

	for (let index = 0; index < Math.min(rawIds.length, slotCount); index += 1) {
		const tileId = rawIds[index];
		if (tileIds.has(tileId) && !selected.has(tileId)) {
			slotIds[index] = tileId;
			selected.add(tileId);
		}
	}

	return slotIds;
}

export function placeTileInSlot(question, slotTileIds, tileId, slotIndex) {
	const slotCount = Array.isArray(question?.answerParts)
		? question.answerParts.length
		: 0;
	const tileIds = new Set(question?.tiles?.map((tile) => tile.id) ?? []);

	if (
		!Array.isArray(slotTileIds) ||
		slotTileIds.length !== slotCount ||
		!Number.isInteger(slotIndex) ||
		slotIndex < 0 ||
		slotIndex >= slotCount ||
		!tileIds.has(tileId) ||
		slotTileIds[slotIndex] !== null
	) {
		return null;
	}

	const selected = new Set();
	for (const currentId of slotTileIds) {
		if (currentId === null) continue;
		if (!tileIds.has(currentId) || selected.has(currentId)) return null;
		selected.add(currentId);
	}

	if (selected.has(tileId)) return null;

	const nextSlotTileIds = [...slotTileIds];
	nextSlotTileIds[slotIndex] = tileId;
	return nextSlotTileIds;
}
