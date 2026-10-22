(() => {
  const app = window.InstaLinkAdmin || (window.InstaLinkAdmin = { features: {} });
  app.features.services = { renderServices };

  async function renderServices(ctx, editService = null, refreshStatus = false) {
    const { api, state, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast } = ctx;
    const servicesPath = refreshStatus ? '/services?refresh=true' : '/services';
    const [serviceResult, customerResult, planResult, routerResult] = await Promise.all([
      api(servicesPath), api('/customers'), api('/plans'),
      state.user.role === 'admin' ? api('/routers') : Promise.resolve({ data: [] }),
    ]);
    state.routers = routerResult.data;
    state.services = serviceResult.data;
    const rows = serviceResult.data.map((service) => `<tr><td><strong>${escapeHtml(service.pppoe_username)}</strong><span class="cell-sub">Caller-ID/MAC: ${escapeHtml(service.caller_id || '—')}</span></td><td><strong>${escapeHtml(service.customer_name)}</strong><span class="cell-sub">${escapeHtml(service.customer_code)}</span></td><td>${escapeHtml(service.router_name || '—')}</td><td>${statusBadge(service.connection_status)}<span class="cell-sub">IP: ${escapeHtml(service.ip_address || '—')}</span>${service.connection_uptime ? `<span class="cell-sub">Uptime: ${escapeHtml(service.connection_uptime)}</span>` : ''}</td><td>${escapeHtml(service.plan_name)}<span class="cell-sub">${escapeHtml(service.plan_type)}</span></td><td>${escapeHtml(service.download_mbps)} / ${escapeHtml(service.upload_mbps)} Mbps${service.contention_ratio ? `<span class="cell-sub">Rasio ${escapeHtml(service.contention_ratio)}</span>` : ''}</td><td>${formatMoney(service.monthly_price)}</td><td>${formatDate(service.activated_at)}</td><td>${statusBadge(service.status)}</td>${state.user.role === 'admin' ? `<td><div class="row-actions">${service.status !== 'cancelled' ? `<button class="small-button" data-edit-service="${escapeHtml(service.id)}">Edit</button><button class="small-button small-button-danger" data-delete-service="${escapeHtml(service.id)}">Nonaktifkan</button>` : ''}<button class="small-button small-button-permanent" data-permanent-service="${escapeHtml(service.id)}">Hapus permanen</button></div></td>` : ''}</tr>`).join('');
    const customers = customerResult.data.filter((customer) => customer.status === 'active');
    const plans = planResult.data.filter((plan) => plan.is_active);
    const planOptions = (selectedPlanId = '') => plans.map((plan) => {
      const label = plan.pricing_mode === 'negotiated'
        ? `${plan.name} · ${plan.plan_type.toUpperCase()} · ${plan.download_mbps}/${plan.upload_mbps} Mbps · rasio ${plan.contention_ratio}`
        : `${plan.name} · ${formatMoney(plan.monthly_price)}`;
      return `<option value="${escapeHtml(plan.id)}" data-pricing-mode="${escapeHtml(plan.pricing_mode)}" data-download-mbps="${escapeHtml(plan.download_mbps)}" data-upload-mbps="${escapeHtml(plan.upload_mbps)}" data-contention-ratio="${escapeHtml(plan.contention_ratio)}" ${plan.id === selectedPlanId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
    const agreementFields = (service = null) => `<div class="form-grid span-two" data-service-agreement ${service?.pricing_mode === 'negotiated' ? '' : 'hidden'}>
      <p class="span-two" data-service-profile>${service?.pricing_mode === 'negotiated' ? `Profil tetap: ${escapeHtml(service.download_mbps)} / ${escapeHtml(service.upload_mbps)} Mbps, rasio ${escapeHtml(service.contention_ratio)}. Kecepatan tidak dapat diubah.` : ''}</p>
      <p class="span-two">Masukkan harga bulanan sesuai kesepakatan pelanggan. Perubahan berlaku untuk tagihan berikutnya.</p>
      <label>Harga bulanan (Rp)<input name="monthlyPrice" type="number" min="0" step="1" value="${escapeHtml(service?.monthly_price ?? '')}" ${service?.pricing_mode === 'negotiated' ? 'required' : 'disabled'}></label>
    </div>`;
    const routerOptions = (selectedRouterId = '') => `<option value="">Pilih router MikroTik</option>${routerResult.data.filter((router) => router.is_active).map((router) => `<option value="${escapeHtml(router.id)}" ${router.id === selectedRouterId ? 'selected' : ''}>${escapeHtml(router.name)} · ${escapeHtml(router.host)}</option>`).join('')}`;
    const routerSelect = (service = null) => `<label>Router MikroTik<select name="routerId" ${routerResult.data.some((router) => router.is_active) ? 'required' : ''}>${routerOptions(service?.router_id || '')}</select></label>`;
    const form = editService
      ? `<div id="service-edit-form" class="content-card inline-create"><h2>Ubah layanan pelanggan</h2><p>Perubahan paket atau harga berlaku pada tagihan berikutnya; tagihan yang sudah terbit tidak berubah. Kosongkan password untuk tetap menggunakan password tersimpan.</p><form id="update-service" class="form-grid" data-record-id="${escapeHtml(editService.id)}"><label class="span-two">Paket internet<select name="planId" data-service-plan-select data-previous-plan="${escapeHtml(editService.plan_id)}" required>${planOptions(editService.plan_id)}</select></label>${agreementFields(editService)}${routerSelect(editService)}<label>Username PPPoE<input name="pppoeUsername" value="${escapeHtml(editService.pppoe_username)}" required maxlength="128"></label><label>Password PPPoE<input name="pppoePassword" type="password" autocomplete="new-password" maxlength="200" placeholder="Kosongkan untuk tetap memakai password tersimpan"></label><div class="form-actions span-two"><button class="button button-quiet" type="button" data-cancel-service-edit>Batal</button><button class="button button-primary">Simpan perubahan</button></div></form></div>`
      : `<div id="service-form" class="content-card inline-create" hidden><h2>Aktifkan layanan</h2><p>Username dan password PPPoE dipakai untuk autentikasi RADIUS. Akun lokal router yang sudah ada tidak diubah.</p><form id="create-service" class="form-grid"><label>Pelanggan<select name="customerId" required><option value="">Pilih pelanggan</option>${customers.map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.customer_code)} · ${escapeHtml(customer.name)}</option>`).join('')}</select></label><label>Paket internet<select name="planId" data-service-plan-select required><option value="">Pilih paket</option>${planOptions()}</select></label>${agreementFields()}${routerSelect()}<label>Username PPPoE<input name="pppoeUsername" placeholder="customer-001" required maxlength="128"></label><label>Password PPPoE<input name="pppoePassword" type="password" autocomplete="new-password" required maxlength="200"></label><div class="form-actions span-two"><button class="button button-quiet" type="button" data-toggle="service-form">Batal</button><button class="button button-primary">Simpan layanan</button></div></form></div>`;
    const serviceAction = state.user.role !== 'admin' ? '' : editService
      ? '<button class="button button-quiet" data-cancel-service-edit>Batal edit</button>'
      : '<button class="button button-primary" data-toggle="service-form">＋ Tambah layanan</button>';
    const serviceActions = `<div class="heading-actions"><button class="button button-quiet" data-refresh-services>↻ Perbarui status</button>${serviceAction}</div>`;
    setPage('services', `${pageHeading('Layanan PPPoE', 'Pantau router, status koneksi, IP sesi, caller-id, dan uptime.', serviceActions)}${state.user.role === 'admin' ? form : ''}${routerNotice(serviceResult.router)}${dataTable(['USERNAME PPPoE', 'PELANGGAN', 'ROUTER', 'KONEKSI / IP', 'PAKET', 'KECEPATAN (DOWN/UP)', 'HARGA BULANAN', 'AKTIF SEJAK', 'STATUS LAYANAN', ...(state.user.role === 'admin' ? ['AKSI'] : [])], rows, 'Layanan yang aktif akan muncul di sini.')}`);
  }
  app.features.services.submit = submit;

  async function submit(ctx, form) {
    const { api, state, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast, showConfirmation, showPermanentConfirmation, submitForm, renderDashboard, renderCustomers, renderPlans, renderServices, renderInvoices, renderTickets, renderUsers, renderRouters, renderSettings } = ctx;
    if (form.id === 'create-service') return submitForm(form, async (data) => {
      ['downloadMbps', 'uploadMbps', 'monthlyPrice'].forEach((key) => {
        if (data[key] !== undefined) data[key] = Number(data[key]);
      });
      data.routerId = data.routerId || null;
      await api('/services', { method: 'POST', body: JSON.stringify(data) });
      showToast('Layanan berhasil dicatat.');
      await renderServices();
    });
    if (form.id === 'update-service') return submitForm(form, async (data) => {
      ['downloadMbps', 'uploadMbps', 'monthlyPrice'].forEach((key) => {
        if (data[key] !== undefined) data[key] = Number(data[key]);
      });
      data.routerId = data.routerId || null;
      if (!data.pppoePassword) delete data.pppoePassword;
      await api(`/services/${encodeURIComponent(form.dataset.recordId)}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      showToast('Paket layanan pelanggan berhasil diperbarui.');
      await renderServices();
    });
  }
  app.features.services.handleClick = handleClick;
  async function handleClick(ctx, event) {
    const { state, api, showToast, showConfirmation, showPermanentConfirmation, renderServices } = ctx;
    const refreshButton = event.target.closest('[data-refresh-services]');
    if (refreshButton) {
      refreshButton.disabled = true;
      try { await renderServices(null, true); showToast('Status koneksi pelanggan berhasil diperbarui.'); }
      catch (error) { showToast(error.message, true); }
      return;
    }
    const editButton = event.target.closest('[data-edit-service]');
    if (editButton) {
      const service = state.services.find((item) => item.id === editButton.dataset.editService);
      if (!service) return showToast('Layanan tidak ditemukan; muat ulang halaman.', true);
      return renderServices(service);
    }
    if (event.target.closest('[data-cancel-service-edit]')) return renderServices();
    const deleteButton = event.target.closest('[data-delete-service]');
    if (deleteButton) {
      const service = state.services.find((item) => item.id === deleteButton.dataset.deleteService);
      if (!service) return showToast('Layanan tidak ditemukan; muat ulang halaman.', true);
      return showConfirmation('Nonaktifkan layanan?', `Layanan ${service.pppoe_username} milik ${service.customer_name} akan dihentikan dan tidak menghasilkan tagihan baru. Tagihan serta riwayat sebelumnya tetap tersimpan.`, 'Ya, nonaktifkan layanan', async () => {
        try { await api(`/services/${encodeURIComponent(service.id)}`, { method: 'DELETE' }); showToast('Layanan berhasil dinonaktifkan.'); await renderServices(); }
        catch (error) { showToast(error.message, true); }
      });
    }
    const permanentButton = event.target.closest('[data-permanent-service]');
    if (!permanentButton) return;
    const service = state.services.find((item) => item.id === permanentButton.dataset.permanentService);
    if (!service) return showToast('Layanan tidak ditemukan; muat ulang halaman.', true);
    return showPermanentConfirmation('Hapus layanan PPPoE permanen?', `Layanan ${service.pppoe_username} milik ${service.customer_name} akan dihapus permanen. Penghapusan ditolak jika pelanggan ${service.customer_code} sudah memiliki tagihan. Jika ingin menghentikan layanan tanpa menghapus riwayat, gunakan Nonaktifkan.`, service.pppoe_username, 'Hapus layanan', async () => {
      try { await api(`/services/${encodeURIComponent(service.id)}/permanent`, { method: 'DELETE' }); showToast(`Layanan ${service.pppoe_username} berhasil dihapus.`); await renderServices(); }
      catch (error) { showToast(error.message, true); }
    });
  }
})();
