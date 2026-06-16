import { asc, eq } from 'drizzle-orm'
import { db } from '@/server/db'
import {
  modPolicyCategories,
  modPolicyEntries,
  modPolicyEntryCategories,
} from '@/server/db/schema'

// Public read endpoint the game server polls (BALATROMP_BASE_URL/api/mod-policy).
// Normalized: a flat array of uniform records (no nested maps, no mixed types).
//   [{ modId, name, url, status, versions, categories }]
//   versions: null = all versions; categories: string[] (informational)
// The game server builds its lookup maps from this (it only reads
// modId/status/versions; name/url/categories are informational).
export async function GET() {
  const entries = await db
    .select({
      id: modPolicyEntries.id,
      modId: modPolicyEntries.modId,
      name: modPolicyEntries.name,
      url: modPolicyEntries.url,
      status: modPolicyEntries.status,
      versions: modPolicyEntries.versions,
    })
    .from(modPolicyEntries)
    .orderBy(asc(modPolicyEntries.status), asc(modPolicyEntries.modIdLower))

  const joins = await db
    .select({
      entryId: modPolicyEntryCategories.entryId,
      categoryName: modPolicyCategories.name,
    })
    .from(modPolicyEntryCategories)
    .innerJoin(
      modPolicyCategories,
      eq(modPolicyEntryCategories.categoryId, modPolicyCategories.id)
    )
    .orderBy(asc(modPolicyCategories.nameLower))

  const cats = new Map<number, string[]>()
  for (const j of joins) {
    const a = cats.get(j.entryId) ?? []
    a.push(j.categoryName)
    cats.set(j.entryId, a)
  }

  const mods = entries.map(({ id, ...e }) => ({
    ...e,
    categories: cats.get(id) ?? [],
  }))

  return Response.json(
    { mods },
    { headers: { 'Cache-Control': 'public, max-age=30' } }
  )
}
