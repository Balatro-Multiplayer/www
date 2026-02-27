import { parseAsString, parseAsStringLiteral } from 'nuqs/server'
import {
  STATS_FILTER_MODES,
  STATS_QUEUES,
  STATS_SEASONS,
  STAT_TABS,
} from './search-params.constants'

export const statsSearchParamsParsersServer = {
  tab: parseAsStringLiteral(STAT_TABS).withDefault('rating-distribution'),

  deckMode: parseAsStringLiteral(STATS_FILTER_MODES).withDefault('season'),
  deckSeason: parseAsStringLiteral(STATS_SEASONS).withDefault('season6'),
  deckStartDate: parseAsString,
  deckEndDate: parseAsString,
  deckQueueId: parseAsStringLiteral(STATS_QUEUES).withDefault('all'),

  stakeMode: parseAsStringLiteral(STATS_FILTER_MODES).withDefault('season'),
  stakeSeason: parseAsStringLiteral(STATS_SEASONS).withDefault('season6'),
  stakeStartDate: parseAsString,
  stakeEndDate: parseAsString,
  stakeQueueId: parseAsStringLiteral(STATS_QUEUES).withDefault('all'),
}
