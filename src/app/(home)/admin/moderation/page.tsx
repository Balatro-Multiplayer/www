import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { auth } from '@/server/auth'
import { api, HydrateClient } from '@/trpc/server'
import { createMetadata } from '../../../../../lib/metadata'
import { ModerationClient } from './moderation-client'

export const metadata = createMetadata({
  title: 'Moderation',
  description: 'Search and manage strikes and bans from the web admin panel.',
  path: '/admin/moderation',
  noIndex: true,
})

export default async function ModerationPage() {
  const session = await auth()
  const role = session?.user?.role ?? 'user'
  const isHelper = ['helper', 'admin', 'owner'].includes(role)

  if (!isHelper) {
    redirect('/')
  }

  await Promise.all([
    api.moderation.listPlayersWithStrikes.prefetch({
      page: 1,
      limit: 12,
      sort: 'recent',
      includeBans: false,
    }),
    api.moderation.listActiveBans.prefetch({
      page: 1,
      limit: 12,
    }),
  ])

  return (
    <Suspense>
      <HydrateClient>
        <ModerationClient role={role as 'helper' | 'admin' | 'owner'} />
      </HydrateClient>
    </Suspense>
  )
}
