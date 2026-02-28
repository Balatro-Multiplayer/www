import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import type { AdapterAccount } from 'next-auth/adapters'

export const raw_history = pgTable(
  'raw_history',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    game_num: integer('game_num').notNull(),
    entry: json(),
  },
  (t) => [uniqueIndex('game_num_unique_idx').on(t.game_num)]
)
export const metadata = pgTable('metadata', {
  key: text('key').primaryKey().notNull(),
  value: text('value').notNull(),
})
export const player_games = pgTable(
  'player_games',
  {
    playerId: text('player_id').notNull(),
    queueId: text('queue_id'),
    playerName: text('player_name').notNull(),
    gameId: integer('game_id').notNull(),
    gameTime: timestamp('game_time').notNull(),
    gameType: text('game_type').notNull(),
    gameNum: integer('game_num').notNull(),
    playerMmr: real('player_mmr').notNull(),
    mmrChange: real('mmr_change').notNull(),
    opponentId: text('opponent_id').notNull(),
    opponentName: text('opponent_name').notNull(),
    opponentMmr: real('opponent_mmr').notNull(),
    deck: text('deck'),
    stake: text('stake'),
    result: text('result').notNull(),
    season: text('season'),
  },
  (t) => [
    primaryKey({ columns: [t.playerId, t.gameNum] }),
    uniqueIndex('game_num_per_player_idx').on(t.playerId, t.gameNum),
    index('season_idx').on(t.season),
  ]
)

export const users = pgTable('user', (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: d.varchar({ length: 255 }),
  email: d.varchar({ length: 255 }).notNull(),
  emailVerified: d
    .timestamp({
      mode: 'date',
      withTimezone: true,
    })
    .default(sql`CURRENT_TIMESTAMP`),
  image: d.varchar({ length: 255 }),
  discord_id: d.varchar({ length: 255 }),
  twitch_url: d.varchar({ length: 255 }),
  youtube_url: d.varchar({ length: 255 }),
  role: d.varchar({ length: 255 }).notNull().default('user'),
}))

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
}))

export const accounts = pgTable(
  'account',
  (d) => ({
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id),
    type: d.varchar({ length: 255 }).$type<AdapterAccount['type']>().notNull(),
    provider: d.varchar({ length: 255 }).notNull(),
    providerAccountId: d.varchar({ length: 255 }).notNull(),
    refresh_token: d.text(),
    access_token: d.text(),
    expires_at: d.integer(),
    token_type: d.varchar({ length: 255 }),
    scope: d.varchar({ length: 255 }),
    id_token: d.text(),
    session_state: d.varchar({ length: 255 }),
  }),
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index('account_user_id_idx').on(t.userId),
  ]
)

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}))

export const sessions = pgTable(
  'session',
  (d) => ({
    sessionToken: d.varchar({ length: 255 }).notNull().primaryKey(),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => users.id),
    expires: d.timestamp({ mode: 'date', withTimezone: true }).notNull(),
  }),
  (t) => [index('t_user_id_idx').on(t.userId)]
)

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))

export const verificationTokens = pgTable(
  'verification_token',
  (d) => ({
    identifier: d.varchar({ length: 255 }).notNull(),
    token: d.varchar({ length: 255 }).notNull(),
    expires: d.timestamp({ mode: 'date', withTimezone: true }).notNull(),
  }),
  (t) => [primaryKey({ columns: [t.identifier, t.token] })]
)

export const branches = pgTable('mod_branches', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  name: text('name').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const releases = pgTable('mod_release', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  name: text('name').notNull(),
  description: text('description'),
  version: text('version').notNull(),
  url: text('url').notNull(),
  smods_version: text('smods_version').default('latest'),
  lovely_version: text('lovely_version').default('latest'),
  branchId: integer('branch_id')
    .references(() => branches.id)
    .notNull()
    .default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const branchesRelations = relations(branches, ({ many }) => ({
  releases: many(releases),
}))

export const releasesRelations = relations(releases, ({ one }) => ({
  branch: one(branches, {
    fields: [releases.branchId],
    references: [branches.id],
  }),
}))

export const logFiles = pgTable('log_files', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  userId: text('user_id').references(() => users.id),
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(),
  parsedJson: json('parsed_json').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const logFilesRelations = relations(logFiles, ({ one }) => ({
  user: one(users, {
    fields: [logFiles.userId],
    references: [users.id],
  }),
}))

export const leaderboardSnapshots = pgTable('leaderboard_snapshots', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  channelId: text('channel_id').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  data: json('data').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const leaderboardSnapshotsRelations = relations(
  leaderboardSnapshots,
  () => ({})
)

export const seasons = pgTable('seasons', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  name: text('name').notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'),
  isActive: boolean('is_active').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const seasonSnapshots = pgTable(
  'season_snapshots',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    seasonId: integer('season_id')
      .references(() => seasons.id)
      .notNull(),
    queueType: text('queue_type').notNull(),
    queueId: text('queue_id').notNull(),
    minioKey: text('minio_key'),
    uploadedBy: text('uploaded_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('season_snapshots_season_id_idx').on(t.seasonId),
    uniqueIndex('season_snapshots_season_queue_unique').on(
      t.seasonId,
      t.queueType
    ),
  ]
)

export const seasonsRelations = relations(seasons, ({ many }) => ({
  snapshots: many(seasonSnapshots),
}))

export const seasonSnapshotsRelations = relations(
  seasonSnapshots,
  ({ one }) => ({
    season: one(seasons, {
      fields: [seasonSnapshots.seasonId],
      references: [seasons.id],
    }),
  })
)

export const transcripts = pgTable('transcripts', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  gameNumber: integer('game_number').notNull().unique(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const blogPosts = pgTable('blog_posts', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  content: text('content').notNull(),
  excerpt: text('excerpt'),
  published: boolean('published').notNull().default(false),
  authorId: varchar('author_id', { length: 255 })
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const blogPostsRelations = relations(blogPosts, ({ one }) => ({
  author: one(users, {
    fields: [blogPosts.authorId],
    references: [users.id],
  }),
}))

export const memoryLogs = pgTable('memory_logs', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  runId: varchar('run_id', { length: 36 }).notNull(),
  label: varchar('label', { length: 100 }).notNull(),
  heapUsedMb: real('heap_used_mb').notNull(),
  heapTotalMb: real('heap_total_mb').notNull(),
  rssMb: real('rss_mb').notNull(),
  externalMb: real('external_mb').notNull(),
  metadata: json('metadata'),
})
