import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { hasPermission } from '@/lib/permissions'
import { auth } from '@/server/auth'
import { api, HydrateClient } from '@/trpc/server'
import { createMetadata } from '../../../../../lib/metadata'
import { ModPolicyClient } from './mod-policy-client'

export const metadata = createMetadata({
  title: 'Mod Policy',
  description:
    'Manage the ranked banned/approved mod list served to the game server.',
  path: '/admin/mod-policy',
  noIndex: true,
})

export default async function ModPolicyPage() {
  const session = await auth()

  if (!hasPermission(session?.user, 'mod_policy.manage')) {
    redirect('/')
  }

  await api.modPolicy.list.prefetch()

  return (
    <Suspense>
      <HydrateClient>
        <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col gap-4 pt-8'>
          <h1 className='font-bold text-3xl'>Mod Policy</h1>
          <p className='text-fd-muted-foreground text-sm'>
            Banned (red) and approved (green) mods — opponents&apos; mods show
            red / green / white (unknown) in the lobby. The game server polls{' '}
            <code>/api/mod-policy</code>.
          </p>
          <ModPolicyClient />
        </div>
      </HydrateClient>
    </Suspense>
  )
}
