const { Router } = require('express');
const { z } = require('zod');
const db = require('../db');

const router = Router();
const requestTypes = {
  installation: {
    table: 'installation_requests',
    statuses: ['new', 'contacted', 'survey_scheduled', 'approved', 'rejected', 'completed'],
    select: `id, name, email, phone, address, preferred_plan, status, staff_notes,
             created_at, updated_at`,
  },
  trouble: {
    table: 'customer_trouble_reports',
    statuses: ['open', 'in_progress', 'need_customer', 'resolved', 'closed'],
    select: `id, name, phone, customer_code, category, subject, description,
             status, staff_notes, created_at, updated_at`,
  },
};

router.get('/:type', async (req, res) => {
  if (!Object.hasOwn(requestTypes, req.params.type)) {
    return res.status(404).json({ error: 'Request type not found' });
  }
  const requestType = requestTypes[req.params.type];
  const result = await db.query(
    `SELECT ${requestType.select}
     FROM ${requestType.table}
     ORDER BY created_at DESC
     LIMIT 200`,
  );
  return res.json({ data: result.rows });
});

router.patch('/:type/:id', async (req, res) => {
  if (!Object.hasOwn(requestTypes, req.params.type)) {
    return res.status(404).json({ error: 'Request type not found' });
  }
  const requestType = requestTypes[req.params.type];
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid request ID' });
  }
  const input = z.object({
    status: z.enum(requestType.statuses),
    staffNotes: z.string().trim().max(5000).default(''),
  }).safeParse(req.body);
  if (!input.success) {
    return res.status(400).json({
      error: 'Data tindak lanjut tidak valid',
      details: input.error.flatten(),
    });
  }
  const result = await db.query(
    `UPDATE ${requestType.table}
     SET status = $2, staff_notes = $3, updated_at = NOW()
     WHERE id = $1
     RETURNING id, status, staff_notes, updated_at`,
    [req.params.id, input.data.status, input.data.staffNotes],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Request not found' });
  return res.json({ data: result.rows[0] });
});

module.exports = router;
