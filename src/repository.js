function expandQuestion(question) {
  if (!question || typeof question !== 'object' || Array.isArray(question) || !Array.isArray(question.words)) {
    return [question];
  }

  const { words, ...questionInfo } = question;
  return words.map((word, index) => {
    const wordInfo = word && typeof word === 'object' && !Array.isArray(word)
      ? word
      : { word };

    return {
      ...questionInfo,
      ...wordInfo,
      word: wordInfo.word ?? wordInfo.answer ?? wordInfo.text ?? word,
      ...(questionInfo.id ? { id: `${questionInfo.id}-${index + 1}` } : {}),
    };
  });
}

function normalizeQuestionBank(data, gameId = null) {
  if (Array.isArray(data)) {
    return { info: {}, questions: data.flatMap(expandQuestion) };
  }

  if (data && typeof data === 'object') {
    if (Array.isArray(data.games)) {
      const game = data.games.find((item) => item?.id === gameId) ?? data.games[0];
      return normalizeQuestionBank(game, gameId);
    }

    if (data.games && typeof data.games === 'object') {
      const games = Object.values(data.games);
      const game = data.games[gameId] ?? games[0];
      return normalizeQuestionBank(game, gameId);
    }

    const { questions = [], ...info } = data;
    return {
      info,
      questions: Array.isArray(questions) ? questions.flatMap(expandQuestion) : [],
    };
  }

  return { info: {}, questions: [] };
}

class Source {
  async fetchQuestionBank(gameId = null) {
    throw new Error('fetchQuestionBank must be implemented');
  }


}


class DefaultBankSource extends Source {
  async fetchQuestionBank(gameId = null) {
    const response = await fetch(`${import.meta.env.BASE_URL}question-bank.json`);
    if (!response.ok) {
      throw new Error(`Failed to fetch question bank: ${response.status}`);
    }
    return normalizeQuestionBank(await response.json(), gameId);
  }
}


export class Repository {
  constructor(source) {
    this.source = source;
  }

  async fetchQuestionBank(gameId = null) {
    return this.source.fetchQuestionBank(gameId);
  }

}

export const defaultRepository = new Repository(new DefaultBankSource());
