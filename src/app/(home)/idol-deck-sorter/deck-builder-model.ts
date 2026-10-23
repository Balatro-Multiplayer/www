/**
 * The Idol Deck Sorter's authoritative deck-builder state: one row per
 * distinct (rank, suit, enhancement, edition, seal) variant, with a count of
 * physical copies. The grid, the text box, and the algorithm all derive from
 * (or converge back into) a `DeckBuilderEntry[]`.
 */

import {
  type DeckCardSnapshot,
  parseDeckCardsFromString,
} from '../log-parser/deck-utils'

export type DeckBuilderEntry = {
  rank: string
  suit: string
  enhancement: string | null
  edition: string | null
  seal: string | null
  count: number
}

export type EntryVariant = Omit<DeckBuilderEntry, 'count'>

/** Stable identity for a variant, independent of count — used as React keys and for lookups. */
export function entryKey(entry: EntryVariant): string {
  return `${entry.suit}_${entry.rank}_${entry.enhancement ?? 'none'}_${entry.edition ?? 'none'}_${entry.seal ?? 'none'}`
}

/**
 * The site's canonical single-card code, e.g. `S-A-none-none-none` — exactly
 * the token format `parseDeckCardsFromString` (from `log-parser/deck-utils`)
 * expects. That's deliberate: `expandEntriesToCards` builds a full deck
 * string out of these and hands it to that existing parser instead of
 * re-implementing rank/suit/enhancement/edition/seal normalization here.
 */
export function codeOfEntry(entry: EntryVariant): string {
  return `${entry.suit}-${entry.rank}-${entry.enhancement ?? 'none'}-${entry.edition ?? 'none'}-${entry.seal ?? 'none'}`
}

/** One canonical code token per physical copy, e.g. `count=3` -> the same code three times. Shared by `expandEntriesToCards` and `serializeCanonical`. */
export function canonicalTokensForEntries(
  entries: DeckBuilderEntry[]
): string[] {
  const tokens: string[] = []
  for (const entry of entries) {
    const code = codeOfEntry(entry)
    for (let copy = 0; copy < entry.count; copy++) {
      tokens.push(code)
    }
  }
  return tokens
}

/** Expands builder entries (one row per variant, with a count) into one physical card per copy. */
export function expandEntriesToCards(
  entries: DeckBuilderEntry[]
): DeckCardSnapshot[] {
  return parseDeckCardsFromString(canonicalTokensForEntries(entries).join(';'))
}

/** Inverse of `expandEntriesToCards`: groups physical cards back into variant rows with counts. */
export function collapseCardsToEntries(
  cards: DeckCardSnapshot[]
): DeckBuilderEntry[] {
  const byKey = new Map<string, DeckBuilderEntry>()

  for (const card of cards) {
    const variant: EntryVariant = {
      rank: card.rank,
      suit: card.suit,
      enhancement: card.enhancement,
      edition: card.edition,
      seal: card.seal,
    }
    const key = entryKey(variant)
    const existing = byKey.get(key)
    if (existing) {
      existing.count += 1
    } else {
      byKey.set(key, { ...variant, count: 1 })
    }
  }

  return [...byKey.values()]
}

/**
 * Adds or removes copies of a specific variant. `deltaCount` may be negative;
 * an entry whose count would drop to 0 or below is dropped from the list.
 * Never mutates `entries` — always returns a new array (or the same
 * reference when there's nothing to do, e.g. removing from an entry that
 * doesn't exist).
 */
export function upsertEntry(
  entries: DeckBuilderEntry[],
  patch: EntryVariant,
  deltaCount: number
): DeckBuilderEntry[] {
  const key = entryKey(patch)
  const index = entries.findIndex((entry) => entryKey(entry) === key)

  if (index === -1) {
    if (deltaCount <= 0) {
      return entries
    }
    return [...entries, { ...patch, count: deltaCount }]
  }

  const existing = entries[index]
  if (!existing) {
    return entries
  }

  const nextCount = existing.count + deltaCount
  if (nextCount <= 0) {
    return entries.filter((_entry, entryIndex) => entryIndex !== index)
  }

  const next = [...entries]
  next[index] = { ...existing, count: nextCount }
  return next
}

/** Removes a variant entirely, by its `entryKey`. */
export function removeEntry(
  entries: DeckBuilderEntry[],
  key: string
): DeckBuilderEntry[] {
  return entries.filter((entry) => entryKey(entry) !== key)
}
