import { describe, expect, test } from 'bun:test'
import type { DeckBuilderEntry } from './deck-builder-model'
import {
  parseDeckText,
  parseShorthand,
  serializeCanonical,
  serializeShorthand,
} from './deck-shorthand'

function sortedKeys(entries: DeckBuilderEntry[]): string[] {
  return entries
    .map(
      (e) =>
        `${e.suit}${e.rank}-${e.enhancement}-${e.edition}-${e.seal}x${e.count}`
    )
    .sort()
}

describe('parseShorthand — valid lines', () => {
  test('a bare card defaults to count 1, no modifiers', () => {
    const result = parseShorthand('AS')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entries).toEqual([
        {
          rank: 'A',
          suit: 'S',
          enhancement: null,
          edition: null,
          seal: null,
          count: 1,
        },
      ])
    }
  })

  test('a count prefix multiplies the card', () => {
    const result = parseShorthand('4x KH-steel-foil')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entries).toEqual([
        {
          rank: 'K',
          suit: 'H',
          enhancement: 'm_steel',
          edition: 'foil',
          seal: null,
          count: 4,
        },
      ])
    }
  })

  test('is case-insensitive on rank, suit, count "x", and modifiers', () => {
    const result = parseShorthand('4X kh-STEEL')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entries).toEqual([
        {
          rank: 'K',
          suit: 'H',
          enhancement: 'm_steel',
          edition: null,
          seal: null,
          count: 4,
        },
      ])
    }
  })

  test('"10H" normalizes rank to "T"', () => {
    const result = parseShorthand('10H-goldseal')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entries).toEqual([
        {
          rank: 'T',
          suit: 'H',
          enhancement: null,
          edition: null,
          seal: 'Gold',
          count: 1,
        },
      ])
    }
  })

  test('accepts glyph suits', () => {
    const result = parseShorthand('A♠')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entries).toEqual([
        {
          rank: 'A',
          suit: 'S',
          enhancement: null,
          edition: null,
          seal: null,
          count: 1,
        },
      ])
    }
  })

  test('blank lines and #-comments are ignored, including trailing inline comments', () => {
    const result = parseShorthand(
      [
        'AS # ace of spades',
        '',
        '  ',
        '# a full-line comment',
        '2xQC-glass',
      ].join('\n')
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(sortedKeys(result.entries)).toEqual(
        sortedKeys([
          {
            rank: 'A',
            suit: 'S',
            enhancement: null,
            edition: null,
            seal: null,
            count: 1,
          },
          {
            rank: 'Q',
            suit: 'C',
            enhancement: 'm_glass',
            edition: null,
            seal: null,
            count: 2,
          },
        ])
      )
    }
  })

  test('repeated lines for the same variant accumulate count instead of duplicating rows', () => {
    const result = parseShorthand('AS\nAS\n2xAS')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entries).toEqual([
        {
          rank: 'A',
          suit: 'S',
          enhancement: null,
          edition: null,
          seal: null,
          count: 4,
        },
      ])
    }
  })
})

describe('parseShorthand — gold enhancement vs Gold seal disambiguation', () => {
  test('bare "gold" is the Gold enhancement', () => {
    const result = parseShorthand('KH-gold')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entries[0]?.enhancement).toBe('m_gold')
      expect(result.entries[0]?.seal).toBeNull()
    }
  })

  test('"goldseal" is the Gold seal', () => {
    const result = parseShorthand('KH-goldseal')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entries[0]?.enhancement).toBeNull()
      expect(result.entries[0]?.seal).toBe('Gold')
    }
  })

  test('both together parse as one card carrying both', () => {
    const result = parseShorthand('KH-gold-goldseal')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entries[0]?.enhancement).toBe('m_gold')
      expect(result.entries[0]?.seal).toBe('Gold')
    }
  })
})

describe('parseShorthand — errors', () => {
  test('two enhancement tokens on one card is a conflict error naming both', () => {
    const result = parseShorthand('KH-steel-gold')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.line).toBe(1)
      expect(result.error.message).toContain('steel')
      expect(result.error.message).toContain('gold')
    }
  })

  test('an unrecognized token errors with the line number', () => {
    const result = parseShorthand('KH-sparkly')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.line).toBe(1)
      expect(result.error.message).toContain('sparkly')
    }
  })

  test('a bare seal-color word hints at the "...seal" spelling', () => {
    const result = parseShorthand('KH-red')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain('redseal')
    }
  })

  test('an unparseable line reports its 1-based line number', () => {
    const result = parseShorthand('AS\nnot a card\nKH')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.line).toBe(2)
    }
  })
})

describe('shorthand round trip', () => {
  test('entries -> serializeShorthand -> parseShorthand recovers the same entries', () => {
    const entries: DeckBuilderEntry[] = [
      {
        rank: 'A',
        suit: 'S',
        enhancement: null,
        edition: null,
        seal: null,
        count: 1,
      },
      {
        rank: 'K',
        suit: 'H',
        enhancement: 'm_steel',
        edition: 'foil',
        seal: null,
        count: 4,
      },
      {
        rank: 'Q',
        suit: 'C',
        enhancement: null,
        edition: null,
        seal: 'Red',
        count: 2,
      },
    ]
    const text = serializeShorthand(entries)
    const result = parseShorthand(text)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(sortedKeys(result.entries)).toEqual(sortedKeys(entries))
    }
  })
})

describe('parseDeckText auto-detection', () => {
  test('a canonical deck string routes through parseDeckCardsFromString and matches the shorthand equivalent', () => {
    const canonical =
      'S-A-none-none-none;H-K-m_steel-foil-none;H-K-m_steel-foil-none;H-K-m_steel-foil-none;H-K-m_steel-foil-none'
    const shorthandEquivalent = 'AS\n4x KH-steel-foil'

    const canonicalResult = parseDeckText(canonical)
    const shorthandResult = parseDeckText(shorthandEquivalent)
    expect(canonicalResult.ok).toBe(true)
    expect(shorthandResult.ok).toBe(true)
    if (canonicalResult.ok && shorthandResult.ok) {
      expect(sortedKeys(canonicalResult.entries)).toEqual(
        sortedKeys(shorthandResult.entries)
      )
    }
  })

  test('plain shorthand does not get misdetected as canonical', () => {
    const result = parseDeckText('AS\n4x KH-steel-foil')
    expect(result.ok).toBe(true)
  })

  test('empty input parses to an empty deck', () => {
    const result = parseDeckText('')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entries).toEqual([])
    }
  })
})

describe('serializeCanonical', () => {
  test('renders one repeated code token per copy, semicolon-joined', () => {
    const text = serializeCanonical([
      {
        rank: 'A',
        suit: 'S',
        enhancement: null,
        edition: null,
        seal: null,
        count: 2,
      },
    ])
    expect(text).toBe('S-A-none-none-none;S-A-none-none-none')
  })
})
