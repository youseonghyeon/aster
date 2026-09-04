import { useCallback, useEffect, useState } from "react";
import { getReadingFocusOffset } from "../lib/reading-viewport";

const headingActivationTolerance = 1;
const headingPositionTolerance = 24;
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
      const isAtTop = scrollContainer.scrollTop <= scrollBottomTolerance;
      const isAtBottom =
        hasScrollableContent &&
        scrollContainer.scrollTop + scrollContainer.clientHeight >=
          scrollContainer.scrollHeight - scrollBottomTolerance;

      if (isAtTop) {
        setActiveHeadingId(headings[0]?.id ?? null);
        return;
      }

      if (isAtBottom) {
        setActiveHeadingId(headings[headings.length - 1]?.id ?? null);
        return;
      }

      const activationLine =
        scrollContainer.getBoundingClientRect().top +
        getReadingFocusOffset(scrollContainer.clientHeight) +
        headingPositionTolerance;
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
      const readingFocusOffset = getReadingFocusOffset(container.clientHeight);
      const nextScrollTop =
        container.scrollTop +
        headingTop -
        containerTop -
        readingFocusOffset;
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      // REGRESSION GUARD: activeHeadingId remains owned by the viewport during
      // smooth navigation. Never preselect the clicked destination here: the
      // observer would immediately replace C with the still-visible A and then
      // report B and C, recreating the C -> A -> B -> C flash from v1.7.0.
      // Cover the start, intermediate, and arrival scroll events in tests.
      if (
        Math.abs(headingTop - containerTop - readingFocusOffset) <=
        headingPositionTolerance
      ) {
        // No scroll event will fire when the heading is already at the focus
        // line, so this is the only branch that synchronizes state directly.
        setActiveHeadingId(headingId);
        return heading;
      }
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
