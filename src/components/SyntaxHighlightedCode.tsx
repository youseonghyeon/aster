import {
  memo,
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import { normalizeSyntaxLanguage } from "../lib/syntax-languages";

type SyntaxHighlightedCodeProps = {
  code: string;
  language: string;
  codeClassName?: string;
  preProps: ComponentPropsWithoutRef<"pre">;
  sourceOffset?: string | number;
};

export const SyntaxHighlightedCode = memo(function SyntaxHighlightedCode({
  code,
  language,
  codeClassName,
  preProps,
  sourceOffset,
}: SyntaxHighlightedCodeProps) {
  const normalizedLanguage = normalizeSyntaxLanguage(language);
  const [highlightedCode, setHighlightedCode] = useState<string | null>(null);

  useEffect(() => {
    let isCurrentRequest = true;

    setHighlightedCode(null);

    if (!normalizedLanguage) {
      return () => {
        isCurrentRequest = false;
      };
    }

    void import("../lib/syntax-highlighter")
      .then(({ highlightCode }) => highlightCode(code, normalizedLanguage))
      .then((html) => {
        if (isCurrentRequest) {
          setHighlightedCode(html);
        }
      })
      .catch(() => {
        // A plain code block remains readable if highlighting cannot load.
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [code, normalizedLanguage]);

  if (!highlightedCode) {
    return (
      <pre {...preProps} tabIndex={0} translate="no">
        <code className={codeClassName}>{code}</code>
      </pre>
    );
  }

  return (
    <div
      className="syntax-highlighted-code"
      translate="no"
      data-source-offset={sourceOffset}
      dangerouslySetInnerHTML={{ __html: highlightedCode }}
    />
  );
});
