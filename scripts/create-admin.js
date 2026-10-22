require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

async function main() {
  const { DATABASE_URL, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!DATABASE_URL || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Set DATABASE_URL, ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD');
  }
  if (ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');

  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await pool.query(
      `INSERT INTO staff_users (name, email, password_hash, role)
       VALUES ($1, LOWER($2), $3, 'admin')
       ON CONFLICT (email) DO NOTHING`,
      [ADMIN_NAME, ADMIN_EMAIL, passwordHash],
    );
    console.log('Admin account created, or an account with that email already exists.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Admin creation failed:', error.message);
  process.exitCode = 1;
});
