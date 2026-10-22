(() => {
  const app = window.InstaLinkAdmin || (window.InstaLinkAdmin = { features: {} });
  app.features.users = { renderUsers };

  async function renderUsers(ctx) {
    const { api, state, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast } = ctx;
    const result = await api('/users');
    const rows = result.data.map((user) => `<tr><td><strong>${escapeHtml(user.name)}</strong></td><td>${escapeHtml(user.email)}</td><td>${user.role === 'admin' ? '<span class="badge badge-active">Admin</span>' : '<span class="badge">Staf</span>'}</td><td>${formatDate(user.created_at)}</td></tr>`).join('');
    setPage('users', `${pageHeading('Pengguna staf', 'Atur akun dan akses untuk anggota tim.', '<button class="button button-primary" data-toggle="user-form">＋ Tambah pengguna</button>')}
      <div id="user-form" class="content-card inline-create" hidden><h2>Buat akun staf</h2><p>Password minimal 12 karakter. Akses admin dapat mengelola paket, layanan, tagihan, dan akun staf.</p><form id="create-user" class="form-grid"><label>Nama lengkap<input name="name" required maxlength="120"></label><label>Email<input name="email" type="email" required maxlength="255"></label><label>Password<input name="password" type="password" minlength="12" maxlength="200" autocomplete="new-password" required></label><label>Role<select name="role"><option value="staff">Staf</option><option value="admin">Admin</option></select></label><div class="form-actions span-two"><button class="button button-quiet" type="button" data-toggle="user-form">Batal</button><button class="button button-primary">Buat akun</button></div></form></div>
      ${dataTable(['NAMA', 'EMAIL', 'ROLE', 'DIBUAT'], rows, 'Belum ada pengguna staf.')}`);
  }
  app.features.users.submit = submit;

  async function submit(ctx, form) {
    const { api, state, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast, showConfirmation, showPermanentConfirmation, submitForm, renderDashboard, renderCustomers, renderPlans, renderServices, renderInvoices, renderTickets, renderUsers, renderRouters, renderSettings } = ctx;
    if (form.id === 'create-user') return submitForm(form, async (data) => {
      await api('/users', { method: 'POST', body: JSON.stringify(data) });
      showToast('Akun staf berhasil dibuat.');
      await renderUsers();
    });
  }
})();
