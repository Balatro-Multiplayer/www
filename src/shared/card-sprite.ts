/**
 * Sprite-atlas positioning for rendering a playing card exactly as the game
 * does, from the site's atlas PNGs (`/atlases/8BitDeck.png`, `Enhancers.png`,
 * `Editions.png`). Extracted out of the log parser's `deck-view.tsx` so the
 * Idol Deck Sorter's card grid can render pixel-identical card art without a
 * second copy of this positioning table. `deck-view.tsx` now imports from
 * here instead of keeping its own copy — no rendering behavior changed.
 */

import type { CSSProperties } from 'react'

export const CARD_WIDTH = 71
export const CARD_HEIGHT = 95

export const SUIT_ROW = {
  H: 0,
  C: 1,
  D: 2,
  S: 3,
} as const

export const RANK_COLUMN = {
  '2': 0,
  '3': 1,
  '4': 2,
  '5': 3,
  '6': 4,
  '7': 5,
  '8': 6,
  '9': 7,
  T: 8,
  J: 9,
  Q: 10,
  K: 11,
  A: 12,
} as const

export const ENHANCEMENT_POSITION = {
  base: { x: 1, y: 0 },
  m_bonus: { x: 1, y: 1 },
  m_mult: { x: 2, y: 1 },
  m_wild: { x: 3, y: 1 },
  m_lucky: { x: 4, y: 1 },
  m_glass: { x: 5, y: 1 },
  m_steel: { x: 6, y: 1 },
  m_stone: { x: 5, y: 0 },
  m_gold: { x: 6, y: 0 },
} as const

export const SEAL_POSITION = {
  Gold: { x: 2, y: 0 },
  Purple: { x: 4, y: 4 },
  Red: { x: 5, y: 4 },
  Blue: { x: 6, y: 4 },
} as const

export const EDITION_POSITION = {
  foil: { x: 1, y: 0 },
  holo: { x: 2, y: 0 },
  polychrome: { x: 3, y: 0 },
} as const

export function spriteOffset(x: number, y: number): string {
  return `-${x * CARD_WIDTH}px -${y * CARD_HEIGHT}px`
}

export type SpriteCard = {
  rank: string
  suit: string
  enhancement?: string | null
  edition?: string | null
}

/** Layered background-image/-position CSS for a card's face (front + enhancement + edition), matching the game's atlas layering. Seals are drawn as a separate overlay layer by the caller (see `SEAL_POSITION`) since they sit above everything else, including the count badge in some layouts. */
export function getCardFaceStyle(card: SpriteCard): CSSProperties {
  const frontX = RANK_COLUMN[card.rank as keyof typeof RANK_COLUMN]
  const frontY = SUIT_ROW[card.suit as keyof typeof SUIT_ROW]
  const enhancementPos = card.enhancement
    ? (ENHANCEMENT_POSITION[
        card.enhancement as keyof typeof ENHANCEMENT_POSITION
      ] ?? ENHANCEMENT_POSITION.base)
    : ENHANCEMENT_POSITION.base

  const layers = [`url('/atlases/Jokers.png')`]
  const positions = ['0px -855px']

  if (card.edition && card.edition in EDITION_POSITION) {
    const editionPos =
      EDITION_POSITION[card.edition as keyof typeof EDITION_POSITION]
    layers.push(`url('/atlases/Editions.png')`)
    positions.push(spriteOffset(editionPos.x, editionPos.y))
  }

  if (card.enhancement === 'm_stone') {
    layers.push(`url('/atlases/Enhancers.png')`)
    positions.push(spriteOffset(enhancementPos.x, enhancementPos.y))
  } else {
    layers.push(`url('/atlases/8BitDeck.png')`)
    positions.push(spriteOffset(frontX, frontY))
    layers.push(`url('/atlases/Enhancers.png')`)
    positions.push(spriteOffset(enhancementPos.x, enhancementPos.y))
  }

  return {
    backgroundImage: layers.join(', '),
    backgroundPosition: positions.join(', '),
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
    backgroundBlendMode:
      card.edition === 'polychrome' ? 'normal, color' : undefined,
  }
}
