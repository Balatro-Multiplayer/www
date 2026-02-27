import { parseAsString, parseAsStringLiteral } from 'nuqs'
import {
  STATS_FILTER_MODES,
  STATS_QUEUES,
  STATS_SEASONS,
  STAT_TABS,
} from './search-params.constants'

export { STAT_TABS, STATS_FILTER_MODES, STATS_QUEUES, STATS_SEASONS }

export const statsSearchParamsParsers = {
  tab: parseAsStringLiteral(STAT_TABS).withDefault('rating-distribution'),

  deckMode: parseAsStringLiteral(STATS_FILTER_MODES).withDefault('season'),
  deckSeason: parseAsStringLiteral(STATS_SEASONS).withDefault('season5'),
  deckStartDate: parseAsString,
  deckEndDate: parseAsString,
  deckQueueId: parseAsStringLiteral(STATS_QUEUES).withDefault('all'),

  stakeMode: parseAsStringLiteral(STATS_FILTER_MODES).withDefault('season'),
  stakeSeason: parseAsStringLiteral(STATS_SEASONS).withDefault('season5'),
  stakeStartDate: parseAsString,
  stakeEndDate: parseAsString,
  stakeQueueId: parseAsStringLiteral(STATS_QUEUES).withDefault('all'),
}
