import { deferReplaceChildren } from "../dom-utils";
import { queryClient, defaultQuestionBankQuery } from "../queryClient";
import { GridIcon, GridLayout, SvgPlus } from "../squidly-utils";

class GameButton extends GridIcon {
  constructor(info = {}, group) {
    const buttonInfo = {
      ...info,
      type: { theme: info.theme || "language-button", card: false },
    };

    super(buttonInfo, group);
    this.classList.add("game-button");

    if (info.className) {
      this.classList.add(...String(info.className).split(" ").filter(Boolean));
    }
  }

  set selected(value) {
    this.toggleAttribute("selected", Boolean(value));
  }

  get selected() {
    return this.hasAttribute("selected");
  }

  set disabled(value) {
    super.disabled = Boolean(value);
    this.setAttribute("aria-disabled", String(Boolean(value)));
    this.tabIndex = value ? -1 : 0;
  }

  get disabled() {
    return this.hasAttribute("i-disabled");
  }
}

function createElement(tagName, className, textContent = null) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (textContent !== null) element.textContent = textContent;
  return element;
}

function getQuestionWord(question) {
  if (typeof question === "string") return question;
  if (!question || typeof question !== "object") return "";

  const value = question.word ?? question.answer ?? question.text ?? "";
  return Array.isArray(value) ? value.join("") : String(value);
}

function getAnswerParts(question, word) {
  if (question && typeof question === "object") {
    const explicitParts =
      question.answerParts ?? question.parts ?? question.chunks ?? null;

    if (Array.isArray(explicitParts)) {
      return explicitParts.map((part) => String(part));
    }

    if (Array.isArray(question.answer)) {
      return question.answer.map((part) => String(part));
    }
  }

  return Array.from(word);
}

function getDefaultTiles(answerParts) {
  const tiles = [...answerParts].sort((a, b) => a.localeCompare(b));
  const answerKey = answerParts.join("\u0000");
  const tileKey = tiles.join("\u0000");

  if (tiles.length > 1 && answerKey === tileKey) {
    tiles.reverse();
  }

  return tiles;
}

function getSourceInfoValue(sourceInfo, key) {
  const value = sourceInfo?.[key];
  return value === null || value === undefined ? "" : String(value);
}

function formatUnit(value) {
  if (value === null || value === undefined || value === "") return "";
  return typeof value === "number" ? `Unit ${value}` : String(value);
}

function getSourceTitle(sourceInfo) {
  return getSourceInfoValue(sourceInfo, "title") || getSourceInfoValue(sourceInfo, "name") || "Question Bank";
}

function normalizeQuestion(question, index, sourceInfo = {}) {
  const isObject = question && typeof question === "object" && !Array.isArray(question);
  let word = getQuestionWord(question).trim();
  const answerParts = getAnswerParts(question, word).filter((part) => part.length > 0);
  if (!word) word = answerParts.join("");

  const tileValues = isObject && Array.isArray(question.tiles)
    ? question.tiles.map((tile) => String(tile))
    : getDefaultTiles(answerParts);
  const id = isObject && question.id
    ? String(question.id)
    : `word-${index + 1}-${word || "empty"}`;

  return {
    id,
    title: isObject && question.title ? String(question.title) : getSourceTitle(sourceInfo),
    unit: isObject && question.unit ? formatUnit(question.unit) : formatUnit(sourceInfo?.unit),
    prompt: isObject && question.prompt ? String(question.prompt) : "Build the word you hear.",
    word,
    answerParts,
    tiles: tileValues.map((value, tileIndex) => ({
      id: `${id}-tile-${tileIndex}`,
      value,
    })),
    utterance: isObject && question.utterance ? String(question.utterance) : word,
  };
}

export class WordBuildingGame {
  #questions;
  #questionIndex;
  #questionState;
  #sourceInfo;
  #gameState;
  #onGameStateChange;

  constructor(rootElement, { gameState = null, onGameStateChange = null } = {}) {
    this.rootElement = rootElement;
    this.#questions = [];
    this.#questionIndex = 0;
    this.#questionState = new Map();
    this.#sourceInfo = {};
    this.#gameState = gameState;
    this.#onGameStateChange = onGameStateChange instanceof Function ? onGameStateChange : () => {};
  }

  get questions() {
    return this.#questions;
  }

  async render() {
    this.#renderLoading();

    try {
      const questionBank = await queryClient.ensureQueryData(defaultQuestionBankQuery);
      this.#sourceInfo = questionBank.info ?? {};
      this.#questions = questionBank.questions.map((question, index) => normalizeQuestion(question, index, this.#sourceInfo));
      this.#applyGameState(this.#gameState);
      this.#questionIndex = Math.min(this.#questionIndex, Math.max(this.#questions.length - 1, 0));
      this.#renderQuestion();
    } catch (error) {
      this.#renderError(error);
    }
  }

  #replaceRoot(element) {
    deferReplaceChildren(this.rootElement, element);
  }

  #createShell() {
    const main = document.createElement("main");
    main.className = "game-shell word-building-shell";

    const panel = document.createElement("section");
    panel.className = "question-panel word-builder-panel";

    main.append(panel);

    return { main, panel };
  }

  #currentQuestion() {
    return this.#questions[this.#questionIndex] ?? null;
  }

  #getQuestionState(question) {
    if (!this.#questionState.has(question.id)) {
      this.#questionState.set(question.id, {
        selectedTileIds: [],
        completed: false,
        incorrect: false,
      });
    }

    return this.#questionState.get(question.id);
  }

  #getSelectedTiles(question, state) {
    return state.selectedTileIds
      .map((tileId) => question.tiles.find((tile) => tile.id === tileId))
      .filter(Boolean);
  }

  #applyGameState(gameState) {
    const questionCount = this.#questions.length;
    const rawIndex = Number(gameState?.questionIndex);
    this.#questionIndex = Number.isFinite(rawIndex)
      ? Math.max(0, Math.min(Math.round(rawIndex), Math.max(questionCount - 1, 0)))
      : 0;

    this.#questionState.clear();

    const answers = gameState?.answers && typeof gameState.answers === "object"
      ? gameState.answers
      : {};

    for (const question of this.#questions) {
      const rawAnswer = answers[question.id];
      if (!rawAnswer || typeof rawAnswer !== "object") continue;

      const tileIds = new Set(question.tiles.map((tile) => tile.id));
      const selectedTileIds = Array.isArray(rawAnswer.selectedTileIds)
        ? rawAnswer.selectedTileIds.filter((tileId) => tileIds.has(tileId))
        : [];
      const state = {
        selectedTileIds,
        completed: false,
        incorrect: false,
      };

      this.#updateAnswerState(question, state);
      this.#questionState.set(question.id, state);
    }
  }

  #toGameState() {
    const answers = {};

    for (const question of this.#questions) {
      const state = this.#getQuestionState(question);
      if (state.selectedTileIds.length === 0 && !state.completed && !state.incorrect) continue;

      answers[question.id] = {
        selectedTileIds: [...state.selectedTileIds],
        completed: state.completed,
        incorrect: state.incorrect,
      };
    }

    return {
      questionIndex: this.#questionIndex,
      answers,
    };
  }

  #commitGameState() {
    this.#onGameStateChange(this.#toGameState());
  }

  #createButton({
    symbol = null,
    displayValue,
    className = "",
    theme = "language-button",
    group = "word-building-controls",
    order = 0,
    disabled = false,
    onClick = null,
  }) {
    const button = new GameButton({
      symbol,
      displayValue,
      theme,
      disabled,
      events: {
        "access-click": (event) => {
          if (button.disabled || !onClick) return;
          onClick(event);
        },
      },
    }, group);

    if (className) {
      button.classList.add(...String(className).split(" ").filter(Boolean));
    }

    button.setAttribute("access-order", String(order));
    button.setAttribute("aria-label", displayValue);
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      button.click();
    });

    return button;
  }

  #renderQuestion() {
    if (this.#questions.length === 0) {
      this.#renderEmpty();
      return;
    }

    const question = this.#currentQuestion();
    const state = this.#getQuestionState(question);
    this.#preloadUtterance(question);

    const main = document.createElement("main");
    main.className = "game-shell word-building-shell";
    main.append(this.#createGameLayout(question, state));

    this.#replaceRoot(main);
  }

  #createGameLayout(question, state) {
    const layout = new GridLayout(4, 5);
    layout.classList.add("word-builder-layout");
    layout.styles = {
      "grid-template-rows": "repeat(4, minmax(0, 1fr))",
      "grid-template-columns": "repeat(5, minmax(0, 1fr))",
      gap: "clamp(0.5rem, 1.4vw, 0.9rem)",
    };

    layout.addItemInstances(GameButton, [[
      null,
      null,
      null,
      {
        symbol: "home",
        displayValue: "Home",
        className: "icon-button",
        group: "word-building-top-controls",
        order: 0,
        events: {
          "access-click": () => this.#restart(),
        },
      },
      {
        symbol: "speaker",
        displayValue: "Speak",
        className: "icon-button",
        group: "word-building-top-controls",
        order: 1,
        events: {
          "access-click": () => this.#speakQuestion(question),
        },
      },
    ]], 0, 0);

    const questionSection = this.#createQuestionSection(question, state);
    layout.add(questionSection, [1, 2], [0, 4]);

    const { previous, clear, next } = this.#createActionButtons(question, state);
    layout.addItems([[null, previous, clear, next, null]], 3, 0);

    return layout;
  }

  #createQuestionSection(question, state) {
    const questionSection = new SvgPlus("section");
    questionSection.classList.add("word-question-section");
    questionSection.append(
      this.#createTitleBlock(question),
      this.#createBoard(question, state),
      this.#createFeedback(question, state),
    );
    return questionSection;
  }

  #createTitleBlock(question) {
    const titleBlock = createElement("div", "game-title-block");
    const badge = createElement("div", "game-badge");
    badge.setAttribute("aria-hidden", "true");
    badge.append(
      createElement("span", "badge-letter badge-letter-m", "m"),
      createElement("span", "badge-letter badge-letter-t", "t"),
      createElement("span", "badge-letter badge-letter-a", "a"),
    );

    const titleText = createElement("div", "game-title-text");
    titleText.append(createElement("h1", "game-title", question.title));

    const metaRow = createElement("div", "game-meta-row");

    if (question.unit) {
      metaRow.append(createElement("p", "game-unit", question.unit));
    }

    metaRow.append(
      createElement("p", "game-step", `Word ${this.#questionIndex + 1} of ${this.#questions.length}`),
    );
    titleText.append(metaRow);

    const prompt = createElement("p", "word-prompt", question.prompt);
    prompt.id = "word-builder-prompt";
    titleText.append(prompt);

    titleBlock.append(badge, titleText);
    return titleBlock;
  }

  #createBoard(question, state) {
    const board = createElement("section", "word-board");
    board.setAttribute("aria-labelledby", "word-builder-prompt");

    const letterBank = this.#createLetterBank(question, state);
    const slots = this.#createAnswerSlots(question, state);

    board.append(letterBank, slots);
    return board;
  }

  #createLetterBank(question, state) {
    const letterBank = createElement("div", "letter-bank");

    question.tiles.forEach((tile, index) => {
      const isSelected = state.selectedTileIds.includes(tile.id);
      const tileButton = this.#createButton({
        displayValue: tile.value,
        className: "letter-tile",
        theme: "language-tile",
        group: "word-building-letters",
        order: index,
        onClick: () => this.#toggleTile(question, tile.id),
      });
      tileButton.selected = isSelected;
      tileButton.setAttribute(
        "aria-label",
        `${tile.value}${isSelected ? " selected" : ""}`,
      );
      letterBank.append(tileButton);
    });

    return letterBank;
  }

  #createAnswerSlots(question, state) {
    const selectedTiles = this.#getSelectedTiles(question, state);
    const slots = createElement("div", "answer-slots");

    for (let index = 0; index < question.answerParts.length; index += 1) {
      const selectedTile = selectedTiles[index];
      const slot = document.createElement("access-button");
      slot.className = "answer-slot";
      slot.setAttribute("access-group", "word-building-slots");
      slot.setAttribute("access-order", String(index));
      slot.setAttribute("aria-label", selectedTile ? `Remove ${selectedTile.value}` : "Empty letter slot");
      slot.tabIndex = selectedTile ? 0 : -1;

      if (selectedTile) {
        slot.classList.add("filled");
        slot.textContent = selectedTile.value;
        slot.addEventListener("access-click", () => this.#removeTileAt(question, index));
        slot.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          slot.click();
        });
      } else {
        const line = createElement("span", "answer-slot-line");
        line.setAttribute("aria-hidden", "true");
        slot.append(line);
      }

      slots.append(slot);
    }

    return slots;
  }

  #createFeedback(question, state) {
    const feedback = createElement("p", "word-feedback");
    const selectedCount = state.selectedTileIds.length;
    const totalCount = question.answerParts.length;

    if (state.completed) {
      feedback.textContent = "Great job!";
      feedback.classList.add("success");
    } else if (state.incorrect) {
      feedback.textContent = "Not quite. Change a tile or clear the word and try again.";
      feedback.classList.add("error");
    } else {
      feedback.textContent = `${selectedCount} of ${totalCount} slots filled`;
    }

    return feedback;
  }

  #createActionButtons(question, state) {
    const isFirst = this.#questionIndex === 0;
    const isLast = this.#questionIndex === this.#questions.length - 1;

    return {
      previous: this.#createButton({
        symbol: "leftArrow",
        displayValue: "Previous",
        className: "nav-button",
        group: "word-building-navigation",
        order: 0,
        disabled: isFirst,
        onClick: () => this.#moveQuestion(-1),
      }),
      clear: this.#createButton({
        symbol: "refresh",
        displayValue: "Clear",
        className: "nav-button",
        group: "word-building-navigation",
        order: 1,
        disabled: state.selectedTileIds.length === 0,
        onClick: () => this.#clearQuestion(question),
      }),
      next: this.#createButton({
        symbol: isLast ? "tick" : "rightArrow",
        displayValue: isLast ? "Restart" : "Next",
        className: "nav-button primary",
        group: "word-building-navigation",
        order: 2,
        onClick: () => {
          if (isLast) this.#restart();
          else this.#moveQuestion(1);
        },
      }),
    };
  }



  #toggleTile(question, tileId) {
    const state = this.#getQuestionState(question);
    const selectedIndex = state.selectedTileIds.indexOf(tileId);

    if (selectedIndex >= 0) {
      state.selectedTileIds.splice(selectedIndex, 1);
    } else if (state.selectedTileIds.length < question.answerParts.length) {
      state.selectedTileIds.push(tileId);
    }

    this.#updateAnswerState(question, state);
    this.#commitGameState();
    this.#renderQuestion();
  }

  #removeTileAt(question, index) {
    const state = this.#getQuestionState(question);
    state.selectedTileIds.splice(index, 1);
    this.#updateAnswerState(question, state);
    this.#commitGameState();
    this.#renderQuestion();
  }

  #clearQuestion(question) {
    const state = this.#getQuestionState(question);
    state.selectedTileIds = [];
    state.completed = false;
    state.incorrect = false;
    this.#commitGameState();
    this.#renderQuestion();
  }

  #updateAnswerState(question, state) {
    state.completed = false;
    state.incorrect = false;

    if (state.selectedTileIds.length !== question.answerParts.length) return;

    const selectedWord = this.#getSelectedTiles(question, state)
      .map((tile) => tile.value)
      .join("");
    const targetWord = question.answerParts.join("");

    state.completed = selectedWord === targetWord;
    state.incorrect = !state.completed;
  }

  #moveQuestion(step) {
    const nextIndex = this.#questionIndex + step;
    this.#questionIndex = Math.max(0, Math.min(nextIndex, this.#questions.length - 1));
    this.#commitGameState();
    this.#renderQuestion();
  }

  #restart() {
    this.#questionIndex = 0;
    this.#questionState.clear();
    this.#commitGameState();
    this.#renderQuestion();
  }

  #preloadUtterance(question) {
    const api = globalThis.SquidlyAPI;
    if (!question.utterance || !api?.loadUtterances) return;
    api.loadUtterances([question.utterance]);
  }

  #speakQuestion(question) {
    const text = question.utterance || question.word;
    if (!text) return;

    const api = globalThis.SquidlyAPI;
    if (api?.speak) {
      api.speak(text);
      return;
    }

    if (globalThis.speechSynthesis && globalThis.SpeechSynthesisUtterance) {
      globalThis.speechSynthesis.cancel();
      globalThis.speechSynthesis.speak(new globalThis.SpeechSynthesisUtterance(text));
    }
  }

  #renderEmpty() {
    const { main, panel } = this.#createShell();

    panel.append(
      createElement("h1", "game-title", getSourceTitle(this.#sourceInfo)),
      createElement("p", "empty-message", "No words are available in the question bank."),
    );

    this.#replaceRoot(main);
  }

  #renderError(error) {
    const { main, panel } = this.#createShell();

    const heading = createElement("h1", "game-title", "Question Bank");
    const message = createElement("p", null, "Unable to load questions.");
    const detail = document.createElement("code");
    detail.textContent = error instanceof Error ? error.message : "Unknown error";

    panel.append(heading, message, detail);
    this.#replaceRoot(main);
  }

  #renderLoading() {
    const { main, panel } = this.#createShell();

    panel.append(
      createElement("h1", "game-title", "Question Bank"),
      createElement("p", null, "Loading questions…"),
    );

    this.#replaceRoot(main);
  }
}
