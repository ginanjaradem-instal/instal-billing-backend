const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const { createPaymentLink } = require('../services/payment-links');
const { checkCoverage } = require('../services/coverage');

const router = Router();
const paymentLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment verification attempts. Try again later.' },
});
const paymentInput = z.object({
  invoiceNumber: z.string().trim().min(1).max(50),
  customerCode: z.string().trim().min(1).max(32),
});
const coverageLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many coverage checks. Try again later.' },
});
const coverageInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
const installRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.union([z.string().trim().email().max(255), z.literal('')]).optional(),
  phone: z.string().trim().min(6).max(32),
  address: z.string().trim().min(8).max(1000),
  preferredPlan: z.string().trim().max(120).optional(),
});
const troubleReportSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(32),
  customerCode: z.string().trim().max(32).optional(),
  category: z.enum(['connection_down', 'slow_connection', 'unstable_connection', 'other']),
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(5000),
});
const customerRequestLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak pengajuan. Silakan coba lagi 15 menit lagi.' },
});

router.post('/payment-link', paymentLimit, async (req, res) => {
  const input = paymentInput.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Enter a valid invoice number and customer code' });

  const result = await createPaymentLink({
    invoiceNumber: input.data.invoiceNumber.toUpperCase(),
    customerCode: input.data.customerCode.toUpperCase(),
  });
  if (result.statusCode === 404) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  if (result.error) return res.status(result.statusCode).json({ error: result.error });

  return res.status(result.statusCode).json({
    data: {
      invoice_number: result.data.invoice_number,
      amount: result.data.amount,
      due_date: result.data.due_date,
      status: result.data.status,
      payment_url: result.data.payment_url,
    },
  });
});

router.post('/coverage-check', coverageLimit, async (req, res) => {
  const input = coverageInput.safeParse(req.body);
  if (!input.success) {
    return res.status(400).json({ error: 'Enter valid device coordinates to check coverage' });
  }
  const result = await checkCoverage(input.data.longitude, input.data.latitude);
  return res.json({ data: result });
});

router.post('/installation-requests', customerRequestLimit, async (req, res) => {
  const input = installRequestSchema.safeParse(req.body);
  if (!input.success) {
    return res.status(400).json({
      error: 'Data ajuan pemasangan tidak valid',
      details: input.error.flatten(),
    });
  }
  const { name, email, phone, address, preferredPlan } = input.data;
  const result = await db.query(
    `INSERT INTO installation_requests (name, email, phone, address, preferred_plan)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, status, created_at`,
    [name, email || null, phone, address, preferredPlan || null],
  );
  return res.status(201).json({
    data: {
      requestNumber: result.rows[0].id,
      status: result.rows[0].status,
      createdAt: result.rows[0].created_at,
    },
  });
});

router.post('/trouble-reports', customerRequestLimit, async (req, res) => {
  const input = troubleReportSchema.safeParse(req.body);
  if (!input.success) {
    return res.status(400).json({
      error: 'Data laporan gangguan tidak valid',
      details: input.error.flatten(),
    });
  }
  const { name, phone, customerCode, category, subject, description } = input.data;
  const result = await db.query(
    `INSERT INTO customer_trouble_reports (
       name, phone, customer_code, category, subject, description
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, status, created_at`,
    [name, phone, customerCode || null, category, subject, description],
  );
  return res.status(201).json({
    data: {
      reportNumber: result.rows[0].id,
      status: result.rows[0].status,
      createdAt: result.rows[0].created_at,
    },
  });
});

module.exports = router;
