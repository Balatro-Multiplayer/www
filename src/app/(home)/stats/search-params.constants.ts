import {
  CASUAL_QUEUE_ID,
  RANKED_QUEUE_ID,
  SMALLWORLD_QUEUE_ID,
  VANILLA_QUEUE_ID,
} from '@/shared/constants'

export const STAT_TABS = [
  'rating-distribution',
  'deck-popularity',
  'stake-popularity',
  'season-overview',
  'game-activity',
] as const

export const STATS_FILTER_MODES = ['season', 'dateRange'] as const

export const STATS_SEASONS = [
  'season1',
  'season2',
  'season3',
  'season4',
  'season5',
] as const

export const STATS_QUEUES = [
  'all',
  RANKED_QUEUE_ID,
  VANILLA_QUEUE_ID,
  SMALLWORLD_QUEUE_ID,
  CASUAL_QUEUE_ID,
] as const
