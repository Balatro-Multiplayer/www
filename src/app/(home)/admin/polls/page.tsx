import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/permissions'
import { toPollMethod } from '@/lib/poll-method'
import { auth } from '@/server/auth'
import { api } from '@/trpc/server'
import { createMetadata } from '../../../../../lib/metadata'
import { PollsClient } from './polls-client'

export const metadata = createMetadata({
  title: 'Manage Polls',
  description: 'Create and manage ranked-choice and multiple-choice polls.',
  path: '/admin/polls',
  noIndex: true,
})

export default async function AdminPollsPage() {
  const session = await auth()

  if (!hasPermission(session?.user, 'polls.manage')) {
    redirect('/')
  }

  const polls = await api.polls.adminList()

  return (
    <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col gap-6 pt-8'>
      <div className='flex flex-col gap-2'>
        <h1 className='font-bold text-3xl'>Manage Polls</h1>
        <p className='text-muted-foreground text-sm'>
          Create ranked-choice or multiple-choice polls, share the public link,
          and review results.
        </p>
      </div>

      <PollsClient
        polls={polls.map((poll) => ({
          id: poll.id,
          uuid: poll.uuid,
          title: poll.title,
          method: toPollMethod(poll.method),
          status: poll.status,
          optionCount: poll.optionCount,
          ballotCount: poll.ballotCount,
          createdAt: poll.createdAt.toISOString(),
        }))}
      />
    </div>
  )
}
