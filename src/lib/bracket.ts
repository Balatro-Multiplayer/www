/**
 * Pure single-elimination bracket logic.
 *
 * A bracket of `size` players (power of two, 4–32) has log2(size) rounds.
 * Matches are addressed by (round, slot): round 1 is the first round
 * (slot s pairs seeds 2s and 2s+1), and the winner of (r, s) advances to
 * (r+1, floor(s/2)) as player 1 when s is even, player 2 when s is odd.
 * When the bracket has a third-place match it lives in the final round at
 * slot 1 (slot 0 is the grand final) and receives the semifinal losers.
 *
 * Only seed names and per-match scores are stored; everything else —
 * who plays whom in later rounds, winners, champion — is derived here, so
 * the data can never disagree with itself.
 */

export const BRACKET_SIZES = [4, 8, 16, 32] as const
export type BracketSize = (typeof BRACKET_SIZES)[number]

/** A stored score row. Scores are null until entered. */
export type BracketResult = {
  round: number
  slot: number
  score1: number | null
  score2: number | null
}

export type ComputedMatch = {
  round: number
  slot: number
  isThirdPlace: boolean
  player1: string | null
  player2: string | null
  score1: number | null
  score2: number | null
  /** 1 or 2 when both players are known and scores are decisive, else null. */
  winner: 1 | 2 | null
}

export type ComputedRound = {
  round: number
  label: string
  matches: ComputedMatch[]
}

export function isBracketSize(size: number): size is BracketSize {
  return (BRACKET_SIZES as readonly number[]).includes(size)
}

export function roundCount(size: BracketSize): number {
  return Math.log2(size)
}

/** Number of matches in a round, counting the third-place match if present. */
export function matchCountInRound(
  size: BracketSize,
  round: number,
  hasThirdPlace: boolean
): number {
  const main = size / 2 ** round
  return round === roundCount(size) && hasThirdPlace ? main + 1 : main
}

export function isValidMatchAddress(
  size: BracketSize,
  hasThirdPlace: boolean,
  round: number,
  slot: number
): boolean {
  if (!Number.isInteger(round) || !Number.isInteger(slot)) return false
  if (round < 1 || round > roundCount(size)) return false
  return slot >= 0 && slot < matchCountInRound(size, round, hasThirdPlace)
}

export function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round
  if (fromEnd === 0) return 'Finals'
  if (fromEnd === 1) return 'Semifinals'
  if (fromEnd === 2) return 'Quarterfinals'
  return `Round of ${2 ** (fromEnd + 1)}`
}

export function matchLabel(match: ComputedMatch, totalRounds: number): string {
  if (match.round !== totalRounds) return roundLabel(match.round, totalRounds)
  return match.isThirdPlace ? 'Third Place' : 'Grand Finals'
}

function decideWinner(match: ComputedMatch): 1 | 2 | null {
  if (match.player1 === null || match.player2 === null) return null
  if (match.score1 === null || match.score2 === null) return null
  if (match.score1 === match.score2) return null
  return match.score1 > match.score2 ? 1 : 2
}

function winnerName(match: ComputedMatch): string | null {
  if (match.winner === null) return null
  return match.winner === 1 ? match.player1 : match.player2
}

function loserName(match: ComputedMatch): string | null {
  if (match.winner === null) return null
  return match.winner === 1 ? match.player2 : match.player1
}

/**
 * Derive the full bracket from seeds and stored scores.
 *
 * `seeds` is indexed by seed position (0..size-1); missing/blank entries are
 * treated as TBD. Score rows for addresses outside the bracket are ignored.
 */
export function computeBracket(
  size: BracketSize,
  hasThirdPlace: boolean,
  seeds: readonly (string | null)[],
  results: readonly BracketResult[]
): ComputedRound[] {
  const totalRounds = roundCount(size)

  const scoreByAddress = new Map<string, BracketResult>()
  for (const result of results) {
    if (isValidMatchAddress(size, hasThirdPlace, result.round, result.slot)) {
      scoreByAddress.set(`${result.round}:${result.slot}`, result)
    }
  }

  const normalizedSeed = (position: number): string | null => {
    const name = seeds[position]?.trim()
    return name ? name : null
  }

  const buildMatch = (
    round: number,
    slot: number,
    isThirdPlace: boolean,
    player1: string | null,
    player2: string | null
  ): ComputedMatch => {
    const stored = scoreByAddress.get(`${round}:${slot}`)
    const match: ComputedMatch = {
      round,
      slot,
      isThirdPlace,
      player1,
      player2,
      score1: stored?.score1 ?? null,
      score2: stored?.score2 ?? null,
      winner: null,
    }
    match.winner = decideWinner(match)
    return match
  }

  const rounds: ComputedRound[] = []
  let previous: ComputedMatch[] = []

  for (let round = 1; round <= totalRounds; round++) {
    const mainMatches = size / 2 ** round
    const matches: ComputedMatch[] = []

    for (let slot = 0; slot < mainMatches; slot++) {
      let player1: string | null
      let player2: string | null
      if (round === 1) {
        player1 = normalizedSeed(2 * slot)
        player2 = normalizedSeed(2 * slot + 1)
      } else {
        const feed1 = previous[2 * slot]
        const feed2 = previous[2 * slot + 1]
        player1 = feed1 ? winnerName(feed1) : null
        player2 = feed2 ? winnerName(feed2) : null
      }
      matches.push(buildMatch(round, slot, false, player1, player2))
    }

    if (round === totalRounds && hasThirdPlace) {
      // `previous` holds the semifinals (size >= 4 guarantees they exist).
      const player1 = previous[0] ? loserName(previous[0]) : null
      const player2 = previous[1] ? loserName(previous[1]) : null
      matches.push(buildMatch(round, 1, true, player1, player2))
    }

    rounds.push({ round, label: roundLabel(round, totalRounds), matches })
    previous = matches
  }

  return rounds
}

/** The champion's name once the grand final is decided, else null. */
export function championOf(rounds: readonly ComputedRound[]): string | null {
  const finalRound = rounds[rounds.length - 1]
  const grandFinal = finalRound?.matches.find((m) => !m.isThirdPlace)
  return grandFinal ? winnerName(grandFinal) : null
}
