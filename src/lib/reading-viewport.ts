const minimumReadingFocusOffset = 72;
const maximumReadingFocusOffset = 180;
const readingFocusRatio = 0.2;

export function getReadingFocusOffset(viewportHeight: number) {
  return Math.min(
    maximumReadingFocusOffset,
    Math.max(minimumReadingFocusOffset, viewportHeight * readingFocusRatio),
  );
}
