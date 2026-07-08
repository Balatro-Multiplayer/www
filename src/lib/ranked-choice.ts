/**
 * Pure, side-effect-free poll tallying.
 *
 * The aggregation method is swappable via {@link tally}. Today there are two:
 * Borda count (ranked-choice) and approval count (multiple choice). IRV /
 * Condorcet can be added as new branches without touching the tRPC router or UI.
 *
 * Both methods consume the same {@link Ballot} shape. For approval ballots the
 * order of `ranked` carries no meaning; it is treated as an unordered set of
 * selected options.
 */

export type Ballot = {
  userId: string
  /**
   * optionIds selected on this ballot. For ranked polls, index 0 is the top
   * choice; for approval polls the order is irrelevant (a plain set). Partial
   * ballots (including empty) are allowed.
   */
  ranked: number[]
}

export type OptionResult = {
  optionId: number
  /** Borda points (ranked) or approval count (approval) across all ballots. */
  points: number
  /** How many ballots ranked/selected this option at all. */
  ballotsRanking: number
  /** Mean 1-based rank among ballots that ranked it, or null (always null for approval). */
  averageRank: number | null
  /** 1-based final standing after sorting + tie-breaking. */
  position: number
}

export type TallyMethod = 'borda' | 'approval'

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

/**
 * Approval count: every option a ballot selected earns one point, order-blind.
 *
 * An option's `points` and `ballotsRanking` are both the number of distinct
 * ballots that selected it (its "approvals"). Callers turn this into a share by
 * dividing by the total ballot count, including empty ballots, which count as
 * voters but approve nothing. Results are ordered by approvals desc, tie-broken
 * by optionId asc. `averageRank` is always null (approval is unordered).
 */
export function tallyApproval(
  ballots: Ballot[],
  optionIds: number[]
): OptionResult[] {
  const known = new Set(optionIds)

  const approvals = new Map<number, number>()
  for (const optionId of optionIds) approvals.set(optionId, 0)

  for (const ballot of ballots) {
    // Dedupe within a ballot so a repeated selection can't count twice.
    const seen = new Set<number>()
    for (const optionId of ballot.ranked) {
      if (!known.has(optionId) || seen.has(optionId)) continue
      seen.add(optionId)
      approvals.set(optionId, (approvals.get(optionId) ?? 0) + 1)
    }
  }

  const results = optionIds.map((optionId) => {
    const count = approvals.get(optionId) ?? 0
    return {
      optionId,
      points: count,
      ballotsRanking: count,
      averageRank: null,
      position: 0,
    }
  })

  results.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
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
    case 'approval':
      return tallyApproval(ballots, optionIds)
    default: {
      // Exhaustiveness guard so adding a method to TallyMethod forces a branch.
      const _never: never = method
      throw new Error(`Unknown tally method: ${String(_never)}`)
    }
  }
}
