'use client'

import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { api } from '@/trpc/react'

export type PickedPlayer = {
  discordId: string
  name: string
}

/**
 * Search over the ranked leaderboard (already cached by the site) for
 * filling bracket seeds with linked players instead of hand-typed names.
 */
export function PlayerSearch({
  onPick,
}: {
  onPick: (player: PickedPlayer) => void
}) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  const search = api.brackets.searchPlayers.useQuery(
    { q: debouncedQuery },
    { enabled: debouncedQuery.length >= 2, staleTime: 60_000, retry: false }
  )

  return (
    <div className='flex flex-col gap-1.5'>
      <div className='relative'>
        <Search className='absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search ranked players…'
          className='pl-8'
          aria-label='Search ranked players'
        />
      </div>
      {debouncedQuery.length >= 2 ? (
        <div className='flex flex-col overflow-hidden rounded-md border'>
          {search.isLoading ? (
            <p className='px-3 py-2 text-muted-foreground text-sm'>
              Searching…
            </p>
          ) : search.isError ? (
            <p className='px-3 py-2 text-muted-foreground text-sm'>
              Search unavailable right now — you can still type names manually.
            </p>
          ) : search.data?.length ? (
            search.data.map((player) => (
              <button
                key={player.discordId}
                type='button'
                className='flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent'
                onClick={() => {
                  onPick({ discordId: player.discordId, name: player.name })
                  setQuery('')
                }}
              >
                <span className='w-10 shrink-0 text-muted-foreground text-xs'>
                  #{player.rank}
                </span>
                <span className='truncate font-medium'>{player.name}</span>
                <span className='truncate text-muted-foreground text-xs'>
                  {player.mmr} MMR
                </span>
              </button>
            ))
          ) : (
            <p className='px-3 py-2 text-muted-foreground text-sm'>
              No ranked players found.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
