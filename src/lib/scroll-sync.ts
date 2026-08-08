export type ScrollSyncPoint = {
  sourceOffset: number;
  editorY: number;
  previewY: number;
};

export type ScrollSyncMap = {
  points: ScrollSyncPoint[];
  editorMax: number;
  previewMax: number;
};

export const maximumScrollSyncAnchors = 180;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function sampleSourceOffsets(offsets: number[], maximum: number) {
  const uniqueOffsets = Array.from(new Set(offsets)).sort(
    (left, right) => left - right,
  );

  if (uniqueOffsets.length <= maximum) {
    return uniqueOffsets;
  }

  const sampled: number[] = [];

  for (let index = 0; index < maximum; index += 1) {
    const sourceIndex = Math.round(
      (index * (uniqueOffsets.length - 1)) / (maximum - 1),
    );
    const offset = uniqueOffsets[sourceIndex];

    if (sampled[sampled.length - 1] !== offset) {
      sampled.push(offset);
    }
  }

  return sampled;
}

export function createScrollSyncMap(
  points: ScrollSyncPoint[],
  markdownLength: number,
  editorMax: number,
  previewMax: number,
): ScrollSyncMap {
  const boundedEditorMax = Math.max(0, editorMax);
  const boundedPreviewMax = Math.max(0, previewMax);
  const normalized: ScrollSyncPoint[] = [
    { sourceOffset: 0, editorY: 0, previewY: 0 },
  ];

  points
    .slice()
    .sort((left, right) => left.sourceOffset - right.sourceOffset)
    .forEach((point) => {
      const nextPoint = {
        sourceOffset: clamp(point.sourceOffset, 0, markdownLength),
        editorY: clamp(point.editorY, 0, boundedEditorMax),
        previewY: clamp(point.previewY, 0, boundedPreviewMax),
      };
      const previous = normalized[normalized.length - 1];

      if (
        !previous ||
        nextPoint.sourceOffset <= previous.sourceOffset ||
        nextPoint.editorY <= previous.editorY ||
        nextPoint.previewY <= previous.previewY ||
        nextPoint.sourceOffset >= markdownLength ||
        nextPoint.editorY >= boundedEditorMax ||
        nextPoint.previewY >= boundedPreviewMax
      ) {
        return;
      }

      normalized.push(nextPoint);
    });

  const endPoint = {
    sourceOffset: markdownLength,
    editorY: boundedEditorMax,
    previewY: boundedPreviewMax,
  };
  const previous = normalized[normalized.length - 1];

  if (
    !previous ||
    previous.sourceOffset !== endPoint.sourceOffset ||
    previous.editorY !== endPoint.editorY ||
    previous.previewY !== endPoint.previewY
  ) {
    normalized.push(endPoint);
  }

  return {
    points: normalized,
    editorMax: boundedEditorMax,
    previewMax: boundedPreviewMax,
  };
}

export function mapScrollPosition(
  map: ScrollSyncMap,
  source: "editor" | "preview",
  position: number,
) {
  const sourceKey = source === "editor" ? "editorY" : "previewY";
  const targetKey = source === "editor" ? "previewY" : "editorY";
  const sourceMaximum =
    source === "editor" ? map.editorMax : map.previewMax;
  const targetMaximum =
    source === "editor" ? map.previewMax : map.editorMax;

  if (sourceMaximum <= 0 || targetMaximum <= 0) {
    return 0;
  }

  const boundedPosition = clamp(position, 0, sourceMaximum);

  if (boundedPosition <= 0) {
    return 0;
  }

  if (boundedPosition >= sourceMaximum) {
    return targetMaximum;
  }

  for (let index = 1; index < map.points.length; index += 1) {
    const previous = map.points[index - 1];
    const next = map.points[index];

    if (boundedPosition > next[sourceKey]) {
      continue;
    }

    const distance = next[sourceKey] - previous[sourceKey];
    const progress =
      distance > 0 ? (boundedPosition - previous[sourceKey]) / distance : 0;

    return clamp(
      previous[targetKey] + (next[targetKey] - previous[targetKey]) * progress,
      0,
      targetMaximum,
    );
  }

  return targetMaximum;
}
