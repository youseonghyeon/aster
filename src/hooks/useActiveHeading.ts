import { useCallback, useEffect, useState } from "react";

const headingActivationOffset = 32;
const headingActivationTolerance = 1;
const scrollBottomTolerance = 2;

function getHeadingElements(container: HTMLElement, headingIds: string[]) {
  return headingIds.flatMap((headingId) => {
    const heading = container.querySelector<HTMLElement>(`#${headingId}`);
    return heading ? [heading] : [];
  });
}

export function useActiveHeading(
  container: HTMLElement | null,
  headingIds: string[],
) {
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(
    headingIds[0] ?? null,
  );

  useEffect(() => {
    if (!container || headingIds.length === 0) {
      setActiveHeadingId(headingIds[0] ?? null);
      return;
    }

    const scrollContainer = container;
    let animationFrame = 0;

    function updateActiveHeading() {
      const headings = getHeadingElements(scrollContainer, headingIds);

      if (headings.length === 0) {
        setActiveHeadingId(null);
        return;
      }

      const hasScrollableContent =
        scrollContainer.scrollHeight >
        scrollContainer.clientHeight + scrollBottomTolerance;
      const isAtBottom =
        hasScrollableContent &&
        scrollContainer.scrollTop + scrollContainer.clientHeight >=
          scrollContainer.scrollHeight - scrollBottomTolerance;

      if (isAtBottom) {
        setActiveHeadingId(headings[headings.length - 1]?.id ?? null);
        return;
      }

      const activationLine =
        scrollContainer.getBoundingClientRect().top + headingActivationOffset;
      let currentHeading = headings[0];

      for (const heading of headings) {
        if (
          heading.getBoundingClientRect().top >
          activationLine + headingActivationTolerance
        ) {
          break;
        }

        currentHeading = heading;
      }

      setActiveHeadingId(currentHeading.id);
    }

    function scheduleUpdate() {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updateActiveHeading);
    }

    scheduleUpdate();
    scrollContainer.addEventListener("scroll", scheduleUpdate, {
      passive: true,
    });

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(scrollContainer);

    if (scrollContainer.firstElementChild) {
      resizeObserver.observe(scrollContainer.firstElementChild);
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      scrollContainer.removeEventListener("scroll", scheduleUpdate);
      resizeObserver.disconnect();
    };
  }, [container, headingIds]);

  const navigateToHeading = useCallback(
    (headingId: string) => {
      if (!container) {
        return null;
      }

      const heading = container.querySelector<HTMLElement>(`#${headingId}`);

      if (!heading) {
        return null;
      }

      const containerTop = container.getBoundingClientRect().top;
      const headingTop = heading.getBoundingClientRect().top;
      const nextScrollTop =
        container.scrollTop +
        headingTop -
        containerTop -
        headingActivationOffset;
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      container.scrollTo({
        top: Math.max(0, nextScrollTop),
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
      return heading;
    },
    [container],
  );

  return { activeHeadingId, navigateToHeading };
}
