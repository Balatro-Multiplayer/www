import type { Viewport } from 'next'
import { notFound } from 'next/navigation'
import { accentColorForUuid, formatCloseLabel } from '@/lib/poll-embed'
import { auth } from '@/server/auth'
import { api } from '@/trpc/server'
import { createMetadata } from '../../../../../lib/metadata'
import { PollVoteClient } from './poll-vote-client'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uuid: string }>
}) {
  const { uuid } = await params
  const poll = await api.polls.getPublic({ uuid }).catch(() => null)

  const closeLabel = poll ? formatCloseLabel(poll) : null
  const baseDescription = poll?.description?.trim()
    ? poll.description.trim()
    : 'Ranked-choice poll — vote and see live results.'
  const description = closeLabel
    ? `${baseDescription} · ${closeLabel}`
    : baseDescription

  return createMetadata({
    title: poll ? poll.title : 'Poll',
    description,
    path: `/polls/${uuid}`,
    images: `/polls/${uuid}/og`,
    noIndex: true,
  })
}

// Per-poll accent color for the Discord embed's left border.
export async function generateViewport({
  params,
}: {
  params: Promise<{ uuid: string }>
}): Promise<Viewport> {
  const { uuid } = await params
  return { themeColor: accentColorForUuid(uuid) }
}

export default async function PublicPollPage({
  params,
}: {
  params: Promise<{ uuid: string }>
}) {
  const { uuid } = await params
  const poll = await api.polls.getPublic({ uuid }).catch(() => null)
  if (!poll) {
    notFound()
  }

  const session = await auth()

  return (
    <div className='mx-auto flex w-[calc(100%-1rem)] max-w-3xl flex-col gap-6 pt-8 pb-16'>
      <PollVoteClient
        poll={{
          uuid: poll.uuid,
          title: poll.title,
          description: poll.description,
          status: poll.status,
          closesAt: poll.closesAt ? poll.closesAt.toISOString() : null,
          isClosed: poll.isClosed,
          options: poll.options,
          totalBallots: poll.totalBallots,
        }}
        isLoggedIn={Boolean(session?.user)}
      />
    </div>
  )
}
