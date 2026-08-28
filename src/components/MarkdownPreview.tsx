import { createElement, isValidElement, memo, type HTMLAttributes, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { getMarkdownHeadingId } from "../lib/markdown-outline";
import { rehypeMarkdownSourceOffsets } from "../lib/markdown-source-offsets";
import { SyntaxHighlightedCode } from "./SyntaxHighlightedCode";

const markdownPlugins = [remarkGfm];
const markdownRehypePlugins = [rehypeMarkdownSourceOffsets];

type MarkdownHeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  node?: {
    position?: {
      start: {
        offset?: number;
      };
    };
  };
};

function createMarkdownHeading(
  tagName: "h1" | "h2" | "h3" | "h4" | "h5" | "h6",
) {
  return function MarkdownHeading({
    node,
    ...headingProps
  }: MarkdownHeadingProps) {
    const id = getMarkdownHeadingId(node?.position?.start.offset);

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

const markdownComponents = {
  h1: MarkdownHeading1,
  h2: MarkdownHeading2,
  h3: MarkdownHeading3,
  h4: MarkdownHeading4,
  h5: MarkdownHeading5,
  h6: MarkdownHeading6,
  pre: ({ node, children, ...preProps }) => {
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
        return (
          <SyntaxHighlightedCode
            code={children.props.children.replace(/\n$/, "")}
            language={language}
            codeClassName={codeClassName}
            preProps={preProps}
            sourceOffset={sourceOffset}
          />
        );
      }
    }

    return (
      <pre {...preProps} tabIndex={0} translate="no">
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
        tabIndex={0}
        data-source-offset={sourceOffset}
      >
        <table {...tableProps} />
      </div>
    );
  },
} satisfies Components;

export const MarkdownPreview = memo(function MarkdownPreview({
  content,
}: {
  content: string;
}) {
  return (
    <article className="markdown-body">
      <ReactMarkdown
        remarkPlugins={markdownPlugins}
        rehypePlugins={markdownRehypePlugins}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
});
