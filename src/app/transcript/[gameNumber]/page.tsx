import { api } from '@/trpc/server'
import type { Metadata } from 'next'
import type {ReactNode} from "react";

type Props = {
  params: Promise<{
    gameNumber: string
  }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const gameNumber = Number.parseInt((await params).gameNumber, 10)
  return {
    title: `Game Transcript #${gameNumber}`,
  }
}

// todo: access botlatro api for transcript content
export default async function TranscriptPage({ params }: Props) {
  const gameNumber = Number.parseInt((await params).gameNumber, 10)

  try {
    const transcriptContent: ReactNode = ''

    if (!transcriptContent) {
      return (
        <div className='flex h-screen w-screen items-center justify-center'>
          <p>Failed to load transcript. Please try again.</p>
        </div>
      )
    }

    // Return the transcript content *escaped*
    return (
      <div
        className='transcript-container'
        content={transcriptContent.toString()}
      />
    )
  } catch (error) {
    return (
      <div className='flex h-screen w-screen items-center justify-center'>
        <p className='text-red-500'>
          Failed to load transcript: {(error as Error).message}
        </p>
      </div>
    )
  }
}
