import { WordBuildingGame } from "./game/word-building";

const FIREBASE_KEYS = {
  ACTIVE_SCREEN: "state",
  WORD_BUILDING_PROGRESS: "wordBuildingState",
};

const SCREENS = {
  WORD_BUILDING: "word-building",
  SPELLING: "spelling",
};

const DEFAULT_SCREEN = SCREENS.WORD_BUILDING;

function parseJSON(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export class LanguageLiteracyGame {
  #wordBuildingProgress = null;
  #wordBuildingProgressJSON = "";

  constructor(rootElement) {
    this.rootElement = rootElement;
    this.activeScreen = DEFAULT_SCREEN;
    this.renderQueued = false;
  }

  async init() {
    const api = globalThis.SquidlyAPI;

    if (api?.firebaseOnValue) {
      api.firebaseOnValue(FIREBASE_KEYS.ACTIVE_SCREEN, (value) => {
        const screen = value || DEFAULT_SCREEN;

        if (!value) {
          api.firebaseSet(FIREBASE_KEYS.ACTIVE_SCREEN, screen);
        }

        this.activeScreen = screen;
        this.requestRender();
      });

      api.firebaseOnValue(FIREBASE_KEYS.WORD_BUILDING_PROGRESS, (value) => {
        this.wordBuildingProgress = value;
      });
    }

    this.requestRender();
  }

  set wordBuildingProgress(value) {
    const string = typeof value === "string" ? value : (value ? JSON.stringify(value) : "");
    const object = typeof value === "object" ? value : parseJSON(value);

    this.#wordBuildingProgress = object;

    if (string !== this.#wordBuildingProgressJSON) {
      this.requestRender();
    }

    this.#wordBuildingProgressJSON = string;
  }

  get wordBuildingProgress() {
    return this.#wordBuildingProgress;
  }

  get wordBuildingProgressJSON() {
    return this.#wordBuildingProgressJSON;
  }

  requestRender() {
    if (this.renderQueued) return;

    this.renderQueued = true;
    window.setTimeout(async () => {
      this.renderQueued = false;
      await this.renderCurrentScreen();
    }, 0);
  }

  async renderCurrentScreen() {
    switch (this.activeScreen) {
      case SCREENS.WORD_BUILDING:
        await this.renderWordBuildingGame();
        return;
      case SCREENS.SPELLING:
        await this.renderSpellingGame();
        return;
      default:
        this.rootElement.replaceChildren(this.createMessage(`Unknown app screen: ${this.activeScreen}`));
    }
  }

  createMessage(message) {
    const main = document.createElement("main");
    main.className = "game-shell";

    const panel = document.createElement("section");
    panel.className = "question-panel";
    panel.textContent = message;

    main.append(panel);
    return main;
  }

  /** Renders the word-building game and syncs its progress to Firebase. */
  async renderWordBuildingGame() {
    const game = new WordBuildingGame(this.rootElement, {
      gameState: this.wordBuildingProgress,
      onGameStateChange: (progress) => {
        this.wordBuildingProgress = progress;

        if (globalThis.SquidlyAPI?.firebaseSet) {
          globalThis.SquidlyAPI.firebaseSet(FIREBASE_KEYS.WORD_BUILDING_PROGRESS, this.wordBuildingProgressJSON);
        }
      },
    });

    await game.render();
  }

  /** State entrypoint for the spelling game. */
  async renderSpellingGame() {
    throw new Error("Spelling game not implemented");
  }
}
