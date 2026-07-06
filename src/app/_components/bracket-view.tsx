import { Crown } from 'lucide-react'
import {
  type BracketResult,
  type BracketSize,
  type ComputedMatch,
  championOf,
  computeBracket,
  roundCount,
} from '@/lib/bracket'
import { cn } from '@/lib/utils'
import styles from './bracket-view.module.css'

export type BracketViewData = {
  size: BracketSize
  hasThirdPlace: boolean
  seeds: (string | null)[]
  results: BracketResult[]
}

/** Vertical space reserved per first-round match, in px. */
const SLOT_HEIGHT = 96

function PlayerRow({
  name,
  score,
  isWinner,
  isLoser,
}: {
  name: string | null
  score: number | null
  isWinner: boolean
  isLoser: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-3 py-1.5',
        isLoser && 'opacity-45'
      )}
    >
      <span
        className={cn(
          'truncate font-m6x11 text-[#f4eee0] text-lg leading-6',
          !name && 'text-[#8b93a7]',
          isWinner && styles.winnerName
        )}
      >
        {name ?? 'TBD'}
      </span>
      <span
        className={cn(
          'shrink-0 rounded-md px-2 pt-0.5 text-center font-m6x11 text-base leading-5',
          score === null
            ? styles.chipEmpty
            : isWinner
              ? styles.chipWin
              : styles.chip
        )}
      >
        {score ?? '-'}
      </span>
    </div>
  )
}

function MatchCard({
  match,
  className,
}: {
  match: ComputedMatch
  className?: string
}) {
  return (
    <div
      className={cn('w-full divide-y divide-[#2a2d38]', styles.card, className)}
    >
      <PlayerRow
        name={match.player1}
        score={match.score1}
        isWinner={match.winner === 1}
        isLoser={match.winner === 2}
      />
      <PlayerRow
        name={match.player2}
        score={match.score2}
        isWinner={match.winner === 2}
        isLoser={match.winner === 1}
      />
    </div>
  )
}

/**
 * Balatro-styled single-elimination bracket: felt board, one column per
 * round joined by elbow connectors, third-place match set below the board.
 * Scrolls horizontally on narrow screens.
 */
export function BracketView({ bracket }: { bracket: BracketViewData }) {
  const rounds = computeBracket(
    bracket.size,
    bracket.hasThirdPlace,
    bracket.seeds,
    bracket.results
  )
  const totalRounds = roundCount(bracket.size)
  const champion = championOf(rounds)
  const thirdPlace = rounds[rounds.length - 1]?.matches.find(
    (m) => m.isThirdPlace
  )
  const columnHeight = (bracket.size / 2) * SLOT_HEIGHT

  return (
    <div className={cn('overflow-x-auto p-4 sm:p-6', styles.panel)}>
      <div className='flex min-w-max flex-col items-center gap-5'>
        {champion ? (
          <div
            className={cn(
              'flex items-center gap-2.5 px-5 py-2.5',
              styles.championCard
            )}
          >
            <Crown className='size-5 text-[#f5c452]' />
            <span className='pt-0.5 font-m6x11 text-[#f5c452] text-xl'>
              Champion: {champion}
            </span>
          </div>
        ) : null}

        <div className='flex gap-10'>
          {rounds.map((round) => (
            <div key={round.round} className='flex w-48 flex-col'>
              <p className='mb-2 text-center font-m6x11 text-[#f4eee0]/80 text-lg'>
                {round.round === totalRounds ? 'Grand Finals' : round.label}
              </p>
              <div className='flex flex-col' style={{ height: columnHeight }}>
                {round.matches
                  .filter((match) => !match.isThirdPlace)
                  .map((match, index) => (
                    <div
                      key={`${match.round}:${match.slot}`}
                      className={cn(
                        styles.slot,
                        round.round < totalRounds &&
                          (index % 2 === 0 ? styles.outTop : styles.outBottom),
                        round.round > 1 && styles.in
                      )}
                    >
                      <MatchCard match={match} />
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {thirdPlace ? (
          <div className='flex w-48 flex-col'>
            <p className='mb-2 text-center font-m6x11 text-[#fe5f55] text-lg'>
              Third Place Match
            </p>
            <MatchCard match={thirdPlace} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
