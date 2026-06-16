import { z } from 'zod'

// Mod ids are case-insensitive but punctuation IS significant: "Saturn" and
// "saturn" are the same mod, but "Mod-X" and "ModX" are different mods (a hyphen
// is part of the id, not noise). Used for the unique index so the same id can't
// be re-added under different casing.
export const normalizeModId = (id: string) => id.trim().toLowerCase()

// A mod id is required — you can't add an entry without one (it's the matching
// key; an entry with no id couldn't be enforced in-game). null/empty versions =
// applies to all versions.
export const saveModSchema = z.object({
  id: z.number().int().positive().optional(),
  modId: z.string().trim().min(1).max(120),
  status: z.enum(['banned', 'approved']),
  versions: z.array(z.string().trim().min(1)).nullish(),
  // A display name is required.
  name: z.string().trim().min(1).max(200),
  // Any hosting link (GitHub, Nexus, Discord, Drive, …) — not just http(s).
  url: z.string().trim().max(500).nullish(),
  // A mod can belong to multiple categories (many-to-many).
  categoryIds: z.array(z.number().int().positive()).default([]),
  note: z.string().trim().max(500).nullish(),
})

export type SaveModInput = z.infer<typeof saveModSchema>
