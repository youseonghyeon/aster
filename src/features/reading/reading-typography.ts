import type { ReadingFont } from "./reading-preferences";

export type ReadingTypographyCompensation = {
  fontWeight: number;
  textStrokeWidth: number;
};

type VariableWeightProfile = {
  kind: "variable";
  maximumWeight: number;
};

type SteppedWeightProfile = {
  kind: "stepped";
  compactWeight: number;
  compactThreshold: number;
};

type StrokeProfile = {
  kind: "stroke";
  maximumStrokeWidth: number;
};

type TypographyProfile =
  | VariableWeightProfile
  | SteppedWeightProfile
  | StrokeProfile;

const comfortableFontSize = 17;
const minimumCompensatedFontSize = 12;

const typographyProfiles: Record<ReadingFont, TypographyProfile> = {
  // Pretendard is bundled as static faces, so use its real 500 face instead of
  // asking WebKit to synthesize intermediate weights.
  pretendard: {
    kind: "stepped",
    compactWeight: 500,
    compactThreshold: 15.5,
  },
  "noto-sans": { kind: "variable", maximumWeight: 500 },
  // Gowun Batang only provides 400 and 700. Jumping to 700 makes small body
  // copy look bold, so a sub-pixel stroke supplies only the missing density.
  "gowun-batang": { kind: "stroke", maximumStrokeWidth: 0.14 },
  "noto-serif": { kind: "variable", maximumWeight: 525 },
  system: { kind: "variable", maximumWeight: 480 },
  literata: { kind: "variable", maximumWeight: 510 },
  "eb-garamond": { kind: "variable", maximumWeight: 540 },
  "dancing-script": { kind: "variable", maximumWeight: 520 },
};

function getCompensationRatio(effectiveFontSize: number) {
  const compensatedSize = Math.min(
    comfortableFontSize,
    Math.max(minimumCompensatedFontSize, effectiveFontSize),
  );

  return (
    (comfortableFontSize - compensatedSize) /
    (comfortableFontSize - minimumCompensatedFontSize)
  );
}

/**
 * Keeps small reading text optically dense without adding another preference.
 * The effective size already includes reading zoom, so zooming out receives the
 * same compensation as selecting a smaller body size.
 */
export function getReadingTypographyCompensation(
  font: ReadingFont,
  effectiveFontSize: number,
): ReadingTypographyCompensation {
  const profile = typographyProfiles[font];

  if (profile.kind === "stepped") {
    return {
      fontWeight:
        effectiveFontSize <= profile.compactThreshold
          ? profile.compactWeight
          : 400,
      textStrokeWidth: 0,
    };
  }

  const compensationRatio = getCompensationRatio(effectiveFontSize);

  if (profile.kind === "stroke") {
    return {
      fontWeight: 400,
      textStrokeWidth: Number(
        (profile.maximumStrokeWidth * compensationRatio).toFixed(3),
      ),
    };
  }

  return {
    fontWeight:
      Math.round(
        (400 + (profile.maximumWeight - 400) * compensationRatio) / 5,
      ) * 5,
    textStrokeWidth: 0,
  };
}
