export interface FuzzyMatchResult {
  matches: boolean;
  score: number;
  indices: number[];
}

export interface HighlightSegment {
  text: string;
  isMatch: boolean;
}

function isWordBoundary(target: string, index: number): boolean {
  if (index === 0) return true;
  const prev = target[index - 1];
  const curr = target[index];

  // Separators: space, hyphen, underscore, slash, dot
  if (/[\s\-_/.()[\],]/.test(prev)) return true;

  // CamelCase transition: lowercase followed by uppercase
  if (/[a-z]/.test(prev) && /[A-Z]/.test(curr)) return true;

  return false;
}

export function fuzzyMatch(target: string, query: string): FuzzyMatchResult {
  const cleanTarget = target.trim();
  const cleanQuery = query.trim();

  if (!cleanQuery) {
    return { matches: true, score: 0, indices: [] };
  }

  if (!cleanTarget) {
    return { matches: false, score: 0, indices: [] };
  }

  const lowerTarget = cleanTarget.toLowerCase();
  const lowerQuery = cleanQuery.toLowerCase();

  // 1. Exact Match
  if (lowerTarget === lowerQuery) {
    const indices: number[] = [];
    for (let i = 0; i < cleanTarget.length; i++) {
      indices.push(i);
    }
    return { matches: true, score: 1000 + Math.max(0, 100 - cleanTarget.length), indices };
  }

  // 2. Prefix Match
  if (lowerTarget.startsWith(lowerQuery)) {
    const indices: number[] = [];
    for (let i = 0; i < lowerQuery.length; i++) {
      indices.push(i);
    }
    const score = 800 - Math.min(200, (cleanTarget.length - lowerQuery.length) * 2);
    return { matches: true, score, indices };
  }

  // 3. Word-Boundary Prefix Match (e.g. "view" in "Reset Viewport")
  const words = cleanTarget.split(/[\s\-_/.]+/);
  let charOffset = 0;
  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    const wordLower = word.toLowerCase();
    const wordIndex = lowerTarget.indexOf(wordLower, charOffset);
    charOffset = wordIndex >= 0 ? wordIndex + word.length : charOffset;

    if (wordIndex >= 0 && wordLower.startsWith(lowerQuery)) {
      const indices: number[] = [];
      for (let i = 0; i < lowerQuery.length; i++) {
        indices.push(wordIndex + i);
      }
      const score = 650 - w * 20 - Math.min(100, (word.length - lowerQuery.length) * 2);
      return { matches: true, score, indices };
    }
  }

  // 4. Acronym Match (e.g. "rv" for "Reset Viewport", "tgm" for "Toggle Minimap")
  const wordInitials: Array<{ char: string; index: number }> = [];
  for (let i = 0; i < cleanTarget.length; i++) {
    if (isWordBoundary(cleanTarget, i) && /[a-zA-Z0-9]/.test(cleanTarget[i])) {
      wordInitials.push({ char: cleanTarget[i].toLowerCase(), index: i });
    }
  }

  if (wordInitials.length >= lowerQuery.length && lowerQuery.length > 1) {
    let initialIdx = 0;
    const acronymIndices: number[] = [];
    let matchedAcronym = true;

    for (let q = 0; q < lowerQuery.length; q++) {
      const qChar = lowerQuery[q];
      let found = false;
      while (initialIdx < wordInitials.length) {
        if (wordInitials[initialIdx].char === qChar) {
          acronymIndices.push(wordInitials[initialIdx].index);
          initialIdx++;
          found = true;
          break;
        }
        initialIdx++;
      }
      if (!found) {
        matchedAcronym = false;
        break;
      }
    }

    if (matchedAcronym) {
      const score = 550 + Math.max(0, 50 - (cleanTarget.length - lowerQuery.length));
      return { matches: true, score, indices: acronymIndices };
    }
  }

  // 5. Subsequence Fuzzy Match with scoring
  const targetLen = cleanTarget.length;
  const queryLen = lowerQuery.length;

  let queryIndex = 0;
  let targetIndex = 0;
  const matchIndices: number[] = [];
  let score = 100;
  let consecutiveMatches = 0;
  let prevMatchIndex = -1;

  while (queryIndex < queryLen && targetIndex < targetLen) {
    const qChar = lowerQuery[queryIndex];
    const tChar = lowerTarget[targetIndex];

    if (qChar === tChar) {
      matchIndices.push(targetIndex);

      // Bonuses
      if (isWordBoundary(cleanTarget, targetIndex)) {
        score += 35;
      }

      if (prevMatchIndex >= 0 && targetIndex === prevMatchIndex + 1) {
        consecutiveMatches++;
        score += 20 * consecutiveMatches;
      } else {
        consecutiveMatches = 0;
        if (prevMatchIndex >= 0) {
          const gap = targetIndex - prevMatchIndex - 1;
          score -= Math.min(30, gap * 2);
        }
      }

      // First character position penalty
      if (queryIndex === 0) {
        score -= Math.min(40, targetIndex * 3);
      }

      prevMatchIndex = targetIndex;
      queryIndex++;
    }

    targetIndex++;
  }

  if (queryIndex === queryLen) {
    const finalScore = Math.max(10, score + Math.max(0, 100 - targetLen));
    return { matches: true, score: finalScore, indices: matchIndices };
  }

  return { matches: false, score: 0, indices: [] };
}

export function highlightMatches(text: string, indices: number[]): HighlightSegment[] {
  if (!text) return [];
  if (!indices || indices.length === 0) {
    return [{ text, isMatch: false }];
  }

  const indexSet = new Set(indices);
  const segments: HighlightSegment[] = [];
  let currentSegment = "";
  let isCurrentMatch = indexSet.has(0);

  for (let i = 0; i < text.length; i++) {
    const isCharMatch = indexSet.has(i);
    if (isCharMatch === isCurrentMatch) {
      currentSegment += text[i];
    } else {
      if (currentSegment) {
        segments.push({ text: currentSegment, isMatch: isCurrentMatch });
      }
      currentSegment = text[i];
      isCurrentMatch = isCharMatch;
    }
  }

  if (currentSegment) {
    segments.push({ text: currentSegment, isMatch: isCurrentMatch });
  }

  return segments;
}

export interface FuzzySearchable {
  id: string;
  title: string;
  description?: string;
  keywords?: string[];
}

export interface ScoredSearchResult<T> {
  item: T;
  score: number;
  titleMatches: number[];
  descriptionMatches: number[];
}

export function fuzzySearchItems<T extends FuzzySearchable>(
  items: T[],
  query: string,
): Array<ScoredSearchResult<T>> {
  const trimmed = query.trim();
  if (!trimmed) {
    return items.map((item) => ({
      item,
      score: 0,
      titleMatches: [],
      descriptionMatches: [],
    }));
  }

  const scored: Array<ScoredSearchResult<T>> = [];

  for (const item of items) {
    const titleMatch = fuzzyMatch(item.title, trimmed);
    let bestScore = titleMatch.matches ? titleMatch.score : 0;
    const titleIndices = titleMatch.indices;
    let descriptionIndices: number[] = [];

    if (item.description) {
      const descMatch = fuzzyMatch(item.description, trimmed);
      if (descMatch.matches) {
        const descScore = Math.floor(descMatch.score * 0.7);
        if (descScore > bestScore) {
          bestScore = descScore;
        }
        descriptionIndices = descMatch.indices;
      }
    }

    if (item.keywords && item.keywords.length > 0) {
      for (const kw of item.keywords) {
        const kwMatch = fuzzyMatch(kw, trimmed);
        if (kwMatch.matches) {
          const kwScore = Math.floor(kwMatch.score * 0.85);
          if (kwScore > bestScore) {
            bestScore = kwScore;
          }
        }
      }
    }

    if (bestScore > 0 || (titleMatch.matches && trimmed.length > 0)) {
      scored.push({
        item,
        score: bestScore,
        titleMatches: titleIndices,
        descriptionMatches: descriptionIndices,
      });
    }
  }

  return scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.item.title.localeCompare(b.item.title);
  });
}
