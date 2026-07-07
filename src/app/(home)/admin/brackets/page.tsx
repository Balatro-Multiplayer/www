import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/permissions'
import { auth } from '@/server/auth'
import { api } from '@/trpc/server'
import { createMetadata } from '../../../../../lib/metadata'
import { BracketsClient } from './brackets-client'

export const metadata = createMetadata({
  title: 'Manage Brackets',
  description: 'Create playoff brackets, enter results, and publish.',
  path: '/admin/brackets',
  noIndex: true,
})

export default async function AdminBracketsPage() {
  const session = await auth()

  if (!hasPermission(session?.user, 'brackets.manage')) {
    redirect('/')
  }

  const [brackets, seasons] = await Promise.all([
    api.brackets.adminList(),
    api.seasons.list(),
  ])

  return (
    <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col gap-6 pt-8'>
      <div className='flex flex-col gap-2'>
        <h1 className='font-bold text-3xl'>Manage Brackets</h1>
        <p className='text-muted-foreground text-sm'>
          Create playoff brackets, enter match results, and publish them to the
          Playoffs tab.
        </p>
      </div>

      <BracketsClient
        brackets={brackets.map((bracket) => ({
          id: bracket.id,
          name: bracket.name,
          seasonId: bracket.seasonId,
          size: bracket.size,
          isPublished: bracket.isPublished,
          seedCount: bracket.seedCount,
          createdAt: bracket.createdAt.toISOString(),
        }))}
        seasons={seasons.map((season) => ({
          id: season.id,
          name: season.name,
          isActive: season.isActive,
        }))}
      />
    </div>
  )
}
