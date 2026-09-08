/** A bounded context search; no document-sized edit-distance matrix. */
export function createReadingOffsetMapper(previous: string, next: string) {
  if (previous === next) return (offset: number) =>
    Number.isInteger(offset) && offset >= 0 && offset <= previous.length ? offset : null;
  let prefix = 0;
  const commonLength = Math.min(previous.length, next.length);
  while (prefix < commonLength && previous[prefix] === next[prefix]) prefix += 1;
  let oldEnd = previous.length;
  let newEnd = next.length;
  while (oldEnd > prefix && newEnd > prefix && previous[oldEnd - 1] === next[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  // Share the search budget across the reading block and nested scroll regions.
  // Many changed blocks must not turn a large reload into quadratic work.
  let remainingSearches = 24;
  return (offset: number): number | null => {
    if (!Number.isInteger(offset) || offset < 0 || offset > previous.length) return null;
    if (offset < prefix) return offset;
    if (offset >= oldEnd) return offset + newEnd - oldEnd;

    // In a changed interval, require an unambiguous surviving local context.
    // Repeated matches are bounded and ties deliberately fall back to a neighbour.
    for (const length of [96, 32, 12]) {
      const needle = previous.slice(offset, Math.min(oldEnd, offset + length));
      if (needle.trim().length < 4) continue;
      if (remainingSearches === 0) return null;
      remainingSearches -= 1;
      let found = next.indexOf(needle, prefix);
      let best: number | null = null;
      let bestScore = -1;
      let tied = false;
      let candidates = 0;
      while (found >= 0 && found < newEnd && candidates < 64) {
        let before = 0;
        while (before < 64 && offset > before && found > before &&
          previous[offset - before - 1] === next[found - before - 1]) before += 1;
        let after = needle.length;
        while (after < 160 && offset + after < previous.length && found + after < next.length &&
          previous[offset + after] === next[found + after]) after += 1;
        const score = before + after;
        if (score > bestScore) {
          best = found;
          bestScore = score;
          tied = false;
        } else if (score === bestScore) tied = true;
        candidates += 1;
        found = next.indexOf(needle, found + 1);
      }
      if (best !== null && !tied && !(found >= 0 && found < newEnd)) return best;
    }
    return null;
  };
}
