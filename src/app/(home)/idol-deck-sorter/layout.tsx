import type { ReactNode } from 'react'
import { createMetadata } from '../../../../lib/metadata'

export const metadata = createMetadata({
  title: 'Idol Deck Sorter',
  description:
    "Build a deck and see how Balatro Multiplayer's Idol algorithm would score, sort, and weight it.",
  path: '/idol-deck-sorter',
})

export default function IdolDeckSorterLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
