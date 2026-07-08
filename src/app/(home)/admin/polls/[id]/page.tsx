import { notFound, redirect } from 'next/navigation'
import { hasPermission } from '@/lib/permissions'
import { toPollMethod } from '@/lib/poll-method'
import { auth } from '@/server/auth'
import { api } from '@/trpc/server'
import { createMetadata } from '../../../../../../lib/metadata'
import { PollDetailClient } from './poll-detail-client'

export const metadata = createMetadata({
  title: 'Manage Poll',
  description: 'Edit a poll.',
  path: '/admin/polls',
  noIndex: true,
})

export default async function AdminPollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!hasPermission(session?.user, 'polls.manage')) {
    redirect('/')
  }

  const { id } = await params
  const pollId = Number.parseInt(id, 10)
  if (!Number.isInteger(pollId) || pollId <= 0) {
    notFound()
  }

  const poll = await api.polls.getForAdmin({ id: pollId }).catch(() => null)
  if (!poll) {
    notFound()
  }

  return (
    <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col gap-6 pt-8'>
      <PollDetailClient
        poll={{
          id: poll.id,
          uuid: poll.uuid,
          title: poll.title,
          description: poll.description,
          method: toPollMethod(poll.method),
          status: poll.status,
          closesAt: poll.closesAt ? poll.closesAt.toISOString() : null,
          ballotCount: poll.ballotCount,
          options: poll.options.map((o) => ({ id: o.id, label: o.label })),
        }}
      />
    </div>
  )
}
