(() => {
  const tokenKey = 'orbitisp_token';
  const userKey = 'orbitisp_user';
  const labels = {
    dashboard: 'Ringkasan',
    customers: 'Pelanggan',
    plans: 'Paket internet',
    services: 'Layanan PPPoE',
    invoices: 'Tagihan',
    tickets: 'Tiket support',
    'installation-requests': 'Ajuan pemasangan',
    'trouble-reports': 'Laporan gangguan',
    users: 'Pengguna staf',
    routers: 'Router MikroTik',
    'settings-general': 'Pengaturan Umum',
    'settings-invoice': 'Invoice',
    'settings-email': 'Setting Email',
    'settings-whatsapp': 'Whatsapp API',
    'settings-api': 'Setting API',
    'settings-payment': 'Payment Gateway',
  };
  const settingsPages = {
    'settings-general': 'Informasi umum dan preferensi operasional aplikasi.',
    'settings-invoice': 'Rancangan invoice, identitas usaha, dan logo yang tampil pada tagihan.',
    'settings-email': 'Pengaturan email untuk pengiriman tagihan dan komunikasi layanan.',
    'settings-whatsapp': 'Pengaturan integrasi Whatsapp API untuk komunikasi pelanggan.',
    'settings-api': 'Pengelolaan konfigurasi dan akses API aplikasi.',
    'settings-payment': 'Pemilihan dan pengaturan payment gateway, seperti Xendit.',
  };
  const state = { token: sessionStorage.getItem(tokenKey), user: null, toastTimer: null, customers: [], plans: [], services: [], invoices: [], routers: [] };
  const loginScreen = document.getElementById('login-screen');
  const appShell = document.getElementById('app-shell');
  const pageContent = document.getElementById('page-content');
  const toast = document.getElementById('toast');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
    }).format(date);
  }

  function formatMonth(value) {
    if (!value) return '-';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat('id-ID', {
      month: 'short', year: '2-digit',
    }).format(date);
  }

  function statusBadge(status) {
    const statusLabels = {
      active: 'Aktif', suspended: 'Ditangguhkan', cancelled: 'Dibatalkan',
      pending: 'Menunggu', paid: 'Lunas', overdue: 'Terlambat',
      open: 'Terbuka', in_progress: 'Diproses', resolved: 'Selesai', closed: 'Ditutup',
      low: 'Rendah', normal: 'Normal', high: 'Tinggi', urgent: 'Urgent',
      connected: 'Terhubung', disconnected: 'Terputus', unknown: 'Belum diketahui',
    };
    return `<span class="badge badge-${escapeHtml(status)}">${escapeHtml(statusLabels[status] || status)}</span>`;
  }

  function routerNotice(router) {
    if (!router || router.status === 'connected') return '';
    const messages = {
      unconfigured: 'Koneksi MikroTik belum dikonfigurasi. Status dan IP pelanggan belum tersedia.',
      misconfigured: router.message || 'Konfigurasi koneksi MikroTik belum lengkap atau tidak valid.',
      unavailable: router.message || 'MikroTik tidak dapat dijangkau; status koneksi belum diketahui.',
      partial: router.message || 'Sebagian router MikroTik tidak dapat dijangkau.',
      partial: router.message || 'Sebagian router MikroTik tidak dapat dijangkau.',
    };
    const checkedAt = router.checkedAt
      ? ` Pemeriksaan: ${new Date(router.checkedAt).toLocaleString('id-ID')}.`
      : '';
    return `<div class="notice router-notice" role="status">${escapeHtml(messages[router.status] || messages.unavailable)}${escapeHtml(checkedAt)}</div>`;
  }

  function showToast(message, isError = false) {
    window.clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    state.toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3800);
  }

  async function api(path, options = {}) {
    const headers = {
      ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    let response;
    try {
      response = await fetch(`/api${path}`, { ...options, headers });
    } catch {
      throw new Error('Tidak dapat terhubung ke server. Pastikan backend sedang berjalan.');
    }
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== '/auth/login') {
      logout();
      throw new Error(payload.error || 'Sesi berakhir. Silakan masuk lagi.');
    }
    if (!response.ok) throw new Error(payload.error || `Permintaan gagal (${response.status})`);
    return payload;
  }

  function setAuthenticated(user) {
    state.user = user;
    loginScreen.classList.add('hidden');
    appShell.classList.remove('hidden');
    document.getElementById('user-name').textContent = user.name;
    document.getElementById('user-role').textContent = user.role === 'admin' ? 'Administrator' : 'Staf';
    document.getElementById('user-avatar').textContent = (user.name || 'U').trim().charAt(0).toUpperCase();
    document.querySelectorAll('.admin-only').forEach((element) => {
      element.classList.toggle('hidden', user.role !== 'admin');
    });
    navigate('dashboard');
  }

  function logout() {
    state.token = null;
    state.user = null;
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(userKey);
    appShell.classList.add('hidden');
    loginScreen.classList.remove('hidden');
  }

  function pageHeading(title, description, action = '') {
    return `<div class="page-heading"><div><p class="eyebrow-small">ISP OPERATIONS</p><h1>${title}</h1><p>${description}</p></div>${action ? `<div class="heading-actions">${action}</div>` : ''}</div>`;
  }

  function dataTable(headers, rows, emptyText = 'Belum ada data untuk ditampilkan.') {
    return `<div class="content-card table-card"><div class="table-scroll"><table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}"><div class="empty-state"><strong>Data masih kosong</strong>${emptyText}</div></td></tr>`}</tbody></table></div></div>`;
  }

  function setPage(page, html) {
    document.getElementById('page-breadcrumb').textContent = labels[page] || 'Ringkasan';
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
    const settingsSubmenu = document.getElementById('settings-submenu');
    const settingsToggle = document.querySelector('.settings-toggle');
    const isSettingsPage = Object.hasOwn(settingsPages, page);
    settingsSubmenu.classList.toggle('hidden', !isSettingsPage && settingsSubmenu.dataset.open !== 'true');
    settingsToggle.classList.toggle('active', isSettingsPage);
    settingsToggle.setAttribute('aria-expanded', String(isSettingsPage || settingsSubmenu.dataset.open === 'true'));
    pageContent.innerHTML = html;
  }


  const app = window.InstaLinkAdmin || (window.InstaLinkAdmin = { features: {} });
  app.features = app.features || {};
  const ctx = { state, labels, settingsPages, api, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast, showConfirmation, showPermanentConfirmation, submitForm, formObject, pageContent };
  const renderDashboard = (...args) => app.features.dashboard.renderDashboard(ctx, ...args);
  const renderCustomers = (...args) => app.features.customers.renderCustomers(ctx, ...args);
  const renderPlans = (...args) => app.features.plans.renderPlans(ctx, ...args);
  const renderServices = (...args) => app.features.services.renderServices(ctx, ...args);
  const renderInvoices = (...args) => app.features.invoices.renderInvoices(ctx, ...args);
  const renderTickets = (...args) => app.features.tickets.renderTickets(ctx, ...args);
  const renderInstallationRequests = (...args) => app.features.requests.renderInstallationRequests(ctx, ...args);
  const renderTroubleReports = (...args) => app.features.requests.renderTroubleReports(ctx, ...args);
  const renderUsers = (...args) => app.features.users.renderUsers(ctx, ...args);
  const renderRouters = (...args) => app.features.routers.renderRouters(ctx, ...args);
  const renderSettings = (...args) => app.features.settings.renderSettings(ctx, ...args);
  Object.assign(ctx, { renderDashboard, renderCustomers, renderPlans, renderServices, renderInvoices, renderTickets, renderInstallationRequests, renderTroubleReports, renderUsers, renderRouters, renderSettings, navigate });

  async function navigate(page) {
    if ((['users', 'routers'].includes(page) || Object.hasOwn(settingsPages, page))
      && state.user?.role !== 'admin') {
      showToast('Halaman ini hanya tersedia untuk admin.', true);
      return;
    }
    document.querySelector('.sidebar').classList.remove('open');
    try {
      if (page === 'dashboard') return await renderDashboard();
      if (page === 'customers') return await renderCustomers();
      if (page === 'plans') return await renderPlans();
      if (page === 'services') return await renderServices();
      if (page === 'invoices') return await renderInvoices();
      if (page === 'tickets') return await renderTickets();
      if (page === 'installation-requests') return await renderInstallationRequests();
      if (page === 'trouble-reports') return await renderTroubleReports();
      if (page === 'users') return await renderUsers();
      if (page === 'routers') return await renderRouters();
      if (Object.hasOwn(settingsPages, page)) return renderSettings(page);
    } catch (error) {
      showToast(error.message, true);
      setPage(page, `${pageHeading(labels[page] || 'Dashboard', 'Terjadi kesalahan saat memuat data.')}<div class="content-card"><div class="empty-state"><strong>Data tidak dapat dimuat</strong>${escapeHtml(error.message)}</div></div>`);
    }
  }

  function showConfirmation(title, description, confirmLabel, onConfirm) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="confirm-box" role="dialog" aria-modal="true"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p><div class="form-actions"><button class="button button-quiet" data-cancel>Batalkan</button><button class="button button-primary" data-confirm>${escapeHtml(confirmLabel)}</button></div></div>`;
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop || event.target.closest('[data-cancel]')) backdrop.remove();
      if (event.target.closest('[data-confirm]')) {
        backdrop.remove();
        onConfirm();
      }
    });
    document.body.append(backdrop);
  }

  function showPermanentConfirmation(title, description, confirmationCode, confirmLabel, onConfirm) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="confirm-box" role="dialog" aria-modal="true" aria-labelledby="permanent-title">
      <h2 id="permanent-title">${escapeHtml(title)}</h2>
      <p>${escapeHtml(description)}</p>
      <label>Ketik <code>${escapeHtml(confirmationCode)}</code> untuk mengonfirmasi
        <input data-confirmation-input autocomplete="off" spellcheck="false" aria-label="Ketik kode konfirmasi">
      </label>
      <div class="form-actions">
        <button class="button button-quiet" data-cancel>Batalkan</button>
        <button class="button button-danger" data-confirm disabled>${escapeHtml(confirmLabel)}</button>
      </div>
    </div>`;
    const input = backdrop.querySelector('[data-confirmation-input]');
    const confirm = backdrop.querySelector('[data-confirm]');
    input.addEventListener('input', () => {
      confirm.disabled = input.value.trim() !== confirmationCode;
    });
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop || event.target.closest('[data-cancel]')) backdrop.remove();
      if (event.target.closest('[data-confirm]') && !confirm.disabled) {
        backdrop.remove();
        onConfirm();
      }
    });
    document.body.append(backdrop);
    input.focus();
  }

  function formObject(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  async function submitForm(form, action) {
    const button = form.querySelector('button[type="submit"], button:not([type])');
    if (button) button.disabled = true;
    try {
      await action(formObject(form));
    } catch (error) {
      showToast(error.message, true);
      if (button) button.disabled = false;
    }
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    if (form.id === 'login-form') {
      const data = formObject(form);
      const errorBox = document.getElementById('login-error');
      errorBox.textContent = '';
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const result = await api('/auth/login', { method: 'POST', body: JSON.stringify(data) });
        state.token = result.token;
        sessionStorage.setItem(tokenKey, result.token);
        sessionStorage.setItem(userKey, JSON.stringify(result.user));
        setAuthenticated(result.user);
      } catch (error) {
        errorBox.textContent = error.message;
      } finally {
        button.disabled = false;
      }
      return;
    }
    const owners = {
      'update-general-settings': 'settings', 'update-invoice-design': 'settings',
      'create-customer': 'customers', 'update-customer': 'customers',
      'create-plan': 'plans', 'update-plan': 'plans', 'create-service': 'services',
      'update-service': 'services', 'generate-invoices': 'invoices', 'create-ticket': 'tickets',
      'request-followup-form': 'requests',
      'create-user': 'users', 'create-router': 'routers', 'update-router': 'routers',
    };
    const feature = form.matches('.request-followup-form')
      ? app.features.requests
      : app.features[owners[form.id]];
    if (feature?.submit) return feature.submit(ctx, form);
  }


  pageContent.addEventListener('submit', handleSubmit);
  app.features.actions.bind(ctx);
  app.features.interactions.bind(ctx);

  pageContent.addEventListener('input', (event) => {
    if (event.target.id !== 'customer-search') return;
    window.clearTimeout(state.searchTimer);
    const search = event.target.value;
    state.searchTimer = window.setTimeout(() => renderCustomers(search).catch((error) => showToast(error.message, true)), 250);
  });

  document.getElementById('login-form').addEventListener('submit', handleSubmit);
  document.getElementById('logout-button').addEventListener('click', logout);
  document.getElementById('mobile-menu').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
  document.querySelector('.main-nav').addEventListener('click', (event) => {
    const settingsToggle = event.target.closest('.settings-toggle');
    if (settingsToggle) {
      const submenu = document.getElementById('settings-submenu');
      const isOpen = submenu.dataset.open === 'true';
      submenu.dataset.open = String(!isOpen);
      submenu.classList.toggle('hidden', isOpen);
      settingsToggle.setAttribute('aria-expanded', String(!isOpen));
      return;
    }
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) navigate(pageButton.dataset.page);
  });

  if (state.token) {
    try {
      const user = JSON.parse(sessionStorage.getItem(userKey) || 'null');
      if (user && ['admin', 'staff'].includes(user.role)) setAuthenticated(user);
      else logout();
    } catch {
      logout();
    }
  }
})();
