const { Router } = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireRole } = require('../middleware/auth');
const {
  enrichPppServices,
  getPppSessionSnapshot,
  publicRouterStatus,
} = require('../services/mikrotik');

const router = Router();
const customerSchema = z.object({
  customerCode: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().trim().min(1).max(32),
  address: z.string().trim().min(1).max(2000),
  billingDay: z.number().int().min(1).max(28).default(10),
});
const customerUpdateSchema = z.object({
  customerCode: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  email: z.union([z.string().email().max(255), z.literal(''), z.null()]),
  phone: z.string().trim().min(1).max(32),
  address: z.string().trim().min(1).max(2000),
  billingDay: z.number().int().min(1).max(28),
});

router.get('/', async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const result = await db.query(
    `SELECT id, customer_code, name, email, phone, address, billing_day, status, created_at
     FROM customers
     WHERE ($1 = '' OR name ILIKE '%' || $1 || '%' OR customer_code ILIKE '%' || $1 || '%')
     ORDER BY created_at DESC LIMIT 100`,
    [search],
  );
  const customerIds = result.rows.map((customer) => customer.id);
  const serviceResult = customerIds.length
    ? await db.query(
      `SELECT s.id, s.customer_id, s.pppoe_username, s.status,
              s.router_id, r.name AS router_name
       FROM services s
       LEFT JOIN mikrotik_routers r ON r.id = s.router_id
       WHERE s.customer_id = ANY($1::uuid[])
       ORDER BY s.created_at DESC`,
      [customerIds],
    )
    : { rows: [] };
  const snapshot = await getPppSessionSnapshot();
  const services = enrichPppServices(serviceResult.rows, snapshot);
  const servicesByCustomer = new Map();
  services.forEach((service) => {
    const customerServices = servicesByCustomer.get(service.customer_id) || [];
    customerServices.push({
      pppoeUsername: service.pppoe_username,
      status: service.connection_status,
      ipAddress: service.ip_address,
      callerId: service.caller_id,
      uptime: service.connection_uptime,
      routerName: service.router_name || null,
    });
    servicesByCustomer.set(service.customer_id, customerServices);
  });
  return res.json({
    data: result.rows.map((customer) => ({
      ...customer,
      connections: servicesByCustomer.get(customer.id) || [],
    })),
    router: publicRouterStatus(snapshot),
  });
});

router.post('/', async (req, res) => {
  const input = customerSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid customer data', details: input.error.flatten() });
  const { customerCode, name, email, phone, address, billingDay } = input.data;
  const result = await db.query(
    `INSERT INTO customers (customer_code, name, email, phone, address, billing_day)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, customer_code, name, email, phone, address, billing_day, status, created_at`,
    [customerCode, name, email || null, phone, address, billingDay],
  );
  return res.status(201).json({ data: result.rows[0] });
});

router.patch('/:id', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid customer ID' });
  }
  const input = customerUpdateSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid customer data', details: input.error.flatten() });
  const { customerCode, name, email, phone, address, billingDay } = input.data;
  const result = await db.query(
    `UPDATE customers
     SET customer_code = $2, name = $3, email = $4, phone = $5, address = $6,
         billing_day = $7, updated_at = NOW()
     WHERE id = $1
     RETURNING id, customer_code, name, email, phone, address, billing_day, status, created_at, updated_at`,
    [req.params.id, customerCode, name, email || null, phone, address, billingDay],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Customer not found' });
  return res.json({ data: result.rows[0] });
});

router.patch('/:id/activation', requireRole('admin'), async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid customer ID' });
  }
  const result = await db.query(
    `UPDATE customers
     SET status = 'active', updated_at = NOW()
     WHERE id = $1 AND status = 'cancelled'
     RETURNING id, customer_code, name, status`,
    [req.params.id],
  );
  if (!result.rowCount) {
    const customer = await db.query(
      'SELECT status FROM customers WHERE id = $1',
      [req.params.id],
    );
    if (!customer.rowCount) return res.status(404).json({ error: 'Customer not found' });
    return res.status(409).json({ error: 'Only cancelled customers can be reactivated' });
  }
  return res.json({ data: result.rows[0] });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid customer ID' });
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE customers SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [req.params.id],
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found' });
    }
    await client.query(
      `UPDATE services SET status = 'cancelled'
       WHERE customer_id = $1 AND status != 'cancelled'`,
      [req.params.id],
    );
    await client.query('COMMIT');
    return res.json({ data: { id: result.rows[0].id, status: 'cancelled' } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

router.delete('/:id/permanent', requireRole('admin'), async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid customer ID' });
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const customerResult = await client.query(
      'SELECT id, customer_code FROM customers WHERE id = $1 FOR UPDATE',
      [req.params.id],
    );
    const customer = customerResult.rows[0];
    if (!customer) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found' });
    }

    const invoicesResult = await client.query(
      'SELECT id, status, xendit_invoice_id FROM invoices WHERE customer_id = $1 FOR UPDATE',
      [customer.id],
    );
    if (invoicesResult.rows.some((invoice) => invoice.status === 'paid')) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Customer has paid invoices; permanent deletion is blocked to preserve payment history',
      });
    }
    if (invoicesResult.rows.some((invoice) => invoice.xendit_invoice_id)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Customer has an active Xendit payment link; wait for it to expire before permanent deletion',
      });
    }

    const invoiceIds = invoicesResult.rows.map((invoice) => invoice.id);
    if (invoiceIds.length) {
      await client.query('DELETE FROM payments WHERE invoice_id = ANY($1::uuid[])', [invoiceIds]);
      await client.query('DELETE FROM invoices WHERE id = ANY($1::uuid[])', [invoiceIds]);
    }
    const ticketsResult = await client.query(
      'DELETE FROM support_tickets WHERE customer_id = $1',
      [customer.id],
    );
    const servicesResult = await client.query(
      'DELETE FROM services WHERE customer_id = $1',
      [customer.id],
    );
    await client.query('DELETE FROM customers WHERE id = $1', [customer.id]);
    await client.query('COMMIT');
    return res.json({
      data: {
        id: customer.id,
        customerCode: customer.customer_code,
        deletedInvoices: invoiceIds.length,
        deletedTickets: ticketsResult.rowCount,
        deletedServices: servicesResult.rowCount,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

router.get('/:id', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid customer ID' });
  }
  const result = await db.query(
    `SELECT c.id, c.customer_code, c.name, c.email, c.phone, c.address, c.billing_day, c.status,
            COALESCE(json_agg(json_build_object(
              'id', s.id, 'pppoeUsername', s.pppoe_username, 'status', s.status,
              'monthlyPrice', COALESCE(s.monthly_price, p.monthly_price),
              'downloadMbps', COALESCE(s.download_mbps, p.download_mbps),
              'uploadMbps', COALESCE(s.upload_mbps, p.upload_mbps),
              'contentionRatio', COALESCE(s.contention_ratio, p.contention_ratio),
              'plan', json_build_object('id', p.id, 'name', p.name, 'planType', p.plan_type)
            )) FILTER (WHERE s.id IS NOT NULL), '[]') AS services
     FROM customers c
     LEFT JOIN services s ON s.customer_id = c.id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE c.id = $1
     GROUP BY c.id`,
    [req.params.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Customer not found' });
  const snapshot = await getPppSessionSnapshot();
  const customer = result.rows[0];
  customer.services = enrichPppServices(customer.services, snapshot);
  return res.json({ data: customer, router: publicRouterStatus(snapshot) });
});

module.exports = router;
