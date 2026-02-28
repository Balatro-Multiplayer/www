/**
 * snapshot-season5.ts
 *
 * Run this at the END of Season 5 to archive the final leaderboard and all
 * match history into the website DB, so Season 5 can be served from the DB
 * going forward (same as Season 3).
 *
 * Usage:
 *   bun scripts/snapshot-season5.ts
 */

import { db } from '@/server/db'
import { leaderboardSnapshots, player_games } from '@/server/db/schema'
import { getSeasonForDate } from '@/server/seasons'
import {
  CASUAL_QUEUE_ID,
  RANKED_QUEUE_ID,
  SANDBOX_QUEUE_ID,
  SMALLWORLD_QUEUE_ID,
  VANILLA_QUEUE_ID,
} from '@/shared/constants'
import { SEASON_5_START_DATE } from '@/shared/seasons'
import { sql } from 'drizzle-orm'

const BOTLATRO_URL = 'http://balatro.virtualized.dev:4931'

const QUEUE_IDS = [
  RANKED_QUEUE_ID,
  SMALLWORLD_QUEUE_ID,
  VANILLA_QUEUE_ID,
  CASUAL_QUEUE_ID,
  SANDBOX_QUEUE_ID,
]

const QUEUE_NAME: Record<string, string> = {
  [RANKED_QUEUE_ID]: 'ranked',
  [SMALLWORLD_QUEUE_ID]: 'smallworld',
  [VANILLA_QUEUE_ID]: 'vanilla',
  [CASUAL_QUEUE_ID]: 'casual',
  [SANDBOX_QUEUE_ID]: 'sandbox',
}

// The timestamp stored on the snapshot rows — must be within the Season 5 window
const SNAPSHOT_TIMESTAMP = new Date()

// ─── Types ────────────────────────────────────────────────────────────────────

type ApiLeaderboardEntry = {
  id: string
  name: string | null
  mmr: number
  wins: number
  losses: number
  streak: string
  peak_mmr: number
  peak_streak: string
  rank: number
}

type ApiPlayerMatch = {
  match_id: number
  player_name: string
  player_id: string
  queue_id: number
  mmr_after: number
  won: boolean
  elo_change: number
  opponents: Array<{
    user_id: string
    name: string
    elo_change: number
    mmr_after: number
  }>
  deck: string | null
  stake: string | null
  created_at: string
}

type ApiOverallMatch = {
  match_id: number
  players: Array<{ user_id: string }>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<void>
): Promise<void> {
  let nextIdx = 0

  async function worker() {
    while (nextIdx < items.length) {
      const i = nextIdx++
      const item = items[i]
      if (item === undefined) {
        continue
      }
      await fn(item, i)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  )
}

// ─── Step 1: Leaderboard snapshots ───────────────────────────────────────────

async function snapshotLeaderboard(queueId: string): Promise<string[]> {
  const res = await fetch(
    `${BOTLATRO_URL}/api/stats/leaderboard/${queueId}?limit=100000`
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const json = (await res.json()) as { leaderboard: ApiLeaderboardEntry[] }

  const entries = json.leaderboard.map((e) => ({
    id: e.id,
    name: e.name ?? `User: ${e.id}`,
    mmr: e.mmr,
    wins: e.wins,
    losses: e.losses,
    streak: e.streak,
    totalgames: e.wins + e.losses,
    peak_mmr: e.peak_mmr,
    peak_streak: e.peak_streak,
    rank: e.rank,
    winrate: e.wins + e.losses > 0 ? e.wins / (e.wins + e.losses) : 0,
  }))

  await db.insert(leaderboardSnapshots).values({
    channelId: queueId,
    timestamp: SNAPSHOT_TIMESTAMP,
    data: entries,
  })

  console.log(`  ✓ Queue ${queueId}: ${entries.length} leaderboard entries`)
  return entries.map((e) => e.id)
}

// ─── Step 2: Collect all Season 5 player IDs via overall-history ──────────────

async function getPlayerIdsFromHistory(queueId: string): Promise<Set<string>> {
  const params = new URLSearchParams({
    limit: '200000',
    start_date: SEASON_5_START_DATE.toISOString(),
    end_date: SNAPSHOT_TIMESTAMP.toISOString(),
  })

  const res = await fetch(
    `${BOTLATRO_URL}/api/stats/overall-history/${queueId}?${params}`
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const json = (await res.json()) as { matches: ApiOverallMatch[] }
  const ids = new Set<string>()
  for (const match of json.matches) {
    for (const p of match.players) ids.add(p.user_id)
  }

  console.log(
    `  ✓ Queue ${queueId}: ${json.matches.length} matches, ${ids.size} unique players`
  )
  return ids
}

// ─── Step 3: Fetch + insert per-player match history ─────────────────────────

async function fetchPlayerMatches(userId: string): Promise<ApiPlayerMatch[]> {
  const res = await fetch(
    `${BOTLATRO_URL}/api/players/${userId}/matches?limit=10000`
  )
  if (!res.ok) return []

  const json = (await res.json()) as { matches: ApiPlayerMatch[] }
  const matches = await Promise.all(
    json.matches.map(async (match) => ({
      match,
      season: await getSeasonForDate(new Date(match.created_at)),
    }))
  )

  return matches
    .filter((entry) => entry.season === 'season5')
    .map((entry) => entry.match)
}

async function insertPlayerGames(
  playerIds: string[],
  gameNumOffset: number
): Promise<number> {
  let totalRows = 0
  let done = 0

  await runWithConcurrency(playerIds, 10, async (playerId) => {
    const matches = await fetchPlayerMatches(playerId)

    if (matches.length > 0) {
      const rows = matches.flatMap((m) => {
        const opponent = m.opponents[0]
        if (!opponent) {
          return []
        }

        return [
          {
            playerId: m.player_id,
            queueId: m.queue_id.toString(),
            playerName: m.player_name,
            gameId: m.match_id,
            gameTime: new Date(m.created_at),
            gameType: QUEUE_NAME[m.queue_id.toString()] ?? 'unknown',
            gameNum: m.match_id + gameNumOffset,
            playerMmr: m.mmr_after,
            mmrChange: m.elo_change,
            opponentId: opponent.user_id,
            opponentName: opponent.name,
            opponentMmr: opponent.mmr_after,
            deck: m.deck,
            stake: m.stake,
            result: m.won ? 'win' : ('loss' as const),
            season: 'season5' as const,
          },
        ]
      })

      const BATCH = 500
      for (let i = 0; i < rows.length; i += BATCH) {
        await db
          .insert(player_games)
          .values(rows.slice(i, i + BATCH))
          .onConflictDoNothing({
            target: [player_games.playerId, player_games.gameNum],
          })
      }

      totalRows += rows.length
    }

    done++
    process.stdout.write(`\r  Progress: ${done}/${playerIds.length} players`)
  })

  process.stdout.write('\n')
  return totalRows
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Season 5 Snapshot ===')
  console.log(`Timestamp: ${SNAPSHOT_TIMESTAMP.toISOString()}\n`)

  // Step 1: Leaderboard snapshots
  console.log('Step 1: Snapshotting leaderboards...')
  const leaderboardPlayerIds = new Set<string>()
  for (const queueId of QUEUE_IDS) {
    try {
      const ids = await snapshotLeaderboard(queueId)
      for (const id of ids) {
        leaderboardPlayerIds.add(id)
      }
    } catch (err) {
      console.error(`  ✗ Queue ${queueId} leaderboard failed:`, err)
    }
  }

  // Step 2: Collect all Season 5 player IDs from match history
  console.log(
    '\nStep 2: Collecting all Season 5 player IDs from match history...'
  )
  const allPlayerIds = new Set(leaderboardPlayerIds)
  for (const queueId of QUEUE_IDS) {
    try {
      const ids = await getPlayerIdsFromHistory(queueId)
      for (const id of ids) {
        allPlayerIds.add(id)
      }
    } catch (err) {
      console.error(`  ✗ Queue ${queueId} history failed:`, err)
    }
  }
  console.log(`  Total unique players: ${allPlayerIds.size}`)

  // Step 3: Insert match history per player
  // console.log('\nStep 3: Inserting match history...')
  // const [{ max }] = await db
  //   .select({ max: sql<number>`coalesce(max(${player_games.gameNum}), 0)` })
  //   .from(player_games)
  // const gameNumOffset = Number(max)
  // console.log(`  gameNum offset: ${gameNumOffset}`)
  //
  // const inserted = await insertPlayerGames(Array.from(allPlayerIds), gameNumOffset)
  // console.log(`  ✓ ${inserted} player_game rows inserted`)

  // Verify
  // const [{ total }] = await db
  //   .select({ total: sql<number>`count(*)` })
  //   .from(player_games)
  //   .where(sql`${player_games.season} = 'season5'`)
  // console.log(`\nSeason 5 rows in player_games: ${Number(total)}`)

  console.log('\nSnapshot complete!')
  console.log('\nNext steps to wire up Season 5 as a DB season:')
  console.log('  1. Add SEASON_6_START_DATE to src/shared/seasons.ts')
  console.log(
    '  2. Add season5 to DB_SEASONS in src/server/api/routers/stats.ts'
  )
  console.log(
    '  3. Update the date guards in src/server/api/routers/history.ts'
  )
  console.log(
    '  4. Add getSeason5Leaderboard to LeaderboardService (same as Season 3)'
  )

  process.exit(0)
}

main().catch((err) => {
  console.error('Snapshot failed:', err)
  process.exit(1)
})
