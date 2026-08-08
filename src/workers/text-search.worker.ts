import { findTextMatches, type TextSearchOptions } from "../lib/text-search";

type SearchWorkerRequest = {
  id: number;
  value: string;
  query: string;
  options: TextSearchOptions;
};

self.addEventListener("message", (event: MessageEvent<SearchWorkerRequest>) => {
  const { id, value, query, options } = event.data;
  self.postMessage({ id, result: findTextMatches(value, query, options) });
});
