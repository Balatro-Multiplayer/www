import { describe, expect, test } from 'bun:test'
import {
  type BracketResult,
  championOf,
  computeBracket,
  isValidMatchAddress,
  matchCountInRound,
  roundCount,
  roundLabel,
} from '@/lib/bracket'

/** Convenience: find a specific match in the computed rounds. */
function matchAt(
  rounds: ReturnType<typeof computeBracket>,
  round: number,
  slot: number
) {
  const found = rounds[round - 1]?.matches.find((m) => m.slot === slot)
  if (!found) throw new Error(`no match at (${round}, ${slot})`)
  return found
}

const SEASON_5_SEEDS = [
  'Dunk',
  'tomf',
  'Piton',
  'StarToad',
  'Bacon',
  'ReelStory',
  'Klust',
  'Toying',
  'Blockattack',
  'ezhikezhikov',
  'Owen',
  'Kozak',
  'Bob the Chopper',
  'King',
  'estrakami',
  'Yenn',
]

// Round of 16 + quarterfinal scores from the Season 5 bracket sheet.
const SEASON_5_RESULTS: BracketResult[] = [
  { round: 1, slot: 0, score1: 2, score2: 1 }, // Dunk > tomf
  { round: 1, slot: 1, score1: 0, score2: 2 }, // StarToad > Piton
  { round: 1, slot: 2, score1: 2, score2: 1 }, // Bacon > ReelStory
  { round: 1, slot: 3, score1: 2, score2: 1 }, // Klust > Toying
  { round: 1, slot: 4, score1: 2, score2: 1 }, // Blockattack > ezhikezhikov
  { round: 1, slot: 5, score1: 1, score2: 2 }, // Kozak > Owen
  { round: 1, slot: 6, score1: 2, score2: 1 }, // Bob the Chopper > King
  { round: 1, slot: 7, score1: 0, score2: 2 }, // Yenn > estrakami
  { round: 2, slot: 0, score1: 0, score2: 2 }, // StarToad > Dunk
  { round: 2, slot: 1, score1: 2, score2: 1 }, // Bacon > Klust
  { round: 2, slot: 2, score1: 1, score2: 2 }, // Kozak > Blockattack
  { round: 2, slot: 3, score1: 2, score2: 0 }, // Bob the Chopper > Yenn
]

describe('computeBracket — Season 5 playoffs scenario (16 players)', () => {
  const rounds = computeBracket(16, true, SEASON_5_SEEDS, SEASON_5_RESULTS)

  test('has 4 rounds with the right shapes and labels', () => {
    expect(rounds.map((r) => r.label)).toEqual([
      'Round of 16',
      'Quarterfinals',
      'Semifinals',
      'Finals',
    ])
    expect(rounds.map((r) => r.matches.length)).toEqual([8, 4, 2, 2])
  })

  test('quarterfinal pairings come from round-of-16 winners', () => {
    expect(matchAt(rounds, 2, 0)).toMatchObject({
      player1: 'Dunk',
      player2: 'StarToad',
    })
    expect(matchAt(rounds, 2, 3)).toMatchObject({
      player1: 'Bob the Chopper',
      player2: 'Yenn',
    })
  })

  test('semifinal pairings come from quarterfinal winners', () => {
    expect(matchAt(rounds, 3, 0)).toMatchObject({
      player1: 'StarToad',
      player2: 'Bacon',
    })
    expect(matchAt(rounds, 3, 1)).toMatchObject({
      player1: 'Kozak',
      player2: 'Bob the Chopper',
    })
  })

  test('grand final and third place are TBD until semis are played', () => {
    const grandFinal = matchAt(rounds, 4, 0)
    const thirdPlace = matchAt(rounds, 4, 1)
    expect(grandFinal.player1).toBeNull()
    expect(grandFinal.player2).toBeNull()
    expect(thirdPlace.isThirdPlace).toBe(true)
    expect(thirdPlace.player1).toBeNull()
    expect(championOf(rounds)).toBeNull()
  })

  test('semifinal losers feed the third-place match, winners the final', () => {
    const played = computeBracket(16, true, SEASON_5_SEEDS, [
      ...SEASON_5_RESULTS,
      { round: 3, slot: 0, score1: 3, score2: 1 }, // StarToad > Bacon
      { round: 3, slot: 1, score1: 2, score2: 3 }, // Bob the Chopper > Kozak
      { round: 4, slot: 0, score1: 3, score2: 2 }, // StarToad wins it all
      { round: 4, slot: 1, score1: 0, score2: 2 }, // Kozak third
    ])
    expect(matchAt(played, 4, 0)).toMatchObject({
      player1: 'StarToad',
      player2: 'Bob the Chopper',
      winner: 1,
    })
    expect(matchAt(played, 4, 1)).toMatchObject({
      player1: 'Bacon',
      player2: 'Kozak',
      winner: 2,
    })
    expect(championOf(played)).toBe('StarToad')
  })
})

describe('computeBracket — edge cases', () => {
  test('tied scores decide nothing', () => {
    const rounds = computeBracket(
      4,
      false,
      ['A', 'B', 'C', 'D'],
      [{ round: 1, slot: 0, score1: 1, score2: 1 }]
    )
    expect(matchAt(rounds, 1, 0).winner).toBeNull()
    expect(matchAt(rounds, 2, 0).player1).toBeNull()
  })

  test('partial scores decide nothing', () => {
    const rounds = computeBracket(
      4,
      false,
      ['A', 'B', 'C', 'D'],
      [{ round: 1, slot: 0, score1: 2, score2: null }]
    )
    expect(matchAt(rounds, 1, 0).winner).toBeNull()
  })

  test('scores against TBD players decide nothing', () => {
    const rounds = computeBracket(
      4,
      false,
      ['A', 'B'],
      [{ round: 1, slot: 1, score1: 2, score2: 0 }]
    )
    expect(matchAt(rounds, 1, 1)).toMatchObject({
      player1: null,
      player2: null,
      winner: null,
    })
  })

  test('blank and missing seeds are TBD', () => {
    const rounds = computeBracket(4, false, ['A', '  ', 'C'], [])
    expect(matchAt(rounds, 1, 0)).toMatchObject({
      player1: 'A',
      player2: null,
    })
    expect(matchAt(rounds, 1, 1)).toMatchObject({
      player1: 'C',
      player2: null,
    })
  })

  test('out-of-range stored results are ignored', () => {
    const rounds = computeBracket(
      4,
      false,
      ['A', 'B', 'C', 'D'],
      [
        { round: 9, slot: 0, score1: 5, score2: 0 },
        { round: 2, slot: 1, score1: 5, score2: 0 }, // no 3rd place match
      ]
    )
    expect(rounds[1]?.matches).toHaveLength(1)
    expect(matchAt(rounds, 2, 0).score1).toBeNull()
  })

  test('size 4 with third place: round 1 is the semifinals', () => {
    const rounds = computeBracket(
      4,
      true,
      ['A', 'B', 'C', 'D'],
      [
        { round: 1, slot: 0, score1: 2, score2: 0 }, // A > B
        { round: 1, slot: 1, score1: 0, score2: 2 }, // D > C
      ]
    )
    expect(rounds.map((r) => r.label)).toEqual(['Semifinals', 'Finals'])
    expect(matchAt(rounds, 2, 0)).toMatchObject({ player1: 'A', player2: 'D' })
    expect(matchAt(rounds, 2, 1)).toMatchObject({
      player1: 'B',
      player2: 'C',
      isThirdPlace: true,
    })
  })

  test('size 32 labels', () => {
    expect(roundLabel(1, roundCount(32))).toBe('Round of 32')
    expect(roundLabel(2, roundCount(32))).toBe('Round of 16')
  })
})

describe('match address validation', () => {
  test('counts include the third-place match only in the final round', () => {
    expect(matchCountInRound(16, 1, true)).toBe(8)
    expect(matchCountInRound(16, 4, true)).toBe(2)
    expect(matchCountInRound(16, 4, false)).toBe(1)
  })

  test('accepts in-range addresses and rejects the rest', () => {
    expect(isValidMatchAddress(16, true, 1, 7)).toBe(true)
    expect(isValidMatchAddress(16, true, 4, 1)).toBe(true)
    expect(isValidMatchAddress(16, false, 4, 1)).toBe(false)
    expect(isValidMatchAddress(16, true, 1, 8)).toBe(false)
    expect(isValidMatchAddress(16, true, 0, 0)).toBe(false)
    expect(isValidMatchAddress(16, true, 5, 0)).toBe(false)
    expect(isValidMatchAddress(16, true, 1.5, 0)).toBe(false)
    expect(isValidMatchAddress(16, true, 1, -1)).toBe(false)
  })
})
