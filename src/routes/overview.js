const { Router } = require('express');
const db = require('../db');

const router = Router();

router.get('/', async (_req, res) => {
  const [summary, monthly, plans, invoices, tickets] = await Promise.all([
    db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM customers WHERE status = 'active') AS active_customers,
         (SELECT COUNT(*)::int FROM customers) AS total_customers,
         (SELECT COUNT(*)::int FROM services WHERE status = 'active') AS active_services,
         (SELECT COUNT(*)::int FROM plans WHERE is_active) AS active_plans,
         (SELECT COUNT(*)::int FROM invoices
          WHERE billing_period >= date_trunc('month', CURRENT_DATE)
            AND billing_period < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month') AS current_month_invoice_count,
         (SELECT COALESCE(SUM(amount), 0)
          FROM invoices
          WHERE billing_period >= date_trunc('month', CURRENT_DATE)
            AND billing_period < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month') AS current_month_billed,
         (SELECT COALESCE(SUM(amount), 0)
          FROM invoices
          WHERE status = 'paid'
            AND paid_at >= date_trunc('month', CURRENT_DATE)
            AND paid_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month') AS current_month_collected,
         (SELECT COUNT(*)::int
          FROM invoices
          WHERE status IN ('pending', 'overdue') AND due_date < CURRENT_DATE) AS overdue_invoice_count,
         (SELECT COALESCE(SUM(amount), 0)
          FROM invoices
          WHERE status IN ('pending', 'overdue')
            AND due_date < CURRENT_DATE) AS overdue_amount,
         (SELECT COALESCE(SUM(amount), 0)
          FROM invoices
          WHERE status IN ('pending', 'overdue')) AS outstanding_amount,
         (SELECT COUNT(*)::int FROM support_tickets
          WHERE status IN ('open', 'in_progress')) AS open_ticket_count`,
    ),
    db.query(
      `WITH months AS (
         SELECT generate_series(
           date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
           date_trunc('month', CURRENT_DATE),
           INTERVAL '1 month'
         )::date AS month
       )
       SELECT months.month,
              COALESCE(SUM(i.amount), 0) AS billed,
              COALESCE(SUM(i.amount) FILTER (
                WHERE i.status = 'paid'
                  AND i.paid_at >= months.month
                  AND i.paid_at < months.month + INTERVAL '1 month'
              ), 0) AS collected
       FROM months
       LEFT JOIN invoices i
         ON i.billing_period >= months.month
        AND i.billing_period < months.month + INTERVAL '1 month'
       GROUP BY months.month
       ORDER BY months.month`,
    ),
    db.query(
      `SELECT p.id, p.name, COUNT(s.id)::int AS active_subscribers
       FROM plans p
       JOIN services s ON s.plan_id = p.id AND s.status = 'active'
       WHERE p.is_active
       GROUP BY p.id, p.name
       ORDER BY active_subscribers DESC, p.name
       LIMIT 5`,
    ),
    db.query(
      `SELECT i.id, i.invoice_number, i.billing_period, i.amount, i.due_date, i.status,
              c.name AS customer_name, c.customer_code
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       ORDER BY i.created_at DESC
       LIMIT 5`,
    ),
    db.query(
      `SELECT t.id, t.subject, t.status, t.priority, t.created_at,
              c.name AS customer_name, c.customer_code
       FROM support_tickets t
       JOIN customers c ON c.id = t.customer_id
       WHERE t.status IN ('open', 'in_progress')
       ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
                t.created_at ASC
       LIMIT 5`,
    ),
  ]);

  return res.json({
    data: {
      summary: summary.rows[0],
      monthly: monthly.rows,
      plans: plans.rows,
      recentInvoices: invoices.rows,
      priorityTickets: tickets.rows,
    },
  });
});

module.exports = router;
