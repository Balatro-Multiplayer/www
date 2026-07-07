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

/** Sanity ceiling for an entered game count — far above any real series. */
export const MAX_SCORE = 999

export const BEST_OF_OPTIONS = [1, 3, 5, 7] as const
export type BestOf = (typeof BEST_OF_OPTIONS)[number]

export function isBestOf(value: number): value is BestOf {
  return (BEST_OF_OPTIONS as readonly number[]).includes(value)
}

/** Wins required to take a best-of-N series (first to the majority). */
export function winsNeeded(bestOf: number): number {
  return Math.ceil(bestOf / 2)
}

/**
 * A score pair is a possible best-of-N state (finished or in progress):
 * nobody can exceed the wins needed, and at most one side can reach them.
 * Null scores are always acceptable (series not fully entered yet).
 */
export function isValidSeriesScore(
  score1: number | null,
  score2: number | null,
  bestOf: number
): boolean {
  const needed = winsNeeded(bestOf)
  if (score1 !== null && score1 > needed) return false
  if (score2 !== null && score2 > needed) return false
  return !(score1 === needed && score2 === needed)
}

/**
 * A series is decided only when exactly one player has reached the wins
 * the format requires — a 1-0 in a Bo3 is a series in progress, not a win.
 */
function decideWinner(match: ComputedMatch, bestOf: number): 1 | 2 | null {
  if (match.player1 === null || match.player2 === null) return null
  if (match.score1 === null || match.score2 === null) return null
  const needed = winsNeeded(bestOf)
  const oneWon = match.score1 >= needed
  const twoWon = match.score2 >= needed
  if (oneWon === twoWon) return null
  return oneWon ? 1 : 2
}

function winnerName(match: ComputedMatch): string | null {
  if (match.winner === null) return null
  return match.winner === 1 ? match.player1 : match.player2
}

function loserName(match: ComputedMatch): string | null {
  if (match.winner === null) return null
  return match.winner === 1 ? match.player2 : match.player1
}

export type BracketFormat = {
  /** Series format for every match (default Bo3). */
  bestOf?: number
  /** Series format for the grand final only; null/omitted = same as bestOf. */
  finalsBestOf?: number | null
}

/**
 * Derive the full bracket from seeds and stored scores.
 *
 * `seeds` is indexed by seed position (0..size-1); missing/blank entries are
 * treated as TBD. Score rows for addresses outside the bracket are ignored.
 * Winners are decided by the series format: first to the majority of
 * `bestOf` games (`finalsBestOf` for the grand final).
 */
export function computeBracket(
  size: BracketSize,
  hasThirdPlace: boolean,
  seeds: readonly (string | null)[],
  results: readonly BracketResult[],
  format: BracketFormat = {}
): ComputedRound[] {
  const totalRounds = roundCount(size)
  const bestOf = format.bestOf ?? 3
  const grandFinalBestOf = format.finalsBestOf ?? bestOf

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
    const isGrandFinal = round === totalRounds && !isThirdPlace
    match.winner = decideWinner(match, isGrandFinal ? grandFinalBestOf : bestOf)
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

/**
 * Every stored-result address invalidated by changing the occupants of the
 * given first-round slots: the changed matches themselves plus everything
 * downstream of them (their feed chain to the final, and the third-place
 * match once an affected semifinal is involved).
 */
export function affectedResultAddresses(
  size: BracketSize,
  hasThirdPlace: boolean,
  changedFirstRoundSlots: readonly number[]
): { round: number; slot: number }[] {
  const totalRounds = roundCount(size)
  const affected = new Set<string>()

  let frontier = [...new Set(changedFirstRoundSlots)].filter((slot) =>
    isValidMatchAddress(size, hasThirdPlace, 1, slot)
  )
  for (let round = 1; round <= totalRounds; round++) {
    for (const slot of frontier) {
      affected.add(`${round}:${slot}`)
    }
    if (round === totalRounds - 1 && hasThirdPlace && frontier.length > 0) {
      // An affected semifinal changes who drops into the third-place match.
      affected.add(`${totalRounds}:1`)
    }
    frontier = [...new Set(frontier.map((slot) => Math.floor(slot / 2)))]
  }

  return [...affected].map((key) => {
    const [round = 0, slot = 0] = key.split(':').map(Number)
    return { round, slot }
  })
}

/** The champion's name once the grand final is decided, else null. */
export function championOf(rounds: readonly ComputedRound[]): string | null {
  const finalRound = rounds[rounds.length - 1]
  const grandFinal = finalRound?.matches.find((m) => !m.isThirdPlace)
  return grandFinal ? winnerName(grandFinal) : null
}

/** A stored seed: display name plus an optional player-profile link. */
export type SeedEntry = { name: string; playerId: string | null }

/** A roster entry: a seed plus its placement (null = in the pool). */
export type RosterEntry = SeedEntry & { position: number | null }

/** Placed roster entries as a full positional array (nulls = TBD). */
export function rosterToSeeds(
  roster: readonly RosterEntry[],
  size: number
): (SeedEntry | null)[] {
  const seeds: (SeedEntry | null)[] = Array.from({ length: size }, () => null)
  for (const entry of roster) {
    if (
      entry.position !== null &&
      entry.position >= 0 &&
      entry.position < size
    ) {
      seeds[entry.position] = { name: entry.name, playerId: entry.playerId }
    }
  }
  return seeds
}

/** Positional name array for computeBracket from stored seed entries. */
export function seedNames(
  seeds: readonly (SeedEntry | null)[]
): (string | null)[] {
  return seeds.map((seed) => seed?.name ?? null)
}

/** Name → Discord id map for seeds linked to a player profile. */
export function seedPlayerLinks(
  seeds: readonly (SeedEntry | null)[]
): Record<string, string> {
  const links: Record<string, string> = {}
  for (const seed of seeds) {
    if (seed?.playerId) {
      links[seed.name] = seed.playerId
    }
  }
  return links
}
