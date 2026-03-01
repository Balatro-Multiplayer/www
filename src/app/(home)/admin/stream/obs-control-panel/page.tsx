import { Suspense } from 'react'
import { RANKED_QUEUE_ID } from '@/shared/constants'
import { api, HydrateClient } from '@/trpc/server'
import { ObsControlPanelClient } from './_components/obs-control-panel-client'

export default async function AdminStreamWidgetPage() {
  await api.leaderboard.get_leaderboard.prefetch({
    channel_id: RANKED_QUEUE_ID,
  })

  return (
    <Suspense>
      <HydrateClient>
        <ObsControlPanelClient />
      </HydrateClient>
    </Suspense>
  )
}
