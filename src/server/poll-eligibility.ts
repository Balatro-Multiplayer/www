import { getActiveSeasonNumber } from '@/server/seasons'
import { leaderboardService } from '@/server/services/leaderboard'
import { RANKED_QUEUE_ID } from '@/shared/constants'

/**
 * Discord ids that are always allowed to vote in polls, regardless of ranked
 * participation. Manual override list — the checks below short-circuit on these
 * before touching the ranked service, so exempt users can vote even during an
 * API outage and are never purged.
 */
export const POLL_ELIGIBILITY_EXEMPT_DISCORD_IDS = new Set<string>([
  '236316622153973760',
])

/**
 * Discord ids allowed to vote: everyone on the current-season standard-ranked
 * leaderboard, plus the manual exemptions. Loads the leaderboard once, so it is
 * the efficient shape for bulk checks (e.g. the ballot purge).
 *
 * Throws if the ranked leaderboard cannot be resolved, so callers can fail-closed.
 */
export async function getEligibleVoterDiscordIds(): Promise<Set<string>> {
  const seasonId = await getActiveSeasonNumber()
  const board = await leaderboardService.getSeasonLeaderboard(
    seasonId,
    RANKED_QUEUE_ID
  )
  const ids = new Set(board.map((entry) => entry.id))
  for (const id of POLL_ELIGIBILITY_EXEMPT_DISCORD_IDS) {
    ids.add(id)
  }
  return ids
}

/**
 * True iff this discord id may vote: either manually exempt, or present on the
 * current-season standard-ranked leaderboard (presence ⇒ played ≥1 ranked game
 * this season; presence is used rather than a games-played threshold so that
 * tie-only players still count).
 *
 * Throws if eligibility cannot be determined, so callers can fail-closed.
 */
export async function hasPlayedStandardRankedThisSeason(
  discordId: string | null | undefined
): Promise<boolean> {
  if (!discordId) return false
  if (POLL_ELIGIBILITY_EXEMPT_DISCORD_IDS.has(discordId)) return true
  const seasonId = await getActiveSeasonNumber()
  const entry = await leaderboardService.getSeasonUserRank(
    seasonId,
    RANKED_QUEUE_ID,
    discordId
  )
  return entry !== null
}
