import { queryTemplate } from './builtin/query';
import { summaryTemplate } from './builtin/summary';
import { vulnerabilityTemplate } from './builtin/vulnerability';

export const BUILTIN_TEMPLATES = {
  summary: summaryTemplate,
  vulnerability: vulnerabilityTemplate,
  query: queryTemplate,
};
