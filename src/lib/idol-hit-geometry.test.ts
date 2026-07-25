import { describe, expect, test } from 'bun:test'
import {
  computeHitBoundaries,
  computeHitCumulativeFracs,
  computeIdolHitWindow,
  computeLabelPlacement,
  type IdolHitBoundary,
  toRawIdolHitEntry,
  WINDOW_RADIUS,
} from '@/lib/idol-hit-geometry'
import type { IdolHit, IdolHitEntry } from '@/lib/log-source-parser'

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const SUITS = ['S', 'H', 'C', 'D']

/** A fresh, unweighted 52-card deck: every rank/suit combo, count 1. */
function freshDeck(): IdolHitEntry[] {
  const cards: IdolHitEntry[] = []
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      cards.push({ rank, suit, count: 1 })
    }
  }
  return cards
}

/** A small deck with varying counts, so shares are uneven. */
function weightedDeck(): IdolHitEntry[] {
  return [
    { rank: 'A', suit: 'S', count: 1 },
    { rank: 'K', suit: 'S', count: 4 },
    { rank: 'Q', suit: 'H', count: 10 },
    { rank: 'J', suit: 'D', count: 2 },
    { rank: 'T', suit: 'C', count: 3 },
  ]
}

function winnerOf(entry: IdolHitEntry): IdolHit['winner'] {
  return { rank: entry.rank, suit: entry.suit }
}

/**
 * Walks the cumulative thresholds the way the mod does: the card whose
 * `[lo, hi)` interval contains `roll`. Used to independently verify that the
 * boundaries the geometry computes agree with a plain reference walk.
 */
function walkToWinner(cards: IdolHitEntry[], roll: number): IdolHitEntry {
  const fracs = computeHitCumulativeFracs(cards)
  for (let index = 0; index < cards.length; index++) {
    const lo = fracs[index] ?? 0
    const hi = fracs[index + 1] ?? 1
    if (roll >= lo && roll < hi) {
      const entry = cards[index]
      if (entry) {
        return entry
      }
    }
  }
  const last = cards[cards.length - 1]
  if (!last) {
    throw new Error('empty deck')
  }
  return last
}

describe('computeHitCumulativeFracs', () => {
  test('starts at 0, ends at 1, and is monotonically non-decreasing', () => {
    const fracs = computeHitCumulativeFracs(weightedDeck())
    expect(fracs[0]).toBe(0)
    expect(fracs[fracs.length - 1]).toBe(1)
    let nonDecreasing = true
    for (let index = 1; index < fracs.length; index++) {
      const prev = fracs[index - 1] ?? 0
      const curr = fracs[index] ?? 0
      if (curr < prev) {
        nonDecreasing = false
      }
    }
    expect(nonDecreasing).toBe(true)
  })

  test('a zero total does not divide by zero', () => {
    const cards: IdolHitEntry[] = [
      { rank: 'A', suit: 'S', count: 0 },
      { rank: 'K', suit: 'S', count: 0 },
    ]
    const fracs = computeHitCumulativeFracs(cards)
    expect(fracs).toEqual([0, 0, 0])
    expect(fracs.every((f) => Number.isFinite(f))).toBe(true)
  })

  test('empty deck yields a single 0 boundary', () => {
    expect(computeHitCumulativeFracs([])).toEqual([0])
  })
})

describe('computeHitBoundaries', () => {
  test('each entry boundary pair equals its cumulative share', () => {
    const cards = weightedDeck() // total = 1+4+10+2+3 = 20
    const winner = winnerOf(cards[2] as IdolHitEntry) // Q, count 10
    const boundaries = computeHitBoundaries(cards, winner)
    // Cumulative fractions: 0, 1/20, 5/20, 15/20, 17/20, 20/20
    expect(boundaries.map((b) => b.frac)).toEqual([
      0, 0.05, 0.25, 0.75, 0.85, 1,
    ])
    // With no range, position === frac * 100
    expect(boundaries.map((b) => b.position)).toEqual([0, 5, 25, 75, 85, 100])
  })

  test('isWinnerEdge is set on exactly the two edges of the winning entry', () => {
    const cards = weightedDeck()
    const winner = winnerOf(cards[2] as IdolHitEntry) // Q at index 2
    const boundaries = computeHitBoundaries(cards, winner)
    const winnerEdgeIndices = boundaries
      .map((b, i) => (b.isWinnerEdge ? i : null))
      .filter((i): i is number => i !== null)
    expect(winnerEdgeIndices).toEqual([2, 3])
  })

  test('no isWinnerEdge set when the winner is not present in the list', () => {
    const cards = weightedDeck()
    const boundaries = computeHitBoundaries(cards, { rank: '2', suit: 'D' })
    expect(boundaries.every((b) => !b.isWinnerEdge)).toBe(true)
  })

  test('a zero-total deck yields no boundaries', () => {
    const cards: IdolHitEntry[] = [{ rank: 'A', suit: 'S', count: 0 }]
    expect(
      computeHitBoundaries(cards, winnerOf(cards[0] as IdolHitEntry))
    ).toEqual([])
  })

  test('range argument rescales positions into 0-100 of that sub-range', () => {
    const cards = weightedDeck() // fracs: 0, .05, .25, .75, .85, 1
    const winner = winnerOf(cards[2] as IdolHitEntry) // Q
    // Sub-range covering just entries [1, 3) (K and Q), spanning fracs .05 to .75
    const boundaries = computeHitBoundaries(cards, winner, {
      start: 1,
      end: 3,
      lo: 0.05,
      hi: 0.75,
    })
    // frac stays absolute; position is rescaled to the sub-range's own 0-100
    expect(boundaries.map((b) => b.frac)).toEqual([0.05, 0.25, 0.75])
    expect(boundaries.map((b) => b.position)).toEqual([
      0,
      ((0.25 - 0.05) / (0.75 - 0.05)) * 100,
      100,
    ])
  })
})

describe('walking the thresholds picks the declared winner', () => {
  test('fresh 52-card uniform deck: every card is correctly identified by its roll', () => {
    const cards = freshDeck()
    const fracs = computeHitCumulativeFracs(cards)
    for (let index = 0; index < cards.length; index++) {
      const entry = cards[index]
      if (!entry) {
        continue
      }
      const lo = fracs[index] ?? 0
      const hi = fracs[index + 1] ?? 1
      const midpoint = (lo + hi) / 2
      const found = walkToWinner(cards, midpoint)
      expect(found.rank).toBe(entry.rank)
      expect(found.suit).toBe(entry.suit)

      // The boundaries computed for this entry as "winner" mark exactly its
      // own two edges — confirming computeHitBoundaries agrees with the walk.
      const boundaries = computeHitBoundaries(cards, winnerOf(entry))
      const winnerEdges = boundaries
        .map((b, i) => (b.isWinnerEdge ? i : null))
        .filter((i): i is number => i !== null)
      expect(winnerEdges).toEqual([index, index + 1])
    }
  })

  test('weighted deck with varying counts: every card is correctly identified by its roll', () => {
    const cards = weightedDeck()
    const fracs = computeHitCumulativeFracs(cards)
    for (let index = 0; index < cards.length; index++) {
      const entry = cards[index]
      if (!entry) {
        continue
      }
      const lo = fracs[index] ?? 0
      const hi = fracs[index + 1] ?? 1
      const midpoint = (lo + hi) / 2
      const found = walkToWinner(cards, midpoint)
      expect(found.rank).toBe(entry.rank)
      expect(found.suit).toBe(entry.suit)
    }
  })
})

describe('computeIdolHitWindow', () => {
  test('window is centred on the winner in the middle of a long list', () => {
    const cards = freshDeck() // 52 entries
    const winnerIndex = 30
    const entry = cards[winnerIndex] as IdolHitEntry
    const result = computeIdolHitWindow(cards, winnerOf(entry))
    expect(result.sliceStart).toBe(winnerIndex - WINDOW_RADIUS)
    expect(result.sliceEnd).toBe(winnerIndex + WINDOW_RADIUS + 1)
    expect(result.windowEntries).toHaveLength(2 * WINDOW_RADIUS + 1)
  })

  test('beforeCount/afterCount sum with the window size to the full list length', () => {
    const cards = freshDeck()
    const entry = cards[10] as IdolHitEntry
    const result = computeIdolHitWindow(cards, winnerOf(entry))
    const total =
      result.beforeCount + result.windowEntries.length + result.afterCount
    expect(total).toBe(cards.length)
  })

  test('winner at the very start clamps to a valid, non-negative window', () => {
    const cards = freshDeck()
    const entry = cards[0] as IdolHitEntry
    const result = computeIdolHitWindow(cards, winnerOf(entry))
    expect(result.sliceStart).toBe(0)
    expect(result.beforeCount).toBe(0)
    expect(result.windowEntries.length + result.afterCount).toBe(cards.length)
  })

  test('winner at the very end clamps to a valid window with no negative slice', () => {
    const cards = freshDeck()
    const entry = cards[cards.length - 1] as IdolHitEntry
    const result = computeIdolHitWindow(cards, winnerOf(entry))
    expect(result.sliceEnd).toBe(cards.length)
    expect(result.afterCount).toBe(0)
    expect(result.beforeCount + result.windowEntries.length).toBe(cards.length)
  })
})

describe('computeLabelPlacement', () => {
  /** Builds evenly-spaced boundaries (0, 100/n, 200/n, ..., 100), with the
   * given indices marked as winner edges. */
  function evenBoundaries(
    count: number,
    winnerEdges: number[]
  ): IdolHitBoundary[] {
    const boundaries: IdolHitBoundary[] = []
    for (let index = 0; index <= count; index++) {
      const position = (index / count) * 100
      boundaries.push({
        frac: position / 100,
        position,
        isWinnerEdge: winnerEdges.includes(index),
      })
    }
    return boundaries
  }

  test('both winner edges and both range ends are always in shown', () => {
    const boundaries = evenBoundaries(10, [4, 5])
    const placement = computeLabelPlacement(boundaries)
    expect(placement.shown.has(0)).toBe(true)
    expect(placement.shown.has(10)).toBe(true)
    expect(placement.shown.has(4)).toBe(true)
    expect(placement.shown.has(5)).toBe(true)
  })

  test('a narrow winner slice staggers its second edge instead of dropping it', () => {
    // Start and end are far from the winner slice (no stagger there); the
    // two winner edges themselves are only 2% apart — inside the 4% pct gap.
    const boundaries: IdolHitBoundary[] = [
      { frac: 0, position: 0, isWinnerEdge: false },
      { frac: 0.5, position: 50, isWinnerEdge: true },
      { frac: 0.52, position: 52, isWinnerEdge: true },
      { frac: 1, position: 100, isWinnerEdge: false },
    ]
    const placement = computeLabelPlacement(boundaries)
    // Both winner edges (1 and 2) are always shown even though they're
    // within LABEL_MIN_GAP_PCT of each other — the second is staggered.
    expect(placement.shown.has(1)).toBe(true)
    expect(placement.shown.has(2)).toBe(true)
    expect(placement.staggered.has(2)).toBe(true)
    expect(placement.staggered.has(1)).toBe(false)
  })

  test('optional (non-always-show) boundaries within the min gap are skipped, not staggered', () => {
    // Wide-enough segments, but candidate boundaries closer together than
    // the pct gap right after an always-shown label.
    const boundaries: IdolHitBoundary[] = [
      { frac: 0, position: 0, isWinnerEdge: false }, // always shown (end)
      { frac: 0.2, position: 20, isWinnerEdge: false }, // wide segment, but only 20% > gap threshold... use tight spacing below
      { frac: 0.21, position: 21, isWinnerEdge: false }, // within 4% of previous shown -> skipped
      { frac: 1, position: 100, isWinnerEdge: false }, // always shown (end)
    ]
    const placement = computeLabelPlacement(boundaries)
    expect(placement.shown.has(0)).toBe(true)
    expect(placement.shown.has(3)).toBe(true)
    // index 1's segment (0->20%) is wide enough to be a candidate and clears the gap from index 0
    expect(placement.shown.has(1)).toBe(true)
    // index 2's segment (20%->21%) is narrow, so it's never even a candidate
    expect(placement.shown.has(2)).toBe(false)
    expect(placement.staggered.has(2)).toBe(false)
  })

  test('a known trackWidthPx (expanded mode) surfaces far more labels than without one', () => {
    // 40 evenly spaced narrow segments (2.5% each) over a wide track.
    const boundaries = evenBoundaries(40, [])
    const trackWidthPx = 4000 // 100px per segment — comfortably above LABEL_MIN_GAP_PX
    const collapsed = computeLabelPlacement(boundaries)
    const expanded = computeLabelPlacement(boundaries, trackWidthPx)
    expect(expanded.shown.size > collapsed.shown.size).toBe(true)
  })
})

describe('toRawIdolHitEntry', () => {
  test('suits render as glyphs, cards serialise as rank+glyph+count', () => {
    const hit: IdolHit = {
      roll: 0.4231,
      winner: { rank: 'A', suit: 'S' },
      cards: [
        { rank: 'A', suit: 'S', count: 1 },
        { rank: 'K', suit: 'H', count: 4 },
        { rank: 'Q', suit: 'C', count: 2 },
        { rank: 'J', suit: 'D', count: 3 },
      ],
    }
    const raw = toRawIdolHitEntry(hit)
    expect(raw.winner).toBe('A♠')
    expect(raw.cards).toEqual(['A♠1', 'K♥4', 'Q♣2', 'J♦3'])
    expect(raw).toEqual({
      roll: 0.4231,
      winner: 'A♠',
      cards: ['A♠1', 'K♥4', 'Q♣2', 'J♦3'],
    })
  })

  test('a null roll serialises as null', () => {
    const hit: IdolHit = {
      roll: null,
      winner: { rank: 'T', suit: 'D' },
      cards: [{ rank: 'T', suit: 'D', count: 1 }],
    }
    const raw = toRawIdolHitEntry(hit)
    expect(raw.roll).toBeNull()
  })

  test('unknown suit codes pass through the first character rather than a glyph', () => {
    const hit: IdolHit = {
      roll: null,
      winner: { rank: 'A', suit: 'X' },
      cards: [{ rank: 'A', suit: 'X', count: 1 }],
    }
    const raw = toRawIdolHitEntry(hit)
    expect(raw.winner).toBe('AX')
    expect(raw.cards).toEqual(['AX1'])
  })
})
