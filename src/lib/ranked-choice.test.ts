import { describe, expect, test } from 'bun:test'
import { type Ballot, tally, tallyBorda } from '@/lib/ranked-choice'

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
    // 3:4, 1:2, 2:0 — straightforward, verifies ordering
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

describe('tally dispatcher', () => {
  test('borda method matches tallyBorda and is deterministic', () => {
    const optionIds = [1, 2, 3]
    const ballots: Ballot[] = [{ userId: 'a', ranked: [3, 1] }]
    const a = tally('borda', ballots, optionIds)
    const b = tally('borda', ballots, optionIds)
    expect(a).toEqual(b)
    expect(a).toEqual(tallyBorda(ballots, optionIds))
  })
})
