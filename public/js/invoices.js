(() => {
  const app = window.InstaLinkAdmin || (window.InstaLinkAdmin = { features: {} });
  app.features.invoices = { renderInvoices };

  async function renderInvoices(ctx) {
    const { api, state, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast } = ctx;
    const result = await api('/invoices');
    state.invoices = result.data;
    const rows = result.data.map((invoice) => `<tr><td><strong>${escapeHtml(invoice.invoice_number)}</strong><span class="cell-sub">${formatDate(invoice.billing_period)}</span></td><td><strong>${escapeHtml(invoice.customer_name)}</strong><span class="cell-sub">${escapeHtml(invoice.customer_code)}</span></td><td><strong>${formatMoney(invoice.amount)}</strong></td><td>${formatDate(invoice.due_date)}</td><td>${statusBadge(invoice.status)}</td><td>${invoice.payment_url ? `<a class="small-button" href="${escapeHtml(invoice.payment_url)}" target="_blank" rel="noopener noreferrer">Buka pembayaran ↗</a>` : invoice.status === 'pending' || invoice.status === 'overdue' ? `<button class="small-button" data-payment-link="${escapeHtml(invoice.id)}">Buat link</button>` : '—'}</td><td>${state.user.role !== 'admin' ? '—' : invoice.status === 'paid' ? 'Riwayat dilindungi' : invoice.has_active_payment ? 'Link pembayaran aktif' : `<button class="small-button small-button-permanent" data-permanent-invoice="${escapeHtml(invoice.id)}">Hapus permanen</button>`}</td></tr>`).join('');
    setPage('invoices', `${pageHeading('Tagihan', 'Generate tagihan di muka untuk layanan aktif dan pantau status pembayaran.', '<button class="button button-primary" data-toggle="invoice-form">＋ Generate tagihan</button>')}
      <div id="invoice-form" class="content-card inline-create" hidden><h2>Generate tagihan bulanan</h2><p>Tagihan dibuat untuk pelanggan aktif berdasarkan harga layanan aktif. Satu tagihan per pelanggan per bulan.</p><form id="generate-invoices" class="form-grid"><label>Periode tagihan<input name="period" type="month" value="${new Date().toISOString().slice(0, 7)}" required></label><div class="notice span-two">Proses ini menyimpan tagihan baru di database. Tagihan yang sudah ada untuk periode tersebut tidak akan dibuat ulang.</div><div class="form-actions span-two"><button class="button button-quiet" type="button" data-toggle="invoice-form">Batal</button><button class="button button-primary">Buat tagihan</button></div></form></div>
      ${dataTable(['NOMOR TAGIHAN', 'PELANGGAN', 'JUMLAH', 'JATUH TEMPO', 'STATUS', 'PEMBAYARAN', 'AKSI'], rows, 'Tagihan bulanan akan ditampilkan di sini.')}`);
  }
  app.features.invoices.submit = submit;

  async function submit(ctx, form) {
    const { api, state, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast, showConfirmation, showPermanentConfirmation, submitForm, formObject, renderDashboard, renderCustomers, renderPlans, renderServices, renderInvoices, renderTickets, renderUsers, renderRouters, renderSettings } = ctx;
    if (form.id === 'generate-invoices') {
      const data = formObject(form);
      return showConfirmation('Generate tagihan periode ini?', `Tagihan akan dibuat untuk semua pelanggan dengan layanan aktif pada periode ${data.period}. Data yang sudah ada tidak digandakan.`, 'Ya, generate', async () => submitForm(form, async () => {
        const result = await api('/invoices/generate', { method: 'POST', body: JSON.stringify(data) });
        showToast(`${result.created} tagihan baru berhasil dibuat.`);
        await renderInvoices();
      }));
    }
  }
  app.features.invoices.handleClick = handleClick;

  async function handleClick(ctx, event) {
    const { state, api, showToast, showConfirmation, showPermanentConfirmation, formatMoney, renderInvoices } = ctx;
    const permanentInvoice = event.target.closest('[data-permanent-invoice]');
      if (permanentInvoice) {
        const invoice = state.invoices.find((item) => item.id === permanentInvoice.dataset.permanentInvoice);
        if (!invoice) return showToast('Tagihan tidak ditemukan; muat ulang halaman.', true);
        return showPermanentConfirmation(
          'Hapus tagihan permanen?',
          `Tagihan ${invoice.invoice_number} sebesar ${formatMoney(invoice.amount)} serta payment record terkait akan dihapus permanen. Tagihan lunas atau yang memiliki payment link aktif tidak bisa dihapus.`,
          invoice.invoice_number,
          'Hapus tagihan',
          async () => {
            try {
              await api(`/invoices/${encodeURIComponent(invoice.id)}`, { method: 'DELETE' });
              showToast('Tagihan dan payment record terkait berhasil dihapus.');
              await renderInvoices();
            } catch (error) {
              showToast(error.message, true);
            }
          },
        );
      }

      const paymentButton = event.target.closest('[data-payment-link]');
      if (paymentButton) {
        showConfirmation('Buat payment link Xendit?', 'Tindakan ini menghubungi Xendit dan membuat tautan pembayaran nyata untuk tagihan ini.', 'Buat payment link', async () => {
          paymentButton.disabled = true;
          try {
            const result = await api(`/invoices/${encodeURIComponent(paymentButton.dataset.paymentLink)}/payment-link`, { method: 'POST' });
            showToast(result.data.payment_url
              ? 'Payment link berhasil dibuat. Buka dari daftar tagihan.'
              : 'Permintaan payment link berhasil diproses.');
            await renderInvoices();
          } catch (error) {
            showToast(error.message, true);
            paymentButton.disabled = false;
          }
        });
      }
  }
})();
