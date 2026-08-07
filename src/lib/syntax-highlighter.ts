import { transformerColorizedBrackets } from "@shikijs/colorized-brackets";
import {
  createCssVariablesTheme,
  createHighlighterCore,
  type LanguageRegistration,
} from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { SyntaxLanguage } from "./syntax-languages";

type LanguageModule = { default: LanguageRegistration[] };
type LanguageLoader = () => Promise<LanguageModule>;

const languageLoaders = {
  bash: () => import("@shikijs/langs/bash"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  css: () => import("@shikijs/langs/css"),
  diff: () => import("@shikijs/langs/diff"),
  dockerfile: () => import("@shikijs/langs/dockerfile"),
  go: () => import("@shikijs/langs/go"),
  graphql: () => import("@shikijs/langs/graphql"),
  html: () => import("@shikijs/langs/html"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  jsx: () => import("@shikijs/langs/jsx"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  markdown: () => import("@shikijs/langs/markdown"),
  php: () => import("@shikijs/langs/php"),
  python: () => import("@shikijs/langs/python"),
  ruby: () => import("@shikijs/langs/ruby"),
  rust: () => import("@shikijs/langs/rust"),
  scss: () => import("@shikijs/langs/scss"),
  sql: () => import("@shikijs/langs/sql"),
  svelte: () => import("@shikijs/langs/svelte"),
  swift: () => import("@shikijs/langs/swift"),
  toml: () => import("@shikijs/langs/toml"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  vue: () => import("@shikijs/langs/vue"),
  xml: () => import("@shikijs/langs/xml"),
  yaml: () => import("@shikijs/langs/yaml"),
} satisfies Record<SyntaxLanguage, LanguageLoader>;

const syntaxTheme = createCssVariablesTheme({
  name: "aster",
  variablePrefix: "--syntax-",
  fontStyle: true,
});

const bracketTransformer = transformerColorizedBrackets({
  themes: {
    aster: [
      "var(--syntax-bracket-1)",
      "var(--syntax-bracket-2)",
      "var(--syntax-bracket-3)",
      "var(--syntax-bracket-4)",
      "var(--syntax-bracket-error)",
    ],
  },
});

const highlighterPromise = createHighlighterCore({
  themes: [syntaxTheme],
  langs: [],
  engine: createJavaScriptRegexEngine(),
});

const loadedLanguages = new Map<SyntaxLanguage, Promise<string>>();
const highlightedCodeCache = new Map<string, Promise<string>>();
const maximumCacheEntries = 100;

async function loadLanguage(language: SyntaxLanguage): Promise<string> {
  const existingLoad = loadedLanguages.get(language);

  if (existingLoad) {
    return existingLoad;
  }

  const languageLoad = (async () => {
    const [highlighter, languageModule] = await Promise.all([
      highlighterPromise,
      languageLoaders[language](),
    ]);
    const registrations = languageModule.default;

    await highlighter.loadLanguage(...registrations);

    return registrations[registrations.length - 1].name;
  })();

  loadedLanguages.set(language, languageLoad);

  try {
    return await languageLoad;
  } catch (error) {
    loadedLanguages.delete(language);
    throw error;
  }
}

export function highlightCode(
  code: string,
  language: SyntaxLanguage,
): Promise<string> {
  const cacheKey = `${language}\u0000${code}`;
  const cachedCode = highlightedCodeCache.get(cacheKey);

  if (cachedCode) {
    return cachedCode;
  }

  const highlightedCode = (async () => {
    const [highlighter, registeredLanguage] = await Promise.all([
      highlighterPromise,
      loadLanguage(language),
    ]);

    return highlighter.codeToHtml(code, {
      lang: registeredLanguage,
      theme: "aster",
      transformers: [bracketTransformer],
    });
  })();

  if (highlightedCodeCache.size >= maximumCacheEntries) {
    const oldestKey = highlightedCodeCache.keys().next().value;

    if (oldestKey !== undefined) {
      highlightedCodeCache.delete(oldestKey);
    }
  }

  highlightedCodeCache.set(cacheKey, highlightedCode);
  highlightedCode.catch(() => highlightedCodeCache.delete(cacheKey));

  return highlightedCode;
}
