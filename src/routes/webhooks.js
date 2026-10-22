const { Router } = require('express');
const db = require('../db');

const router = Router();

function toMinorUnits(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
}

router.post('/xendit', async (req, res) => {
  const expectedToken = process.env.XENDIT_CALLBACK_TOKEN;
  if (!expectedToken) return res.status(503).json({ error: 'Xendit webhook is not configured' });
  if (req.get('x-callback-token') !== expectedToken) return res.status(401).json({ error: 'Invalid callback token' });

  const { external_id: providerExternalId, id: externalId, status, paid_amount: paidAmount } = req.body || {};
  if (!providerExternalId || !externalId || !status) return res.status(400).json({ error: 'Invalid webhook payload' });
  if (status !== 'PAID' && status !== 'SETTLED' && status !== 'EXPIRED') {
    return res.status(200).json({ received: true });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const invoiceResult = await client.query(
      'SELECT id, amount, status, xendit_invoice_id FROM invoices WHERE xendit_external_id = $1 FOR UPDATE',
      [providerExternalId],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) {
      await client.query('ROLLBACK');
      if (status === 'EXPIRED') return res.json({ received: true });
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (!invoice.xendit_invoice_id || invoice.xendit_invoice_id !== externalId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Payment does not match the active Xendit invoice' });
    }
    if (status === 'EXPIRED') {
      await client.query(
        `UPDATE invoices
         SET status = 'overdue', xendit_invoice_id = NULL, xendit_external_id = NULL, payment_url = NULL
         WHERE id = $1 AND status != 'paid'`,
        [invoice.id],
      );
      await client.query('COMMIT');
      return res.json({ received: true });
    }
    const callbackAmount = toMinorUnits(paidAmount);
    const invoiceAmount = toMinorUnits(invoice.amount);
    if (callbackAmount === null || callbackAmount !== invoiceAmount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Payment amount does not match invoice' });
    }
    if (invoice.status !== 'paid') {
      await client.query(
        `INSERT INTO payments (invoice_id, provider, external_id, amount, status, paid_at)
         VALUES ($1, 'xendit', $2, $3, 'paid', NOW())
         ON CONFLICT (external_id) DO NOTHING`,
        [invoice.id, externalId, invoice.amount],
      );
      await client.query(
        `UPDATE invoices SET status = 'paid', paid_at = NOW(), xendit_invoice_id = $2
         WHERE id = $1`,
        [invoice.id, req.body.id],
      );
    }
    await client.query('COMMIT');
    return res.json({ received: true });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

module.exports = router;
