'use client'

/**
 * Drives the illustrative `roll` value fed into `IdolRollTrack` and
 * `pickWinnerForRoll` — there's no real seed here, so this is just a slider
 * + "Randomize" the user can scrub to see which card would win at a given roll.
 */

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'

export function RollControls({
  roll,
  onRollChange,
}: {
  roll: number
  onRollChange: (roll: number) => void
}) {
  return (
    <div className='flex flex-wrap items-center gap-3'>
      <span className='text-muted-foreground text-sm'>Roll</span>
      <Slider
        value={[roll]}
        onValueChange={(next) => {
          const value = next[0]
          if (value !== undefined) {
            onRollChange(value)
          }
        }}
        min={0}
        max={1}
        step={0.01}
        className='max-w-xs'
        aria-label='Idol roll value'
      />
      <span className='w-12 font-mono text-sm tabular-nums'>
        {roll.toFixed(2)}
      </span>
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() => onRollChange(Math.random())}
      >
        Randomize
      </Button>
    </div>
  )
}
