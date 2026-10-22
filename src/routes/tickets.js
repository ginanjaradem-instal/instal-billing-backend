const { Router } = require('express');
const { z } = require('zod');
const db = require('../db');

const router = Router();
const createSchema = z.object({
  customerId: z.string().uuid(),
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(10000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
});

router.get('/', async (req, res) => {
  const result = await db.query(
    `SELECT t.id, t.subject, t.description, t.status, t.priority, t.created_at, t.updated_at,
            c.id AS customer_id, c.customer_code, c.name AS customer_name,
            u.id AS assigned_to, u.name AS assigned_name
     FROM support_tickets t
     JOIN customers c ON c.id = t.customer_id
     LEFT JOIN staff_users u ON u.id = t.assigned_to
     WHERE ($1::text IS NULL OR t.status = $1)
     ORDER BY t.created_at DESC LIMIT 100`,
    [req.query.status || null],
  );
  return res.json({ data: result.rows });
});

router.post('/', async (req, res) => {
  const input = createSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid ticket data', details: input.error.flatten() });
  const { customerId, subject, description, priority } = input.data;
  const result = await db.query(
    `INSERT INTO support_tickets (customer_id, subject, description, priority)
     VALUES ($1, $2, $3, $4)
     RETURNING id, customer_id, subject, description, status, priority, created_at`,
    [customerId, subject, description, priority],
  );
  return res.status(201).json({ data: result.rows[0] });
});

router.patch('/:id', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid ticket ID' });
  }
  const input = z.object({
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    assignedTo: z.string().uuid().nullable().optional(),
  }).refine((data) => Object.keys(data).length > 0).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid ticket update', details: input.error.flatten() });
  const data = input.data;
  const result = await db.query(
    `UPDATE support_tickets SET
       status = COALESCE($2, status),
       priority = COALESCE($3, priority),
       assigned_to = CASE WHEN $4 THEN $5::uuid ELSE assigned_to END,
       updated_at = NOW()
     WHERE id = $1
     RETURNING id, customer_id, subject, description, status, priority, assigned_to, updated_at`,
    [req.params.id, data.status || null, data.priority || null,
      Object.hasOwn(data, 'assignedTo'), data.assignedTo || null],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Ticket not found' });
  return res.json({ data: result.rows[0] });
});

module.exports = router;
