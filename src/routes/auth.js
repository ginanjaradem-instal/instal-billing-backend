const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db');

const router = Router();
const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});

router.post('/login', async (req, res) => {
  const input = loginSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid login input' });

  const result = await db.query(
    'SELECT id, name, email, password_hash, role FROM staff_users WHERE email = LOWER($1)',
    [input.data.email],
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(input.data.password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' },
  );
  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

module.exports = router;
