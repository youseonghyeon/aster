import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { isRelativeAssetSource } from "../lib/markdown-links";

export type RelativeImageResolver = (src: string) => Promise<string>;

type RelativeMarkdownImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  resolveImage?: RelativeImageResolver;
};

export function RelativeMarkdownImage({
  src,
  alt,
  resolveImage,
  ...imageProps
}: RelativeMarkdownImageProps) {
  const shouldResolve = Boolean(src && isRelativeAssetSource(src));
  const [resolved, setResolved] = useState<{
    source: string;
    url: string | null;
    failed: boolean;
  }>({ source: src ?? "", url: shouldResolve ? null : (src ?? null), failed: false });

  useEffect(() => {
    let disposed = false;
    const source = src ?? "";
    if (!source || !isRelativeAssetSource(source)) {
      setResolved({ source, url: source || null, failed: false });
      return () => {
        disposed = true;
      };
    }
    if (!resolveImage) {
      setResolved({ source, url: null, failed: true });
      return () => {
        disposed = true;
      };
    }

    setResolved({ source, url: null, failed: false });
    void resolveImage(source)
      .then((url) => {
        if (!disposed) setResolved({ source, url, failed: false });
      })
      .catch(() => {
        if (!disposed) setResolved({ source, url: null, failed: true });
      });

    return () => {
      disposed = true;
    };
  }, [resolveImage, src]);

  if (shouldResolve && (resolved.source !== src || !resolved.url)) {
    return (
      <span
        className={`markdown-image-placeholder${resolved.source === src && resolved.failed ? " is-error" : ""}`}
        role="img"
        aria-label={
          resolved.source === src && resolved.failed
            ? `${alt || "이미지"}: 불러오지 못했습니다.`
            : `${alt || "이미지"}: 불러오는 중`
        }
      >
        {resolved.source === src && resolved.failed
          ? "이미지를 불러오지 못했습니다."
          : (alt ?? "이미지 불러오는 중…")}
      </span>
    );
  }

  return <img {...imageProps} src={resolved.url ?? undefined} alt={alt ?? ""} />;
}
