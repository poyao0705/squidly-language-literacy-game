import { WordBuildingGame } from "./game/word-building";
import { defaultQuestionBankQuery, queryClient } from "./queryClient";
import { createScreenLayout } from "./screen-layout";
import { callSquidly } from "./squidly-api";
import { AccessButton, GridIcon, GridLayout, SvgPlus } from "./squidly-utils";

const FIREBASE_KEYS = {
	ACTIVE_SCREEN: "state",
	WORD_BUILDING_UNIT: "wordBuildingUnit",
	WORD_BUILDING_PROGRESS: "wordBuildingState",
};

const SCREENS = {
	MENU: "menu",
	WORD_BUILDING: "word-building",
	SPELLING: "spelling",
};

const DEFAULT_SCREEN = SCREENS.MENU;
const SCREEN_VALUES = new Set(Object.values(SCREENS));

function parseJSON(json) {
	try {
		return JSON.parse(json);
	} catch {
		return null;
	}
}

function createElement(tagName, className, textContent = null) {
	const element = new SvgPlus(tagName);
	if (className) element.className = className;
	if (textContent !== null) element.textContent = textContent;
	return element;
}

function normalizeScreen(value) {
	return SCREEN_VALUES.has(value) ? value : DEFAULT_SCREEN;
}

function normalizeUnitKey(value) {
	if (value === null || value === undefined || value === "") return "";

	const text = String(value).trim();
	const unitMatch = text.match(/^unit\s+(.+)$/i);
	return (unitMatch ? unitMatch[1] : text).trim();
}

function formatUnitLabel(value) {
	const unitKey = normalizeUnitKey(value);
	if (!unitKey) return "";

	const text = String(value).trim();
	return /^unit\s+/i.test(text) ? text : `Unit ${unitKey}`;
}

function getQuestionWord(question) {
	if (typeof question === "string") return question;
	if (!question || typeof question !== "object") return "";

	const value = question.word ?? question.answer ?? question.text ?? "";
	if (Array.isArray(value)) return value.join("");
	if (value && typeof value === "object") return getQuestionWord(value);
	return String(value);
}

function compareUnitOptions(a, b) {
	const aNumber = Number(a.key);
	const bNumber = Number(b.key);

	if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
		return aNumber - bNumber;
	}

	return a.label.localeCompare(b.label, undefined, { numeric: true });
}

function getWordBuildingUnits(questionBank) {
	const questions = Array.isArray(questionBank?.questions)
		? questionBank.questions
		: [];
	const units = new Map();

	for (const question of questions) {
		const rawUnit = question?.unit ?? questionBank?.info?.unit ?? "";
		const key = normalizeUnitKey(rawUnit) || "all";
		const label = formatUnitLabel(rawUnit) || "All Words";

		if (!units.has(key)) {
			units.set(key, {
				key,
				label,
				words: [],
			});
		}

		const unit = units.get(key);
		const word = getQuestionWord(question).trim();

		if (word && !unit.words.includes(word)) {
			unit.words.push(word);
		}
	}

	return [...units.values()]
		.map((unit) => ({
			...unit,
			wordCount: unit.words.length,
		}))
		.sort(compareUnitOptions);
}

export class LanguageLiteracyGame {
	#wordBuildingProgress = null;
	#wordBuildingProgressJSON = "";
	#renderVersion = 0;
	#cursorSample = null;
	#cursorListenerRegistered = false;

	constructor(rootElement) {
		this.rootElement = rootElement;
		this.activeScreen = DEFAULT_SCREEN;
		this.selectedUnitKey = "";
		this.unitMenuPage = 0;
		this.renderQueued = false;
	}

	async init() {
		this.requestRender();

		if (!this.#cursorListenerRegistered) {
			this.#cursorListenerRegistered = true;
			void callSquidly("addCursorListener", (sample) => {
				if (sample?.source === "local") this.#cursorSample = sample;
			}).then((registered) => {
				if (!registered) this.#cursorListenerRegistered = false;
			});
		}

		void callSquidly(
			"firebaseOnValue",
			FIREBASE_KEYS.ACTIVE_SCREEN,
			(value) => {
				const screen = normalizeScreen(value);
				this.activeScreen = screen;
				this.requestRender();

				if (!value || value !== screen) {
					void callSquidly("firebaseSet", FIREBASE_KEYS.ACTIVE_SCREEN, screen);
				}
			},
		);

		void callSquidly(
			"firebaseOnValue",
			FIREBASE_KEYS.WORD_BUILDING_UNIT,
			(value) => {
				this.selectedUnit = value;
			},
		);

		void callSquidly(
			"firebaseOnValue",
			FIREBASE_KEYS.WORD_BUILDING_PROGRESS,
			(value) => {
				this.wordBuildingProgress = value;
			},
		);
	}

	#setWordBuildingProgress(value, shouldRequestRender = true) {
		const string =
			typeof value === "string" ? value : value ? JSON.stringify(value) : "";
		const object = typeof value === "object" ? value : parseJSON(value);
		const changed = string !== this.#wordBuildingProgressJSON;

		this.#wordBuildingProgress = object;
		this.#wordBuildingProgressJSON = string;

		if (changed && shouldRequestRender) {
			this.requestRender();
		}
	}

	set wordBuildingProgress(value) {
		this.#setWordBuildingProgress(value);
	}

	get wordBuildingProgress() {
		return this.#wordBuildingProgress;
	}

	get wordBuildingProgressJSON() {
		return this.#wordBuildingProgressJSON;
	}

	set selectedUnit(value) {
		const unitKey = normalizeUnitKey(value);

		if (unitKey === this.selectedUnitKey) return;

		this.selectedUnitKey = unitKey;
		this.requestRender();
	}

	get selectedUnit() {
		return this.selectedUnitKey;
	}

	requestRender() {
		this.#renderVersion += 1;

		if (this.renderQueued) return;

		this.renderQueued = true;
		window.setTimeout(async () => {
			this.renderQueued = false;
			await this.renderCurrentScreen(this.#renderVersion);
		}, 0);
	}

	#isRenderCurrent(renderVersion) {
		return renderVersion === this.#renderVersion;
	}

	#replaceRoot(element, renderVersion) {
		if (!this.#isRenderCurrent(renderVersion)) return;

		this.rootElement.replaceChildren(element);
	}

	async renderCurrentScreen(renderVersion) {
		switch (this.activeScreen) {
			case SCREENS.MENU:
				await this.renderUnitMenu(renderVersion);
				return;
			case SCREENS.WORD_BUILDING:
				await this.renderWordBuildingGame(renderVersion);
				return;
			case SCREENS.SPELLING:
				await this.renderSpellingGame(renderVersion);
				return;
			default:
				this.#replaceRoot(
					this.createMessage(`Unknown app screen: ${this.activeScreen}`),
					renderVersion,
				);
		}
	}

	createAccessButton({ className, group, order, label, onClick }) {
		const button = new AccessButton(group);
		button.className = className;
		button.setAttribute("access-order", String(order));
		button.setAttribute("aria-label", label);
		button.setAttribute("role", "button");
		button.tabIndex = 0;

		button.addEventListener("access-click", (event) => {
			onClick?.(event);
		});
		button.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			button.click();
		});

		return button;
	}

	createMessage(message, { actionLabel = null, onAction = null } = {}) {
		const { main, layout } = createScreenLayout();
		const panel = new SvgPlus("section");
		panel.className = "question-panel message-panel";
		panel.append(createElement("p", "empty-message", message));

		if (actionLabel && onAction) {
			const button = this.createAccessButton({
				className: "message-action-button",
				group: "app-message-actions",
				order: 0,
				label: actionLabel,
				onClick: onAction,
			});
			button.textContent = actionLabel;
			layout.add(button, 3, 2);
		}

		layout.add(panel, [1, 2], [0, 4]);
		return main;
	}

	async renderUnitMenu(renderVersion) {
		this.#replaceRoot(
			this.createMessage("Loading word-building units…"),
			renderVersion,
		);

		try {
			const questionBank = await queryClient.ensureQueryData(
				defaultQuestionBankQuery,
			);
			if (!this.#isRenderCurrent(renderVersion)) return;

			this.#replaceRoot(
				this.createUnitMenu(questionBank, getWordBuildingUnits(questionBank)),
				renderVersion,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			this.#replaceRoot(
				this.createMessage(`Unable to load units: ${message}`),
				renderVersion,
			);
		}
	}

	createUnitMenu(questionBank, units) {
		const { main, layout } = createScreenLayout("unit-menu-shell");
		layout.classList.add("unit-menu-layout");
		const unitsPerPage = 3;
		const totalPages = Math.max(1, Math.ceil(units.length / unitsPerPage));
		const currentPage = Math.min(
			Math.max(this.unitMenuPage, 0),
			totalPages - 1,
		);
		const visibleUnits = units.slice(
			currentPage * unitsPerPage,
			(currentPage + 1) * unitsPerPage,
		);

		this.unitMenuPage = currentPage;

		const header = createElement("header", "unit-menu-header");
		header.append(
			createElement("p", "unit-menu-eyebrow", "Language Literacy"),
			createElement(
				"h1",
				"unit-menu-title",
				questionBank?.info?.title || "Word Building",
			),
			createElement(
				"p",
				"unit-menu-subtitle",
				"Choose a unit to start practicing words.",
			),
		);
		layout.add(header, 0, 1, 0, 4);

		if (units.length === 0) {
			layout.add(
				createElement(
					"p",
					"empty-message",
					"No word-building units are available.",
				),
				[1, 2],
				[1, 3],
			);
		} else {
			const cardRow = new GridLayout(1, 3);
			cardRow.classList.add("unit-menu-card-row");
			cardRow.setAttribute("role", "region");
			cardRow.setAttribute("aria-label", "Units");

			visibleUnits.forEach((unit, index) => {
				cardRow.add(this.createUnitCard(unit, index), 0, index);
			});

			layout.add(cardRow, [1, 2], [0, 4]);
		}

		layout.add(
			this.createUnitMenuArrowButton({
				symbol: "leftArrow",
				displayValue: "Previous",
				order: 0,
				disabled: currentPage === 0,
				onClick: () => this.showUnitMenuPage(currentPage - 1),
			}),
			3,
			1,
		);
		layout.add(this.createUnitMenuPageStatus(currentPage, totalPages), 3, 2);
		layout.add(
			this.createUnitMenuArrowButton({
				symbol: "rightArrow",
				displayValue: "Next",
				order: 1,
				disabled: currentPage >= totalPages - 1,
				onClick: () => this.showUnitMenuPage(currentPage + 1),
			}),
			3,
			3,
		);

		return main;
	}

	createUnitMenuPageStatus(currentPage, totalPages) {
		const pageStatus = createElement(
			"p",
			"unit-menu-page-status",
			`Page ${currentPage + 1} of ${totalPages}`,
		);
		pageStatus.setAttribute("aria-live", "polite");
		return pageStatus;
	}

	createUnitMenuArrowButton({
		symbol,
		displayValue,
		order,
		disabled,
		onClick,
	}) {
		const button = new GridIcon(
			{
				symbol,
				displayValue,
				type: { theme: "language-button", card: false },
				disabled,
				events: {
					"access-click": (event) => {
						if (button.disabled || !onClick) return;
						onClick(event);
					},
				},
			},
			"unit-menu-navigation",
		);

		button.classList.add("game-button", "nav-button", "unit-menu-arrow-button");
		button.setAttribute("access-order", String(order));
		button.setAttribute("aria-label", displayValue);
		button.setAttribute("aria-disabled", String(Boolean(disabled)));
		button.tabIndex = disabled ? -1 : 0;

		button.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			button.click();
		});

		return button;
	}

	showUnitMenuPage(pageIndex) {
		const nextPage = Math.max(0, pageIndex);

		if (nextPage === this.unitMenuPage) return;

		this.unitMenuPage = nextPage;
		this.requestRender();
	}

	createUnitCard(unit, index) {
		const card = this.createAccessButton({
			className: "unit-card",
			group: "unit-menu",
			order: index,
			label: `Start ${unit.label}`,
			onClick: () => this.selectWordBuildingUnit(unit.key),
		});

		const icon = createElement("div", "unit-card-icon");
		const letters = unit.words.join("").slice(0, 4).split("");

		for (const letter of letters) {
			icon.append(createElement("span", "unit-card-letter", letter));
		}

		const title = createElement("h2", "unit-card-title", unit.label);
		const count = createElement(
			"p",
			"unit-card-count",
			`${unit.wordCount} word${unit.wordCount === 1 ? "" : "s"}`,
		);
		const preview = createElement("div", "unit-card-preview");

		for (const word of unit.words.slice(0, 3)) {
			preview.append(createElement("span", "unit-card-word", word));
		}

		card.append(icon, title, count, preview);
		return card;
	}

	selectWordBuildingUnit(unitKey) {
		this.selectedUnitKey = normalizeUnitKey(unitKey);
		this.#setWordBuildingProgress(null, false);
		this.activeScreen = SCREENS.WORD_BUILDING;

		this.requestRender();
		void callSquidly(
			"firebaseSet",
			FIREBASE_KEYS.WORD_BUILDING_UNIT,
			this.selectedUnitKey,
		);
		void callSquidly("firebaseSet", FIREBASE_KEYS.WORD_BUILDING_PROGRESS, "");
		void callSquidly(
			"firebaseSet",
			FIREBASE_KEYS.ACTIVE_SCREEN,
			SCREENS.WORD_BUILDING,
		);
	}

	goToUnitMenu() {
		this.activeScreen = SCREENS.MENU;
		this.selectedUnitKey = "";
		this.#setWordBuildingProgress(null, false);

		this.requestRender();
		void callSquidly("firebaseSet", FIREBASE_KEYS.WORD_BUILDING_UNIT, "");
		void callSquidly("firebaseSet", FIREBASE_KEYS.WORD_BUILDING_PROGRESS, "");
		void callSquidly("firebaseSet", FIREBASE_KEYS.ACTIVE_SCREEN, SCREENS.MENU);
	}

	/** Renders the word-building game and syncs its progress to Firebase. */
	async renderWordBuildingGame(renderVersion) {
		const game = new WordBuildingGame(this.rootElement, {
			gameState: this.wordBuildingProgress,
			selectedUnit: this.selectedUnit,
			getCursorSample: () => this.#cursorSample,
			canRender: () =>
				this.activeScreen === SCREENS.WORD_BUILDING &&
				this.#isRenderCurrent(renderVersion),
			onGoHome: () => this.goToUnitMenu(),
			onGameStateChange: (progress) => {
				this.#setWordBuildingProgress(progress, false);

				void callSquidly(
					"firebaseSet",
					FIREBASE_KEYS.WORD_BUILDING_PROGRESS,
					this.wordBuildingProgressJSON,
				);
			},
		});

		await game.render();
	}

	/** State entrypoint for the spelling game. */
	async renderSpellingGame(renderVersion) {
		this.#replaceRoot(
			this.createMessage("Spelling game is not implemented yet.", {
				actionLabel: "Choose a unit",
				onAction: () => this.goToUnitMenu(),
			}),
			renderVersion,
		);
	}
}
