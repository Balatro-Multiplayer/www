import { beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock the heavy dependencies (ranked service + season resolver, which pull in
// redis/env/botlatro) BEFORE importing the module under test.
const getSeasonUserRank = mock(
  async (_seasonId: number, _queueId: string, _userId: string) =>
    null as { id: string } | null
)
const getSeasonLeaderboard = mock(
  async (_seasonId: number, _queueId: string) => [] as { id: string }[]
)
const getActiveSeasonNumber = mock(async () => 7)

mock.module('@/server/seasons', () => ({ getActiveSeasonNumber }))
mock.module('@/server/services/leaderboard', () => ({
  leaderboardService: { getSeasonUserRank, getSeasonLeaderboard },
}))

const {
  hasPlayedStandardRankedThisSeason,
  getEligibleVoterDiscordIds,
  POLL_ELIGIBILITY_EXEMPT_DISCORD_IDS,
} = await import('@/server/poll-eligibility')

const EXEMPT_ID = '236316622153973760'

beforeEach(() => {
  getSeasonUserRank.mockClear()
  getSeasonLeaderboard.mockClear()
  getActiveSeasonNumber.mockClear()
  getSeasonUserRank.mockImplementation(async () => null)
  getSeasonLeaderboard.mockImplementation(async () => [])
  getActiveSeasonNumber.mockImplementation(async () => 7)
})

describe('hasPlayedStandardRankedThisSeason', () => {
  test('true when the player is present on the ranked leaderboard', async () => {
    getSeasonUserRank.mockImplementation(async () => ({ id: 'player-1' }))
    expect(await hasPlayedStandardRankedThisSeason('player-1')).toBe(true)
    expect(getSeasonUserRank).toHaveBeenCalledWith(7, '1', 'player-1')
  })

  test('false when the player is absent from the leaderboard', async () => {
    getSeasonUserRank.mockImplementation(async () => null)
    expect(await hasPlayedStandardRankedThisSeason('nobody')).toBe(false)
  })

  test('exempt id is eligible without hitting the service', async () => {
    expect(POLL_ELIGIBILITY_EXEMPT_DISCORD_IDS.has(EXEMPT_ID)).toBe(true)
    expect(await hasPlayedStandardRankedThisSeason(EXEMPT_ID)).toBe(true)
    expect(getSeasonUserRank).not.toHaveBeenCalled()
    expect(getActiveSeasonNumber).not.toHaveBeenCalled()
  })

  test('null/empty discord id is ineligible and does not hit the service', async () => {
    expect(await hasPlayedStandardRankedThisSeason(null)).toBe(false)
    expect(await hasPlayedStandardRankedThisSeason(undefined)).toBe(false)
    expect(await hasPlayedStandardRankedThisSeason('')).toBe(false)
    expect(getSeasonUserRank).not.toHaveBeenCalled()
  })

  test('propagates service errors so callers can fail-closed', async () => {
    getSeasonUserRank.mockImplementation(async () => {
      throw new Error('botlatro down')
    })
    expect(hasPlayedStandardRankedThisSeason('player-1')).rejects.toThrow(
      'botlatro down'
    )
  })
})

describe('getEligibleVoterDiscordIds', () => {
  test('unions leaderboard players with the exemption list', async () => {
    getSeasonLeaderboard.mockImplementation(async () => [
      { id: 'a' },
      { id: 'b' },
    ])
    const ids = await getEligibleVoterDiscordIds()
    expect(ids.has('a')).toBe(true)
    expect(ids.has('b')).toBe(true)
    expect(ids.has(EXEMPT_ID)).toBe(true)
    expect(ids.has('c')).toBe(false)
    expect(getSeasonLeaderboard).toHaveBeenCalledWith(7, '1')
  })

  test('propagates service errors', async () => {
    getSeasonLeaderboard.mockImplementation(async () => {
      throw new Error('leaderboard unavailable')
    })
    expect(getEligibleVoterDiscordIds()).rejects.toThrow(
      'leaderboard unavailable'
    )
  })
})
