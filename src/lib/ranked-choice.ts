/**
 * Pure, side-effect-free ranked-choice tallying.
 *
 * The aggregation method is swappable via {@link tally}. The default and only
 * method today is Borda count; IRV/Condorcet can be added as new branches
 * without touching the tRPC router or UI.
 */

export type Ballot = {
  userId: string
  /** optionIds in ranked order; index 0 is the top choice. Partial rankings allowed. */
  ranked: number[]
}

export type OptionResult = {
  optionId: number
  /** Total Borda points across all ballots. */
  points: number
  /** How many ballots ranked this option at all. */
  ballotsRanking: number
  /** Mean 1-based rank among ballots that ranked it, or null if never ranked. */
  averageRank: number | null
  /** 1-based final standing after sorting + tie-breaking. */
  position: number
}

export type TallyMethod = 'borda'

/**
 * Borda count with the "unranked = tied for last" convention.
 *
 * With `M = optionIds.length`, an option ranked at 1-based position `p` on a
 * ballot earns `M - p` points; options a ballot did not rank earn `0`. Results
 * are ordered by points desc, tie-broken by (1) number of ballots ranking the
 * option desc, then (2) optionId asc for determinism. Every option in
 * `optionIds` appears in the output, even if never ranked.
 */
export function tallyBorda(
  ballots: Ballot[],
  optionIds: number[]
): OptionResult[] {
  const m = optionIds.length
  const known = new Set(optionIds)

  const points = new Map<number, number>()
  const count = new Map<number, number>()
  const rankSum = new Map<number, number>()
  for (const optionId of optionIds) {
    points.set(optionId, 0)
    count.set(optionId, 0)
    rankSum.set(optionId, 0)
  }

  for (const ballot of ballots) {
    // Normalize to a clean ranking (drop unknown/duplicate ids, preserve order)
    // so positions are contiguous 1..k regardless of malformed input.
    const seen = new Set<number>()
    const cleaned: number[] = []
    for (const optionId of ballot.ranked) {
      if (!known.has(optionId) || seen.has(optionId)) continue
      seen.add(optionId)
      cleaned.push(optionId)
    }
    cleaned.forEach((optionId, index) => {
      const position = index + 1 // 1-based
      points.set(optionId, (points.get(optionId) ?? 0) + (m - position))
      count.set(optionId, (count.get(optionId) ?? 0) + 1)
      rankSum.set(optionId, (rankSum.get(optionId) ?? 0) + position)
    })
  }

  const results = optionIds.map((optionId) => {
    const ballotsRanking = count.get(optionId) ?? 0
    return {
      optionId,
      points: points.get(optionId) ?? 0,
      ballotsRanking,
      averageRank:
        ballotsRanking > 0
          ? (rankSum.get(optionId) ?? 0) / ballotsRanking
          : null,
      position: 0,
    }
  })

  results.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.ballotsRanking !== a.ballotsRanking) {
      return b.ballotsRanking - a.ballotsRanking
    }
    return a.optionId - b.optionId
  })

  results.forEach((result, index) => {
    result.position = index + 1
  })

  return results
}

/** Method-dispatching entry point. Defaults to Borda. */
export function tally(
  method: TallyMethod,
  ballots: Ballot[],
  optionIds: number[]
): OptionResult[] {
  switch (method) {
    case 'borda':
      return tallyBorda(ballots, optionIds)
    default: {
      // Exhaustiveness guard so adding a method to TallyMethod forces a branch.
      const _never: never = method
      throw new Error(`Unknown tally method: ${String(_never)}`)
    }
  }
}
