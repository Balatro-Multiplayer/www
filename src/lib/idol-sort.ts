/**
 * A TypeScript port of `reset_idol_card()` from Balatro-Multiplayer's
 * `compatibility/TheOrder.lua` — the algorithm the modded Idol joker uses to
 * score and sort the deck each round before doing a weighted-random pick.
 * Ported for the Idol Deck Sorter tool, which lets a user build an arbitrary
 * deck and see how it would be scored/ordered without needing a real seed.
 *
 * Weight constants below reflect
 * https://github.com/Balatro-Multiplayer/BalatroMultiplayer/pull/527 (not
 * yet merged as of writing, but confirmed to land) rather than the current
 * `dev` branch — every value PR527 changes is commented with what it
 * replaces so a future mod tweak is a one-line edit here.
 *
 * Terminology mirrors the Lua source directly (tier/effectiveCount/mainHit/
 * offHit/strengthAdj/etc.) rather than being renamed, so this file can be
 * diffed against the source by eye.
 */

import type { IdolHitEntry } from '@/lib/log-source-parser'
import {
  FACE_RANKS,
  LOW_RANKS,
  previousRank,
  rankIndex,
  suitIndex,
} from '@/shared/cards'

/**
 * The subset of a physical card the algorithm actually looks at. Deliberately
 * NOT `Pick<DeckCardSnapshot, ...>` — the algorithm treats rank/suit as plain
 * string keys, so this stays decoupled from `DeckCardSnapshot`'s narrower
 * `suit` literal union. Any `DeckCardSnapshot` is still structurally
 * assignable here.
 */
export type IdolSortCard = {
  rank: string
  suit: string
  enhancement: string | null
  edition: string | null
  seal: string | null
}

// ---------------------------------------------------------------------------
// Per-card quality weights
// ---------------------------------------------------------------------------

/** `glass` is kept for fidelity with the Lua source's own comment ("some mods
 * track glass as an edition, not enhancement") even though it's unreachable
 * in this app's data model — here glass is always an enhancement, never an
 * edition (see `ENHANCEMENT_WEIGHT.m_glass`). */
export const EDITION_WEIGHT = {
  polychrome: 1.05,
  glass: 0.95,
  holo: 0.15, // PR527: was 0.50
  foil: 0.15,
} as const

export const ENHANCEMENT_WEIGHT = {
  m_glass: 0.95,
  m_lucky: 0.15, // PR527: was 0.45
  m_steel: 0, // PR527: was 0.15 (commented out in TheOrder.lua)
  m_wild: 0, // PR527: was 0.15 (commented out)
  m_bonus: 0.1,
  m_mult: 0.1,
  m_gold: 0, // PR527: was 0.05 (commented out)
} as const

export const SEAL_WEIGHT = {
  Red: 1.2,
  Purple: 0, // PR527: was 0.15 (commented out)
  Gold: 0, // PR527: was 0.30 (commented out)
  Blue: 0, // PR527: was 0.05 (commented out)
} as const

/** A user-tunable copy of one of the weight tables above — plain `Record<string, number>` (not `as const`) so the weights panel can edit it. */
export type WeightTable = Record<string, number>

export function editionWeight(
  card: IdolSortCard,
  table: WeightTable = EDITION_WEIGHT
): number {
  if (!card.edition) {
    return 0
  }
  return table[card.edition] ?? 0
}

export function enhancementWeight(
  card: IdolSortCard,
  table: WeightTable = ENHANCEMENT_WEIGHT
): number {
  if (!card.enhancement) {
    return 0
  }
  return table[card.enhancement] ?? 0
}

export function sealWeight(
  card: IdolSortCard,
  table: WeightTable = SEAL_WEIGHT
): number {
  if (!card.seal) {
    return 0
  }
  return table[card.seal] ?? 0
}

// ---------------------------------------------------------------------------
// Tier / achievability constants
// ---------------------------------------------------------------------------

/** How many exact copies of a (rank, suit) count as "complete" (Tier A). */
export const TARGET_COPIES = 5

/** Tier A: multiplier on (seal+edition+enhancement) quality score. */
export const W_EDITION_A = 1.3
/** Tier B: multiplier on (seal+edition+enhancement) quality score. */
export const W_EDITION_B = 0.7
/** Tier A: reward per existing copy. */
export const W_COUNT_A = 0.5
/** Tier B: reward per existing copy (progress toward TARGET_COPIES). */
export const W_MAIN = 2.2 // PR527: was 2.0
/** Tier B: suit-changer potential, capped by mechanical limit and remaining need. */
export const W_OFF = 0.8 // PR527: was 1.0
/** Tier B: Strength-adjacent potential, capped by mechanical limit and remaining need. */
export const W_STR = 0.7 // PR527: was 1.0

/** Generic face/low-rank pool bonus weight and floor. */
export const W_GEN = 0.05
export const GEN_FLOOR = 0

export function roundToNearest05(x: number): number {
  return Math.floor(x * 20 + 0.5) / 20
}

// ---------------------------------------------------------------------------
// Tunable weight bundle
// ---------------------------------------------------------------------------

/**
 * Every coefficient `computeIdolSort` uses, bundled so a caller (the Idol
 * Deck Sorter's weights panel) can override any of them and re-run the same
 * deck through the algorithm. The individual `W_*`/`*_WEIGHT` exports above
 * remain the source of truth for the PR527 defaults — this is just a
 * user-editable container around them.
 */
export type IdolSortWeights = {
  targetCopies: number
  wEditionA: number
  wEditionB: number
  wCountA: number
  wMain: number
  wOff: number
  wStr: number
  wGen: number
  genFloor: number
  edition: WeightTable
  enhancement: WeightTable
  seal: WeightTable
}

export const DEFAULT_WEIGHTS: IdolSortWeights = {
  targetCopies: TARGET_COPIES,
  wEditionA: W_EDITION_A,
  wEditionB: W_EDITION_B,
  wCountA: W_COUNT_A,
  wMain: W_MAIN,
  wOff: W_OFF,
  wStr: W_STR,
  wGen: W_GEN,
  genFloor: GEN_FLOOR,
  edition: { ...EDITION_WEIGHT },
  enhancement: { ...ENHANCEMENT_WEIGHT },
  seal: { ...SEAL_WEIGHT },
}

/** A deep-enough copy for safe local mutation — the three weight tables are the only nested objects. */
export function cloneWeights(weights: IdolSortWeights): IdolSortWeights {
  return {
    ...weights,
    edition: { ...weights.edition },
    enhancement: { ...weights.enhancement },
    seal: { ...weights.seal },
  }
}

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

type IdolSortEntryBase = {
  rank: string
  suit: string
  totalScore: number
  /** Physical copies of this exact (rank, suit). */
  ownCount: number
  /** Wild cards of the same rank in OTHER suits (they can complete this rank too). */
  wildElsewhere: number
  /** ownCount + wildElsewhere. */
  effectiveCount: number
  sealScore: number
  /** Sum of edition + enhancement weights across every physical card in this group. */
  editionScore: number
  /** (sealScore + editionScore) * the tier's W_EDITION_{A,B} — the actual contribution to totalScore. */
  editionContribution: number
  faceScore: number
  lowScore: number
}

export type IdolSortEntry =
  | (IdolSortEntryBase & {
      tier: 'A'
      /** W_COUNT_A * effectiveCount. */
      countBonus: number
    })
  | (IdolSortEntryBase & {
      tier: 'B'
      /** TARGET_COPIES - effectiveCount. */
      needed: number
      /** W_MAIN * effectiveCount. */
      mainHit: number
      /** Physical same-rank, other-suit, non-wild cards available to be suit-changed onto this one. */
      convertiblePool: number
      /** W_OFF * min(3, max(0, convertiblePool), needed). */
      offHit: number
      /** Physical + wild-elsewhere count at the same-suit previous rank (Strength target). */
      neighborCount: number
      /** W_STR * min(2, neighborCount, needed). */
      strengthAdj: number
    })

/**
 * Deck-wide aggregates computed once and shared by every entry's face/low
 * pool bonus — surfaced (rather than kept private) so the score breakdown UI
 * can show the exact numbers that produced `faceScore`/`lowScore`. `null`
 * for an empty or all-stone deck (nothing to aggregate).
 */
export type IdolSortContext = {
  distinctRanks: number
  totalCards: number
  rawMeanByNumber: number
  facePool: number
  faceRanksPresent: number
  faceBaseline: number
  faceScoreValue: number
  lowPool: number
  lowRanksPresent: number
  lowBaseline: number
  lowScoreValue: number
}

export type IdolSortResult = {
  /** Sorted tier→score→rank→suit, same order the Idol algorithm would present the deck in. */
  entries: IdolSortEntry[]
  /** `entries` reduced to `{rank, suit, count}` — the exact shape the existing
   * idol-hit visualization (`computeHitBoundaries`, `IdolRollTrack`) consumes. */
  hitEntries: IdolHitEntry[]
  context: IdolSortContext | null
}

type CardGroup = {
  rank: string
  suit: string
  cards: IdolSortCard[]
  count: number
  wildCount: number
}

/**
 * Scores and sorts a deck exactly as `reset_idol_card()` would. Cards with
 * `enhancement === 'm_stone'` never enter the pool (the mod excludes them
 * entirely). Returns empty results for an empty or all-stone deck.
 *
 * `weights` defaults to `DEFAULT_WEIGHTS` (the PR527 values) but can be any
 * override — this is what lets the Idol Deck Sorter's weights panel re-run
 * the same deck against different coefficients.
 */
export function computeIdolSort(
  cards: IdolSortCard[],
  weights: IdolSortWeights = DEFAULT_WEIGHTS
): IdolSortResult {
  const validCards = cards.filter((card) => card.enhancement !== 'm_stone')

  const groupByKey = new Map<string, CardGroup>()
  for (const card of validCards) {
    const key = `${card.rank}_${card.suit}`
    let group = groupByKey.get(key)
    if (!group) {
      group = {
        rank: card.rank,
        suit: card.suit,
        cards: [],
        count: 0,
        wildCount: 0,
      }
      groupByKey.set(key, group)
    }
    group.cards.push(card)
    group.count += 1
    if (card.enhancement === 'm_wild') {
      group.wildCount += 1
    }
  }

  const groups = [...groupByKey.values()]
  if (groups.length === 0) {
    return { entries: [], hitEntries: [], context: null }
  }

  const rankTotals = new Map<string, number>()
  const wildByRank = new Map<string, number>()
  for (const group of groups) {
    rankTotals.set(group.rank, (rankTotals.get(group.rank) ?? 0) + group.count)
    wildByRank.set(
      group.rank,
      (wildByRank.get(group.rank) ?? 0) + group.wildCount
    )
  }

  const distinctRanks = rankTotals.size
  const totalCards = groups.reduce((sum, group) => sum + group.count, 0)
  const rawMeanByNumber = totalCards / distinctRanks

  let facePool = 0
  let faceRanksPresent = 0
  let lowPool = 0
  let lowRanksPresent = 0
  for (const [rank, total] of rankTotals) {
    if ((FACE_RANKS as readonly string[]).includes(rank)) {
      facePool += total
      faceRanksPresent += 1
    } else if ((LOW_RANKS as readonly string[]).includes(rank)) {
      lowPool += total
      lowRanksPresent += 1
    }
  }

  const faceBaseline = roundToNearest05(rawMeanByNumber * faceRanksPresent)
  const lowBaseline = roundToNearest05(rawMeanByNumber * lowRanksPresent)
  // Face/low score are constants across every rank in their category — the
  // pool/baseline comparison only depends on totals computed once above.
  const faceScoreValue = Math.max(
    weights.genFloor,
    weights.wGen * 1.1 * Math.max(0, facePool - faceBaseline)
  )
  const lowScoreValue = Math.max(
    weights.genFloor,
    weights.wGen * Math.max(0, lowPool - lowBaseline)
  )

  const context: IdolSortContext = {
    distinctRanks,
    totalCards,
    rawMeanByNumber,
    facePool,
    faceRanksPresent,
    faceBaseline,
    faceScoreValue,
    lowPool,
    lowRanksPresent,
    lowBaseline,
    lowScoreValue,
  }

  const entries: IdolSortEntry[] = groups.map((group) => {
    const { rank, suit, count: ownCount, wildCount: ownWildCount } = group
    const wildElsewhere = (wildByRank.get(rank) ?? 0) - ownWildCount
    const effectiveCount = ownCount + wildElsewhere

    let sealScore = 0
    let editionScore = 0
    for (const card of group.cards) {
      sealScore += sealWeight(card, weights.seal)
      editionScore +=
        editionWeight(card, weights.edition) +
        enhancementWeight(card, weights.enhancement)
    }

    const faceScore = (FACE_RANKS as readonly string[]).includes(rank)
      ? faceScoreValue
      : 0
    const lowScore = (LOW_RANKS as readonly string[]).includes(rank)
      ? lowScoreValue
      : 0

    if (effectiveCount >= weights.targetCopies) {
      const countBonus = weights.wCountA * effectiveCount
      const editionContribution = (sealScore + editionScore) * weights.wEditionA
      const totalScore = countBonus + faceScore + lowScore + editionContribution

      return {
        tier: 'A',
        rank,
        suit,
        totalScore,
        ownCount,
        wildElsewhere,
        effectiveCount,
        sealScore,
        editionScore,
        editionContribution,
        faceScore,
        lowScore,
        countBonus,
      }
    }

    const needed = weights.targetCopies - effectiveCount
    const mainHit = weights.wMain * effectiveCount

    const convertiblePool =
      (rankTotals.get(rank) ?? 0) - ownCount - wildElsewhere
    const offHit =
      weights.wOff * Math.min(3, Math.max(0, convertiblePool), needed)

    const prevRank = previousRank(rank)
    const neighborGroup = groupByKey.get(`${prevRank}_${suit}`)
    const neighborOwnCount = neighborGroup?.count ?? 0
    const neighborOwnWildCount = neighborGroup?.wildCount ?? 0
    const prevWildElsewhere =
      (wildByRank.get(prevRank) ?? 0) - neighborOwnWildCount
    const neighborCount = neighborOwnCount + prevWildElsewhere
    const strengthAdj = weights.wStr * Math.min(2, neighborCount, needed)

    const editionContribution = (sealScore + editionScore) * weights.wEditionB
    const totalScore =
      mainHit +
      offHit +
      strengthAdj +
      faceScore +
      lowScore +
      editionContribution

    return {
      tier: 'B',
      rank,
      suit,
      totalScore,
      ownCount,
      wildElsewhere,
      effectiveCount,
      sealScore,
      editionScore,
      editionContribution,
      faceScore,
      lowScore,
      needed,
      mainHit,
      convertiblePool,
      offHit,
      neighborCount,
      strengthAdj,
    }
  })

  entries.sort((a, b) => {
    if (a.tier !== b.tier) {
      return a.tier === 'A' ? -1 : 1
    }
    if (a.totalScore !== b.totalScore) {
      return b.totalScore - a.totalScore
    }
    const rankDiff = rankIndex(b.rank) - rankIndex(a.rank)
    if (rankDiff !== 0) {
      return rankDiff
    }
    return suitIndex(b.suit) - suitIndex(a.suit)
  })

  const hitEntries: IdolHitEntry[] = entries.map((entry) => ({
    rank: entry.rank,
    suit: entry.suit,
    count: entry.ownCount,
  }))

  return { entries, hitEntries, context }
}

/**
 * Walks the same cumulative-threshold weighted pick `reset_idol_card()` uses
 * for its final selection: `threshold += count/totalWeight`, first entry
 * where `roll < threshold` wins. `entries` should be in the sorted order
 * `computeIdolSort` produces (matches `IdolSortResult.hitEntries`). Returns
 * the last entry as a fallback for floating-point rolls landing at/near 1.
 */
export function pickWinnerForRoll(
  entries: IdolHitEntry[],
  roll: number
): IdolHitEntry | null {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.count, 0)
  if (totalWeight <= 0) {
    return null
  }

  let threshold = 0
  for (const entry of entries) {
    threshold += entry.count / totalWeight
    if (roll < threshold) {
      return entry
    }
  }

  return entries.at(-1) ?? null
}
