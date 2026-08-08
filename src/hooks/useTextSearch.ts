import { useEffect, useRef, useState } from "react";
import {
  type TextSearchOptions,
  type TextSearchResult,
} from "../lib/text-search";

const emptyResult: TextSearchResult = {
  matches: [],
  error: null,
  isTruncated: false,
};

const searchTimeoutMilliseconds = 2_000;

type SearchWorkerResponse = {
  id: number;
  result: TextSearchResult;
};

export function useTextSearch(
  value: string,
  query: string,
  options: TextSearchOptions,
): TextSearchResult {
  const [result, setResult] = useState<TextSearchResult>(emptyResult);
  const requestIdRef = useRef(0);

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    if (query.length === 0) {
      setResult(emptyResult);
      return;
    }

    setResult(emptyResult);

    const worker = new Worker(
      new URL("../workers/text-search.worker.ts", import.meta.url),
      { type: "module" },
    );
    const timeout = window.setTimeout(() => {
      worker.terminate();

      if (requestIdRef.current === requestId) {
        setResult({
          matches: [],
          error: "검색 시간이 오래 걸립니다. 검색어를 더 구체적으로 입력하세요",
          isTruncated: false,
        });
      }
    }, searchTimeoutMilliseconds);

    worker.addEventListener(
      "message",
      (event: MessageEvent<SearchWorkerResponse>) => {
        if (event.data.id !== requestId || requestIdRef.current !== requestId) {
          return;
        }

        window.clearTimeout(timeout);
        setResult(event.data.result);
        worker.terminate();
      },
    );
    worker.addEventListener("error", () => {
      window.clearTimeout(timeout);

      if (requestIdRef.current === requestId) {
        setResult({
          matches: [],
          error: "검색을 완료하지 못했습니다. 다시 시도하세요",
          isTruncated: false,
        });
      }

      worker.terminate();
    });
    worker.postMessage({
      id: requestId,
      value,
      query,
      options,
    });

    return () => {
      window.clearTimeout(timeout);
      worker.terminate();
    };
  }, [options.isCaseSensitive, options.isRegex, query, value]);

  return result;
}
