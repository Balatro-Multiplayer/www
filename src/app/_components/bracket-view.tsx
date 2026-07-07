'use client'

import { Crown } from 'lucide-react'
import Link from 'next/link'
import {
  type BracketResult,
  type BracketSize,
  type ComputedMatch,
  championOf,
  computeBracket,
} from '@/lib/bracket'
import { cn } from '@/lib/utils'
import { BracketSheet, PUBLIC_SHEET } from './bracket-sheet'
import styles from './bracket-view.module.css'

export type BracketViewData = {
  size: BracketSize
  hasThirdPlace: boolean
  bestOf: number
  finalsBestOf: number | null
  seeds: (string | null)[]
  results: BracketResult[]
}

/** Maps a seed name to a Discord id, enabling links to player profiles. */
export type PlayerLinks = Record<string, string>

function PlayerName({
  name,
  isWinner,
  playerLinks,
}: {
  name: string | null
  isWinner: boolean
  playerLinks: PlayerLinks
}) {
  const className = cn(
    'truncate font-m6x11 text-lg text-white leading-6',
    !name && 'text-[#8b93a7]',
    isWinner && styles.winnerName
  )
  const playerId = name ? playerLinks[name] : undefined

  if (name && playerId) {
    return (
      <Link
        href={`/players/${playerId}`}
        className={cn(className, 'underline-offset-4 hover:underline')}
        title={name}
      >
        {name}
      </Link>
    )
  }

  return (
    <span className={className} title={name ?? undefined}>
      {name ?? 'TBD'}
    </span>
  )
}

function PlayerRow({
  name,
  score,
  isWinner,
  isLoser,
  mirrored,
  playerLinks,
}: {
  name: string | null
  score: number | null
  isWinner: boolean
  isLoser: boolean
  mirrored: boolean
  playerLinks: PlayerLinks
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-2.5 py-1.5',
        styles.playerBox,
        mirrored && 'flex-row-reverse',
        isLoser && 'opacity-50'
      )}
    >
      <PlayerName name={name} isWinner={isWinner} playerLinks={playerLinks} />
      <span
        className={cn(
          'shrink-0 rounded-md px-2 pt-0.5 text-center font-m6x11 text-base leading-5',
          score === null ? styles.chipEmpty : styles.chip
        )}
      >
        {score ?? '-'}
      </span>
    </div>
  )
}

function MatchCard({
  match,
  playerLinks,
  mirrored = false,
}: {
  match: ComputedMatch
  playerLinks: PlayerLinks
  mirrored?: boolean
}) {
  return (
    <div className={cn('w-full', styles.card)}>
      <PlayerRow
        name={match.player1}
        score={match.score1}
        isWinner={match.winner === 1}
        isLoser={match.winner === 2}
        mirrored={mirrored}
        playerLinks={playerLinks}
      />
      <PlayerRow
        name={match.player2}
        score={match.score2}
        isWinner={match.winner === 2}
        isLoser={match.winner === 1}
        mirrored={mirrored}
        playerLinks={playerLinks}
      />
    </div>
  )
}

/** The public playoff sheet: read-only match cards with profile links. */
export function BracketView({
  bracket,
  playerLinks = {},
}: {
  bracket: BracketViewData
  playerLinks?: PlayerLinks
}) {
  const rounds = computeBracket(
    bracket.size,
    bracket.hasThirdPlace,
    bracket.seeds,
    bracket.results,
    { bestOf: bracket.bestOf, finalsBestOf: bracket.finalsBestOf }
  )
  const champion = championOf(rounds)
  const championId = champion ? playerLinks[champion] : undefined

  const championName = champion ? (
    <span className='truncate pt-0.5 font-m6x11 text-[#f5c452] text-xl'>
      {champion}
    </span>
  ) : null

  return (
    <BracketSheet
      size={bracket.size}
      rounds={rounds}
      columnWidth={PUBLIC_SHEET.columnWidth}
      slotHeight={PUBLIC_SHEET.slotHeight}
      championWon={champion !== null}
      championContent={
        champion ? (
          <>
            <Crown className='size-5 shrink-0 text-[#f5c452]' />
            {championId ? (
              <Link
                href={`/players/${championId}`}
                className='underline-offset-4 hover:underline'
              >
                {championName}
              </Link>
            ) : (
              championName
            )}
          </>
        ) : (
          <span className='font-m6x11 text-[#8b93a7] text-lg'>TBD</span>
        )
      }
      renderMatch={(match, { mirrored }) => (
        <MatchCard
          match={match}
          playerLinks={playerLinks}
          mirrored={mirrored}
        />
      )}
    />
  )
}
