/**
 * A friendlier, hand-typeable alternative to the site's canonical deck
 * string, plus the glue that lets the Idol Deck Sorter's text box accept
 * either format interchangeably.
 *
 * Grammar (one card per line):
 *
 *   card-line := (count "x")? rank suit ("-" modifier)*
 *   count     := digit+                                   # default 1
 *   rank      := "2".."9" | "10" | "T" | "J" | "Q" | "K" | "A"   (case-insensitive)
 *   suit      := "S" | "H" | "C" | "D" | ♠ | ♥ | ♣ | ♦            (case-insensitive)
 *   modifier  := enhancement | edition | seal                     (order-independent, at most one of each)
 *   enhancement := bonus | mult | wild | glass | steel | stone | gold | lucky
 *   edition      := foil | holo | holographic | polychrome | poly
 *   seal         := redseal | blueseal | goldseal | purpleseal
 *
 * Examples: "AS", "4x KH-steel-foil", "10H-goldseal", "2xQC-glass".
 *
 * Naming-collision note: bare "gold" is the Gold *enhancement* — a seal must
 * be written as one word, "goldseal" (similarly "redseal"/"blueseal"/
 * "purpleseal"), never bare "red"/"blue"/"purple"/"gold" for a seal. This is
 * how the Gold-enhancement/Gold-seal name collision is resolved.
 *
 * Blank lines and `#`-prefixed (or trailing `#...`) comments are ignored.
 */

import { parseDeckCardsFromString } from '../log-parser/deck-utils'
import {
  canonicalTokensForEntries,
  collapseCardsToEntries,
  type DeckBuilderEntry,
  type EntryVariant,
  entryKey,
} from './deck-builder-model'

export type ParseResult =
  | { ok: true; entries: DeckBuilderEntry[] }
  | { ok: false; error: { line: number; message: string } }

const ENHANCEMENT_TOKENS: Record<string, string> = {
  bonus: 'm_bonus',
  mult: 'm_mult',
  wild: 'm_wild',
  glass: 'm_glass',
  steel: 'm_steel',
  stone: 'm_stone',
  gold: 'm_gold',
  lucky: 'm_lucky',
}

const EDITION_TOKENS: Record<string, string> = {
  foil: 'foil',
  holo: 'holo',
  holographic: 'holo',
  polychrome: 'polychrome',
  poly: 'polychrome',
}

const SEAL_TOKENS: Record<string, string> = {
  redseal: 'Red',
  blueseal: 'Blue',
  goldseal: 'Gold',
  purpleseal: 'Purple',
}

// Reverse maps for serialization. Written out explicitly (not derived from
// the parse-direction maps above) because those are many-to-one — e.g.
// "holo"/"holographic" both parse to `edition: 'holo'` — so there's no single
// correct inverse to compute; a canonical display label is picked by hand.
const ENHANCEMENT_LABELS: Record<string, string> = {
  m_bonus: 'bonus',
  m_mult: 'mult',
  m_wild: 'wild',
  m_glass: 'glass',
  m_steel: 'steel',
  m_stone: 'stone',
  m_gold: 'gold',
  m_lucky: 'lucky',
}
const EDITION_LABELS: Record<string, string> = {
  foil: 'foil',
  holo: 'holo',
  polychrome: 'polychrome',
}
const SEAL_LABELS: Record<string, string> = {
  Red: 'redseal',
  Blue: 'blueseal',
  Gold: 'goldseal',
  Purple: 'purpleseal',
}

const SUIT_GLYPH_TO_CODE: Record<string, string> = {
  '♠': 'S',
  '♥': 'H',
  '♣': 'C',
  '♦': 'D',
}

const CARD_LINE_RE =
  /^(?:(\d+)\s*x\s*)?(10|[2-9TJQKA])([SHCD♠♥♣♦])((?:-[A-Za-z]+)*)$/i

/** Everything from the first unescaped `#` onward is a comment. */
function stripComment(line: string): string {
  const hashIndex = line.indexOf('#')
  return hashIndex === -1 ? line : line.slice(0, hashIndex)
}

type ModifierCategory = 'enhancement' | 'edition' | 'seal'

function classifyModifier(
  token: string
): { category: ModifierCategory; value: string } | null {
  const lower = token.toLowerCase()
  if (lower in ENHANCEMENT_TOKENS) {
    return {
      category: 'enhancement',
      value: ENHANCEMENT_TOKENS[lower] as string,
    }
  }
  if (lower in EDITION_TOKENS) {
    return { category: 'edition', value: EDITION_TOKENS[lower] as string }
  }
  if (lower in SEAL_TOKENS) {
    return { category: 'seal', value: SEAL_TOKENS[lower] as string }
  }
  return null
}

/** Parses the site's hand-typeable shorthand into deck-builder entries. */
export function parseShorthand(raw: string): ParseResult {
  const byKey = new Map<string, DeckBuilderEntry>()
  const lines = raw.split('\n')

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1
    const trimmed = stripComment(lines[index] ?? '').trim()
    if (!trimmed) {
      continue
    }

    const match = CARD_LINE_RE.exec(trimmed)
    if (!match) {
      return {
        ok: false,
        error: {
          line: lineNumber,
          message: `Could not parse "${trimmed}" — expected something like "AS" or "4x KH-steel-foil"`,
        },
      }
    }

    const [, countRaw, rankRaw, suitRaw, modifiersRaw] = match
    const count = countRaw ? Number.parseInt(countRaw, 10) : 1
    if (!Number.isFinite(count) || count < 1) {
      return {
        ok: false,
        error: {
          line: lineNumber,
          message: `Count must be at least 1 (got "${countRaw}")`,
        },
      }
    }

    const rank = rankRaw === '10' ? 'T' : (rankRaw ?? '').toUpperCase()
    const suit =
      SUIT_GLYPH_TO_CODE[suitRaw ?? ''] ?? (suitRaw ?? '').toUpperCase()

    const modifierTokens = (modifiersRaw ?? '').split('-').filter(Boolean)
    const modifiers: Record<ModifierCategory, string | null> = {
      enhancement: null,
      edition: null,
      seal: null,
    }
    const seenTokens: Record<ModifierCategory, string | null> = {
      enhancement: null,
      edition: null,
      seal: null,
    }

    for (const rawToken of modifierTokens) {
      const classified = classifyModifier(rawToken)
      if (!classified) {
        const lower = rawToken.toLowerCase()
        const hint =
          lower === 'red' || lower === 'blue' || lower === 'purple'
            ? ` — did you mean "${lower}seal"?`
            : ''
        return {
          ok: false,
          error: {
            line: lineNumber,
            message: `Unrecognized modifier "${rawToken}"${hint}`,
          },
        }
      }
      if (modifiers[classified.category] !== null) {
        return {
          ok: false,
          error: {
            line: lineNumber,
            message: `A card can only have one ${classified.category} — got both "${seenTokens[classified.category]}" and "${rawToken}"`,
          },
        }
      }
      modifiers[classified.category] = classified.value
      seenTokens[classified.category] = rawToken
    }

    const variant: EntryVariant = {
      rank,
      suit,
      enhancement: modifiers.enhancement,
      edition: modifiers.edition,
      seal: modifiers.seal,
    }
    const key = entryKey(variant)
    const existing = byKey.get(key)
    if (existing) {
      existing.count += count
    } else {
      byKey.set(key, { ...variant, count })
    }
  }

  return { ok: true, entries: [...byKey.values()] }
}

const CANONICAL_TOKEN_RE =
  /^[SHCD]-(?:[2-9TJQKA])-[A-Za-z_]+-[A-Za-z_]+-[A-Za-z_]+$/

function looksCanonical(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) {
    return false
  }
  const tokens = trimmed
    .split(';')
    .map((token) => token.trim())
    .filter(Boolean)
  return (
    tokens.length > 0 && tokens.every((token) => CANONICAL_TOKEN_RE.test(token))
  )
}

/**
 * Parses either format: detects the site's canonical `S-A-none-none-none;...`
 * string (e.g. pasted from a real parsed log's deck) and routes it through
 * the existing `parseDeckCardsFromString`; otherwise parses as shorthand.
 */
export function parseDeckText(raw: string): ParseResult {
  if (looksCanonical(raw)) {
    return {
      ok: true,
      entries: collapseCardsToEntries(parseDeckCardsFromString(raw)),
    }
  }
  return parseShorthand(raw)
}

/** Renders entries back to shorthand, one line per variant. */
export function serializeShorthand(entries: DeckBuilderEntry[]): string {
  return entries
    .map((entry) => {
      const prefix = entry.count === 1 ? '' : `${entry.count}x `
      const modifierTokens = [
        entry.enhancement ? ENHANCEMENT_LABELS[entry.enhancement] : null,
        entry.edition ? EDITION_LABELS[entry.edition] : null,
        entry.seal ? SEAL_LABELS[entry.seal] : null,
      ].filter((token): token is string => Boolean(token))
      const modifierSuffix =
        modifierTokens.length > 0 ? `-${modifierTokens.join('-')}` : ''
      return `${prefix}${entry.rank}${entry.suit}${modifierSuffix}`
    })
    .join('\n')
}

/** Renders entries to the site's canonical `S-A-none-none-none;...` deck string. */
export function serializeCanonical(entries: DeckBuilderEntry[]): string {
  return canonicalTokensForEntries(entries).join(';')
}
