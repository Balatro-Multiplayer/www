import fs from 'node:fs'
import path from 'node:path'
import { db } from '@/server/db'
import { leaderboardSnapshots, memoryLogs, metadata } from '@/server/db/schema'
import { SEASON_3_START_DATE, SEASON_4_START_DATE } from '@/shared/seasons'
import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { redis } from '../redis'
import { type LeaderboardEntry, botlatro_service } from './botlatro.service'

// Memory profiling utility
let currentRunId: string | null = null

type SnapshotEntry = {
  id: string
  name: string
  data: {
    mmr: number
    wins: number
    losses: number
    streak: number
    totalgames: number
    peak_mmr: number
    peak_streak: number
    rank: number
    winrate: number
  }
}

type SnapshotFile = {
  alltime: SnapshotEntry[]
}

type StoredLeaderboardSnapshot = {
  data: LeaderboardEntry[]
  timestamp: string
  queue_id: string
}

function logMemory(label: string, metadata?: Record<string, unknown>) {
  if (!currentRunId) return

  const mem = process.memoryUsage()
  const data = {
    runId: currentRunId,
    label,
    heapUsedMb: mem.heapUsed / 1024 / 1024,
    heapTotalMb: mem.heapTotal / 1024 / 1024,
    rssMb: mem.rss / 1024 / 1024,
    externalMb: mem.external / 1024 / 1024,
    metadata: metadata || null,
  }

  console.log(`[MEMORY ${label}]`, {
    heap: `${Math.round(data.heapUsedMb)}MB`,
    rss: `${Math.round(data.rssMb)}MB`,
    ...metadata,
  })
}

function mapSnapshotEntries(fileContent: string): LeaderboardEntry[] {
  const data = JSON.parse(fileContent) as SnapshotFile
  return data.alltime.map((entry) => ({
    id: entry.id,
    name: entry.name,
    mmr: entry.data.mmr,
    wins: entry.data.wins,
    losses: entry.data.losses,
    streak: entry.data.streak,
    totalgames: entry.data.totalgames,
    peak_mmr: entry.data.peak_mmr,
    peak_streak: entry.data.peak_streak,
    rank: entry.data.rank,
    winrate: entry.data.winrate,
  }))
}

function toRedisLeaderboardEntry(
  entry: LeaderboardEntry,
  queue_id: string
): Record<string, string> {
  return {
    id: entry.id,
    name: entry.name,
    mmr: entry.mmr.toString(),
    wins: entry.wins.toString(),
    losses: entry.losses.toString(),
    streak: entry.streak.toString(),
    totalgames: entry.totalgames.toString(),
    peak_mmr: entry.peak_mmr.toString(),
    peak_streak: entry.peak_streak.toString(),
    rank: entry.rank.toString(),
    winrate: entry.winrate.toString(),
    queue_id,
  }
}

export type LeaderboardResponse = {
  data: LeaderboardEntry[]
  isStale: boolean
  total?: number
  page?: number
  pageSize?: number
  totalPages?: number
}

export type PaginationOptions = {
  page?: number
  pageSize?: number
  search?: string
  minGames?: number
  maxGames?: number
  sortBy?:
    | 'rank'
    | 'mmr'
    | 'wins'
    | 'losses'
    | 'winrate'
    | 'totalgames'
    | 'streak'
    | 'peak_mmr'
    | 'peak_streak'
  sortOrder?: 'asc' | 'desc'
}

export type LeaderboardSnapshotResponse = {
  data: LeaderboardEntry[]
  timestamp: string
  queue_id: string
}

export type UserRankResponse = {
  data: LeaderboardEntry
  isStale: boolean
} | null

export class LeaderboardService {
  private static readonly LIVE_SEASON_CACHE_TTL_SECONDS = 180

  private season1DataCache: Map<string, LeaderboardEntry[]> = new Map()
  private season2DataCache: Map<string, LeaderboardEntry[]> = new Map()
  private season3DataCache: Map<string, LeaderboardEntry[]> = new Map()
  private season4DataCache: Map<string, LeaderboardEntry[]> = new Map()
  private season5DataCache: Map<string, LeaderboardEntry[]> = new Map()

  private getZSetKey(queue_id: string) {
    return `zset:leaderboard:${queue_id}`
  }

  // Load Season 1 data from the snapshot file
  private loadSeason1Data(queue_id: string): LeaderboardEntry[] {
    // Check if data is already cached
    if (this.season1DataCache.has(queue_id)) {
      const cached = this.season1DataCache.get(queue_id)
      if (cached) return cached
    }

    try {
      // Path to the Season 1 snapshot file
      const filePath = path.join(
        process.cwd(),
        'src',
        'data',
        'leaderboard-snapshot-eos1.json'
      )

      // Read and parse the file
      const fileContent = fs.readFileSync(filePath, 'utf-8')
      const entries = mapSnapshotEntries(fileContent)

      // Cache the data for future requests
      this.season1DataCache.set(queue_id, entries)

      return entries
    } catch (error) {
      console.error('Error loading Season 2 data:', error)
      return []
    }
  }

  // Get Season 1 leaderboard data
  async getSeason1Leaderboard(queue_id: string): Promise<LeaderboardEntry[]> {
    const entries = this.loadSeason1Data(queue_id)

    // Sort entries by MMR in descending order
    const sortedEntries = [...entries].sort((a, b) => b.mmr - a.mmr)

    // Recalculate ranks based on sorted order
    return sortedEntries.map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }))
  }

  // Get Season 1 user rank data
  async getSeason1UserRank(
    queue_id: string,
    user_id: string
  ): Promise<LeaderboardEntry | null> {
    // Get the sorted leaderboard with recalculated ranks
    const sortedLeaderboard = await this.getSeason1Leaderboard(queue_id)

    // Find the user entry in the sorted leaderboard
    const userEntry = sortedLeaderboard.find((entry) => entry.id === user_id)
    return userEntry || null
  }

  // Load Season 2 data from the snapshot file
  private loadSeason2Data(queue_id: string): LeaderboardEntry[] {
    // Check if data is already cached
    if (this.season2DataCache.has(queue_id)) {
      const cached = this.season2DataCache.get(queue_id)
      if (cached) return cached
    }

    try {
      // Path to the Season 2 snapshot file
      const filePath = path.join(
        process.cwd(),
        'src',
        'data',
        'leaderboard-snapshot-eos2.json'
      )

      // Read and parse the file
      const fileContent = fs.readFileSync(filePath, 'utf-8')
      const entries = mapSnapshotEntries(fileContent)

      // Cache the data for future requests
      this.season2DataCache.set(queue_id, entries)

      return entries
    } catch (error) {
      console.error('Error loading Season 2 data:', error)
      return []
    }
  }

  // Get Season 2 leaderboard data
  async getSeason2Leaderboard(queue_id: string): Promise<LeaderboardEntry[]> {
    const entries = this.loadSeason2Data(queue_id)

    // Sort entries by MMR in descending order
    const sortedEntries = [...entries].sort((a, b) => b.mmr - a.mmr)

    // Recalculate ranks based on sorted order
    return sortedEntries.map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }))
  }

  // Get Season 2 user rank data
  async getSeason2UserRank(
    queue_id: string,
    user_id: string
  ): Promise<LeaderboardEntry | null> {
    // Get the sorted leaderboard with recalculated ranks
    const sortedLeaderboard = await this.getSeason2Leaderboard(queue_id)

    // Find the user entry in the sorted leaderboard
    const userEntry = sortedLeaderboard.find((entry) => entry.id === user_id)
    return userEntry || null
  }

  // Load Season 3 data from the database snapshot table
  private async loadSeason3Data(queue_id: string): Promise<LeaderboardEntry[]> {
    // Use cache if available
    if (this.season3DataCache.has(queue_id)) {
      return this.season3DataCache.get(queue_id) as LeaderboardEntry[]
    }

    try {
      // Find the latest snapshot within the Season 3 window for the channel
      const snapshot = await db
        .select()
        .from(leaderboardSnapshots)
        .where(
          and(
            eq(leaderboardSnapshots.channelId, queue_id),
            gte(leaderboardSnapshots.timestamp, SEASON_3_START_DATE),
            lt(leaderboardSnapshots.timestamp, SEASON_4_START_DATE)
          )
        )
        .orderBy(desc(leaderboardSnapshots.timestamp))
        .limit(1)
        .then((rows) => rows[0])

      if (!snapshot) {
        console.warn(`No Season 3 snapshot found for channel ${queue_id}`)
        this.season3DataCache.set(queue_id, [])
        return []
      }

      const entries = (snapshot.data as LeaderboardEntry[]).map((e) => ({
        ...e,
        // Ensure number fields are numbers
        mmr: Number(e.mmr),
        wins: Number(e.wins),
        losses: Number(e.losses),
        totalgames: Number(e.totalgames),
        peak_mmr: Number(e.peak_mmr),
        peak_streak: Number(e.peak_streak),
        winrate: Number(e.winrate),
      }))

      this.season3DataCache.set(queue_id, entries)
      return entries
    } catch (error) {
      console.error('Error loading Season 3 data from DB:', error)
      return []
    }
  }

  // Get Season 3 leaderboard data
  async getSeason3Leaderboard(queue_id: string): Promise<LeaderboardEntry[]> {
    const entries = await this.loadSeason3Data(queue_id)

    // Sort by MMR desc and recompute ranks
    const sortedEntries = [...entries].sort((a, b) => b.mmr - a.mmr)
    return sortedEntries.map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }))
  }

  // Get Season 3 user rank data
  async getSeason3UserRank(
    queue_id: string,
    user_id: string
  ): Promise<LeaderboardEntry | null> {
    const sortedLeaderboard = await this.getSeason3Leaderboard(queue_id)
    const userEntry = sortedLeaderboard.find((entry) => entry.id === user_id)
    return userEntry || null
  }

  // Load Season 4 data from the snapshot file
  private loadSeason4Data(queue_id: string): LeaderboardEntry[] {
    // Check if data is already cached
    if (this.season4DataCache.has(queue_id)) {
      const cached = this.season4DataCache.get(queue_id)
      if (cached) return cached
    }

    try {
      // Path to the Season 4 snapshot file (change depending on queue id)
      // TODO: Make this better, this is kind of scuffed but I can't be bothered to figure out how to utilize the db
      const filePath = path.join(
        process.cwd(),
        'src',
        'data',
        `leaderboard-snapshot-eos4-${queue_id}.json`
      )

      // Read and parse the file
      const fileContent = fs.readFileSync(filePath, 'utf-8')
      const entries = mapSnapshotEntries(fileContent)

      // Cache the data for future requests
      this.season4DataCache.set(queue_id, entries)

      return entries
    } catch (error) {
      console.error('Error loading Season 4 data:', error)
      return []
    }
  }

  // Get Season 4 leaderboard data
  async getSeason4Leaderboard(queue_id: string): Promise<LeaderboardEntry[]> {
    const entries = this.loadSeason4Data(queue_id)

    // Sort entries by MMR in descending order
    const sortedEntries = [...entries].sort((a, b) => b.mmr - a.mmr)

    // Recalculate ranks based on sorted order
    return sortedEntries.map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }))
  }

  // Get Season 4 user rank data
  async getSeason4UserRank(
    queue_id: string,
    user_id: string
  ): Promise<LeaderboardEntry | null> {
    const sortedLeaderboard = await this.getSeason4Leaderboard(queue_id)
    const userEntry = sortedLeaderboard.find((entry) => entry.id === user_id)
    return userEntry || null
  }

  // Load Season 5 data from the bot using ?season=5
  private async loadSeason5Data(queue_id: string): Promise<LeaderboardEntry[]> {
    if (this.season5DataCache.has(queue_id)) {
      return this.season5DataCache.get(queue_id) as LeaderboardEntry[]
    }

    try {
      const entries = await botlatro_service.get_leaderboard(queue_id, 5)
      this.season5DataCache.set(queue_id, entries)
      return entries
    } catch (error) {
      console.error('Error loading Season 5 data from bot:', error)
      return []
    }
  }

  // Get Season 5 leaderboard data
  async getSeason5Leaderboard(queue_id: string): Promise<LeaderboardEntry[]> {
    const entries = await this.loadSeason5Data(queue_id)

    const sortedEntries = [...entries].sort((a, b) => b.mmr - a.mmr)
    return sortedEntries.map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }))
  }

  // Get Season 5 user rank data
  async getSeason5UserRank(
    queue_id: string,
    user_id: string
  ): Promise<LeaderboardEntry | null> {
    const sortedLeaderboard = await this.getSeason5Leaderboard(queue_id)
    const userEntry = sortedLeaderboard.find((entry) => entry.id === user_id)
    return userEntry || null
  }

  // Load Season 6 data from the bot using ?season=6
  private async loadSeason6Data(queue_id: string): Promise<LeaderboardEntry[]> {
    const cacheKey = this.getSeasonKey(queue_id, 6)
    const cached = await redis.get(cacheKey)
    if (cached) {
      return JSON.parse(cached) as LeaderboardEntry[]
    }

    try {
      const entries = await botlatro_service.get_leaderboard(queue_id, 6)
      await redis.setEx(
        cacheKey,
        LeaderboardService.LIVE_SEASON_CACHE_TTL_SECONDS,
        JSON.stringify(entries)
      )
      return entries
    } catch (error) {
      console.error('Error loading Season 6 data from bot:', error)
      return []
    }
  }

  // Get Season 6 leaderboard data
  async getSeason6Leaderboard(queue_id: string): Promise<LeaderboardEntry[]> {
    const entries = await this.loadSeason6Data(queue_id)

    const sortedEntries = [...entries].sort((a, b) => b.mmr - a.mmr)
    return sortedEntries.map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }))
  }

  // Get Season 6 user rank data
  async getSeason6UserRank(
    queue_id: string,
    user_id: string
  ): Promise<LeaderboardEntry | null> {
    const sortedLeaderboard = await this.getSeason6Leaderboard(queue_id)
    const userEntry = sortedLeaderboard.find((entry) => entry.id === user_id)
    return userEntry || null
  }

  private getRawKey(queue_id: string) {
    return `raw:leaderboard:${queue_id}`
  }

  private getUserKey(user_id: string, queue_id: string) {
    return `user:${user_id}:${queue_id}`
  }

  private getBackupKey(queue_id: string) {
    return `backup_leaderboard_${queue_id}`
  }

  private getSeasonKey(queue_id: string, season: number) {
    return `season:${season}:leaderboard:${queue_id}`
  }

  private getSnapshotKey(queue_id: string, timestamp: string): string {
    return `snapshot_leaderboard_${queue_id}_${timestamp}`
  }

  private getSnapshotPrefix(queue_id: string): string {
    return `snapshot_leaderboard_${queue_id}_`
  }

  private applyFiltersAndPagination(
    data: LeaderboardEntry[],
    options: PaginationOptions
  ): LeaderboardResponse {
    let filtered = data

    // Apply filtering
    if (options.search) {
      const searchLower = options.search.toLowerCase()
      filtered = filtered.filter(
        (entry) =>
          entry.name.toLowerCase().includes(searchLower) ||
          entry.id.toLowerCase().includes(searchLower)
      )
    }
    if (options.minGames !== undefined) {
      const minGames = options.minGames
      filtered = filtered.filter((entry) => entry.totalgames >= minGames)
    }
    if (options.maxGames !== undefined) {
      const maxGames = options.maxGames
      filtered = filtered.filter((entry) => entry.totalgames <= maxGames)
    }

    // Apply sorting
    if (options.sortBy) {
      const sortBy = options.sortBy
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortBy]
        const bVal = b[sortBy]
        const order = options.sortOrder === 'asc' ? 1 : -1
        return aVal < bVal ? -order : aVal > bVal ? order : 0
      })
    }

    // Apply pagination if page or pageSize is provided
    const total = filtered.length

    if (options.page !== undefined || options.pageSize !== undefined) {
      const page = options.page ?? 1 // Default to page 1 if not provided
      const pageSize = options.pageSize ?? 50 // Default to 50 if not provided
      const offset = (page - 1) * pageSize
      const paginated = filtered.slice(offset, offset + pageSize)

      return {
        data: paginated,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        isStale: false,
      }
    }

    // Return all filtered data without pagination
    return {
      data: filtered,
      total,
      isStale: false,
    }
  }

  async refreshLeaderboard(queue_id: string): Promise<LeaderboardResponse> {
    currentRunId = crypto.randomUUID()
    logMemory('refresh_start', { queue_id })

    try {
      console.log('Refreshing leaderboard for queue:', queue_id)
      const start = performance.now()
      const fresh = await botlatro_service.get_leaderboard(queue_id)
      const end = performance.now()
      console.log(
        `Fetching fresh data took ${(end - start).toFixed(2)}ms for queue ${queue_id}`
      )

      logMemory('after_api_fetch', { entries_count: fresh.length })

      const start2 = performance.now()
      console.log('Updating Redis cache for leaderboard:', queue_id)
      const zsetKey = this.getZSetKey(queue_id)
      const rawKey = this.getRawKey(queue_id)
      const season6Key = this.getSeasonKey(queue_id, 6)
      const timestamp = new Date().toISOString()

      logMemory('before_initial_pipeline')
      console.log('Clearing leaderboard caches:', {
        queue_id,
        rawKey,
        zsetKey,
        season6Key,
      })

      // Initial pipeline for cache setup
      const initialPipeline = redis.multi()
      initialPipeline.setEx(
        rawKey,
        LeaderboardService.LIVE_SEASON_CACHE_TTL_SECONDS,
        JSON.stringify(fresh)
      )
      initialPipeline.del(zsetKey)
      initialPipeline.del(season6Key)
      await initialPipeline.exec()

      logMemory('after_initial_pipeline')

      // Batch process entries to prevent memory issues with large datasets
      const BATCH_SIZE = 1000
      for (let i = 0; i < fresh.length; i += BATCH_SIZE) {
        const batch = fresh.slice(i, i + BATCH_SIZE)
        const batchPipeline = redis.multi()

        for (const entry of batch) {
          batchPipeline.zAdd(zsetKey, { score: entry.mmr, value: entry.id })
          batchPipeline.hSet(
            this.getUserKey(entry.id, queue_id),
            toRedisLeaderboardEntry(entry, queue_id)
          )
        }

        await batchPipeline.exec()

        logMemory(`after_redis_batch_${Math.floor(i / BATCH_SIZE)}`, {
          batch_index: Math.floor(i / BATCH_SIZE),
          batch_size: batch.length,
        })
      }

      // Set expiration after all batches complete
      await redis.expire(
        zsetKey,
        LeaderboardService.LIVE_SEASON_CACHE_TTL_SECONDS
      )

      logMemory('after_expire')
      if (global.gc) {
        console.log('[debug] forcing gc...')
        const before = process.memoryUsage().heapUsed / 1024 / 1024
        global.gc()
        const after = process.memoryUsage().heapUsed / 1024 / 1024
        console.log(
          `[debug] heapUsed before gc: ${before.toFixed(2)} MB, after: ${after.toFixed(2)} MB`
        )
      } else {
        console.warn('[debug] gc not exposed, run node with --expose-gc')
      }
      const end2 = performance.now()
      console.log('Redis cache update took:', (end2 - start2).toFixed(2))
      console.log('Leaderboard refresh complete:', {
        queue_id,
        entries: fresh.length,
        durationMs: Number((end2 - start2).toFixed(2)),
      })

      logMemory('refresh_end')
      currentRunId = null

      // Hint to GC if available
      if (global.gc) {
        global.gc()
      }

      return { data: fresh, isStale: false }
    } catch (error) {
      console.error('Error refreshing leaderboard:', error)
      logMemory('refresh_error', { error: String(error) })
      currentRunId = null

      // If botlatro fails, try to get the latest backup from the database
      const backupKey = this.getBackupKey(queue_id)
      const backup = await db
        .select()
        .from(metadata)
        .where(eq(metadata.key, backupKey))
        .limit(1)
        .then((res) => res[0])

      if (backup) {
        const parsedBackup = JSON.parse(backup.value)
        console.log(
          `Using backup leaderboard data from ${parsedBackup.timestamp} in refreshLeaderboard`
        )
        return { data: parsedBackup.data as LeaderboardEntry[], isStale: true }
      }

      // If no backup exists, return an empty array with isStale flag
      console.log(
        'No backup leaderboard data available for refreshLeaderboard, returning empty array'
      )
      return { data: [], isStale: true }
    }
  }

  async getLeaderboard(
    queue_id: string,
    options?: PaginationOptions
  ): Promise<LeaderboardResponse> {
    try {
      // Try to get from Redis cache first
      const cached = await redis.get(this.getRawKey(queue_id))
      let data: LeaderboardEntry[]
      let isStale = false

      if (cached) {
        data = JSON.parse(cached) as LeaderboardEntry[]
      } else {
        // If not in cache, try to refresh from botlatro
        const result = await this.refreshLeaderboard(queue_id)
        data = result.data
        isStale = result.isStale
      }

      // If no pagination options, return all data (backward compatibility)
      if (!options) {
        return { data, isStale }
      }

      const result = this.applyFiltersAndPagination(data, options)
      return { ...result, isStale }
    } catch (error) {
      console.error('Error getting leaderboard from botlatro:', error)

      // If botlatro fails, try to get the latest backup from the database
      const backupKey = this.getBackupKey(queue_id)
      const backup = await db
        .select()
        .from(metadata)
        .where(eq(metadata.key, backupKey))
        .limit(1)
        .then((res) => res[0])

      if (backup) {
        const parsedBackup = JSON.parse(backup.value)
        console.log(
          `Using backup leaderboard data from ${parsedBackup.timestamp}`
        )
        const data = parsedBackup.data as LeaderboardEntry[]

        // Apply same filtering/pagination logic for backup data
        if (!options) {
          return { data, isStale: true }
        }

        const result = this.applyFiltersAndPagination(data, options)
        return { ...result, isStale: true }
      }

      // If no backup exists, return an empty array with isStale flag
      console.log(
        'No backup leaderboard data available for getLeaderboard, returning empty array'
      )
      return {
        data: [],
        isStale: true,
        total: 0,
        page: options?.page ?? 1,
        pageSize: options?.pageSize ?? 50,
        totalPages: 0,
      }
    }
  }

  /**
   * Get historical leaderboard snapshots for a channel
   * @param queue_id The channel ID
   * @param limit Optional limit on the number of snapshots to return (default: 100)
   * @returns Array of leaderboard snapshots
   */
  async getLeaderboardSnapshots(
    queue_id: string,
    limit = 100
  ): Promise<LeaderboardSnapshotResponse[]> {
    try {
      // Query the dedicated leaderboardSnapshots table
      const snapshots = await db
        .select()
        .from(leaderboardSnapshots)
        .where(eq(leaderboardSnapshots.channelId, queue_id))
        .orderBy(desc(leaderboardSnapshots.timestamp)) // Most recent first
        .limit(limit)

      // Map the snapshots to the expected response format
      return snapshots.map((snapshot) => {
        return {
          data: snapshot.data as LeaderboardEntry[],
          timestamp: snapshot.timestamp.toISOString(),
          queue_id: snapshot.channelId,
        }
      })
    } catch (error) {
      console.error(
        'Error getting leaderboard snapshots from dedicated table:',
        error
      )

      try {
        // Fallback to the old metadata table approach if the new table query fails
        const prefix = this.getSnapshotPrefix(queue_id)

        // Query the database for all entries with keys that start with the snapshot prefix
        const oldSnapshots = await db
          .select()
          .from(metadata)
          .where(sql`${metadata.key} LIKE ${`${prefix}%`}`)
          .orderBy(sql`${metadata.key} DESC`) // Most recent first
          .limit(limit)

        // Parse the snapshots
        return oldSnapshots.map((snapshot) => {
          const parsedValue = JSON.parse(
            snapshot.value
          ) as StoredLeaderboardSnapshot
          return {
            data: parsedValue.data as LeaderboardEntry[],
            timestamp: parsedValue.timestamp,
            queue_id: parsedValue.queue_id,
          }
        })
      } catch (fallbackError) {
        console.error(
          'Error getting leaderboard snapshots from metadata fallback:',
          fallbackError
        )
        return []
      }
    }
  }

  async getUserRank(
    queue_id: string,
    user_id: string
  ): Promise<UserRankResponse> {
    try {
      // Try to get user data from Redis first
      const userData = await redis.hGetAll(this.getUserKey(user_id, queue_id))
      if (userData && Object.keys(userData).length > 0) {
        return {
          data: {
            ...userData,
            mmr: Number(userData.mmr),
            streak: userData.streak,
          } as unknown as LeaderboardEntry,
          isStale: false,
        }
      }

      // If not found in Redis, try to refresh the leaderboard
      try {
        const { data: freshLeaderboard } =
          await this.refreshLeaderboard(queue_id)
        const userEntry = freshLeaderboard.find((entry) => entry.id === user_id)
        if (userEntry) {
          return { data: userEntry, isStale: false }
        }
      } catch (refreshError) {
        console.error(
          'Error refreshing leaderboard for user rank:',
          refreshError
        )
        // Continue to backup if refresh fails
      }

      // If not found in fresh data or refresh failed, try to get from backup
      const backupKey = this.getBackupKey(queue_id)
      const backup = await db
        .select()
        .from(metadata)
        .where(eq(metadata.key, backupKey))
        .limit(1)
        .then((res) => res[0])

      if (backup) {
        const parsedBackup = JSON.parse(
          backup.value
        ) as StoredLeaderboardSnapshot
        const userEntry = parsedBackup.data.find(
          (entry) => entry.id === user_id
        )
        if (userEntry) {
          console.log(
            `Using backup leaderboard data for user ${user_id} from ${parsedBackup.timestamp}`
          )
          return { data: userEntry as LeaderboardEntry, isStale: true }
        }
      }

      // If user not found anywhere
      return null
    } catch (error) {
      console.error('Error getting user rank:', error)
      // Return null instead of rethrowing the error to prevent the page from breaking
      return null
    }
  }
}

export const leaderboardService = new LeaderboardService()
