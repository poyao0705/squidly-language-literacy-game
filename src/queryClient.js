// src/queryClient.js

import { QueryClient } from '@tanstack/query-core';
import { defaultRepository } from './repository';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      retry: 1,
    },
  },
});

// question bank
export const questionBankQuery = (gameId = null) => ({
  queryKey: ['question-bank', gameId],
  queryFn: () => defaultRepository.fetchQuestionBank(gameId),
});

export const defaultQuestionBankQuery = questionBankQuery('word-building');


