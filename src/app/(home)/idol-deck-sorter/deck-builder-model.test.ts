import { describe, expect, test } from 'bun:test'
import {
  codeOfEntry,
  collapseCardsToEntries,
  type DeckBuilderEntry,
  entryKey,
  expandEntriesToCards,
  removeEntry,
  upsertEntry,
} from './deck-builder-model'

function entry(overrides: Partial<DeckBuilderEntry> = {}): DeckBuilderEntry {
  return {
    rank: 'A',
    suit: 'S',
    enhancement: null,
    edition: null,
    seal: null,
    count: 1,
    ...overrides,
  }
}

describe('codeOfEntry', () => {
  test('renders the canonical suit-rank-enh-ed-seal token', () => {
    expect(codeOfEntry(entry())).toBe('S-A-none-none-none')
    expect(
      codeOfEntry(
        entry({
          suit: 'H',
          rank: 'K',
          enhancement: 'm_steel',
          edition: 'foil',
          seal: 'Gold',
        })
      )
    ).toBe('H-K-m_steel-foil-Gold')
  })
})

describe('expandEntriesToCards / collapseCardsToEntries round trip', () => {
  test('expands a count into that many physical cards', () => {
    const cards = expandEntriesToCards([entry({ count: 3 })])
    expect(cards).toHaveLength(3)
    expect(cards.every((card) => card.rank === 'A' && card.suit === 'S')).toBe(
      true
    )
  })

  test('round-trips a multi-variant deck, including two distinct variants at the same (rank,suit)', () => {
    const entries: DeckBuilderEntry[] = [
      entry({ rank: 'K', suit: 'H', count: 2 }),
      entry({
        rank: 'K',
        suit: 'H',
        enhancement: 'm_steel',
        edition: 'foil',
        count: 1,
      }),
      entry({ rank: '2', suit: 'D', seal: 'Red', count: 4 }),
    ]

    const cards = expandEntriesToCards(entries)
    expect(cards).toHaveLength(7)

    const collapsed = collapseCardsToEntries(cards)
    // Same (rank,suit) with different modifiers must stay two separate rows, not merge.
    expect(collapsed).toHaveLength(3)

    const byKey = new Map(collapsed.map((row) => [entryKey(row), row]))
    expect(byKey.get(entryKey(entries[0] as DeckBuilderEntry))?.count).toBe(2)
    expect(byKey.get(entryKey(entries[1] as DeckBuilderEntry))?.count).toBe(1)
    expect(byKey.get(entryKey(entries[2] as DeckBuilderEntry))?.count).toBe(4)
  })

  test('an empty entry list expands to an empty card list', () => {
    expect(expandEntriesToCards([])).toEqual([])
  })
})

describe('upsertEntry', () => {
  test('adds a new variant when it does not exist yet', () => {
    const next = upsertEntry([], entry(), 3)
    expect(next).toEqual([entry({ count: 3 })])
  })

  test('increments an existing variant', () => {
    const next = upsertEntry([entry({ count: 2 })], entry(), 1)
    expect(next).toEqual([entry({ count: 3 })])
  })

  test('decrements and drops the row once count reaches 0', () => {
    const next = upsertEntry([entry({ count: 1 })], entry(), -1)
    expect(next).toEqual([])
  })

  test('a negative delta on a nonexistent variant is a no-op', () => {
    const initial: DeckBuilderEntry[] = []
    expect(upsertEntry(initial, entry(), -1)).toBe(initial)
  })

  test('never mutates the input array', () => {
    const initial = [entry({ count: 1 })]
    const next = upsertEntry(initial, entry(), 1)
    expect(initial[0]?.count).toBe(1)
    expect(next[0]?.count).toBe(2)
  })
})

describe('removeEntry', () => {
  test('removes the matching variant by key', () => {
    const entries = [entry({ rank: 'A' }), entry({ rank: 'K' })]
    const next = removeEntry(entries, entryKey(entry({ rank: 'A' })))
    expect(next).toEqual([entry({ rank: 'K' })])
  })

  test('is a no-op when the key is not present', () => {
    const entries = [entry({ rank: 'A' })]
    const next = removeEntry(entries, entryKey(entry({ rank: 'K' })))
    expect(next).toEqual(entries)
  })
})
