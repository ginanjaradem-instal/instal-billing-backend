const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db');
const { requireRole } = require('../middleware/auth');

const router = Router();
const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().max(255),
  password: z.string().min(12).max(200),
  role: z.enum(['admin', 'staff']),
});

router.get('/', requireRole('admin'), async (_req, res) => {
  const result = await db.query('SELECT id, name, email, role, created_at FROM staff_users ORDER BY name');
  return res.json({ data: result.rows });
});

router.post('/', requireRole('admin'), async (req, res) => {
  const input = createUserSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid staff account data', details: input.error.flatten() });

  const { name, email, password, role } = input.data;
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await db.query(
    `INSERT INTO staff_users (name, email, password_hash, role)
     VALUES ($1, LOWER($2), $3, $4)
     RETURNING id, name, email, role, created_at`,
    [name, email, passwordHash, role],
  );
  return res.status(201).json({ data: result.rows[0] });
});

module.exports = router;
