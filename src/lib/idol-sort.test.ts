import { describe, expect, test } from 'bun:test'
import {
  cloneWeights,
  computeIdolSort,
  DEFAULT_WEIGHTS,
  EDITION_WEIGHT,
  ENHANCEMENT_WEIGHT,
  type IdolSortCard,
  pickWinnerForRoll,
  roundToNearest05,
  SEAL_WEIGHT,
  W_MAIN,
} from '@/lib/idol-sort'
import { previousRank } from '@/shared/cards'

function card(
  rank: string,
  suit: string,
  overrides: Partial<Omit<IdolSortCard, 'rank' | 'suit'>> = {}
): IdolSortCard {
  return {
    rank,
    suit,
    enhancement: null,
    edition: null,
    seal: null,
    ...overrides,
  }
}

describe('roundToNearest05', () => {
  test('rounds to the nearest 0.05', () => {
    expect(roundToNearest05(4)).toBe(4)
    expect(roundToNearest05(4.024)).toBe(4)
    expect(roundToNearest05(4.026)).toBe(4.05)
    expect(roundToNearest05(4.05)).toBe(4.05)
  })
})

describe('computeIdolSort — edge cases', () => {
  test('empty deck produces empty results', () => {
    const result = computeIdolSort([])
    expect(result.entries).toEqual([])
    expect(result.hitEntries).toEqual([])
  })

  test('an all-stone deck produces empty results (stone cards never enter the pool)', () => {
    const result = computeIdolSort([
      card('A', 'S', { enhancement: 'm_stone' }),
      card('K', 'H', { enhancement: 'm_stone' }),
    ])
    expect(result.entries).toEqual([])
    expect(result.hitEntries).toEqual([])
  })
})

describe('previousRank wraparound', () => {
  test("previousRank('2') wraps to 'A'", () => {
    expect(previousRank('2')).toBe('A')
  })

  test('previousRank steps back within the middle of the order', () => {
    expect(previousRank('5')).toBe('4')
    expect(previousRank('A')).toBe('K')
  })
})

describe('PR527 weight values', () => {
  test('edition weights reflect PR527 (holo lowered to match foil)', () => {
    expect(EDITION_WEIGHT.holo).toBe(0.15)
    expect(EDITION_WEIGHT.foil).toBe(0.15)
    expect(EDITION_WEIGHT.polychrome).toBe(1.05)
  })

  test('enhancement weights reflect PR527 (steel/wild/gold zeroed, lucky lowered)', () => {
    expect(ENHANCEMENT_WEIGHT.m_steel).toBe(0)
    expect(ENHANCEMENT_WEIGHT.m_wild).toBe(0)
    expect(ENHANCEMENT_WEIGHT.m_gold).toBe(0)
    expect(ENHANCEMENT_WEIGHT.m_lucky).toBe(0.15)
    expect(ENHANCEMENT_WEIGHT.m_glass).toBe(0.95)
  })

  test('seal weights reflect PR527 (only Red seal still scores)', () => {
    expect(SEAL_WEIGHT.Red).toBe(1.2)
    expect(SEAL_WEIGHT.Purple).toBe(0)
    expect(SEAL_WEIGHT.Gold).toBe(0)
    expect(SEAL_WEIGHT.Blue).toBe(0)
  })
})

/**
 * Hand-computed fixture, worked by hand against the ported formulas before
 * writing this test (see the plan this feature shipped from). Deck: 5x A♠
 * (plain), 2x 2♠ (plain), 1x 2♥ wild.
 *
 * Aggregates: distinctRanks=2 ('A','2'), totalCards=8, rawMeanByNumber=4.
 * facePool=5 (only 'A' present) / faceBaseline=round05(4*1)=4 /
 * faceScoreValue=max(0, 0.05*1.1*max(0,5-4))=0.055.
 * lowPool=3 (2♠+2♥) / lowBaseline=round05(4*1)=4 /
 * lowScoreValue=max(0, 0.05*max(0,3-4))=0.
 *
 * (A,S): Tier A (effectiveCount=5). countBonus=0.5*5=2.5.
 *   totalScore = 2.5 + faceScore(0.055) + 0 + 0 = 2.555.
 * (2,S): Tier B. wildElsewhere=1 (the 2♥ wild card), effectiveCount=3.
 *   mainHit=2.2*3=6.6. convertiblePool=rankTotal(3)-own(2)-wildElsewhere(1)=0 -> offHit=0.
 *   previousRank('2')=='A' -> neighborCount=(A,S).count(5)+0=5, needed=2 -> strengthAdj=0.7*min(2,5,2)=1.4.
 *   totalScore = 6.6+0+1.4+0+0+0 = 8.0.
 * (2,H): Tier B (this IS the wild card, so its own wildElsewhere=0). effectiveCount=1.
 *   mainHit=2.2*1=2.2. convertiblePool=3-1-0=2, needed=4 -> offHit=0.8*min(3,2,4)=1.6.
 *   no (A,H) group exists -> neighborCount=0 -> strengthAdj=0.
 *   m_wild enhancement weight is zeroed under PR527, so editionContribution=0.
 *   totalScore = 2.2+1.6+0+0+0+0 = 3.8.
 *
 * Final sort: tier desc first, so (A,S) [Tier A, 2.555] outranks BOTH Tier B
 * entries despite having the lowest raw score of the three — then within
 * Tier B, (2,S) [8.0] outranks (2,H) [3.8]. Order: [A♠, 2♠, 2♥].
 */
function fixtureDeck(): IdolSortCard[] {
  const cards: IdolSortCard[] = []
  for (let i = 0; i < 5; i++) {
    cards.push(card('A', 'S'))
  }
  for (let i = 0; i < 2; i++) {
    cards.push(card('2', 'S'))
  }
  cards.push(card('2', 'H', { enhancement: 'm_wild' }))
  return cards
}

describe('computeIdolSort — hand-verified fixture', () => {
  test('computes the correct intermediate aggregates and scores', () => {
    const { entries } = computeIdolSort(fixtureDeck())
    expect(entries).toHaveLength(3)

    const aceSpades = entries.find((e) => e.rank === 'A' && e.suit === 'S')
    const twoSpades = entries.find((e) => e.rank === '2' && e.suit === 'S')
    const twoHearts = entries.find((e) => e.rank === '2' && e.suit === 'H')
    expect(aceSpades).toBeDefined()
    expect(twoSpades).toBeDefined()
    expect(twoHearts).toBeDefined()
    if (!(aceSpades && twoSpades && twoHearts)) {
      return
    }

    expect(aceSpades.tier).toBe('A')
    expect(aceSpades.effectiveCount).toBe(5)
    expect(aceSpades.faceScore).toBeCloseTo(0.055, 10)
    expect(aceSpades.totalScore).toBeCloseTo(2.555, 10)

    expect(twoSpades.tier).toBe('B')
    expect(twoSpades.effectiveCount).toBe(3)
    if (twoSpades.tier === 'B') {
      expect(twoSpades.wildElsewhere).toBe(1)
      expect(twoSpades.mainHit).toBeCloseTo(6.6, 10)
      expect(twoSpades.convertiblePool).toBe(0)
      expect(twoSpades.offHit).toBe(0)
      expect(twoSpades.neighborCount).toBe(5)
      expect(twoSpades.strengthAdj).toBeCloseTo(1.4, 10)
    }
    expect(twoSpades.totalScore).toBeCloseTo(8.0, 10)

    expect(twoHearts.tier).toBe('B')
    expect(twoHearts.effectiveCount).toBe(1)
    if (twoHearts.tier === 'B') {
      expect(twoHearts.wildElsewhere).toBe(0)
      expect(twoHearts.mainHit).toBeCloseTo(2.2, 10)
      expect(twoHearts.convertiblePool).toBe(2)
      expect(twoHearts.offHit).toBeCloseTo(1.6, 10)
      expect(twoHearts.neighborCount).toBe(0)
      expect(twoHearts.strengthAdj).toBe(0)
    }
    expect(twoHearts.editionContribution).toBe(0)
    expect(twoHearts.totalScore).toBeCloseTo(3.8, 10)
  })

  test('sorts Tier A above Tier B even at a lower raw score', () => {
    const { entries, hitEntries } = computeIdolSort(fixtureDeck())
    expect(entries.map((entry) => `${entry.rank}${entry.suit}`)).toEqual([
      'AS',
      '2S',
      '2H',
    ])
    expect(hitEntries).toEqual([
      { rank: 'A', suit: 'S', count: 5 },
      { rank: '2', suit: 'S', count: 2 },
      { rank: '2', suit: 'H', count: 1 },
    ])
  })
})

describe('pickWinnerForRoll', () => {
  const { hitEntries } = computeIdolSort(fixtureDeck())
  // Cumulative thresholds over [AS(5), 2S(2), 2H(1)] / total 8: 0.625, 0.875, 1.0.

  test('picks the first entry for a low roll', () => {
    expect(pickWinnerForRoll(hitEntries, 0)).toEqual({
      rank: 'A',
      suit: 'S',
      count: 5,
    })
  })

  test('picks the second entry once past the first threshold', () => {
    expect(pickWinnerForRoll(hitEntries, 0.7)).toEqual({
      rank: '2',
      suit: 'S',
      count: 2,
    })
  })

  test('picks the third entry once past the second threshold', () => {
    expect(pickWinnerForRoll(hitEntries, 0.9)).toEqual({
      rank: '2',
      suit: 'H',
      count: 1,
    })
  })

  test('falls back to the last entry for a roll at/near 1', () => {
    expect(pickWinnerForRoll(hitEntries, 0.999999)).toEqual({
      rank: '2',
      suit: 'H',
      count: 1,
    })
  })

  test('returns null for an empty entry list', () => {
    expect(pickWinnerForRoll([], 0.5)).toBeNull()
  })
})

describe('tier boundary', () => {
  test('effectiveCount of exactly 4 stays Tier B, exactly 5 flips to Tier A', () => {
    // 4 physical A♠ plus a wild 4♥ elsewhere doesn't reach the target...
    const belowTarget = computeIdolSort([
      card('4', 'S'),
      card('4', 'S'),
      card('4', 'S'),
      card('4', 'S'),
    ])
    const aceEntryBelow = belowTarget.entries.find((e) => e.rank === '4')
    expect(aceEntryBelow?.tier).toBe('B')

    // ...but a 5th physical copy does.
    const atTarget = computeIdolSort([
      card('4', 'S'),
      card('4', 'S'),
      card('4', 'S'),
      card('4', 'S'),
      card('4', 'S'),
    ])
    const aceEntryAt = atTarget.entries.find((e) => e.rank === '4')
    expect(aceEntryAt?.tier).toBe('A')
  })

  test('a wild card elsewhere can push effectiveCount to the target too', () => {
    const result = computeIdolSort([
      card('4', 'S'),
      card('4', 'S'),
      card('4', 'S'),
      card('4', 'S'),
      card('4', 'H', { enhancement: 'm_wild' }),
    ])
    const spadesFour = result.entries.find(
      (e) => e.rank === '4' && e.suit === 'S'
    )
    expect(spadesFour?.effectiveCount).toBe(5)
    expect(spadesFour?.tier).toBe('A')
  })
})

describe('computeIdolSort — custom weights', () => {
  test('omitting weights matches passing DEFAULT_WEIGHTS explicitly', () => {
    const implicit = computeIdolSort(fixtureDeck())
    const explicit = computeIdolSort(fixtureDeck(), DEFAULT_WEIGHTS)
    expect(explicit.entries).toEqual(implicit.entries)
    expect(explicit.context).toEqual(implicit.context)
  })

  test('doubling wMain doubles Tier B mainHit (and totalScore moves with it)', () => {
    const baseline = computeIdolSort(fixtureDeck())
    const doubled = cloneWeights(DEFAULT_WEIGHTS)
    doubled.wMain *= 2

    const result = computeIdolSort(fixtureDeck(), doubled)

    const baseTwoSpades = baseline.entries.find(
      (e) => e.rank === '2' && e.suit === 'S'
    )
    const nextTwoSpades = result.entries.find(
      (e) => e.rank === '2' && e.suit === 'S'
    )
    expect(baseTwoSpades?.tier).toBe('B')
    expect(nextTwoSpades?.tier).toBe('B')
    if (baseTwoSpades?.tier === 'B' && nextTwoSpades?.tier === 'B') {
      expect(nextTwoSpades.mainHit).toBeCloseTo(baseTwoSpades.mainHit * 2, 10)
      expect(nextTwoSpades.totalScore).toBeGreaterThan(baseTwoSpades.totalScore)
    }
  })

  test('lowering targetCopies can flip a Tier B entry to Tier A', () => {
    const lowered = cloneWeights(DEFAULT_WEIGHTS)
    lowered.targetCopies = 1

    const result = computeIdolSort(fixtureDeck(), lowered)
    const twoHearts = result.entries.find(
      (e) => e.rank === '2' && e.suit === 'H'
    )
    expect(twoHearts?.tier).toBe('A')
  })

  test('zeroing the relevant quality weights zeroes editionContribution even with modifiers present', () => {
    const zeroed = cloneWeights(DEFAULT_WEIGHTS)
    zeroed.seal.Red = 0
    zeroed.edition.foil = 0
    zeroed.enhancement.m_glass = 0

    const result = computeIdolSort(
      [
        card('A', 'S', {
          seal: 'Red',
          edition: 'foil',
          enhancement: 'm_glass',
        }),
      ],
      zeroed
    )
    expect(result.entries[0]?.editionContribution).toBe(0)
  })

  test('cloneWeights never mutates the shared DEFAULT_WEIGHTS object', () => {
    const clone = cloneWeights(DEFAULT_WEIGHTS)
    clone.wMain = 999
    clone.seal.Red = 999

    expect(DEFAULT_WEIGHTS.wMain).toBe(W_MAIN)
    expect(DEFAULT_WEIGHTS.seal.Red).toBe(SEAL_WEIGHT.Red)
  })
})

describe('computeIdolSort — context', () => {
  test('reports the deck-wide aggregates behind the fixture’s face/low bonuses', () => {
    const { context } = computeIdolSort(fixtureDeck())
    expect(context).not.toBeNull()
    if (!context) {
      return
    }

    expect(context.distinctRanks).toBe(2)
    expect(context.totalCards).toBe(8)
    expect(context.rawMeanByNumber).toBe(4)
    expect(context.facePool).toBe(5)
    expect(context.faceBaseline).toBe(4)
    expect(context.faceScoreValue).toBeCloseTo(0.055, 10)
    expect(context.lowPool).toBe(3)
    expect(context.lowBaseline).toBe(4)
    expect(context.lowScoreValue).toBe(0)
  })

  test('context is null for an empty or all-stone deck', () => {
    expect(computeIdolSort([]).context).toBeNull()
    expect(
      computeIdolSort([card('A', 'S', { enhancement: 'm_stone' })]).context
    ).toBeNull()
  })
})
