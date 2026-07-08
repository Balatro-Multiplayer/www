import { describe, expect, test } from 'bun:test'
import {
  type Ballot,
  tally,
  tallyApproval,
  tallyBorda,
} from '@/lib/ranked-choice'

/** Convenience: map results to `{ optionId: points }` for readable assertions. */
function pointsByOption(results: ReturnType<typeof tallyBorda>) {
  return Object.fromEntries(results.map((r) => [r.optionId, r.points]))
}

describe('tallyBorda', () => {
  test('full ballots: M - position scoring', () => {
    const optionIds = [1, 2, 3]
    const ballots: Ballot[] = [
      { userId: 'a', ranked: [1, 2, 3] }, // 1:2, 2:1, 3:0
      { userId: 'b', ranked: [1, 3, 2] }, // 1:2, 3:1, 2:0
    ]
    const results = tallyBorda(ballots, optionIds)
    expect(pointsByOption(results)).toEqual({ 1: 4, 2: 1, 3: 1 })
    // option 1 wins outright
    expect(results[0]?.optionId).toBe(1)
    expect(results[0]?.position).toBe(1)
  })

  test('partial ballots: unranked options score 0 (tied for last)', () => {
    const optionIds = [1, 2, 3, 4]
    const ballots: Ballot[] = [
      { userId: 'a', ranked: [2] }, // M=4, pos1 → 2:3; 1,3,4 unranked → 0
      { userId: 'b', ranked: [2, 1] }, // 2:3, 1:2
    ]
    const results = tallyBorda(ballots, optionIds)
    expect(pointsByOption(results)).toEqual({ 1: 2, 2: 6, 3: 0, 4: 0 })
    const two = results.find((r) => r.optionId === 2)
    expect(two?.ballotsRanking).toBe(2)
    expect(two?.averageRank).toBe(1)
    const three = results.find((r) => r.optionId === 3)
    expect(three?.ballotsRanking).toBe(0)
    expect(three?.averageRank).toBeNull()
  })

  test('every option appears even when never ranked (empty poll)', () => {
    const results = tallyBorda([], [10, 20, 30])
    expect(results).toHaveLength(3)
    expect(results.every((r) => r.points === 0)).toBe(true)
    expect(results.every((r) => r.ballotsRanking === 0)).toBe(true)
    // deterministic order by optionId when all tied
    expect(results.map((r) => r.optionId)).toEqual([10, 20, 30])
  })

  test('center-squeeze: Borda favors the consensus option B', () => {
    // 100 voters, options A=1, B=2, C=3
    // 40: A>B>C, 35: C>B>A, 25: B>C>A
    const optionIds = [1, 2, 3]
    const ballots: Ballot[] = [
      ...Array.from({ length: 40 }, (_, i) => ({
        userId: `a${i}`,
        ranked: [1, 2, 3],
      })),
      ...Array.from({ length: 35 }, (_, i) => ({
        userId: `c${i}`,
        ranked: [3, 2, 1],
      })),
      ...Array.from({ length: 25 }, (_, i) => ({
        userId: `b${i}`,
        ranked: [2, 3, 1],
      })),
    ]
    const results = tallyBorda(ballots, optionIds)
    // A: 40*2 = 80; B: 40*1 + 35*1 + 25*2 = 125; C: 35*2 + 25*1 = 95
    expect(pointsByOption(results)).toEqual({ 1: 80, 2: 125, 3: 95 })
    expect(results.map((r) => r.optionId)).toEqual([2, 3, 1]) // B > C > A
  })

  test('tie-break: more ballots ranking wins, then lower optionId', () => {
    const optionIds = [1, 2, 3]
    const ballots: Ballot[] = [
      { userId: 'a', ranked: [1] }, // 1: M-1 = 2
      { userId: 'b', ranked: [2] }, // 2: 2
      { userId: 'c', ranked: [2, 3] }, // 2: +2 → 4 ... adjust below
    ]
    // Make 1 and 3 tie on points but differ on ballotsRanking / id:
    const results = tallyBorda(
      [
        { userId: 'a', ranked: [1] }, // 1:2
        { userId: 'b', ranked: [3] }, // 3:2
        { userId: 'c', ranked: [3] }, // 3:+2 → 4
      ],
      optionIds
    )
    // 3:4, 1:2, 2:0, straightforward, verifies ordering
    expect(results.map((r) => r.optionId)).toEqual([3, 1, 2])
    // suppress unused
    void ballots
  })

  test('ignores duplicate and unknown option ids on a ballot', () => {
    const optionIds = [1, 2]
    const ballots: Ballot[] = [
      { userId: 'a', ranked: [1, 1, 99, 2] }, // dup 1 and unknown 99 ignored
    ]
    const results = tallyBorda(ballots, optionIds)
    // M=2; effective order [1,2] → 1:1, 2:0
    expect(pointsByOption(results)).toEqual({ 1: 1, 2: 0 })
    expect(results.find((r) => r.optionId === 1)?.ballotsRanking).toBe(1)
  })
})

/** Convenience: map results to `{ optionId: approvals }`. */
function approvalsByOption(results: ReturnType<typeof tallyApproval>) {
  return Object.fromEntries(results.map((r) => [r.optionId, r.ballotsRanking]))
}

/** Share of voters (0..1) that selected each option, given a ballot count. */
function shareByOption(
  results: ReturnType<typeof tallyApproval>,
  totalBallots: number
) {
  return Object.fromEntries(
    results.map((r) => [
      r.optionId,
      totalBallots === 0 ? 0 : r.ballotsRanking / totalBallots,
    ])
  )
}

describe('tallyApproval', () => {
  test('one voter approving every option → all at 100%', () => {
    const optionIds = [1, 2, 3, 4, 5, 6]
    const ballots: Ballot[] = [{ userId: 'a', ranked: [1, 2, 3, 4, 5, 6] }]
    const results = tallyApproval(ballots, optionIds)
    expect(approvalsByOption(results)).toEqual({
      1: 1,
      2: 1,
      3: 1,
      4: 1,
      5: 1,
      6: 1,
    })
    // 1 ballot total, every option selected by it → 100% each.
    const share = shareByOption(results, ballots.length)
    expect(Object.values(share).every((s) => s === 1)).toBe(true)
  })

  test('second voter picking one option → 100% for it, 50% for the rest', () => {
    const optionIds = [1, 2, 3, 4, 5, 6]
    const ballots: Ballot[] = [
      { userId: 'a', ranked: [1, 2, 3, 4, 5, 6] },
      { userId: 'b', ranked: [1] },
    ]
    const results = tallyApproval(ballots, optionIds)
    // option 1: both voters (2/2 = 100%); the other five: one voter (1/2 = 50%).
    expect(approvalsByOption(results)).toEqual({
      1: 2,
      2: 1,
      3: 1,
      4: 1,
      5: 1,
      6: 1,
    })
    const share = shareByOption(results, ballots.length)
    expect(share[1]).toBe(1)
    expect(share[2]).toBe(0.5)
    expect(share[6]).toBe(0.5)
    // winner is option 1
    expect(results[0]?.optionId).toBe(1)
    expect(results[0]?.position).toBe(1)
  })

  test('empty ballots count as voters but approve nothing', () => {
    const optionIds = [1, 2, 3]
    const ballots: Ballot[] = [
      { userId: 'a', ranked: [1] },
      { userId: 'b', ranked: [] }, // abstained, still a voter
      { userId: 'c', ranked: [] },
    ]
    const results = tallyApproval(ballots, optionIds)
    expect(approvalsByOption(results)).toEqual({ 1: 1, 2: 0, 3: 0 })
    // option 1 selected by 1 of 3 voters → 33%.
    const share = shareByOption(results, ballots.length)[1] ?? 0
    expect(Math.round(share * 100)).toBe(33)
  })

  test('every option appears even when no ballots exist', () => {
    const results = tallyApproval([], [10, 20, 30])
    expect(results).toHaveLength(3)
    expect(results.every((r) => r.ballotsRanking === 0)).toBe(true)
    expect(results.every((r) => r.averageRank === null)).toBe(true)
    // deterministic order by optionId when all tied
    expect(results.map((r) => r.optionId)).toEqual([10, 20, 30])
  })

  test('order of selections is irrelevant; dupes and unknowns ignored', () => {
    const optionIds = [1, 2, 3]
    const a = tallyApproval([{ userId: 'x', ranked: [3, 1, 2] }], optionIds)
    const b = tallyApproval([{ userId: 'x', ranked: [1, 2, 3] }], optionIds)
    expect(approvalsByOption(a)).toEqual(approvalsByOption(b))
    // dup 2 counted once, unknown 99 dropped
    const c = tallyApproval([{ userId: 'y', ranked: [2, 2, 99] }], optionIds)
    expect(approvalsByOption(c)).toEqual({ 1: 0, 2: 1, 3: 0 })
  })

  test('ties break by optionId ascending', () => {
    const optionIds = [3, 1, 2]
    const results = tallyApproval(
      [
        { userId: 'a', ranked: [1, 2, 3] },
        { userId: 'b', ranked: [1, 2, 3] },
      ],
      optionIds
    )
    // all tied at 2 approvals → ascending optionId order
    expect(results.map((r) => r.optionId)).toEqual([1, 2, 3])
  })
})

describe('tally dispatcher', () => {
  test('borda method matches tallyBorda and is deterministic', () => {
    const optionIds = [1, 2, 3]
    const ballots: Ballot[] = [{ userId: 'a', ranked: [3, 1] }]
    const a = tally('borda', ballots, optionIds)
    const b = tally('borda', ballots, optionIds)
    expect(a).toEqual(b)
    expect(a).toEqual(tallyBorda(ballots, optionIds))
  })

  test('approval method matches tallyApproval', () => {
    const optionIds = [1, 2, 3]
    const ballots: Ballot[] = [{ userId: 'a', ranked: [3, 1] }]
    expect(tally('approval', ballots, optionIds)).toEqual(
      tallyApproval(ballots, optionIds)
    )
  })
})
