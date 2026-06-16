import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { createTRPCRouter, permissionProcedure } from '@/server/api/trpc'
import { db } from '@/server/db'
import {
  modPolicyCategories,
  modPolicyEntries,
  modPolicyEntryCategories,
} from '@/server/db/schema'
import { normalizeModId, saveModSchema } from '@/server/mod-policy-utils'

export const modPolicyRouter = createTRPCRouter({
  list: permissionProcedure('mod_policy.manage').query(async () => {
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
        categoryId: modPolicyCategories.id,
        categoryName: modPolicyCategories.name,
      })
      .from(modPolicyEntryCategories)
      .innerJoin(
        modPolicyCategories,
        eq(modPolicyEntryCategories.categoryId, modPolicyCategories.id)
      )
      .orderBy(asc(modPolicyCategories.nameLower))

    const byEntry = new Map<number, { id: number; name: string }[]>()
    for (const j of joins) {
      const arr = byEntry.get(j.entryId) ?? []
      arr.push({ id: j.categoryId, name: j.categoryName })
      byEntry.set(j.entryId, arr)
    }
    return entries.map((e) => ({ ...e, categories: byEntry.get(e.id) ?? [] }))
  }),

  save: permissionProcedure('mod_policy.manage')
    .input(saveModSchema)
    .mutation(async ({ input }) => {
      const versions = input.versions?.length ? input.versions : null
      const values = {
        modId: input.modId,
        modIdLower: normalizeModId(input.modId),
        status: input.status,
        versions,
        name: input.name,
        url: input.url ?? null,
        note: input.note ?? null,
      }

      // Save the entry and replace its category links atomically.
      const entryId = await db.transaction(async (tx) => {
        let id: number
        if (input.id) {
          const [updated] = await tx
            .update(modPolicyEntries)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(modPolicyEntries.id, input.id))
            .returning({ id: modPolicyEntries.id })
          if (!updated) throw new Error('Entry not found')
          id = updated.id
        } else {
          // Upsert on the normalized id so re-adding a mod flips its rule rather
          // than erroring on the unique index.
          const [saved] = await tx
            .insert(modPolicyEntries)
            .values(values)
            .onConflictDoUpdate({
              target: modPolicyEntries.modIdLower,
              set: {
                modId: values.modId,
                status: values.status,
                versions: values.versions,
                name: values.name,
                url: values.url,
                note: values.note,
                updatedAt: new Date(),
              },
            })
            .returning({ id: modPolicyEntries.id })
          if (!saved) throw new Error('Failed to save entry')
          id = saved.id
        }

        await tx
          .delete(modPolicyEntryCategories)
          .where(eq(modPolicyEntryCategories.entryId, id))
        if (input.categoryIds.length > 0) {
          await tx.insert(modPolicyEntryCategories).values(
            input.categoryIds.map((categoryId) => ({
              entryId: id,
              categoryId,
            }))
          )
        }
        return id
      })
      return { id: entryId }
    }),

  delete: permissionProcedure('mod_policy.manage')
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db.delete(modPolicyEntries).where(eq(modPolicyEntries.id, input.id))
      return { success: true }
    }),

  // --- categories ---
  categories: permissionProcedure('mod_policy.manage').query(async () => {
    return db
      .select()
      .from(modPolicyCategories)
      .orderBy(asc(modPolicyCategories.nameLower))
  }),

  addCategory: permissionProcedure('mod_policy.manage')
    .input(
      z.object({
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().max(300).nullish(),
      })
    )
    .mutation(async ({ input }) => {
      const [saved] = await db
        .insert(modPolicyCategories)
        .values({
          name: input.name,
          nameLower: normalizeModId(input.name),
          description: input.description ?? null,
        })
        .onConflictDoUpdate({
          target: modPolicyCategories.nameLower,
          set: { name: input.name, updatedAt: new Date() },
        })
        .returning()
      if (!saved) throw new Error('Failed to save category')
      return saved
    }),

  renameCategory: permissionProcedure('mod_policy.manage')
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(80),
      })
    )
    .mutation(async ({ input }) => {
      const [updated] = await db
        .update(modPolicyCategories)
        .set({
          name: input.name,
          nameLower: normalizeModId(input.name),
          updatedAt: new Date(),
        })
        .where(eq(modPolicyCategories.id, input.id))
        .returning()
      if (!updated) throw new Error('Category not found')
      return updated
    }),

  deleteCategory: permissionProcedure('mod_policy.manage')
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      // The join table FK is ON DELETE CASCADE, so deleting a category just
      // removes it from any mods that had it.
      await db
        .delete(modPolicyCategories)
        .where(eq(modPolicyCategories.id, input.id))
      return { success: true }
    }),
})
