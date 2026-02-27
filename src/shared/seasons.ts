import { z } from 'zod'

export const SEASON_2_START_DATE = new Date('2025-04-02T13:00:00.000Z')
export const SEASON_3_START_DATE = new Date('2025-06-02T13:00:00.000Z')
export const SEASON_4_START_DATE = new Date('2025-09-01T05:00:00.000Z')
export const SEASON_5_START_DATE = new Date('2025-11-30T18:08:00.000Z')
export const SEASON_6_START_DATE = new Date('2026-02-27T18:00:00.000Z')

// Season type for selection
export const SeasonSchema = z.enum(['season1', 'season2', 'season3', 'season4', 'season5', 'season6'])
export type Season = z.infer<typeof SeasonSchema>

// Helper function to determine which season a date belongs to
export function getSeasonForDate(
  date: Date
): 'season1' | 'season2' | 'season3' | 'season4' | 'season5' | 'season6' {
  if (date < SEASON_2_START_DATE) return 'season1'
  if (date < SEASON_3_START_DATE) return 'season2'
  if (date < SEASON_4_START_DATE) return 'season3'
  if (date < SEASON_5_START_DATE) return 'season4'
  if (date < SEASON_6_START_DATE) return 'season5'
  return 'season6'
}

// Helper function to filter games by season
export function filterGamesBySeason(games: any[], season: Season): any[] {
  return games.filter((game) => {
    const gameDate = new Date(game.gameTime)
    const gameSeason = getSeasonForDate(gameDate)
    return gameSeason === season
  })
}

// Helper function to get a display name for a season
export function getSeasonDisplayName(season: Season): string {
  switch (season) {
    case 'season1':
      return 'Season 1'
    case 'season2':
      return 'Season 2'
    case 'season3':
      return 'Season 3'
    case 'season4':
      return 'Season 4'
    case 'season5':
      return 'Season 5'
    case 'season6':
      return 'Season 6'
  }
}
