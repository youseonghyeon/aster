import {
  createContext,
  createElement,
  isValidElement,
  memo,
  useContext,
  useRef,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";
import { rehypeMarkdownHeadingAnchors } from "../lib/markdown-heading-anchors";
import {
  markdownHtmlIdAttribute,
  markdownHtmlNameAttribute,
  markdownHtmlSanitizeSchema,
  rehypeMarkdownExplicitAnchors,
} from "../lib/markdown-html";
import { getMarkdownHeadingId } from "../lib/markdown-outline";
import { rehypeMarkdownSourceOffsets } from "../lib/markdown-source-offsets";
import type { MermaidCurvePreference } from "../lib/mermaid-curve";
import { MermaidDiagram } from "./MermaidDiagram";
import {
  RelativeMarkdownImage,
  type RelativeImageResolver,
} from "./RelativeMarkdownImage";
import { SyntaxHighlightedCode } from "./SyntaxHighlightedCode";

import { usePreviewMarkdownCopy } from "./usePreviewMarkdownCopy";

const markdownPlugins = [remarkGfm];
const markdownRehypePlugins: PluggableList = [
  rehypeRaw,
  [rehypeSanitize, markdownHtmlSanitizeSchema],
  rehypeMarkdownExplicitAnchors,
  rehypeMarkdownSourceOffsets,
  rehypeMarkdownHeadingAnchors,
];
const MarkdownAppearanceContext = createContext("");
const MermaidCurveContext = createContext<MermaidCurvePreference>("curved");
const MarkdownLinkContext = createContext<
  ((href: string) => void | Promise<void>) | undefined
>(undefined);
const MarkdownImageContext = createContext<RelativeImageResolver | undefined>(
  undefined,
);

type MarkdownHeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  node?: {
    position?: {
      start: {
        offset?: number;
      };
    };
  };
};

type ExplicitAnchorProps = {
  [markdownHtmlIdAttribute]?: string;
  [markdownHtmlNameAttribute]?: string;
};

function createMarkdownHeading(
  tagName: "h1" | "h2" | "h3" | "h4" | "h5" | "h6",
) {
  return function MarkdownHeading({
    node,
    id: _authoredId,
    ...headingProps
  }: MarkdownHeadingProps) {
    const id = getMarkdownHeadingId(node?.position?.start.offset);
    void _authoredId;

    return createElement(tagName, {
      ...headingProps,
      id,
      tabIndex: id ? -1 : undefined,
    });
  };
}

const MarkdownHeading1 = createMarkdownHeading("h1");
const MarkdownHeading2 = createMarkdownHeading("h2");
const MarkdownHeading3 = createMarkdownHeading("h3");
const MarkdownHeading4 = createMarkdownHeading("h4");
const MarkdownHeading5 = createMarkdownHeading("h5");
const MarkdownHeading6 = createMarkdownHeading("h6");

type MarkdownLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & ExplicitAnchorProps & {
  node?: unknown;
};

const markdownComponents = {
  input: ({ node, checked, ...inputProps }) => {
    void node;
    // Missing checked means false, not an uncontrolled input left in its old state.
    return <input {...inputProps} checked={Boolean(checked)} disabled readOnly />;
  },
  h1: MarkdownHeading1,
  h2: MarkdownHeading2,
  h3: MarkdownHeading3,
  h4: MarkdownHeading4,
  h5: MarkdownHeading5,
  h6: MarkdownHeading6,
  a: function MarkdownLink({ node, href, onClick, ...linkProps }: MarkdownLinkProps) {
    const activateLink = useContext(MarkdownLinkContext);
    void node;
    return (
      <a
        {...linkProps}
        href={href}
        tabIndex={-1}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented || !href || event.button !== 0) return;
          event.preventDefault();
          void activateLink?.(href);
        }}
      />
    );
  },
  img: function MarkdownImage({ node, ...imageProps }) {
    const resolveImage = useContext(MarkdownImageContext);
    void node;
    return <RelativeMarkdownImage {...imageProps} data-copy-src={imageProps.src} resolveImage={resolveImage} />;
  },
  pre: function MarkdownCodeBlock({ node, children, ...preProps }) {
    const appearanceKey = useContext(MarkdownAppearanceContext);
    const mermaidCurve = useContext(MermaidCurveContext);
    void node;
    const sourceOffset = (
      preProps as typeof preProps & { "data-source-offset"?: string | number }
    )["data-source-offset"];

    if (
      isValidElement<{
        className?: string;
        children?: ReactNode;
      }>(children) &&
      children.type === "code"
    ) {
      const codeClassName = children.props.className;
      const language = /(?:^|\s)language-([^\s]+)/.exec(
        codeClassName ?? "",
      )?.[1];

      if (language && typeof children.props.children === "string") {
        const code = children.props.children.replace(/\n$/, "");

        if (language.toLowerCase() === "mermaid") {
          return (
            <MermaidDiagram
              source={code}
              sourceOffset={sourceOffset}
              appearanceKey={appearanceKey}
              curve={mermaidCurve}
            />
          );
        }

        return (
          <SyntaxHighlightedCode
            code={code}
            language={language}
            codeClassName={codeClassName}
            preProps={preProps}
            sourceOffset={sourceOffset}
          />
        );
      }
    }

    return (
      <pre {...preProps} tabIndex={-1} translate="no">
        {children}
      </pre>
    );
  },
  table: ({ node, ...tableProps }) => {
    void node;
    const sourceOffset = (
      tableProps as typeof tableProps & {
        "data-source-offset"?: string | number;
      }
    )["data-source-offset"];

    return (
      <div
        className="table-scroll"
        role="region"
        aria-label="표"
        tabIndex={-1}
        data-source-offset={sourceOffset}
      >
        <table {...tableProps} />
      </div>
    );
  },
} satisfies Components;

export const MarkdownPreview = memo(function MarkdownPreview({
  content,
  appearanceKey,
  mermaidCurve,
  onLinkActivate,
  resolveRelativeImage,
}: {
  content: string;
  appearanceKey: string;
  mermaidCurve: MermaidCurvePreference;
  onLinkActivate?: (href: string) => void | Promise<void>;
  resolveRelativeImage?: RelativeImageResolver;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const copy = usePreviewMarkdownCopy(rootRef, content);
  return (
    <MarkdownLinkContext value={onLinkActivate}>
      <MarkdownImageContext value={resolveRelativeImage}>
        <MarkdownAppearanceContext value={appearanceKey}>
          <MermaidCurveContext value={mermaidCurve}>
            <article ref={rootRef} className="markdown-body" onContextMenu={copy.onContextMenu}>
              <ReactMarkdown
                remarkPlugins={markdownPlugins}
                rehypePlugins={markdownRehypePlugins}
                components={markdownComponents}
              >
                {content}
              </ReactMarkdown>
            </article>
            {copy.error && <p role="status">{copy.error}</p>}
          </MermaidCurveContext>
        </MarkdownAppearanceContext>
      </MarkdownImageContext>
    </MarkdownLinkContext>
  );
});
