import Link from 'next/link'
import { cn } from '@/lib/utils'

export type BracketPickerItem = {
  id: number
  name: string
}

/**
 * Switcher between published brackets (newest first, e.g. one per season).
 * Hidden while there's only one bracket to show.
 */
export function BracketPicker({
  brackets,
  activeId,
}: {
  brackets: BracketPickerItem[]
  activeId: number
}) {
  if (brackets.length < 2) return null

  return (
    <div className='flex flex-wrap items-center gap-2'>
      {brackets.map((bracket) => (
        <Link
          key={bracket.id}
          href={`/playoffs/${bracket.id}`}
          className={cn(
            'rounded-full border px-3.5 py-1 text-sm transition-colors',
            bracket.id === activeId
              ? 'border-transparent bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          {bracket.name}
        </Link>
      ))}
    </div>
  )
}
