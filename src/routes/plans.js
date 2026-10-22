const { Router } = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireRole } = require('../middleware/auth');

const router = Router();
const planSchema = z.object({
  name: z.string().trim().min(1).max(120),
  planType: z.enum(['standard', 'oho', 'dedicated']).default('standard'),
  downloadMbps: z.number().int().positive().optional(),
  uploadMbps: z.number().int().positive().optional(),
  monthlyPrice: z.number().int().nonnegative().optional(),
});

router.get('/', async (_req, res) => {
  const result = await db.query(
    `SELECT id, name, plan_type, pricing_mode, download_mbps, upload_mbps,
            contention_ratio, monthly_price, is_active
     FROM plans ORDER BY name`,
  );
  return res.json({ data: result.rows });
});

router.post('/', requireRole('admin'), async (req, res) => {
  const input = planSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid plan data', details: input.error.flatten() });
  const { name, planType, downloadMbps, uploadMbps, monthlyPrice } = input.data;
  const negotiated = planType !== 'standard';
  if (negotiated && (downloadMbps !== undefined || uploadMbps !== undefined || monthlyPrice !== undefined)) {
    return res.status(400).json({ error: 'OHO/Dedicated bandwidth profiles are fixed; only monthly price is set per customer service' });
  }
  if (!negotiated && (downloadMbps === undefined || uploadMbps === undefined || monthlyPrice === undefined)) {
    return res.status(400).json({ error: 'Standard plans require download, upload, and monthly price' });
  }
  const result = await db.query(
    `INSERT INTO plans (
       name, plan_type, pricing_mode, download_mbps, upload_mbps,
       contention_ratio, monthly_price
     )
     VALUES (
       $1, $2, $3,
       CASE WHEN $2::varchar = 'standard' THEN $4 ELSE 100 END,
       CASE WHEN $2::varchar = 'standard' THEN $5
            WHEN $2::varchar = 'oho' THEN 50 ELSE 100 END,
       CASE $2::varchar WHEN 'oho' THEN '1:2' WHEN 'dedicated' THEN '1:1' END,
       CASE WHEN $2::varchar = 'standard' THEN $6::numeric ELSE NULL::numeric END
     )
     RETURNING id, name, plan_type, pricing_mode, download_mbps, upload_mbps,
               contention_ratio, monthly_price, is_active`,
    [name, planType, negotiated ? 'negotiated' : 'fixed',
      downloadMbps, uploadMbps, monthlyPrice],
  );
  return res.status(201).json({ data: result.rows[0] });
});

router.patch('/:id/activation', requireRole('admin'), async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid plan ID' });
  }
  const input = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid activation status', details: input.error.flatten() });
  const result = await db.query(
    `UPDATE plans SET is_active = $2
     WHERE id = $1
     RETURNING id, name, is_active`,
    [req.params.id, input.data.isActive],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Plan not found' });
  return res.json({ data: result.rows[0] });
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid plan ID' });
  }
  const input = planSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid plan data', details: input.error.flatten() });
  const { name, planType, downloadMbps, uploadMbps, monthlyPrice } = input.data;
  const existing = await db.query(
    'SELECT plan_type, pricing_mode FROM plans WHERE id = $1',
    [req.params.id],
  );
  if (!existing.rowCount) return res.status(404).json({ error: 'Plan not found' });
  if (planType !== existing.rows[0].plan_type) {
    return res.status(409).json({ error: 'Plan type cannot be changed after creation; create a new plan type instead' });
  }
  const negotiated = existing.rows[0].pricing_mode === 'negotiated';
  if (negotiated && (downloadMbps !== undefined || uploadMbps !== undefined || monthlyPrice !== undefined)) {
    return res.status(400).json({ error: 'OHO/Dedicated bandwidth profiles are fixed; only monthly price is set per customer service' });
  }
  if (!negotiated && (downloadMbps === undefined || uploadMbps === undefined || monthlyPrice === undefined)) {
    return res.status(400).json({ error: 'Standard plans require download, upload, and monthly price' });
  }
  const result = await db.query(
    `UPDATE plans
     SET name = $2,
         download_mbps = CASE WHEN plan_type = 'standard' THEN $3 ELSE 100 END,
         upload_mbps = CASE
           WHEN plan_type = 'standard' THEN $4
           WHEN plan_type = 'oho' THEN 50
           ELSE 100
         END,
         monthly_price = $5,
         contention_ratio = CASE plan_type WHEN 'oho' THEN '1:2' WHEN 'dedicated' THEN '1:1' END
     WHERE id = $1
     RETURNING id, name, plan_type, pricing_mode, download_mbps, upload_mbps,
               contention_ratio, monthly_price, is_active`,
    [req.params.id, name, downloadMbps, uploadMbps, negotiated ? null : monthlyPrice],
  );
  return res.json({ data: result.rows[0] });
});

router.delete('/:id/permanent', requireRole('admin'), async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid plan ID' });
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const planResult = await client.query(
      'SELECT id, name FROM plans WHERE id = $1 FOR UPDATE',
      [req.params.id],
    );
    const plan = planResult.rows[0];
    if (!plan) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Plan not found' });
    }
    const serviceResult = await client.query(
      'SELECT COUNT(*)::int AS service_count FROM services WHERE plan_id = $1',
      [plan.id],
    );
    const serviceCount = serviceResult.rows[0].service_count;
    if (serviceCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Plan is used by existing services and cannot be permanently deleted; deactivate it instead',
        serviceCount,
      });
    }
    await client.query('DELETE FROM plans WHERE id = $1', [plan.id]);
    await client.query('COMMIT');
    return res.json({ data: { id: plan.id, name: plan.name, deleted: true } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid plan ID' });
  }
  const result = await db.query(
    `UPDATE plans SET is_active = FALSE
     WHERE id = $1
     RETURNING id, name, is_active`,
    [req.params.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Plan not found' });
  return res.json({ data: result.rows[0] });
});

module.exports = router;
