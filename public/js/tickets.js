(() => {
  const app = window.InstaLinkAdmin || (window.InstaLinkAdmin = { features: {} });
  app.features.tickets = { renderTickets };

  async function renderTickets(ctx) {
    const { api, state, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast } = ctx;
    const [ticketResult, customerResult, userResult] = await Promise.all([
      api('/tickets'),
      api('/customers'),
      state.user.role === 'admin' ? api('/users') : Promise.resolve({ data: [] }),
    ]);
    const rows = ticketResult.data.map((ticket) => `<tr><td class="ticket-subject"><strong>${escapeHtml(ticket.subject)}</strong><span>${escapeHtml(ticket.description)}</span></td><td><strong>${escapeHtml(ticket.customer_name)}</strong><span class="cell-sub">${escapeHtml(ticket.customer_code)}</span></td><td>${statusBadge(ticket.priority)}</td><td><select class="inline-select" data-ticket-status="${escapeHtml(ticket.id)}">${[['open', 'Terbuka'], ['in_progress', 'Diproses'], ['resolved', 'Selesai'], ['closed', 'Ditutup']].map(([value, label]) => `<option value="${value}" ${ticket.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td>${state.user.role === 'admin' ? `<select class="inline-select" data-ticket-assignee="${escapeHtml(ticket.id)}"><option value="">Belum ditugaskan</option>${userResult.data.map((user) => `<option value="${escapeHtml(user.id)}" ${ticket.assigned_to === user.id ? 'selected' : ''}>${escapeHtml(user.name)}</option>`).join('')}</select>` : escapeHtml(ticket.assigned_name || 'Belum ditugaskan')}</td><td>${formatDate(ticket.created_at)}</td></tr>`).join('');
    const customers = customerResult.data;
    setPage('tickets', `${pageHeading('Tiket support', 'Catat kendala pelanggan dan pantau tindak lanjut tim.', '<button class="button button-primary" data-toggle="ticket-form">＋ Buat tiket</button>')}
      <div id="ticket-form" class="content-card inline-create" hidden><h2>Buat tiket support</h2><p>Catat keluhan atau permintaan pelanggan.</p><form id="create-ticket" class="form-grid"><label>Pelanggan<select name="customerId" required><option value="">Pilih pelanggan</option>${customers.map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.customer_code)} · ${escapeHtml(customer.name)}</option>`).join('')}</select></label><label>Prioritas<select name="priority"><option value="normal">Normal</option><option value="low">Rendah</option><option value="high">Tinggi</option><option value="urgent">Urgent</option></select></label><label class="span-two">Subjek<input name="subject" required maxlength="200" placeholder="Contoh: Koneksi internet terputus"></label><label class="span-two">Deskripsi<textarea name="description" required maxlength="10000" placeholder="Jelaskan kendala atau permintaan pelanggan..."></textarea></label><div class="form-actions span-two"><button class="button button-quiet" type="button" data-toggle="ticket-form">Batal</button><button class="button button-primary">Buat tiket</button></div></form></div>
      ${dataTable(['SUBJEK TIKET', 'PELANGGAN', 'PRIORITAS', 'STATUS', 'PIC', 'DIBUAT'], rows, 'Tiket support akan muncul di sini.')}`);
  }
  app.features.tickets.submit = submit;

  async function submit(ctx, form) {
    const { api, state, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast, showConfirmation, showPermanentConfirmation, submitForm, renderDashboard, renderCustomers, renderPlans, renderServices, renderInvoices, renderTickets, renderUsers, renderRouters, renderSettings } = ctx;
    if (form.id === 'create-ticket') return submitForm(form, async (data) => {
      await api('/tickets', { method: 'POST', body: JSON.stringify(data) });
      showToast('Tiket support berhasil dibuat.');
      await renderTickets();
    });
  }
})();
