import { auth } from '@/server/auth'
import { HydrateClient, api } from '@/trpc/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { RolesClient } from './roles-client'

export default async function RolesManagerPage() {
  const session = await auth()
  const isOwner = session?.user?.role === 'owner'

  if (!isOwner) {
    redirect('/')
  }

  await api.users.listUsers.prefetch({
    page: 1,
    pageSize: 50,
    sortBy: 'name',
    sortOrder: 'asc',
  })

  return (
    <Suspense>
      <HydrateClient>
        <div
          className={
            'mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col gap-4 pt-8'
          }
        >
          <h1 className='font-bold text-3xl'>Manage Roles</h1>
          <RolesClient />
        </div>
      </HydrateClient>
    </Suspense>
  )
}
