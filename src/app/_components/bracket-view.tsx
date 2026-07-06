import { Crown } from 'lucide-react'
import Link from 'next/link'
import {
  type BracketResult,
  type BracketSize,
  type ComputedMatch,
  championOf,
  computeBracket,
  roundCount,
  roundLabel,
} from '@/lib/bracket'
import { cn } from '@/lib/utils'
import styles from './bracket-view.module.css'

export type BracketViewData = {
  size: BracketSize
  hasThirdPlace: boolean
  seeds: (string | null)[]
  results: BracketResult[]
}

/** Maps a seed name to a Discord id, enabling links to player profiles. */
export type PlayerLinks = Record<string, string>

/** Vertical space reserved per first-round match in a wing, in px. */
const SLOT_HEIGHT = 96

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
  className,
}: {
  match: ComputedMatch
  playerLinks: PlayerLinks
  mirrored?: boolean
  className?: string
}) {
  return (
    <div className={cn('w-full', styles.card, className)}>
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

function ColumnHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className='mb-2 text-center font-m6x11 text-[#f4eee0]/85 text-lg'>
      {children}
    </p>
  )
}

function Wing({
  columns,
  totalRounds,
  columnHeight,
  mirrored,
  playerLinks,
}: {
  columns: ComputedMatch[][]
  totalRounds: number
  columnHeight: number
  mirrored: boolean
  playerLinks: PlayerLinks
}) {
  const lastColumn = columns.length - 1
  return (
    <div className={cn('flex gap-10', mirrored && 'flex-row-reverse')}>
      {columns.map((matches, columnIndex) => {
        const round = columnIndex + 1
        return (
          <div key={round} className='flex w-40 flex-col'>
            <ColumnHeader>{roundLabel(round, totalRounds)}</ColumnHeader>
            <div className='flex flex-col' style={{ height: columnHeight }}>
              {matches.map((match, index) => (
                <div
                  key={`${match.round}:${match.slot}`}
                  className={cn(
                    styles.slot,
                    columnIndex < lastColumn &&
                      (index % 2 === 0
                        ? mirrored
                          ? styles.outTopMirror
                          : styles.outTop
                        : mirrored
                          ? styles.outBottomMirror
                          : styles.outBottom),
                    columnIndex > 0 && (mirrored ? styles.inMirror : styles.in)
                  )}
                >
                  <MatchCard
                    match={match}
                    mirrored={mirrored}
                    playerLinks={playerLinks}
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Balatro-styled single-elimination bracket laid out like a playoff sheet:
 * two mirrored wings converging on a center column with the champion,
 * grand finals, and third-place match. Scrolls horizontally when narrow.
 */
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
    bracket.results
  )
  const totalRounds = roundCount(bracket.size)
  const champion = championOf(rounds)
  const championId = champion ? playerLinks[champion] : undefined
  const mainRounds = rounds.map((round) =>
    round.matches.filter((match) => !match.isThirdPlace)
  )
  const grandFinal = mainRounds[totalRounds - 1]?.[0]
  const thirdPlace = rounds[totalRounds - 1]?.matches.find(
    (match) => match.isThirdPlace
  )

  // Wings hold every round but the final; the first half of each round's
  // matches feeds the left wing, the second half the right wing.
  const wingRounds = mainRounds.slice(0, totalRounds - 1)
  const leftColumns = wingRounds.map((matches) =>
    matches.slice(0, matches.length / 2)
  )
  const rightColumns = wingRounds.map((matches) =>
    matches.slice(matches.length / 2)
  )
  const columnHeight = Math.max(1, bracket.size / 4) * SLOT_HEIGHT

  const championName = champion ? (
    <span className='truncate pt-0.5 font-m6x11 text-[#f5c452] text-xl'>
      {champion}
    </span>
  ) : null

  return (
    <div className={cn('overflow-x-auto p-4 sm:p-6', styles.panel)}>
      <div className='mx-auto flex w-fit min-w-max items-start gap-10'>
        <Wing
          columns={leftColumns}
          totalRounds={totalRounds}
          columnHeight={columnHeight}
          mirrored={false}
          playerLinks={playerLinks}
        />

        <div
          className='flex w-52 flex-col justify-center gap-8'
          style={{ minHeight: columnHeight + 32 }}
        >
          <div className='flex flex-col'>
            <ColumnHeader>Champion</ColumnHeader>
            <div
              className={cn(
                'flex min-h-12 items-center justify-center gap-2 px-3 py-2',
                styles.championCard,
                champion && styles.championCardWon
              )}
            >
              {champion ? (
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
              )}
            </div>
          </div>

          {grandFinal ? (
            <div className='flex flex-col'>
              <ColumnHeader>Grand Finals</ColumnHeader>
              <MatchCard match={grandFinal} playerLinks={playerLinks} />
            </div>
          ) : null}

          {thirdPlace ? (
            <div className='flex flex-col'>
              <p className='mb-2 text-center font-m6x11 text-[#bd4a3f] text-lg'>
                Third Place Match
              </p>
              <MatchCard match={thirdPlace} playerLinks={playerLinks} />
            </div>
          ) : null}
        </div>

        <Wing
          columns={rightColumns}
          totalRounds={totalRounds}
          columnHeight={columnHeight}
          mirrored={true}
          playerLinks={playerLinks}
        />
      </div>
    </div>
  )
}
