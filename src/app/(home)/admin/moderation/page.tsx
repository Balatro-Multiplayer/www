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
        <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col gap-6 py-8'>
          <div className='space-y-2'>
            <p className='font-medium text-muted-foreground text-sm uppercase tracking-[0.2em]'>
              Admin
            </p>
            <div className='space-y-1'>
              <h1 className='font-bold text-3xl tracking-tight'>Moderation</h1>
              <p className='max-w-2xl text-muted-foreground'>
                Review strikes fast, search recent incidents, and handle bans
                without leaving the site.
              </p>
            </div>
          </div>

          <ModerationClient role={role as 'helper' | 'admin' | 'owner'} />
        </div>
      </HydrateClient>
    </Suspense>
  )
}
