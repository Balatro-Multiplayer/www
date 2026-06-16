import { describe, expect, test } from 'bun:test'
import { normalizeModId, saveModSchema } from '@/server/mod-policy-utils'

describe('normalizeModId', () => {
  test('lowercases and trims but preserves punctuation', () => {
    expect(normalizeModId('Saturn')).toEqual('saturn')
    expect(normalizeModId('  Mod-X  ')).toEqual('mod-x')
    expect(normalizeModId('eramdam.sticky-fingers')).toEqual(
      'eramdam.sticky-fingers'
    )
  })

  test('folds case but keeps punctuation significant', () => {
    // "Blueprint" and the real lowercase id "blueprint" are the same mod.
    expect(normalizeModId('Blueprint')).toEqual(normalizeModId('blueprint'))
    // A hyphen makes it a different mod (not collapsed away).
    expect(normalizeModId('Mod-X') === normalizeModId('ModX')).toEqual(false)
  })
})

describe('saveModSchema — a mod id is required', () => {
  test('rejects a missing id', () => {
    expect(saveModSchema.safeParse({ status: 'banned' }).success).toEqual(false)
  })

  test('rejects an empty id', () => {
    expect(
      saveModSchema.safeParse({ modId: '', status: 'banned' }).success
    ).toEqual(false)
  })

  test('rejects a whitespace-only id', () => {
    expect(
      saveModSchema.safeParse({ modId: '   ', status: 'banned' }).success
    ).toEqual(false)
  })

  test('rejects a missing or empty name', () => {
    expect(
      saveModSchema.safeParse({ modId: 'Saturn', status: 'banned' }).success
    ).toEqual(false)
    expect(
      saveModSchema.safeParse({ modId: 'Saturn', status: 'banned', name: '  ' })
        .success
    ).toEqual(false)
  })

  test('accepts a valid entry and trims the id', () => {
    const r = saveModSchema.safeParse({
      modId: '  Saturn  ',
      status: 'banned',
      name: 'Saturn',
    })
    expect(r.success).toEqual(true)
    if (r.success) expect(r.data.modId).toEqual('Saturn')
  })

  test('rejects an invalid status', () => {
    expect(
      saveModSchema.safeParse({ modId: 'Saturn', status: 'maybe' }).success
    ).toEqual(false)
  })

  test('accepts optional name / url / category / versions', () => {
    const r = saveModSchema.safeParse({
      modId: 'OldMod',
      status: 'banned',
      name: 'Old Mod',
      url: 'https://github.com/x/y',
      categoryId: 3,
      versions: ['1.0.0', '1.1.0'],
    })
    expect(r.success).toEqual(true)
  })

  test('rejects an empty version string', () => {
    expect(
      saveModSchema.safeParse({
        modId: 'X',
        status: 'approved',
        name: 'X Mod',
        versions: [''],
      }).success
    ).toEqual(false)
  })
})
