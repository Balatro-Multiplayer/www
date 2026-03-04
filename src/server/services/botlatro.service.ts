import { eq } from 'drizzle-orm'
import { env } from '@/env'
import { db } from '../db'
import { transcripts } from '../db/schema'
import { redis } from '../redis'

const BOTLATRO_URL = 'http://balatro.virtualized.dev:4931/'
const TRANSCRIPT_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7

export const TRANSCRIPT_CACHE_KEY = (gameNumber: number) =>
  `transcript:${gameNumber}`

export const botlatro_service = {
  get_active_matches: async (): Promise<ActiveMatchQueue[]> => {
    const response = await fetch(`${BOTLATRO_URL}api/matches/active-counts`, {
      headers: {
        Authorization: `Bearer ${env.API_TOKEN}`,
      },
    })
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
    }
    const data = (await response.json()) as { queues: ActiveMatchQueue[] }
    return data.queues
  },
  get_leaderboard: async (queue_id: string, season?: number) => {
    const params = new URLSearchParams({ limit: '100000' })
    if (season !== undefined) {
      params.set('season', season.toString())
    }
    const response = await fetch(
      `${BOTLATRO_URL}api/stats/leaderboard/${queue_id}?${params}`
    )
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
    }
    const res = (await response.json()) as LeaderboardResponse

    res.leaderboard.sort((a, b) => b.mmr - a.mmr)

    const fixed: Array<LeaderboardEntry> = res.leaderboard.map(
      (entry, _idx) => ({
        ...entry,
        rank: entry.rank,
        id: entry.id,
        name: entry.name ?? `User: ${entry.id}`,
        totalgames: entry.wins + entry.losses,
        winrate:
          entry.wins + entry.losses > 0
            ? entry.wins / (entry.wins + entry.losses)
            : 0,
      })
    )

    return fixed
  },
  get_player_matches: async ({
    userId,
    queueId,
    limit,
  }: {
    userId: string
    limit?: number
    queueId?: string
  }) => {
    try {
      const params = new URLSearchParams()
      if (limit) {
        params.set('limit', limit.toString())
      }
      if (queueId) params.set('queue_id', queueId)

      const url = `${BOTLATRO_URL}api/players/${userId}/matches${params.toString() ? `?${params.toString()}` : ''}`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
      }
      const data = (await response.json()) as PlayerMatchesResponse

      return data.matches
    } catch (error) {
      console.error(`Error fetching history for user ${userId}:`, error)
      return []
    }
  },

  get_transcript: async (gameNumber: number) => {
    const cacheKey = TRANSCRIPT_CACHE_KEY(gameNumber)
    const cachedTranscript = await redis.get(cacheKey)

    if (cachedTranscript) {
      console.log(`Transcript #${gameNumber} found in Redis cache`)
      return cachedTranscript
    }

    const dbTranscript = await db.query.transcripts.findFirst({
      where: eq(transcripts.gameNumber, gameNumber),
    })

    if (dbTranscript) {
      console.log(`Transcript #${gameNumber} found in database`)
      await redis.setEx(
        cacheKey,
        TRANSCRIPT_CACHE_TTL_SECONDS,
        dbTranscript.content
      )
      return dbTranscript.content
    }

    console.log(`Fetching transcript #${gameNumber} from neatqueue`)
    try {
      const response = await fetch(
        `${BOTLATRO_URL}api/transcripts/view/${gameNumber}`,
        {
          headers: {
            Authorization: `Bearer ${env.API_TOKEN}`,
          },
        }
      )
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
      }
      const res = (await response.json()) as {
        success: boolean
        transcript: string
      }

      if (!res.success || !res.transcript) {
        return null
      }

      const data = res.transcript

      await db
        .insert(transcripts)
        .values({
          gameNumber,
          content: data,
        })
        .onConflictDoUpdate({
          target: transcripts.gameNumber,
          set: { content: data },
        })

      await redis.setEx(cacheKey, TRANSCRIPT_CACHE_TTL_SECONDS, data)
      return data
    } catch (error) {
      console.error(`Error fetching transcript #${gameNumber}:`, error)
      throw error
    }
  },
}

export type LeaderboardEntry = {
  id: string
  name: string
  mmr: number
  wins: number
  losses: number
  streak: number
  totalgames: number
  decay?: number
  ign?: string
  peak_mmr: number
  peak_streak: number
  rank: number
  winrate: number
}

export type LeaderboardResponse = {
  leaderboard: LeaderboardEntry[]
}

export type PlayerMatch = {
  match_id: number
  player_name: string
  player_id: string
  queue_id: number
  mmr_after: number
  won: boolean
  elo_change: number
  team: number
  opponents: Array<Opponent>
  deck: string | null
  stake: string | null
  best_of_3: boolean
  best_of_5: boolean
  created_at: string
  winning_team: number
}

export type PlayerMatchesResponse = {
  matches: PlayerMatch[]
}

export type Opponent = {
  user_id: string
  name: string
  team: number
  elo_change: number
  mmr_after: number
}

export type ActiveMatchQueue = {
  queue_id: number
  queue_name: string
  active_matches: number
}
