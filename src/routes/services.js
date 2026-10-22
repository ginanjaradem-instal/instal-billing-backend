const { Router } = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireRole } = require('../middleware/auth');
const {
  enrichPppServices,
  getPppSessionSnapshot,
  publicRouterStatus,
} = require('../services/mikrotik');
const { encryptPassword } = require('../services/router-credentials');

const router = Router();
const serviceSchema = z.object({
  customerId: z.string().uuid(),
  planId: z.string().uuid(),
  pppoeUsername: z.string().trim().min(1).max(128),
  pppoePassword: z.string().min(1).max(200).optional(),
  routerId: z.string().uuid().nullable().optional(),
  monthlyPrice: z.number().int().nonnegative().optional(),
});
const serviceUpdateSchema = z.object({
  planId: z.string().uuid(),
  pppoeUsername: z.string().trim().min(1).max(128),
  pppoePassword: z.string().min(1).max(200).optional(),
  routerId: z.string().uuid().nullable().optional(),
  monthlyPrice: z.number().int().nonnegative().optional(),
});

function negotiatedValues(plan, input) {
  if (plan.pricing_mode !== 'negotiated') {
    return input.monthlyPrice !== undefined ? false : { monthlyPrice: null };
  }
  return input.monthlyPrice === undefined ? null : { monthlyPrice: input.monthlyPrice };
}

router.get('/', async (req, res) => {
  const customerId = req.query.customerId || null;
  if (customerId && !z.string().uuid().safeParse(customerId).success) {
    return res.status(400).json({ error: 'Invalid customerId' });
  }
  const result = await db.query(
    `SELECT s.id, s.pppoe_username, s.status, s.activated_at,
            s.router_id, r.name AS router_name,
            COALESCE(s.monthly_price, p.monthly_price) AS monthly_price,
            COALESCE(s.download_mbps, p.download_mbps) AS download_mbps,
            COALESCE(s.upload_mbps, p.upload_mbps) AS upload_mbps,
            COALESCE(s.contention_ratio, p.contention_ratio) AS contention_ratio,
            c.id AS customer_id, c.customer_code, c.name AS customer_name,
            p.id AS plan_id, p.name AS plan_name, p.plan_type, p.pricing_mode
     FROM services s
     JOIN customers c ON c.id = s.customer_id
     JOIN plans p ON p.id = s.plan_id
     LEFT JOIN mikrotik_routers r ON r.id = s.router_id
     WHERE ($1::uuid IS NULL OR s.customer_id = $1)
     ORDER BY s.created_at DESC LIMIT 100`,
    [customerId],
  );
  const snapshot = await getPppSessionSnapshot(req.query.refresh === 'true');
  return res.json({
    data: enrichPppServices(result.rows, snapshot),
    router: publicRouterStatus(snapshot),
  });
});

router.post('/', requireRole('admin'), async (req, res) => {
  const input = serviceSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid service data', details: input.error.flatten() });
  const {
    customerId, planId, pppoeUsername, routerId = null, pppoePassword,
  } = input.data;
  if (routerId && !pppoePassword) {
    return res.status(400).json({ error: 'Password PPPoE diperlukan untuk autentikasi RADIUS' });
  }
  const activeRouters = await db.query(
    'SELECT COUNT(*)::int AS router_count FROM mikrotik_routers WHERE is_active',
  );
  if (!routerId && activeRouters.rows[0].router_count > 0) {
    return res.status(400).json({ error: 'Pilih router MikroTik untuk layanan ini' });
  }
  if (routerId) {
    const routerResult = await db.query(
      'SELECT id FROM mikrotik_routers WHERE id = $1 AND is_active',
      [routerId],
    );
    if (!routerResult.rowCount) return res.status(400).json({ error: 'Router MikroTik tidak aktif atau tidak ditemukan' });
  }
  const planResult = await db.query(
    'SELECT id, pricing_mode, is_active FROM plans WHERE id = $1',
    [planId],
  );
  const plan = planResult.rows[0];
  if (!plan || !plan.is_active) return res.status(404).json({ error: 'Active plan not found' });
  const negotiated = negotiatedValues(plan, input.data);
  if (negotiated === null) {
    return res.status(400).json({
      error: 'OHO/Dedicated service requires an agreed monthly price',
    });
  }
  if (negotiated === false) {
    return res.status(400).json({ error: 'Standard plan price and speeds come from the plan catalog' });
  }
  let encryptedPppoePassword = null;
  if (pppoePassword) {
    try {
      encryptedPppoePassword = encryptPassword(pppoePassword);
    } catch (error) {
      return res.status(503).json({ error: error.message });
    }
  }
  const result = await db.query(
    `INSERT INTO services (
       customer_id, plan_id, pppoe_username, router_id,
       pppoe_password_ciphertext, pppoe_password_iv, pppoe_password_auth_tag,
       monthly_price,
       download_mbps, upload_mbps, contention_ratio
     )
     SELECT c.id, p.id, $3, $4, $5, $6, $7, $8,
            CASE WHEN p.pricing_mode = 'negotiated' THEN p.download_mbps END,
            CASE WHEN p.pricing_mode = 'negotiated' THEN p.upload_mbps END,
            CASE WHEN p.pricing_mode = 'negotiated' THEN p.contention_ratio END
     FROM customers c JOIN plans p ON p.id = $2
     WHERE c.id = $1 AND c.status = 'active' AND p.is_active
     RETURNING id, customer_id, plan_id, pppoe_username, router_id, monthly_price,
               download_mbps, upload_mbps, contention_ratio, status, activated_at`,
    [customerId, planId, pppoeUsername, routerId,
      encryptedPppoePassword?.ciphertext, encryptedPppoePassword?.iv,
      encryptedPppoePassword?.authTag, negotiated.monthlyPrice],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Active customer or plan not found' });
  return res.status(201).json({ data: result.rows[0] });
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid service ID' });
  }
  const input = serviceUpdateSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid service data', details: input.error.flatten() });
  if (input.data.routerId) {
    const routerResult = await db.query(
      'SELECT id FROM mikrotik_routers WHERE id = $1 AND is_active',
      [input.data.routerId],
    );
    if (!routerResult.rowCount) return res.status(400).json({ error: 'Router MikroTik tidak aktif atau tidak ditemukan' });
  }
  const currentResult = await db.query(
    'SELECT router_id, pppoe_username FROM services WHERE id = $1',
    [req.params.id],
  );
  if (!currentResult.rowCount) return res.status(404).json({ error: 'Service not found' });
  const nextRouterId = Object.hasOwn(input.data, 'routerId')
    ? input.data.routerId
    : currentResult.rows[0].router_id;
  const nextUsername = input.data.pppoeUsername;
  if (nextRouterId && !input.data.pppoePassword
    && (!currentResult.rows[0].router_id || nextUsername !== currentResult.rows[0].pppoe_username)) {
    return res.status(400).json({ error: 'Password PPPoE diperlukan saat layanan RADIUS baru atau username berubah' });
  }
  const planResult = await db.query(
    'SELECT id, pricing_mode, is_active FROM plans WHERE id = $1',
    [input.data.planId],
  );
  const plan = planResult.rows[0];
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  const negotiated = negotiatedValues(plan, input.data);
  if (negotiated === null) {
    return res.status(400).json({
      error: 'OHO/Dedicated service requires an agreed monthly price',
    });
  }
  if (negotiated === false) {
    return res.status(400).json({ error: 'Standard plan price and speeds come from the plan catalog' });
  }
  let encryptedPppoePassword = null;
  if (input.data.pppoePassword) {
    try {
      encryptedPppoePassword = encryptPassword(input.data.pppoePassword);
    } catch (error) {
      return res.status(503).json({ error: error.message });
    }
  }
  const result = await db.query(
    `UPDATE services s
     SET plan_id = p.id, pppoe_username = $3,
         router_id = CASE WHEN $5 THEN $6::uuid ELSE s.router_id END,
         pppoe_password_ciphertext = COALESCE($7, s.pppoe_password_ciphertext),
         pppoe_password_iv = COALESCE($8, s.pppoe_password_iv),
         pppoe_password_auth_tag = COALESCE($9, s.pppoe_password_auth_tag),
         monthly_price = $4,
         download_mbps = CASE WHEN p.pricing_mode = 'negotiated' THEN p.download_mbps END,
         upload_mbps = CASE WHEN p.pricing_mode = 'negotiated' THEN p.upload_mbps END,
         contention_ratio = CASE WHEN p.pricing_mode = 'negotiated' THEN p.contention_ratio END
     FROM plans p
     WHERE s.id = $1 AND p.id = $2 AND (p.is_active OR s.plan_id = p.id)
     RETURNING s.id, s.customer_id, s.plan_id, s.pppoe_username, s.router_id,
               s.monthly_price, s.download_mbps, s.upload_mbps, s.contention_ratio,
               s.status, s.activated_at`,
    [req.params.id, input.data.planId, input.data.pppoeUsername,
      negotiated.monthlyPrice, Object.hasOwn(input.data, 'routerId'),
      input.data.routerId, encryptedPppoePassword?.ciphertext,
      encryptedPppoePassword?.iv, encryptedPppoePassword?.authTag],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Active service or plan not found' });
  return res.json({ data: result.rows[0] });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid service ID' });
  }
  const result = await db.query(
    `UPDATE services SET status = 'cancelled'
     WHERE id = $1
     RETURNING id, status`,
    [req.params.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Service not found' });
  return res.json({ data: result.rows[0] });
});

router.delete('/:id/permanent', requireRole('admin'), async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid service ID' });
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const serviceResult = await client.query(
      `SELECT s.id, s.pppoe_username, s.customer_id, c.customer_code
       FROM services s
       JOIN customers c ON c.id = s.customer_id
       WHERE s.id = $1
       FOR UPDATE OF s, c`,
      [req.params.id],
    );
    const service = serviceResult.rows[0];
    if (!service) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Service not found' });
    }

    const invoiceResult = await client.query(
      'SELECT COUNT(*)::int AS invoice_count FROM invoices WHERE customer_id = $1',
      [service.customer_id],
    );
    const invoiceCount = invoiceResult.rows[0].invoice_count;
    if (invoiceCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Customer has billing history; permanent service deletion is blocked to preserve invoice records',
        invoiceCount,
      });
    }

    await client.query('DELETE FROM services WHERE id = $1', [service.id]);
    await client.query('COMMIT');
    return res.json({
      data: {
        id: service.id,
        pppoeUsername: service.pppoe_username,
        customerCode: service.customer_code,
        deleted: true,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

module.exports = router;
