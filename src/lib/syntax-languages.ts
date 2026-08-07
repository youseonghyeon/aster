const syntaxLanguageAliases = {
  bash: "bash",
  sh: "bash",
  shell: "bash",
  shellscript: "bash",
  zsh: "bash",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  cs: "csharp",
  csharp: "csharp",
  "c#": "csharp",
  css: "css",
  diff: "diff",
  docker: "dockerfile",
  dockerfile: "dockerfile",
  go: "go",
  golang: "go",
  gql: "graphql",
  graphql: "graphql",
  html: "html",
  java: "java",
  js: "javascript",
  javascript: "javascript",
  json: "json",
  jsonc: "jsonc",
  jsx: "jsx",
  kt: "kotlin",
  kotlin: "kotlin",
  kts: "kotlin",
  md: "markdown",
  markdown: "markdown",
  php: "php",
  py: "python",
  python: "python",
  rb: "ruby",
  ruby: "ruby",
  rs: "rust",
  rust: "rust",
  scss: "scss",
  sql: "sql",
  svelte: "svelte",
  swift: "swift",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  typescript: "typescript",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
} as const;

export type SyntaxLanguage =
  (typeof syntaxLanguageAliases)[keyof typeof syntaxLanguageAliases];

export function normalizeSyntaxLanguage(
  language: string,
): SyntaxLanguage | null {
  const normalizedLanguage = language.trim().toLowerCase();

  return (
    syntaxLanguageAliases[
      normalizedLanguage as keyof typeof syntaxLanguageAliases
    ] ?? null
  );
}
