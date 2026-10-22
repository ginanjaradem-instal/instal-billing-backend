const { Router, raw } = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireRole } = require('../middleware/auth');

const router = Router();
const logoUpload = raw({
  type: ['image/png', 'image/jpeg', 'image/webp'],
  limit: '2mb',
});
const logoSlots = {
  left: { data: 'logo_left', mime: 'logo_left_mime' },
  right: { data: 'logo_right', mime: 'logo_right_mime' },
};
const bankSchema = z.object({
  bankName: z.string().trim().min(1).max(100),
  accountName: z.string().trim().min(1).max(160),
  accountNumber: z.string().trim().min(1).max(64),
});
const settingsSchema = z.object({
  companyName: z.string().trim().min(1).max(160),
  companyAddress: z.string().trim().min(1).max(2000),
  companyPhone: z.string().trim().min(1).max(32),
  invoiceDescription: z.string().trim().max(2000),
  bankCount: z.union([z.literal(1), z.literal(2)]),
  bankAccounts: z.array(bankSchema).min(1).max(2),
  invoiceReminderDays: z.union([
    z.literal(3),
    z.literal(5),
    z.literal(7),
    z.literal(10),
  ]),
}).refine((settings) => settings.bankAccounts.length === settings.bankCount, {
  message: 'Jumlah rekening harus sesuai dengan pilihan jumlah bank',
  path: ['bankAccounts'],
});

router.use(requireRole('admin'));

router.get('/general', async (_req, res) => {
  const result = await db.query(
    `SELECT company_name, company_address, company_phone, invoice_description,
            bank_count, bank_accounts, invoice_reminder_days, updated_at
     FROM general_settings WHERE singleton = TRUE`,
  );
  const settings = result.rows[0];
  if (!settings) throw new Error('General settings row is missing');
  return res.json({
    data: {
      companyName: settings.company_name,
      companyAddress: settings.company_address,
      companyPhone: settings.company_phone,
      invoiceDescription: settings.invoice_description,
      bankCount: settings.bank_count,
      bankAccounts: settings.bank_accounts,
      invoiceReminderDays: settings.invoice_reminder_days,
      updatedAt: settings.updated_at,
    },
  });
});

router.put('/general', async (req, res) => {
  const input = settingsSchema.safeParse(req.body);
  if (!input.success) {
    return res.status(400).json({
      error: 'Data pengaturan umum tidak valid',
      details: input.error.flatten(),
    });
  }
  const settings = input.data;
  const result = await db.query(
    `INSERT INTO general_settings (
       singleton, company_name, company_address, company_phone,
       invoice_description, bank_count, bank_accounts, invoice_reminder_days,
       updated_at
     )
     VALUES (TRUE, $1, $2, $3, $4, $5, $6::jsonb, $7, NOW())
     ON CONFLICT (singleton) DO UPDATE SET
       company_name = EXCLUDED.company_name,
       company_address = EXCLUDED.company_address,
       company_phone = EXCLUDED.company_phone,
       invoice_description = EXCLUDED.invoice_description,
       bank_count = EXCLUDED.bank_count,
       bank_accounts = EXCLUDED.bank_accounts,
       invoice_reminder_days = EXCLUDED.invoice_reminder_days,
       updated_at = NOW()
     RETURNING company_name, company_address, company_phone, invoice_description,
               bank_count, bank_accounts, invoice_reminder_days, updated_at`,
    [
      settings.companyName,
      settings.companyAddress,
      settings.companyPhone,
      settings.invoiceDescription,
      settings.bankCount,
      JSON.stringify(settings.bankAccounts),
      settings.invoiceReminderDays,
    ],
  );
  const saved = result.rows[0];
  return res.json({
    data: {
      companyName: saved.company_name,
      companyAddress: saved.company_address,
      companyPhone: saved.company_phone,
      invoiceDescription: saved.invoice_description,
      bankCount: saved.bank_count,
      bankAccounts: saved.bank_accounts,
      invoiceReminderDays: saved.invoice_reminder_days,
      updatedAt: saved.updated_at,
    },
  });
});

router.get('/invoice', async (_req, res) => {
  const result = await db.query(
    `SELECT g.company_name, g.company_address,
            d.logo_left, d.logo_left_mime, d.logo_right, d.logo_right_mime,
            d.updated_at
     FROM general_settings g
     JOIN invoice_design_settings d ON d.singleton = g.singleton
     WHERE g.singleton = TRUE`,
  );
  const design = result.rows[0];
  if (!design) throw new Error('Invoice design settings row is missing');
  const logoDataUrl = (data, mime) => (data
    ? `data:${mime};base64,${Buffer.from(data).toString('base64')}`
    : null);
  return res.json({
    data: {
      companyName: design.company_name,
      companyAddress: design.company_address,
      logoLeft: logoDataUrl(design.logo_left, design.logo_left_mime),
      logoRight: logoDataUrl(design.logo_right, design.logo_right_mime),
      updatedAt: design.updated_at,
    },
  });
});

router.put('/invoice/logo/:side', logoUpload, async (req, res) => {
  const slot = logoSlots[req.params.side];
  if (!slot) return res.status(400).json({ error: 'Posisi logo tidak valid' });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'File logo kosong atau format tidak didukung' });
  }
  const mime = req.headers['content-type'];
  const validSignature = mime === 'image/png'
    ? req.body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mime === 'image/jpeg'
      ? req.body[0] === 0xff && req.body[1] === 0xd8
        && req.body[req.body.length - 2] === 0xff && req.body[req.body.length - 1] === 0xd9
      : mime === 'image/webp'
        && req.body.length >= 12
        && req.body.toString('ascii', 0, 4) === 'RIFF'
        && req.body.toString('ascii', 8, 12) === 'WEBP';
  if (!validSignature) {
    return res.status(400).json({ error: 'Isi file tidak sesuai dengan format PNG, JPEG, atau WebP' });
  }
  const result = await db.query(
    `UPDATE invoice_design_settings
     SET ${slot.data} = $1, ${slot.mime} = $2, updated_at = NOW()
     WHERE singleton = TRUE
     RETURNING updated_at`,
    [req.body, mime],
  );
  if (!result.rowCount) throw new Error('Invoice design settings row is missing');
  return res.json({ data: { side: req.params.side, updatedAt: result.rows[0].updated_at } });
});

router.delete('/invoice/logo/:side', async (req, res) => {
  const slot = logoSlots[req.params.side];
  if (!slot) return res.status(400).json({ error: 'Posisi logo tidak valid' });
  const result = await db.query(
    `UPDATE invoice_design_settings
     SET ${slot.data} = NULL, ${slot.mime} = NULL, updated_at = NOW()
     WHERE singleton = TRUE
     RETURNING updated_at`,
  );
  if (!result.rowCount) throw new Error('Invoice design settings row is missing');
  return res.json({ data: { side: req.params.side, removed: true, updatedAt: result.rows[0].updated_at } });
});

module.exports = router;
