const { randomUUID } = require('node:crypto');
const db = require('../db');

async function createPaymentLink({ invoiceId, invoiceNumber, customerCode }) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const invoiceResult = await client.query(
      `SELECT i.id, i.invoice_number, i.amount, i.due_date, i.status, i.payment_url,
              c.email, c.name
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE ($1::uuid IS NULL OR i.id = $1)
         AND ($2::text IS NULL OR UPPER(i.invoice_number) = $2)
         AND ($3::text IS NULL OR UPPER(c.customer_code) = $3)
       FOR UPDATE OF i`,
      [invoiceId || null, invoiceNumber || null, customerCode || null],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) {
      await client.query('ROLLBACK');
      return { statusCode: 404, error: 'Invoice not found' };
    }
    if (invoice.status !== 'pending' && invoice.status !== 'overdue') {
      await client.query('ROLLBACK');
      return { statusCode: 409, error: 'Invoice is not payable' };
    }
    if (invoice.payment_url) {
      await client.query('COMMIT');
      return {
        statusCode: 200,
        data: {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          amount: invoice.amount,
          due_date: invoice.due_date,
          status: invoice.status,
          payment_url: invoice.payment_url,
        },
      };
    }

    const { XENDIT_SECRET_KEY, XENDIT_BASE_URL = 'https://api.xendit.co' } = process.env;
    if (!XENDIT_SECRET_KEY) {
      await client.query('ROLLBACK');
      return { statusCode: 503, error: 'Xendit is not configured' };
    }

    const externalId = `${invoice.invoice_number}-${randomUUID()}`;
    const response = await fetch(`${XENDIT_BASE_URL}/v2/invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${XENDIT_SECRET_KEY}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        external_id: externalId,
        amount: Number(invoice.amount),
        description: `Tagihan ISP ${invoice.invoice_number}`,
        payer_email: invoice.email || undefined,
        customer: { given_names: invoice.name },
      }),
    });
    if (!response.ok) {
      console.error('Xendit invoice request failed with status:', response.status);
      await client.query('ROLLBACK');
      return { statusCode: 502, error: 'Payment provider request failed' };
    }
    const payment = await response.json();
    if (typeof payment.id !== 'string' || typeof payment.invoice_url !== 'string') {
      console.error('Xendit invoice response is missing required fields');
      await client.query('ROLLBACK');
      return { statusCode: 502, error: 'Payment provider returned an invalid response' };
    }
    let paymentUrl;
    try {
      paymentUrl = new URL(payment.invoice_url);
    } catch {
      console.error('Xendit invoice response contains an invalid payment URL');
      await client.query('ROLLBACK');
      return { statusCode: 502, error: 'Payment provider returned an invalid response' };
    }
    if (paymentUrl.protocol !== 'https:' || !paymentUrl.hostname.endsWith('.xendit.co')) {
      console.error('Xendit invoice response contains an unexpected payment URL');
      await client.query('ROLLBACK');
      return { statusCode: 502, error: 'Payment provider returned an invalid response' };
    }
    const saved = await client.query(
      `UPDATE invoices SET xendit_invoice_id = $2, xendit_external_id = $3, payment_url = $4
       WHERE id = $1
       RETURNING id, invoice_number, amount, due_date, payment_url, status`,
      [invoice.id, payment.id, externalId, paymentUrl.toString()],
    );
    await client.query('COMMIT');
    return { statusCode: 201, data: saved.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { createPaymentLink };
