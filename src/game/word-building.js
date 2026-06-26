import { deferReplaceChildren } from "../dom-utils";
import { queryClient, defaultQuestionBankQuery } from "../queryClient";
import { AccessButton, GridIcon, GridIconSymbol, GridLayout, SvgPlus } from "../squidly-utils";

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

const GAME_VIEWS = {
  PLAY: "play",
  RESULT: "result",
};

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function normalizeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.round(count) : 0;
}

function formatElapsedTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatPercentage(value, total) {
  if (total <= 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function formatAverage(value) {
  if (!Number.isFinite(value)) return "0";
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function getQuestionWord(question) {
  if (typeof question === "string") return question;
  if (!question || typeof question !== "object") return "";

  const value = question.word ?? question.answer ?? question.text ?? "";
  if (Array.isArray(value)) return value.join("");
  if (value && typeof value === "object") return getQuestionWord(value);
  return String(value);
}

function normalizeSymbolValue(value) {
  if (typeof value === "string") {
    const symbol = value.trim();
    return symbol ? symbol : null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  if (typeof value.url === "string" && value.url.trim()) {
    return { ...value, url: value.url.trim() };
  }

  if (typeof value.svg === "string" && value.svg.trim()) {
    return { ...value, svg: value.svg };
  }

  if (value.text !== null && value.text !== undefined) {
    return { ...value, text: String(value.text) };
  }

  return null;
}

function normalizeImageUrl(value) {
  if (typeof value === "string") {
    const url = value.trim();
    return url ? url : null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  return typeof value.url === "string" && value.url.trim() ? value.url.trim() : null;
}

function getQuestionImageUrl(question) {
  if (!question || typeof question !== "object" || Array.isArray(question)) return null;
  return normalizeImageUrl(question.imageUrl ?? question.image);
}

function getQuestionSymbol(question) {
  if (!question || typeof question !== "object" || Array.isArray(question)) return null;
  return normalizeSymbolValue(question.symbol ?? question.icon);
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

function normalizeUnitKey(value) {
  if (value === null || value === undefined || value === "") return "";

  const text = String(value).trim();
  const unitMatch = text.match(/^unit\s+(.+)$/i);
  return (unitMatch ? unitMatch[1] : text).trim();
}

function formatUnit(value) {
  const unitKey = normalizeUnitKey(value);
  if (!unitKey) return "";

  const text = String(value).trim();
  return /^unit\s+/i.test(text) ? text : `Unit ${unitKey}`;
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

  const rawUnit = isObject && question.unit !== undefined ? question.unit : sourceInfo?.unit;

  return {
    id,
    title: isObject && question.title ? String(question.title) : getSourceTitle(sourceInfo),
    unit: formatUnit(rawUnit),
    unitKey: normalizeUnitKey(rawUnit) || "all",
    prompt: isObject && question.prompt ? String(question.prompt) : "Build the word you hear.",
    word,
    answerParts,
    tiles: tileValues.map((value, tileIndex) => ({
      id: `${id}-tile-${tileIndex}`,
      value,
    })),
    utterance: isObject && question.utterance ? String(question.utterance) : word,
    imageUrl: isObject ? getQuestionImageUrl(question) : null,
    symbol: isObject ? getQuestionSymbol(question) : null,
  };
}

export class WordBuildingGame {
  #questions;
  #questionIndex;
  #questionState;
  #sourceInfo;
  #gameState;
  #selectedUnitKey;
  #viewState;
  #startedAt;
  #completedAt;
  #canRender;
  #onGameStateChange;
  #onGoHome;

  constructor(rootElement, {
    gameState = null,
    selectedUnit = null,
    canRender = null,
    onGameStateChange = null,
    onGoHome = null,
  } = {}) {
    this.rootElement = rootElement;
    this.#questions = [];
    this.#questionIndex = 0;
    this.#questionState = new Map();
    this.#sourceInfo = {};
    this.#gameState = gameState;
    this.#selectedUnitKey = normalizeUnitKey(selectedUnit);
    this.#viewState = GAME_VIEWS.PLAY;
    this.#startedAt = Date.now();
    this.#completedAt = null;
    this.#canRender = canRender instanceof Function ? canRender : () => true;
    this.#onGameStateChange = onGameStateChange instanceof Function ? onGameStateChange : () => {};
    this.#onGoHome = onGoHome instanceof Function ? onGoHome : null;
  }

  get questions() {
    return this.#questions;
  }

  async render() {
    this.#renderLoading();

    try {
      const questionBank = await queryClient.ensureQueryData(defaultQuestionBankQuery);
      this.#sourceInfo = questionBank.info ?? {};
      const questions = questionBank.questions.map((question, index) => normalizeQuestion(question, index, this.#sourceInfo));
      this.#questions = this.#selectedUnitKey
        ? questions.filter((question) => question.unitKey === this.#selectedUnitKey)
        : questions;
      const shouldCommitState = this.#applyGameState(this.#gameState);
      this.#questionIndex = Math.min(this.#questionIndex, Math.max(this.#questions.length - 1, 0));
      const completionStateChanged = this.#syncCompletionState();

      if (shouldCommitState || completionStateChanged) {
        this.#commitGameState();
      }

      if (this.#viewState === GAME_VIEWS.RESULT) {
        this.#renderResult();
      } else {
        this.#renderQuestion();
      }
    } catch (error) {
      this.#renderError(error);
    }
  }

  #replaceRoot(element) {
    if (!this.#canRender()) return;

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
        attempts: 0,
        correctAttempts: 0,
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
    const startedAt = normalizeTimestamp(gameState?.startedAt);
    this.#questionIndex = Number.isFinite(rawIndex)
      ? Math.max(0, Math.min(Math.round(rawIndex), Math.max(questionCount - 1, 0)))
      : 0;
    this.#viewState = gameState?.view === GAME_VIEWS.RESULT ? GAME_VIEWS.RESULT : GAME_VIEWS.PLAY;
    this.#startedAt = startedAt ?? Date.now();
    this.#completedAt = normalizeTimestamp(gameState?.completedAt);

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
        attempts: normalizeCount(rawAnswer.attempts),
        correctAttempts: normalizeCount(rawAnswer.correctAttempts),
      };

      this.#updateAnswerState(question, state, { countAttempt: false });

      if ((state.completed || state.incorrect) && state.attempts === 0) {
        state.attempts = 1;
      }
      if (state.completed && state.correctAttempts === 0) {
        state.correctAttempts = 1;
      }
      state.correctAttempts = Math.min(state.correctAttempts, state.attempts);

      this.#questionState.set(question.id, state);
    }

    return startedAt === null;
  }

  #toGameState() {
    const answers = {};

    for (const question of this.#questions) {
      const state = this.#getQuestionState(question);
      const attempts = normalizeCount(state.attempts);
      const correctAttempts = normalizeCount(state.correctAttempts);

      if (
        state.selectedTileIds.length === 0
        && !state.completed
        && !state.incorrect
        && attempts === 0
        && correctAttempts === 0
      ) continue;

      answers[question.id] = {
        selectedTileIds: [...state.selectedTileIds],
        completed: state.completed,
        incorrect: state.incorrect,
        attempts,
        correctAttempts,
      };
    }

    return {
      view: this.#viewState,
      questionIndex: this.#questionIndex,
      startedAt: this.#startedAt,
      completedAt: this.#completedAt,
      answers,
    };
  }

  #commitGameState() {
    this.#syncCompletionState();
    this.#onGameStateChange(this.#toGameState());
  }

  #allQuestionsCompleted() {
    return this.#questions.length > 0
      && this.#questions.every((question) => this.#getQuestionState(question).completed);
  }

  #syncCompletionState() {
    const previousCompletedAt = this.#completedAt;
    const previousViewState = this.#viewState;

    if (this.#allQuestionsCompleted()) {
      this.#completedAt = this.#completedAt ?? Date.now();
    } else {
      this.#completedAt = null;
      if (this.#viewState === GAME_VIEWS.RESULT) {
        this.#viewState = GAME_VIEWS.PLAY;
      }
    }

    return previousCompletedAt !== this.#completedAt || previousViewState !== this.#viewState;
  }

  #getResultSummary() {
    const totalWords = this.#questions.length;
    let totalAttempts = 0;
    let correctAttempts = 0;

    for (const question of this.#questions) {
      const state = this.#getQuestionState(question);
      totalAttempts += normalizeCount(state.attempts);
      correctAttempts += normalizeCount(state.correctAttempts);
    }

    const completedAt = this.#completedAt ?? Date.now();
    const elapsedTime = Math.max(0, completedAt - this.#startedAt);

    return {
      totalWords,
      totalAttempts,
      correctAttempts,
      elapsedTime,
      averageAttempts: totalWords > 0 ? totalAttempts / totalWords : 0,
    };
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

    const titleBlock = this.#createTitleBlock(question, state);
    layout.add(titleBlock, 0, [3, 4]);

    const wordIcon = this.#createWordIcon(question);
    if (wordIcon) {
      layout.add(wordIcon, 0, 2);
    }

    const questionSection = this.#createQuestionSection(question, state);
    layout.add(questionSection, [1, 2], [0, 4]);

    const { home, previous, clear, next, speaker } = this.#createActionButtons(question, state);
    layout.addItems([[home, previous, clear, next, speaker]], 3, 0);

    return layout;
  }

  #renderResult() {
    const main = document.createElement("main");
    main.className = "game-shell word-building-shell";
    main.append(this.#createResultLayout());
    this.#replaceRoot(main);
  }

  #createResultLayout() {
    const layout = new GridLayout(4, 5);
    const summary = this.#getResultSummary();
    layout.classList.add("word-builder-layout");
    layout.styles = {
      "grid-template-rows": "repeat(4, minmax(0, 1fr))",
      "grid-template-columns": "repeat(5, minmax(0, 1fr))",
      gap: "clamp(0.5rem, 1.4vw, 0.9rem)",
    };

    layout.add(this.#createResultTitleBlock(summary), 0, [3, 4]);
    layout.add(this.#createResultSection(summary), [1, 2], [0, 4]);

    const { home, previous, clear, restart, speaker } = this.#createResultActionButtons();
    layout.addItems([[home, previous, clear, restart, speaker]], 3, 0);

    return layout;
  }

  #createResultTitleBlock(summary) {
    const titleBlock = new SvgPlus("div");
    titleBlock.classList.add("game-title-block");

    const titleText = createElement("div", "game-title-text");
    titleText.append(createElement("h1", "game-title", getSourceTitle(this.#sourceInfo)));

    const metaRow = createElement("div", "game-meta-row");
    const unit = this.#questions.find((question) => question.unit)?.unit;

    if (unit) {
      metaRow.append(createElement("p", "game-unit", unit));
    }

    metaRow.append(createElement("p", "game-step", "Results"));
    titleText.append(metaRow);

    const wordLabel = summary.totalWords === 1 ? "word" : "words";
    titleText.append(createElement("p", "word-prompt", `You spelled ${summary.totalWords} ${wordLabel}.`));

    titleBlock.append(titleText);
    return titleBlock;
  }

  #createResultSection(summary) {
    const resultSection = new SvgPlus("section");
    resultSection.classList.add("word-question-section", "result-summary-section");

    const card = createElement("div", "result-summary-card");
    card.append(
      createElement("h2", "result-summary-title", "Great spelling!"),
      createElement("p", "result-summary-subtitle", "Here is your result summary."),
    );

    const stats = createElement("dl", "result-summary-list");
    stats.append(
      this.#createResultStat("Total time used", formatElapsedTime(summary.elapsedTime)),
      this.#createResultStat(
        "Spelling correctness",
        `${formatPercentage(summary.correctAttempts, summary.totalAttempts)} (${summary.correctAttempts}/${summary.totalAttempts})`,
      ),
      this.#createResultStat(
        "Attempt per word",
        `${formatAverage(summary.averageAttempts)}`,
      ),
    );

    card.append(stats);
    resultSection.append(card);
    return resultSection;
  }

  #createResultStat(label, value) {
    const stat = createElement("div", "result-summary-stat");
    stat.append(
      createElement("dt", "result-summary-label", label),
      createElement("dd", "result-summary-value", value),
    );
    return stat;
  }

  #createResultActionButtons() {
    return {
      home: this.#createButton({
        symbol: "home",
        displayValue: "Menu",
        className: "nav-button",
        group: "word-building-navigation",
        order: 0,
        onClick: () => this.#goHome(),
      }),
      previous: this.#createButton({
        symbol: "leftArrow",
        displayValue: "Previous",
        className: "nav-button",
        group: "word-building-navigation",
        order: 1,
        disabled: true,
      }),
      clear: this.#createButton({
        symbol: "refresh",
        displayValue: "Clear",
        className: "nav-button",
        group: "word-building-navigation",
        order: 2,
        disabled: true,
      }),
      restart: this.#createButton({
        symbol: "tick",
        displayValue: "Restart",
        className: "nav-button primary",
        group: "word-building-navigation",
        order: 3,
        onClick: () => this.#restart(),
      }),
      speaker: this.#createButton({
        symbol: "speaker",
        displayValue: "Speak",
        className: "nav-button",
        group: "word-building-navigation",
        order: 4,
        disabled: true,
      }),
    };
  }

  #createQuestionSection(question, state) {
    const questionSection = new SvgPlus("section");
    questionSection.classList.add("word-question-section");
    questionSection.append(this.#createBoard(question, state));
    return questionSection;
  }

  #createTitleBlock(question, state) {
    const titleBlock = new SvgPlus("div");
    titleBlock.classList.add("game-title-block");

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
    titleText.append(prompt, this.#createFeedback(question, state));

    titleBlock.append(titleText);
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

  #createWordIcon(question) {
    if (!question.imageUrl && !question.symbol) return null;

    const wordIcon = new AccessButton("word-building-picture");
    wordIcon.classList.add("word-icon-card", "top-word-icon-card");
    wordIcon.setAttribute("access-order", "0");
    wordIcon.setAttribute("aria-label", "Speak picture word");
    wordIcon.setAttribute("role", "button");
    wordIcon.tabIndex = 0;

    const renderSymbolFallback = () => {
      if (!question.symbol) return;
      const symbol = new GridIconSymbol(question.symbol);
      symbol.classList.add("word-icon-symbol");
      wordIcon.replaceChildren(symbol);
    };

    if (question.imageUrl) {
      const imageSymbol = createElement("div", "symbol word-icon-symbol");
      const image = document.createElement("img");
      image.alt = question.word ? `Picture for ${question.word}` : "Picture for word";
      image.decoding = "async";
      image.addEventListener("error", renderSymbolFallback, { once: true });
      image.src = question.imageUrl;
      imageSymbol.append(image);
      wordIcon.append(imageSymbol);
    } else {
      renderSymbolFallback();
    }

    wordIcon.addEventListener("access-click", () => this.#speakQuestion(question));
    wordIcon.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      wordIcon.click();
    });

    return wordIcon;
  }

  #createLetterBank(question, state) {
    const letterBank = createElement("div", "letter-bank");

    question.tiles.forEach((tile, index) => {
      if (state.selectedTileIds.includes(tile.id)) return;

      const tileButton = this.#createButton({
        displayValue: tile.value,
        className: "letter-tile",
        theme: "language-tile",
        group: "word-building-letters",
        order: index,
        onClick: () => this.#toggleTile(question, tile.id),
      });
      tileButton.setAttribute("aria-label", `Spell ${tile.value}`);
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
      feedback.textContent = "Not quite. Try again.";
      feedback.classList.add("error");
    } else {
      feedback.textContent = `${selectedCount} of ${totalCount} slots filled`;
    }

    return feedback;
  }

  #createActionButtons(question, state) {
    const isFirst = this.#questionIndex === 0;
    const isLast = this.#questionIndex === this.#questions.length - 1;
    const allCompleted = this.#allQuestionsCompleted();

    return {
      home: this.#createButton({
        symbol: "home",
        displayValue: "Menu",
        className: "nav-button",
        group: "word-building-navigation",
        order: 0,
        onClick: () => this.#goHome(),
      }),
      previous: this.#createButton({
        symbol: "leftArrow",
        displayValue: "Previous",
        className: "nav-button",
        group: "word-building-navigation",
        order: 1,
        disabled: isFirst,
        onClick: () => this.#moveQuestion(-1),
      }),
      clear: this.#createButton({
        symbol: "refresh",
        displayValue: "Clear",
        className: "nav-button",
        group: "word-building-navigation",
        order: 2,
        disabled: state.selectedTileIds.length === 0,
        onClick: () => this.#clearQuestion(question),
      }),
      next: this.#createButton({
        symbol: isLast ? "tick" : "rightArrow",
        displayValue: isLast ? "Result" : "Next",
        className: "nav-button primary",
        group: "word-building-navigation",
        order: 3,
        disabled: isLast ? !allCompleted : !state.completed,
        onClick: () => {
          if (!state.completed) return;
          if (isLast) this.#showResult();
          else this.#moveQuestion(1);
        },
      }),
      speaker: this.#createButton({
        symbol: "speaker",
        displayValue: "Speak",
        className: "nav-button",
        group: "word-building-navigation",
        order: 4,
        disabled: state.selectedTileIds.length !== question.answerParts.length,
        onClick: () => this.#speakSpelledWord(question, state),
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

    this.#updateAnswerState(question, state, { countAttempt: true });
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

  #updateAnswerState(question, state, { countAttempt = false } = {}) {
    state.completed = false;
    state.incorrect = false;
    state.attempts = normalizeCount(state.attempts);
    state.correctAttempts = normalizeCount(state.correctAttempts);

    if (state.selectedTileIds.length !== question.answerParts.length) return;

    const selectedWord = this.#getSelectedTiles(question, state)
      .map((tile) => tile.value)
      .join("");
    const targetWord = question.answerParts.join("");

    state.completed = selectedWord === targetWord;
    state.incorrect = !state.completed;

    if (countAttempt) {
      state.attempts += 1;
      if (state.completed) {
        state.correctAttempts += 1;
      }
    }
  }

  #moveQuestion(step) {
    const nextIndex = this.#questionIndex + step;
    this.#questionIndex = Math.max(0, Math.min(nextIndex, this.#questions.length - 1));
    this.#commitGameState();
    this.#renderQuestion();
  }

  #showResult() {
    if (!this.#allQuestionsCompleted()) return;

    this.#syncCompletionState();
    this.#viewState = GAME_VIEWS.RESULT;
    this.#commitGameState();
    this.#renderResult();
  }

  #restart() {
    this.#questionIndex = 0;
    this.#questionState.clear();
    this.#viewState = GAME_VIEWS.PLAY;
    this.#startedAt = Date.now();
    this.#completedAt = null;
    this.#commitGameState();
    this.#renderQuestion();
  }

  #goHome() {
    if (this.#onGoHome) {
      this.#onGoHome();
      return;
    }

    this.#restart();
  }

  #preloadUtterance(question) {
    const api = globalThis.SquidlyAPI;
    if (!question.utterance || !api?.loadUtterances) return;
    api.loadUtterances([question.utterance]);
  }

  #getSelectedWord(question, state) {
    return this.#getSelectedTiles(question, state)
      .map((tile) => tile.value)
      .join("");
  }

  #speakQuestion(question) {
    this.#speakText(question.utterance || question.word, true);
  }

  #speakSpelledWord(question, state) {
    if (state.selectedTileIds.length !== question.answerParts.length) return;
    this.#speakText(this.#getSelectedWord(question, state), true);
  }

  #speakText(text, loadFirst = false) {
    if (!text) return;

    const api = globalThis.SquidlyAPI;
    if (api?.speak) {
      if (loadFirst && api.loadUtterances) {
        api.loadUtterances([text]);
      }
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
