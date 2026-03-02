'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/trpc/react'

export function LiveMatchesTab() {
  const [liveCount, setLiveCount] = useState<number | null>(null)
  const { data: initialCount } = api.playerState.getActiveMatchCount.useQuery()

  api.playerState.onActiveMatchCountChange.useSubscription(undefined, {
    onData: (event) => setLiveCount(event.data),
  })

  const count = liveCount ?? initialCount ?? 0

  return (
    <div className='flex flex-col gap-4'>
      <Card className='w-full max-w-sm'>
        <CardHeader className='pb-2'>
          <CardTitle className='flex items-center gap-2 font-medium text-sm'>
            <span className='relative flex h-2 w-2'>
              <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' />
              <span className='relative inline-flex h-2 w-2 rounded-full bg-emerald-500' />
            </span>
            Live
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className='font-bold text-4xl'>{count}</p>
          <p className='text-muted-foreground text-sm'>
            active {count === 1 ? 'match' : 'matches'} right now
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
