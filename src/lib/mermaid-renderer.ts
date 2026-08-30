import type { Mermaid, MermaidConfig } from "mermaid";
import {
  getMermaidFlowchartCurve,
  type MermaidCurvePreference,
} from "./mermaid-curve";

export type MermaidThemeTokens = {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textStrong: string;
  border: string;
  accent: string;
  accentSoft: string;
  fontFamily: string;
  fontSize: string;
  darkMode: boolean;
};

type MermaidRenderRequest = {
  source: string;
  theme: MermaidThemeTokens;
  curve: MermaidCurvePreference;
  signal: AbortSignal;
};

let mermaidImport: Promise<Mermaid> | null = null;
let renderQueue: Promise<void> = Promise.resolve();
let initializedConfigSignature: string | null = null;
let renderSequence = 0;

function loadMermaid() {
  mermaidImport ??= import("mermaid")
    .then(({ default: mermaid }) => mermaid)
    .catch((error: unknown) => {
      mermaidImport = null;
      throw error;
    });
  return mermaidImport;
}

function createAbortError() {
  return new DOMException("Mermaid render request was replaced", "AbortError");
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw createAbortError();
  }
}

function createSecureKeys(mermaid: Mermaid) {
  return Array.from(
    new Set([
      ...Object.keys(mermaid.mermaidAPI.defaultConfig),
      "secure",
      "securityLevel",
      "startOnLoad",
      "suppressErrorRendering",
      "maxTextSize",
      "maxEdges",
      "dompurifyConfig",
      "theme",
      "themeCSS",
      "themeVariables",
      "darkMode",
      "htmlLabels",
      "fontFamily",
      "altFontFamily",
      "look",
      "layout",
    ]),
  );
}

function createMermaidConfig(
  mermaid: Mermaid,
  theme: MermaidThemeTokens,
  curve: MermaidCurvePreference,
): MermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    htmlLabels: false,
    maxTextSize: 50_000,
    maxEdges: 500,
    theme: "base",
    darkMode: theme.darkMode,
    fontFamily: theme.fontFamily,
    secure: createSecureKeys(mermaid),
    flowchart: {
      curve: getMermaidFlowchartCurve(curve),
    },
    themeVariables: {
      darkMode: theme.darkMode,
      background: theme.background,
      primaryColor: theme.surface,
      primaryTextColor: theme.textStrong,
      primaryBorderColor: theme.accent,
      secondaryColor: theme.surfaceMuted,
      secondaryTextColor: theme.textStrong,
      secondaryBorderColor: theme.accent,
      tertiaryColor: theme.background,
      tertiaryTextColor: theme.textStrong,
      tertiaryBorderColor: theme.accent,
      lineColor: theme.accent,
      textColor: theme.text,
      mainBkg: theme.surface,
      nodeTextColor: theme.textStrong,
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSize,
    },
  };
}

function enqueue<T>(task: () => Promise<T>) {
  const result = renderQueue.then(task, task);
  renderQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function removeDiagramLinks(svg: string) {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (document.querySelector("parsererror")) {
    throw new Error("Mermaid returned invalid SVG");
  }

  document.querySelectorAll("a").forEach((link) => {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");

    Array.from(link.attributes).forEach((attribute) => {
      if (
        attribute.localName === "href" ||
        attribute.localName === "target" ||
        attribute.localName === "rel" ||
        attribute.localName === "tabindex" ||
        attribute.name.toLowerCase().startsWith("on")
      ) {
        return;
      }

      group.setAttributeNS(
        attribute.namespaceURI,
        attribute.name,
        attribute.value,
      );
    });
    group.replaceChildren(...Array.from(link.childNodes));
    link.replaceWith(group);
  });

  document.querySelectorAll<SVGElement>(".clickable").forEach((element) => {
    element.classList.remove("clickable");
    if (element.classList.length === 0) {
      element.removeAttribute("class");
    }
  });

  return new XMLSerializer().serializeToString(document.documentElement);
}

export function renderMermaidDiagram({
  source,
  theme,
  curve,
  signal,
}: MermaidRenderRequest): Promise<string> {
  return enqueue(async () => {
    throwIfAborted(signal);
    const mermaid = await loadMermaid();
    throwIfAborted(signal);

    const configSignature = JSON.stringify({ theme, curve });
    if (initializedConfigSignature !== configSignature) {
      mermaid.initialize(createMermaidConfig(mermaid, theme, curve));
      initializedConfigSignature = configSignature;
    }

    const renderId = `aster-mermaid-${Date.now().toString(36)}-${++renderSequence}`;
    const { svg } = await mermaid.render(renderId, source);
    throwIfAborted(signal);
    return removeDiagramLinks(svg);
  });
}
