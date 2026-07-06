import { Crown } from 'lucide-react'
import {
  type BracketResult,
  type BracketSize,
  type ComputedMatch,
  championOf,
  computeBracket,
  matchLabel,
  roundCount,
} from '@/lib/bracket'
import { cn } from '@/lib/utils'

export type BracketViewData = {
  size: BracketSize
  hasThirdPlace: boolean
  seeds: (string | null)[]
  results: BracketResult[]
}

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
        'flex items-center justify-between gap-2 px-2.5 py-1.5',
        isWinner && 'bg-primary/10 font-semibold',
        isLoser && 'text-muted-foreground'
      )}
    >
      <span className={cn('truncate text-sm', !name && 'italic opacity-60')}>
        {name ?? 'TBD'}
      </span>
      <span className='shrink-0 font-mono text-sm tabular-nums'>
        {score ?? '–'}
      </span>
    </div>
  )
}

function MatchCard({
  match,
  totalRounds,
  showLabel,
}: {
  match: ComputedMatch
  totalRounds: number
  showLabel: boolean
}) {
  return (
    <div>
      {showLabel ? (
        <p className='mb-1 text-center text-muted-foreground text-xs'>
          {matchLabel(match, totalRounds)}
        </p>
      ) : null}
      <div className='divide-y overflow-hidden rounded-md border bg-card'>
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
    </div>
  )
}

/**
 * Presentational single-elimination bracket: one column per round, the final
 * column holding the grand final (and third-place match when present).
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

  return (
    <div className='flex flex-col gap-4'>
      {champion ? (
        <div className='flex items-center justify-center gap-2 rounded-lg border bg-primary/10 px-4 py-3 font-semibold'>
          <Crown className='size-5 text-yellow-500' />
          <span>Champion: {champion}</span>
        </div>
      ) : null}
      <div className='overflow-x-auto pb-2'>
        <div className='flex min-w-max items-stretch gap-6'>
          {rounds.map((round) => (
            <div key={round.round} className='flex w-48 flex-col'>
              <p className='mb-3 text-center font-semibold text-muted-foreground text-sm'>
                {round.label}
              </p>
              <div className='flex flex-1 flex-col justify-around gap-3'>
                {round.matches.map((match) => (
                  <MatchCard
                    key={`${match.round}:${match.slot}`}
                    match={match}
                    totalRounds={totalRounds}
                    showLabel={round.round === totalRounds}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
