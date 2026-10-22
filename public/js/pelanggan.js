(() => {
  const app = window.InstaLinkAdmin || (window.InstaLinkAdmin = { features: {} });
  app.features.customers = { renderCustomers };

  async function renderCustomers(ctx, search = '', editCustomer = null) {
    const { api, state, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast } = ctx;
    const result = await api(`/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`);
    state.customers = result.data;
    const connectionCell = (customer) => {
      if (!customer.connections.length) return '<span class="cell-sub">Belum ada layanan PPPoE</span>';
      return customer.connections.map((connection) => `<div class="connection-summary">${statusBadge(connection.status)}<span class="cell-sub">${escapeHtml(connection.pppoeUsername)}${connection.ipAddress ? ` · ${escapeHtml(connection.ipAddress)}` : ''}</span></div>`).join('');
    };
    const rows = result.data.map((customer) => `<tr><td><strong>${escapeHtml(customer.customer_code)}</strong></td><td><strong>${escapeHtml(customer.name)}</strong><span class="cell-sub">${escapeHtml(customer.email || 'Email belum diisi')}</span></td><td>${escapeHtml(customer.phone)}</td><td>${escapeHtml(customer.address)}</td><td>${connectionCell(customer)}</td><td>Tgl. ${escapeHtml(customer.billing_day)}</td><td>${statusBadge(customer.status)}</td><td><div class="row-actions"><button class="small-button" data-edit-customer="${escapeHtml(customer.id)}">Edit</button>${state.user.role === 'admin' && customer.status === 'cancelled' ? `<button class="small-button" data-reactivate-customer="${escapeHtml(customer.id)}">Aktifkan kembali</button>` : ''}${state.user.role === 'admin' && customer.status !== 'cancelled' ? `<button class="small-button small-button-danger" data-delete-customer="${escapeHtml(customer.id)}">Nonaktifkan</button>` : ''}${state.user.role === 'admin' ? `<button class="small-button small-button-permanent" data-permanent-customer="${escapeHtml(customer.id)}">Hapus permanen</button>` : ''}</div></td></tr>`).join('');
    const form = editCustomer
      ? `<div id="customer-edit-form" class="content-card inline-create"><h2>Edit data pelanggan</h2><p>Perbarui informasi kontak dan penagihan pelanggan.</p><form id="update-customer" class="form-grid" data-record-id="${escapeHtml(editCustomer.id)}">
          <label>Kode pelanggan<input name="customerCode" value="${escapeHtml(editCustomer.customer_code)}" required maxlength="32"></label>
          <label>Nama lengkap<input name="name" value="${escapeHtml(editCustomer.name)}" required maxlength="160"></label>
          <label>Email (opsional)<input name="email" type="email" value="${escapeHtml(editCustomer.email || '')}" placeholder="pelanggan@email.id"></label>
          <label>Nomor telepon<input name="phone" value="${escapeHtml(editCustomer.phone)}" required maxlength="32"></label>
          <label>Alamat lengkap<input name="address" value="${escapeHtml(editCustomer.address)}" required maxlength="2000"></label>
          <label>Tanggal tagihan<input name="billingDay" type="number" min="1" max="28" value="${escapeHtml(editCustomer.billing_day)}" required></label>
          <div class="form-actions span-two"><button class="button button-quiet" type="button" data-cancel-customer-edit>Batal</button><button class="button button-primary">Simpan perubahan</button></div>
        </form></div>`
      : `<div id="customer-form" class="content-card inline-create" hidden>
        <h2>Daftarkan pelanggan</h2><p>Lengkapi informasi dasar dan jadwal penagihan.</p>
        <form id="create-customer" class="form-grid">
          <label>Kode pelanggan<input name="customerCode" placeholder="CUST-0001" required maxlength="32"></label>
          <label>Nama lengkap<input name="name" placeholder="Nama pelanggan" required maxlength="160"></label>
          <label>Email (opsional)<input name="email" type="email" placeholder="pelanggan@email.id"></label>
          <label>Nomor telepon<input name="phone" placeholder="08xxxxxxxxxx" required maxlength="32"></label>
          <label>Alamat lengkap<input name="address" placeholder="Alamat instalasi" required maxlength="2000"></label>
          <label>Tanggal tagihan<input name="billingDay" type="number" min="1" max="28" value="10" required></label>
          <div class="form-actions span-two"><button class="button button-quiet" type="button" data-toggle="customer-form">Batal</button><button class="button button-primary">Simpan pelanggan</button></div>
        </form>
      </div>`;
    const customerAction = editCustomer
      ? '<button class="button button-quiet" data-cancel-customer-edit>Batal edit</button>'
      : '<button class="button button-primary" data-toggle="customer-form">＋ Pelanggan baru</button>';
    setPage('customers', `${pageHeading('Pelanggan', 'Kelola data pelanggan dan informasi penagihan.', customerAction)}
      ${form}
      ${routerNotice(result.router)}
      <div class="content-card table-card"><div class="table-toolbar"><input id="customer-search" class="search-input" placeholder="Cari nama atau kode pelanggan..." value="${escapeHtml(search)}"><span class="cell-sub">${result.data.length} pelanggan ditampilkan (maks. 100)</span></div><div class="table-scroll"><table><thead><tr><th>KODE</th><th>PELANGGAN</th><th>TELEPON</th><th>ALAMAT</th><th>KONEKSI / IP</th><th>PENAGIHAN</th><th>STATUS</th><th>AKSI</th></tr></thead><tbody>${rows || '<tr><td colspan="8"><div class="empty-state"><strong>Belum ada pelanggan</strong>Tambah data pelanggan untuk memulai.</div></td></tr>'}</tbody></table></div></div>`);
  }
  app.features.customers.submit = submit;

  async function submit(ctx, form) {
    const { api, state, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast, showConfirmation, showPermanentConfirmation, submitForm, renderDashboard, renderCustomers, renderPlans, renderServices, renderInvoices, renderTickets, renderUsers, renderRouters, renderSettings } = ctx;
    if (form.id === 'create-customer') return submitForm(form, async (data) => {
      data.billingDay = Number(data.billingDay);
      if (!data.email) delete data.email;
      await api('/customers', { method: 'POST', body: JSON.stringify(data) });
      showToast('Pelanggan berhasil ditambahkan.');
      await renderCustomers();
    });
    if (form.id === 'update-customer') return submitForm(form, async (data) => {
      data.billingDay = Number(data.billingDay);
      data.email = data.email || null;
      await api(`/customers/${encodeURIComponent(form.dataset.recordId)}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      showToast('Data pelanggan berhasil diperbarui.');
      const search = document.getElementById('customer-search')?.value || '';
      await renderCustomers(search);
    });
  }
  app.features.customers.handleClick = handleClick;

  async function handleClick(ctx, event) {
    const { state, api, showToast, showConfirmation, showPermanentConfirmation, renderCustomers } = ctx;
    const editCustomer = event.target.closest('[data-edit-customer]');
      if (editCustomer) {
        const customer = state.customers.find((item) => item.id === editCustomer.dataset.editCustomer);
        if (!customer) return showToast('Data pelanggan tidak ditemukan; muat ulang halaman.', true);
        return renderCustomers(document.getElementById('customer-search')?.value || '', customer);
      }

      if (event.target.closest('[data-cancel-customer-edit]')) {
        return renderCustomers(document.getElementById('customer-search')?.value || '');
      }

      const reactivateCustomer = event.target.closest('[data-reactivate-customer]');
      if (reactivateCustomer) {
        const customer = state.customers.find((item) => item.id === reactivateCustomer.dataset.reactivateCustomer);
        if (!customer) return showToast('Data pelanggan tidak ditemukan; muat ulang halaman.', true);
        return showConfirmation(
          'Aktifkan kembali pelanggan?',
          `Pelanggan ${customer.customer_code} · ${customer.name} akan diaktifkan kembali. Layanan lama tetap dibatalkan untuk menjaga riwayat; tambahkan layanan baru secara terpisah agar mulai ditagih kembali.`,
          'Aktifkan pelanggan',
          async () => {
            try {
              await api(`/customers/${encodeURIComponent(customer.id)}/activation`, { method: 'PATCH' });
              showToast('Pelanggan aktif kembali. Tambahkan layanan baru di halaman Layanan PPPoE untuk memulai langganan.');
              await renderCustomers(document.getElementById('customer-search')?.value || '');
            } catch (error) {
              showToast(error.message, true);
            }
          },
        );
      }

  
    const deleteCustomer = event.target.closest('[data-delete-customer]');
      if (deleteCustomer) {
        const customer = state.customers.find((item) => item.id === deleteCustomer.dataset.deleteCustomer);
        if (!customer) return showToast('Data pelanggan tidak ditemukan; muat ulang halaman.', true);
        return showConfirmation(
          'Nonaktifkan pelanggan?',
          `Pelanggan ${customer.customer_code} · ${customer.name} dan layanan aktifnya akan dinonaktifkan. Tagihan serta riwayat tetap tersimpan; tidak ada tagihan baru setelah ini.`,
          'Ya, nonaktifkan',
          async () => {
            try {
              await api(`/customers/${encodeURIComponent(customer.id)}`, { method: 'DELETE' });
              showToast('Pelanggan dan layanan aktifnya berhasil dinonaktifkan.');
              await renderCustomers(document.getElementById('customer-search')?.value || '');
            } catch (error) {
              showToast(error.message, true);
            }
          },
        );
      }

  
    const permanentCustomer = event.target.closest('[data-permanent-customer]');
      if (permanentCustomer) {
        const customer = state.customers.find((item) => item.id === permanentCustomer.dataset.permanentCustomer);
        if (!customer) return showToast('Data pelanggan tidak ditemukan; muat ulang halaman.', true);
        return showPermanentConfirmation(
          'Hapus pelanggan dan data uji terkait?',
          `Tindakan ini permanen. Pelanggan ${customer.name}, seluruh layanan, tiket, tagihan yang belum lunas, dan payment record terkait akan dihapus. Tidak dapat dibatalkan. Jika pelanggan memiliki tagihan lunas atau payment link Xendit aktif, penghapusan akan ditolak.`,
          customer.customer_code,
          'Hapus seluruh data',
          async () => {
            try {
              const result = await api(`/customers/${encodeURIComponent(customer.id)}/permanent`, { method: 'DELETE' });
              showToast(`Pelanggan dihapus. Layanan: ${result.data.deletedServices}, tiket: ${result.data.deletedTickets}, tagihan: ${result.data.deletedInvoices}.`);
              await renderCustomers(document.getElementById('customer-search')?.value || '');
            } catch (error) {
              showToast(error.message, true);
            }
          },
        );
      }

  
  }
})();
