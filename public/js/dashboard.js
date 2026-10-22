(() => {
  const app = window.InstaLinkAdmin || (window.InstaLinkAdmin = { features: {} });
  app.features.dashboard = { renderDashboard };

  async function renderDashboard(ctx) {
    const { api, state, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast } = ctx;
    const result = await api('/overview');
    const { summary, monthly, plans, recentInvoices, priorityTickets } = result.data;
    const openTickets = Number(summary.open_ticket_count);
    document.getElementById('ticket-nav-count').textContent = openTickets ? openTickets : '';

    const monthMaximum = Math.max(1, ...monthly.flatMap((item) => [Number(item.billed), Number(item.collected)]));
    const monthlyBars = monthly.map((item) => {
      const billed = Number(item.billed);
      const collected = Number(item.collected);
      const billedHeight = billed ? Math.max(5, (billed / monthMaximum) * 118) : 2;
      const collectedHeight = collected ? Math.max(5, (collected / monthMaximum) * 118) : 2;
      return `<div class="month-column" title="${escapeHtml(formatMonth(item.month))}: tagihan ${escapeHtml(formatMoney(billed))}, pembayaran diterima ${escapeHtml(formatMoney(collected))}">
        <div class="month-bars"><span class="month-bar billed" style="height:${billedHeight}px"></span><span class="month-bar collected" style="height:${collectedHeight}px"></span></div>
        <span class="month-label">${formatMonth(item.month)}</span>
      </div>`;
    }).join('');
    const planMaximum = Math.max(1, ...plans.map((plan) => Number(plan.active_subscribers)));
    const planBars = plans.map((plan) => {
      const subscribers = Number(plan.active_subscribers);
      const width = Math.max(5, (subscribers / planMaximum) * 100);
      return `<div class="plan-usage"><div class="plan-usage-top"><span>${escapeHtml(plan.name)}</span><strong>${subscribers} pelanggan</strong></div><div class="plan-track"><span style="width:${width}%"></span></div></div>`;
    }).join('');
    const latestInvoices = recentInvoices.map((invoice) =>
      `<div class="activity-row"><span class="activity-mark">▤</span><div class="activity-main"><strong>${escapeHtml(invoice.invoice_number)} · ${escapeHtml(invoice.customer_name)}</strong><span>${formatMonth(invoice.billing_period)} · ${statusBadge(invoice.status)}</span></div><span class="activity-amount">${formatMoney(invoice.amount)}</span></div>`).join('');
    const ticketItems = priorityTickets.map((ticket) =>
      `<div class="activity-row"><span class="activity-mark ticket-mark">▧</span><div class="activity-main"><strong>${escapeHtml(ticket.subject)}</strong><span>${escapeHtml(ticket.customer_name)} · ${statusBadge(ticket.priority)} · ${statusBadge(ticket.status)}</span></div><span class="cell-sub">${formatDate(ticket.created_at)}</span></div>`).join('');
    const now = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date());

    setPage('dashboard', `
      ${pageHeading('Ringkasan', `Ikhtisar billing dan operasional ISP · ${now}`, '<button class="button button-quiet" data-refresh-dashboard>↻ Perbarui</button>')}
      <div class="stats-grid overview-stats">
        <article class="stat-card"><div class="stat-top">Pelanggan aktif<span class="stat-icon">♙</span></div><div class="stat-number">${Number(summary.active_customers)}</div><div class="stat-foot">${Number(summary.total_customers)} pelanggan terdaftar</div></article>
        <article class="stat-card"><div class="stat-top">Layanan aktif<span class="stat-icon">⌁</span></div><div class="stat-number">${Number(summary.active_services)}</div><div class="stat-foot">${Number(summary.active_plans)} paket tersedia</div></article>
        <article class="stat-card"><div class="stat-top">Tagihan periode ini<span class="stat-icon">▤</span></div><div class="stat-number">${formatMoney(summary.current_month_billed)}</div><div class="stat-foot">${Number(summary.current_month_invoice_count)} tagihan diterbitkan</div></article>
        <article class="stat-card"><div class="stat-top">Pembayaran bulan ini<span class="stat-icon">↗</span></div><div class="stat-number">${formatMoney(summary.current_month_collected)}</div><div class="stat-foot">Pembayaran berhasil diterima</div></article>
        <article class="stat-card"><div class="stat-top">Piutang terbuka<span class="stat-icon">◷</span></div><div class="stat-number">${formatMoney(summary.outstanding_amount)}</div><div class="stat-foot">Total tagihan belum lunas</div></article>
        <article class="stat-card stat-card-alert"><div class="stat-top">Tagihan terlambat<span class="stat-icon">!</span></div><div class="stat-number">${Number(summary.overdue_invoice_count)}</div><div class="stat-foot">${formatMoney(summary.overdue_amount)} melewati jatuh tempo</div></article>
      </div>
      <div class="dashboard-grid overview-grid">
        <section class="panel chart-panel">
          <div class="panel-heading"><div><h2>Tren billing & pembayaran</h2><span class="panel-subtitle">6 bulan terakhir</span></div><div class="chart-legend"><span><i class="legend-billed"></i>Tagihan</span><span><i class="legend-collected"></i>Dibayar</span></div></div>
          ${monthly.length ? `<div class="monthly-chart">${monthlyBars}</div>` : '<div class="empty-state">Belum ada data billing.</div>'}
        </section>
        <section class="panel">
          <div class="panel-heading"><div><h2>Pelanggan per paket</h2><span class="panel-subtitle">Langganan aktif · top 5</span></div><button class="text-link" data-page="plans">Lihat paket →</button></div>
          <div class="plan-usage-list">${planBars || '<div class="empty-state"><strong>Belum ada layanan aktif</strong>Distribusi pelanggan tampil setelah layanan dibuat.</div>'}</div>
        </section>
      </div>
      <div class="dashboard-grid overview-grid overview-lower">
        <section class="panel"><div class="panel-heading"><div><h2>Tagihan terbaru</h2><span class="panel-subtitle">5 tagihan terakhir</span></div><button class="text-link" data-page="invoices">Semua tagihan →</button></div><div class="activity-list">${latestInvoices || '<div class="empty-state"><strong>Belum ada tagihan</strong>Buat tagihan periode pertama untuk mulai.</div>'}</div></section>
        <section class="panel"><div class="panel-heading"><div><h2>Tiket perlu perhatian</h2><span class="panel-subtitle">${openTickets} tiket terbuka atau diproses</span></div><button class="text-link" data-page="tickets">Semua tiket →</button></div><div class="activity-list">${ticketItems || '<div class="empty-state"><strong>Tidak ada tiket tertunda</strong>Semua tiket support sudah ditangani.</div>'}</div></section>
      </div>
      <section class="panel quick-panel"><div class="panel-heading"><div><h2>Aksi cepat</h2><span class="panel-subtitle">Pintasan operasional</span></div></div><div class="quick-grid"><button class="quick-action" data-page="customers"><strong>＋ Tambah pelanggan</strong><span>Daftarkan pelanggan baru</span></button><button class="quick-action" data-page="services"><strong>⌁ Tambah layanan</strong><span>Aktifkan paket internet</span></button><button class="quick-action" data-page="invoices"><strong>▤ Buat tagihan</strong><span>Generate billing bulanan</span></button><button class="quick-action" data-page="tickets"><strong>▧ Kelola tiket</strong><span>${openTickets} menunggu ditangani</span></button></div></section>`);
  }
  app.features.dashboard.handleClick = handleClick;
  async function handleClick(ctx, event) {
    const { showToast, renderDashboard } = ctx;
    const refreshButton = event.target.closest('[data-refresh-dashboard]');
    if (!refreshButton) return;
    refreshButton.disabled = true;
    try { await renderDashboard(); showToast('Ringkasan berhasil diperbarui.'); }
    catch (error) { showToast(error.message, true); }
  }
})();
