import { notFound, redirect } from 'next/navigation'
import { isBracketSize } from '@/lib/bracket'
import { hasPermission } from '@/lib/permissions'
import { auth } from '@/server/auth'
import { api } from '@/trpc/server'
import { createMetadata } from '../../../../../../lib/metadata'
import { BracketDetailClient } from './bracket-detail-client'

export const metadata = createMetadata({
  title: 'Edit Bracket',
  description: 'Enter playoff results and publish the bracket.',
  path: '/admin/brackets',
  noIndex: true,
})

export default async function AdminBracketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()

  if (!hasPermission(session?.user, 'brackets.manage')) {
    redirect('/')
  }

  const { id } = await params
  const numericId = Number.parseInt(id, 10)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    notFound()
  }

  const [bracket, seasons] = await Promise.all([
    api.brackets.getForAdmin({ id: numericId }).catch(() => null),
    api.seasons.list(),
  ])
  if (!bracket || !isBracketSize(bracket.size)) {
    notFound()
  }

  return (
    <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col gap-6 pt-8 pb-16'>
      <BracketDetailClient
        bracket={{
          id: bracket.id,
          name: bracket.name,
          seasonId: bracket.seasonId,
          size: bracket.size,
          hasThirdPlace: bracket.hasThirdPlace,
          bestOf: bracket.bestOf,
          finalsBestOf: bracket.finalsBestOf,
          isPublished: bracket.isPublished,
          roster: bracket.roster,
          results: bracket.results,
        }}
        seasons={seasons.map((season) => ({
          id: season.id,
          name: season.name,
          isActive: season.isActive,
        }))}
      />
    </div>
  )
}
