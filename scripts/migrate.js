require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const migrationDirectory = path.join(__dirname, '..', 'db', 'migrations');
    const migrations = (await fs.readdir(migrationDirectory))
      .filter((name) => /^\d+_[a-z0-9_]+\.sql$/i.test(name))
      .sort();

    for (const name of migrations) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const applied = await client.query(
          'SELECT 1 FROM schema_migrations WHERE name = $1',
          [name],
        );
        if (applied.rowCount) {
          await client.query('COMMIT');
          console.log(`Skipping ${name}; already applied.`);
          continue;
        }
        const sql = await fs.readFile(path.join(migrationDirectory, name), 'utf8');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        console.log(`Applied ${name}.`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    console.log('Database migrations completed.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
});
