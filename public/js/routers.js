(() => {
  const app = window.InstaLinkAdmin || (window.InstaLinkAdmin = { features: {} });
  app.features.routers = { renderRouters };

  async function renderRouters(ctx, editRouter = null, scriptText = null, accountingSessions = null) {
    const { api, state, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast } = ctx;
    const result = await api('/routers');
    state.routers = result.data;
    state.radius = result.radius;
    const rows = result.data.map((router) => `<tr>
      <td><strong>${escapeHtml(router.name)}</strong><span class="cell-sub">${escapeHtml(router.host)}:${escapeHtml(router.port)}</span></td>
      <td>${escapeHtml(router.username)}</td>
      <td>${router.use_tls ? 'API-SSL' : 'API tanpa TLS'}<span class="cell-sub">Timeout ${escapeHtml(router.timeout_seconds)} detik</span></td>
      <td>${statusBadge(router.is_active ? 'active' : 'cancelled')}</td>
      <td><div class="row-actions">
        <button class="small-button" data-test-router="${escapeHtml(router.id)}">Tes koneksi</button>
        <button class="small-button" data-router-script="${escapeHtml(router.id)}">Buat script</button>
        <button class="small-button" data-router-sessions="${escapeHtml(router.id)}">Accounting</button>
        <button class="small-button" data-edit-router="${escapeHtml(router.id)}">Edit</button>
        <button class="small-button small-button-danger" data-toggle-router="${escapeHtml(router.id)}" data-active="${router.is_active}">${router.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
        <button class="small-button small-button-permanent" data-delete-router="${escapeHtml(router.id)}">Hapus</button>
      </div></td>
    </tr>`).join('');
    const value = (key, fallback = '') => escapeHtml(editRouter?.[key] ?? fallback);
    const form = `<div id="router-form" class="content-card inline-create"${editRouter ? '' : ' hidden'}>
      <h2>${editRouter ? 'Ubah konfigurasi router' : 'Tambah router MikroTik'}</h2>
      <p>Kredensial disimpan terenkripsi. Gunakan akun RouterOS khusus baca-saja. Autentikasi PPPoE RADIUS mendukung PAP dan CHAP; akun lokal router yang sudah ada tidak dihapus.</p>
      <form id="${editRouter ? 'update-router' : 'create-router'}" class="form-grid"${editRouter ? ` data-record-id="${escapeHtml(editRouter.id)}"` : ''}>
        <label>Nama router<input name="name" value="${value('name')}" required maxlength="120" placeholder="Router Sumedang"></label>
        <label>Host / alamat IP<input name="host" value="${value('host')}" required maxlength="255" placeholder="192.168.88.1"></label>
        <label>Port API<input name="port" type="number" min="1" max="65535" value="${value('port', '8729')}" required></label>
        <label>Username API<input name="username" value="${value('username')}" required maxlength="128" autocomplete="username"></label>
        <label>Password API<input name="password" type="password" maxlength="200" autocomplete="new-password" ${editRouter ? 'placeholder="Kosongkan untuk tetap memakai password tersimpan"' : 'required'}></label>
        <label>Keamanan koneksi<select name="useTls"><option value="true" ${!editRouter || editRouter.use_tls ? 'selected' : ''}>TLS / API-SSL</option><option value="false" ${editRouter && !editRouter.use_tls ? 'selected' : ''}>Tanpa TLS (jaringan privat/VPN saja)</option></select></label>
        <label>Timeout (detik)<input name="timeoutSeconds" type="number" min="1" max="30" value="${value('timeout_seconds', '5')}" required></label>
        <label>IP server RADIUS yang dapat dijangkau router<input name="radiusServerAddress" value="${value('radius_server_address')}" required maxlength="255" placeholder="IP publik atau IP VPN backend"></label>
        <label>IP sumber router ke RADIUS<input name="radiusClientAddress" value="${value('radius_client_address', editRouter?.host || '')}" required maxlength="45" placeholder="IP yang terlihat dari server"></label>
        <label>Port autentikasi RADIUS<input name="radiusAuthPort" type="number" min="1" max="65535" value="${value('radius_auth_port', state.radius.authPort)}" required></label>
        <label>Port accounting RADIUS<input name="radiusAccountingPort" type="number" min="1" max="65535" value="${value('radius_accounting_port', state.radius.accountingPort)}" required></label>
        <label>Shared secret RADIUS<input name="radiusSecret" type="password" minlength="16" maxlength="200" autocomplete="new-password" ${editRouter ? 'placeholder="Kosongkan untuk tetap memakai secret tersimpan"' : 'required'}></label>
        <label>Zona waktu router<input name="timezoneName" value="${value('timezone_name', 'Asia/Jakarta')}" required maxlength="100" placeholder="Asia/Jakarta"></label>
        <label class="span-two">URL informasi isolir (opsional)<input name="isolationInfoUrl" type="url" value="${value('isolation_info_url')}" maxlength="500" placeholder="https://billing.example.id/isolir"></label>
        <div class="form-actions span-two">
          <button class="button button-quiet" type="button" data-cancel-router-form>${editRouter ? 'Batal edit' : 'Batal'}</button>
          <button class="button button-primary">${editRouter ? 'Simpan perubahan' : 'Simpan router'}</button>
        </div>
      </form>
    </div>`;
    const actions = editRouter
      ? '<button class="button button-quiet" data-cancel-router-form>Batal edit</button>'
      : '<button class="button button-primary" data-toggle="router-form">＋ Tambah router</button>';
    setPage('routers', `${pageHeading('Router MikroTik', 'Tambahkan router, uji koneksi API, dan kaitkan layanan PPPoE ke router yang melayaninya.', actions)}
      <div class="notice router-notice">${state.radius.enabled ? `Server RADIUS aktif pada UDP ${escapeHtml(state.radius.authPort)} (authentication) dan ${escapeHtml(state.radius.accountingPort)} (accounting).` : `RADIUS belum aktif. Atur RADIUS_ENABLED=true dan buka UDP ${escapeHtml(state.radius.authPort)}/${escapeHtml(state.radius.accountingPort)} di server sebelum menjalankan script.`} Siapkan MIKROTIK_ENCRYPTION_KEY. Password router dan shared secret disimpan terenkripsi. Jangan membuka API router ke internet publik.</div>
      ${form}
      ${scriptText ? `<div class="content-card inline-create"><h2>Script konfigurasi RouterOS</h2><p>Tinjau dahulu sebelum ditempel ke terminal MikroTik. Script memuat kredensial dan shared secret RADIUS; bagikan hanya melalui kanal aman.</p><label>Script<textarea id="router-config-script" rows="14" readonly>${escapeHtml(scriptText)}</textarea></label><div class="form-actions"><button class="button button-primary" data-copy-router-script>Salin script</button><button class="button button-quiet" data-dismiss-router-script>Tutup script</button></div></div>` : ''}
      ${accountingSessions ? dataTable(['SESI', 'PELANGGAN / USERNAME', 'IP', 'STATUS', 'MULAI / UPDATE', 'DURASI', 'DATA MASUK / KELUAR'], accountingSessions.map((session) => `<tr><td>${escapeHtml(session.accounting_session_id)}</td><td>${escapeHtml(session.username)}</td><td>${escapeHtml(session.framed_ip_address || '—')}</td><td>${statusBadge(session.status === 'active' ? 'connected' : 'disconnected')}</td><td>${formatDate(session.started_at)}<span class="cell-sub">Update ${formatDate(session.last_accounting_at)}</span></td><td>${escapeHtml(session.session_seconds ?? '—')} detik</td><td>${escapeHtml(session.input_octets ?? '—')} / ${escapeHtml(session.output_octets ?? '—')} byte</td></tr>`).join(''), 'Belum ada paket accounting RADIUS untuk router ini.') : ''}
      ${dataTable(['NAMA / HOST', 'AKUN API', 'KONEKSI', 'STATUS', 'AKSI'], rows, 'Belum ada router MikroTik. Tambahkan router untuk menghubungkannya.')}`);
  }
  app.features.routers.submit = submit;

  async function submit(ctx, form) {
    const { api, state, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast, showConfirmation, showPermanentConfirmation, submitForm, renderDashboard, renderCustomers, renderPlans, renderServices, renderInvoices, renderTickets, renderUsers, renderRouters, renderSettings } = ctx;
    if (form.id === 'create-router' || form.id === 'update-router') return submitForm(form, async (data) => {
      ['port', 'timeoutSeconds', 'radiusAuthPort', 'radiusAccountingPort']
        .forEach((key) => { data[key] = Number(data[key]); });
      data.useTls = data.useTls === 'true';
      if (!data.password) delete data.password;
      if (!data.radiusSecret) delete data.radiusSecret;
      const update = form.id === 'update-router';
      await api(update ? `/routers/${encodeURIComponent(form.dataset.recordId)}` : '/routers', {
        method: update ? 'PATCH' : 'POST',
        body: JSON.stringify(data),
      });
      showToast(update ? 'Konfigurasi router berhasil diperbarui.' : 'Router MikroTik berhasil ditambahkan.');
      await renderRouters();
    });
  }
  app.features.routers.handleClick = handleClick;
  async function handleClick(ctx, event) {
    const { state, api, showToast, showConfirmation, renderRouters } = ctx;
    if (event.target.closest('[data-cancel-router-form]') || event.target.closest('[data-dismiss-router-script]')) return renderRouters();
    const copyButton = event.target.closest('[data-copy-router-script]');
    if (copyButton) {
      const script = document.getElementById('router-config-script');
      try { await navigator.clipboard.writeText(script.value); showToast('Script konfigurasi disalin. Jaga kerahasiaan kredensial di dalamnya.'); }
      catch { script.focus(); script.select(); showToast('Clipboard tidak tersedia. Script sudah dipilih; salin secara manual.', true); }
      return;
    }
    const editButton = event.target.closest('[data-edit-router]');
    if (editButton) {
      const router = state.routers.find((item) => item.id === editButton.dataset.editRouter);
      if (!router) return showToast('Router tidak ditemukan; muat ulang halaman.', true);
      return renderRouters(router);
    }
    const testButton = event.target.closest('[data-test-router]');
    if (testButton) {
      testButton.disabled = true;
      try {
        const result = await api(`/routers/${encodeURIComponent(testButton.dataset.testRouter)}/test`, { method: 'POST' });
        if (result.data.status === 'connected') showToast('Koneksi router berhasil; sesi PPPoE dapat dibaca.');
        else showToast(result.data.message || 'Router tidak dapat dijangkau.', true);
        await renderRouters();
      } catch (error) { showToast(error.message, true); testButton.disabled = false; }
      const scriptButton = event.target.closest('[data-router-script]');
      if (scriptButton) {
        scriptButton.disabled = true;
        try { const result = await api(`/routers/${encodeURIComponent(scriptButton.dataset.routerScript)}/script`, { method: 'POST' }); await renderRouters(null, result.data.script); showToast(`Script siap. RADIUS menggunakan UDP ${result.data.authPort}/${result.data.accountingPort}.`); }
        catch (error) { showToast(error.message, true); scriptButton.disabled = false; }
        return;
      }
      const sessionsButton = event.target.closest('[data-router-sessions]');
      if (sessionsButton) {
        sessionsButton.disabled = true;
        try { const result = await api(`/routers/${encodeURIComponent(sessionsButton.dataset.routerSessions)}/sessions`); await renderRouters(null, null, result.data); }
        catch (error) { showToast(error.message, true); sessionsButton.disabled = false; }
        return;
      }
      return;
    }
    const toggleButton = event.target.closest('[data-toggle-router]');
    if (toggleButton) {
      try { await api(`/routers/${encodeURIComponent(toggleButton.dataset.toggleRouter)}`, { method: 'PATCH', body: JSON.stringify({ isActive: toggleButton.dataset.active !== 'true' }) }); showToast(toggleButton.dataset.active === 'true' ? 'Router dinonaktifkan.' : 'Router diaktifkan.'); await renderRouters(); }
      catch (error) { showToast(error.message, true); }
      return;
    }
    const deleteButton = event.target.closest('[data-delete-router]');
    if (!deleteButton) return;
    const router = state.routers.find((item) => item.id === deleteButton.dataset.deleteRouter);
    if (!router) return showToast('Router tidak ditemukan; muat ulang halaman.', true);
    return showConfirmation('Hapus konfigurasi router?', `Konfigurasi ${router.name} akan dihapus. Layanan PPPoE aktif harus dipindahkan terlebih dahulu; riwayat layanan yang sudah dibatalkan tetap tersimpan.`, 'Hapus router', async () => {
      try { await api(`/routers/${encodeURIComponent(router.id)}`, { method: 'DELETE' }); showToast('Konfigurasi router berhasil dihapus.'); await renderRouters(); }
      catch (error) { showToast(error.message, true); }
    });
  }
})();
