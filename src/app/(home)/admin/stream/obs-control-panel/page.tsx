import { Suspense } from 'react'
import { RANKED_QUEUE_ID } from '@/shared/constants'
import { api, HydrateClient } from '@/trpc/server'
import { createMetadata } from '../../../../../../lib/metadata'
import { ObsControlPanelClient } from './_components/obs-control-panel-client'

export const metadata = createMetadata({
  title: 'OBS Control Panel',
  description: 'Internal controls for Balatro Multiplayer stream overlays.',
  path: '/admin/stream/obs-control-panel',
  noIndex: true,
})

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
