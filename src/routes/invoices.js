const { Router } = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireRole } = require('../middleware/auth');
const { createPaymentLink } = require('../services/payment-links');

const router = Router();
const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');

router.get('/', async (req, res) => {
  const customerId = req.query.customerId || null;
  const status = req.query.status || null;
  if (customerId && !z.string().uuid().safeParse(customerId).success) {
    return res.status(400).json({ error: 'Invalid customerId' });
  }
  if (status && !z.enum(['pending', 'paid', 'overdue', 'cancelled']).safeParse(status).success) {
    return res.status(400).json({ error: 'Invalid invoice status' });
  }
  const result = await db.query(
    `SELECT i.id, i.invoice_number, i.customer_id, c.customer_code, c.name AS customer_name,
            i.billing_period, i.amount, i.due_date, i.status, i.payment_url,
            (i.xendit_invoice_id IS NOT NULL) AS has_active_payment, i.created_at
     FROM invoices i JOIN customers c ON c.id = i.customer_id
     WHERE ($1::uuid IS NULL OR i.customer_id = $1)
       AND ($2::text IS NULL OR i.status = $2)
     ORDER BY i.created_at DESC LIMIT 100`,
    [customerId, status],
  );
  return res.json({ data: result.rows });
});

router.post('/generate', requireRole('admin'), async (req, res) => {
  const input = z.object({ period: periodSchema }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid billing period', details: input.error.flatten() });
  const period = `${input.data.period}-01`;
  const result = await db.query(
    `INSERT INTO invoices (invoice_number, customer_id, billing_period, amount, due_date)
     SELECT 'INV-' || to_char($1::date, 'YYYYMM') || '-' || upper(replace(c.id::text, '-', '')),
            c.id, $1::date, SUM(COALESCE(s.monthly_price, p.monthly_price)),
            make_date(EXTRACT(YEAR FROM $1::date)::int, EXTRACT(MONTH FROM $1::date)::int, c.billing_day)
     FROM customers c
     JOIN services s ON s.customer_id = c.id AND s.status = 'active'
     JOIN plans p ON p.id = s.plan_id
     WHERE c.status = 'active'
     GROUP BY c.id, c.billing_day
     ON CONFLICT (customer_id, billing_period) DO NOTHING
     RETURNING id, invoice_number, customer_id, billing_period, amount, due_date, status`,
    [period],
  );
  return res.status(201).json({ data: result.rows, created: result.rowCount });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid invoice ID' });
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT id, invoice_number, status, xendit_invoice_id FROM invoices WHERE id = $1 FOR UPDATE',
      [req.params.id],
    );
    const invoice = result.rows[0];
    if (!invoice) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (invoice.status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Paid invoices cannot be permanently deleted' });
    }
    if (invoice.xendit_invoice_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Invoice has an active Xendit payment link; wait for it to expire before deletion',
      });
    }
    const paymentResult = await client.query(
      'DELETE FROM payments WHERE invoice_id = $1',
      [invoice.id],
    );
    await client.query('DELETE FROM invoices WHERE id = $1', [invoice.id]);
    await client.query('COMMIT');
    return res.json({
      data: { id: invoice.id, invoiceNumber: invoice.invoice_number, deletedPayments: paymentResult.rowCount },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

router.post('/:id/payment-link', requireRole('admin'), async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid invoice ID' });
  }
  const result = await createPaymentLink({ invoiceId: req.params.id });
  if (result.error) return res.status(result.statusCode).json({ error: result.error });
  return res.status(result.statusCode).json({
    data: {
      id: result.data.id,
      invoice_number: result.data.invoice_number,
      payment_url: result.data.payment_url,
      status: result.data.status,
    },
  });
});

module.exports = router;
