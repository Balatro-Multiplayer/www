/**
 * Shared playing-card rank/suit primitives. Rank/suit ordering, names, and
 * glyphs are otherwise duplicated ad hoc across `deck-utils.ts`,
 * `idol-hit-geometry.ts`, and `deck-view.tsx` — this file exists because the
 * idol-sort algorithm, the deck builder grid, and the deck shorthand parser
 * all need the exact same ordering, and a fourth ad hoc copy wasn't worth it.
 * Those three existing files are left untouched (out of scope for this
 * feature) — only new code imports from here.
 */

/** Registration order used by vanilla Balatro/SMODS: 2..9, T(10), J, Q, K, A. */
export const RANK_ORDER = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'T',
  'J',
  'Q',
  'K',
  'A',
] as const

export type Rank = (typeof RANK_ORDER)[number]

/** Registration order used by vanilla Balatro/SMODS. Matches deck-view.tsx's SUIT_ORDER. */
export const SUIT_ORDER = ['S', 'H', 'C', 'D'] as const

export type Suit = (typeof SUIT_ORDER)[number]

export const RANK_NAMES: Record<Rank, string> = {
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  T: '10',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
  A: 'Ace',
}

export const SUIT_NAMES: Record<Suit, string> = {
  H: 'Hearts',
  C: 'Clubs',
  D: 'Diamonds',
  S: 'Spades',
}

export const SUIT_GLYPH: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  C: '♣',
  D: '♦',
}

/** Ranks the idol algorithm treats as "face" ranks. */
export const FACE_RANKS: readonly Rank[] = ['J', 'Q', 'K', 'A']

/** Ranks the idol algorithm treats as "low" (nominal 2-5) ranks. */
export const LOW_RANKS: readonly Rank[] = ['2', '3', '4', '5']

export function isRank(value: string): value is Rank {
  return (RANK_ORDER as readonly string[]).includes(value)
}

export function isSuit(value: string): value is Suit {
  return (SUIT_ORDER as readonly string[]).includes(value)
}

/** Positional index (1-based) of a rank in registration order, or -1 if unknown. */
export function rankIndex(rank: string): number {
  const index = RANK_ORDER.indexOf(rank as Rank)
  return index === -1 ? -1 : index + 1
}

/** Positional index (1-based) of a suit in registration order, or -1 if unknown. */
export function suitIndex(suit: string): number {
  const index = SUIT_ORDER.indexOf(suit as Suit)
  return index === -1 ? -1 : index + 1
}

/**
 * The rank one position back in registration order, wrapping around (the
 * predecessor of the first rank, '2', is the last rank, 'A') — mirrors
 * TheOrder.lua's `previous_rank_key`, used for the idol algorithm's
 * Strength-adjacency scoring. Falls back to the input when it isn't a known
 * rank rather than throwing, since callers already guard on `isRank`.
 */
export function previousRank(rank: string): string {
  const index = RANK_ORDER.indexOf(rank as Rank)
  if (index === -1) {
    return rank
  }
  const previousIndex = index === 0 ? RANK_ORDER.length - 1 : index - 1
  return RANK_ORDER[previousIndex] as Rank
}
