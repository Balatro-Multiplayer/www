import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

// Standalone migration runner used at container startup (no drizzle-kit needed).
// Reads DATABASE_URL directly to avoid pulling in the app's env/alias setup.
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set, cannot run migrations')
  process.exit(1)
}

const sql = postgres(url, { max: 1 })

try {
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' })
  console.log('Migrations applied')
  await sql.end()
  process.exit(0)
} catch (err) {
  console.error('Migration failed:', err)
  await sql.end()
  process.exit(1)
}
