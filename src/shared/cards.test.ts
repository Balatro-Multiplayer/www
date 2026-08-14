import { describe, expect, test } from 'bun:test'
import { FACE_RANKS, LOW_RANKS, previousRank, RANK_ORDER } from './cards'

describe('FACE_RANKS', () => {
  test('is exactly Jack, Queen, King', () => {
    // Steamodded's core rank registrations (src/game_object.lua) set
    // `face = true` on Jack/Queen/King only — Ace gets `nominal = 11` and
    // `face_nominal = 0.4` for sort-order tiebreaking, but no `face` flag.
    // If this ever needs to change, re-check that source first.
    expect([...FACE_RANKS].sort()).toEqual(['J', 'K', 'Q'])
  })

  test('does not include Ace', () => {
    expect(FACE_RANKS).not.toContain('A')
  })
})

describe('LOW_RANKS', () => {
  test('is exactly 2 through 5 (nominal 2-5 in the source)', () => {
    expect([...LOW_RANKS].sort()).toEqual(['2', '3', '4', '5'])
  })
})

describe('previousRank', () => {
  test('wraps from 2 back to Ace, matching the mod’s next-chain (Ace.next = {"2"})', () => {
    expect(previousRank('2')).toBe('A')
  })

  test('every rank has a distinct predecessor covering the full order', () => {
    const predecessors = RANK_ORDER.map((rank) => previousRank(rank))
    expect(new Set(predecessors).size).toBe(RANK_ORDER.length)
  })
})
