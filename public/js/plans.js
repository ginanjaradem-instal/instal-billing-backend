(() => {
  const app = window.InstaLinkAdmin || (window.InstaLinkAdmin = { features: {} });
  app.features.plans = { renderPlans };

  async function renderPlans(ctx, editPlan = null) {
    const { api, state, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast } = ctx;
    const result = await api('/plans');
    state.plans = result.data;
    const planTypeLabels = { standard: 'Reguler', oho: 'OHO', dedicated: 'Dedicated' };
    const rows = result.data.map((plan) => {
      const negotiated = plan.pricing_mode === 'negotiated';
      const speed = `${escapeHtml(plan.download_mbps)} / ${escapeHtml(plan.upload_mbps)} Mbps${negotiated ? `<span class="cell-sub">Rasio ${escapeHtml(plan.contention_ratio)}</span>` : ''}`;
      const price = negotiated ? 'Sesuai kesepakatan' : formatMoney(plan.monthly_price);
      return `<tr><td><strong>${escapeHtml(plan.name)}</strong></td><td>${escapeHtml(planTypeLabels[plan.plan_type] || plan.plan_type)}</td><td>${speed}</td><td><strong>${price}</strong></td><td>${plan.is_active ? statusBadge('active') : '<span class="badge badge-inactive">Nonaktif</span>'}</td>${state.user.role === 'admin' ? `<td><div class="row-actions"><button class="small-button" data-edit-plan="${escapeHtml(plan.id)}">Edit</button><button class="small-button ${plan.is_active ? 'small-button-danger' : ''}" data-toggle-plan-activation="${escapeHtml(plan.id)}">${plan.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button><button class="small-button small-button-permanent" data-permanent-plan="${escapeHtml(plan.id)}">Hapus permanen</button></div></td>` : ''}</tr>`;
    }).join('');
    const planInputs = (plan, editing) => {
      const negotiated = plan?.pricing_mode === 'negotiated';
      return `<div class="form-grid span-two" data-plan-fields ${negotiated ? 'hidden' : ''}>
        <label>Harga bulanan (Rp)<input name="monthlyPrice" type="number" min="0" step="1" value="${escapeHtml(plan?.monthly_price ?? '')}" placeholder="250000" ${negotiated ? 'disabled' : 'required'}></label>
        <label>Kecepatan download (Mbps)<input name="downloadMbps" type="number" min="1" value="${escapeHtml(plan?.download_mbps ?? '')}" ${negotiated ? 'disabled' : 'required'}></label>
        <label>Kecepatan upload (Mbps)<input name="uploadMbps" type="number" min="1" value="${escapeHtml(plan?.upload_mbps ?? '')}" ${negotiated ? 'disabled' : 'required'}></label>
      </div>${editing && negotiated ? '<p class="span-two">Harga bulanan dan kecepatan ditetapkan untuk setiap layanan pelanggan.</p>' : ''}`;
    };
    const planForm = editPlan
      ? `<div id="plan-edit-form" class="content-card inline-create"><h2>Edit paket internet</h2><p>Jenis paket tidak dapat diubah. Perubahan tarif reguler berlaku untuk tagihan berikutnya; tagihan yang sudah terbit tidak berubah.</p><form id="update-plan" class="form-grid" data-record-id="${escapeHtml(editPlan.id)}"><input type="hidden" name="planType" value="${escapeHtml(editPlan.plan_type)}"><label>Nama paket<input name="name" value="${escapeHtml(editPlan.name)}" required maxlength="120"></label><label>Jenis paket<input value="${escapeHtml(planTypeLabels[editPlan.plan_type] || editPlan.plan_type)}" readonly></label>${planInputs(editPlan, true)}<div class="form-actions span-two"><button class="button button-quiet" type="button" data-cancel-plan-edit>Batal</button><button class="button button-primary">Simpan perubahan</button></div></form></div>`
      : `<div id="plan-form" class="content-card inline-create" hidden><h2>Buat paket internet</h2><p>OHO dan Dedicated menggunakan harga serta kecepatan yang disepakati untuk masing-masing pelanggan.</p><form id="create-plan" class="form-grid"><label>Nama paket<input name="name" placeholder="InstaHome 50 atau OHO Jakarta" required maxlength="120"></label><label>Jenis paket<select name="planType" data-plan-type-select><option value="standard">Reguler</option><option value="oho">OHO</option><option value="dedicated">Dedicated</option></select></label>${planInputs(null, false)}<p class="span-two" data-plan-negotiated-note hidden>Harga bulanan dan kecepatan dimasukkan saat paket ini diberikan kepada pelanggan.</p><div class="form-actions span-two"><button class="button button-quiet" type="button" data-toggle="plan-form">Batal</button><button class="button button-primary">Simpan paket</button></div></form></div>`;
    const planAction = state.user.role !== 'admin' ? '' : editPlan
      ? '<button class="button button-quiet" data-cancel-plan-edit>Batal edit</button>'
      : '<button class="button button-primary" data-toggle="plan-form">＋ Tambah paket</button>';
    setPage('plans', `${pageHeading('Paket internet', 'Atur pilihan paket dan harga berlangganan.', planAction)}
      ${state.user.role === 'admin' ? planForm : ''}
      ${dataTable(['NAMA PAKET', 'JENIS', 'KECEPATAN (DOWN/UP)', 'HARGA / BULAN', 'STATUS', ...(state.user.role === 'admin' ? ['AKSI'] : [])], rows, 'Paket internet akan muncul di sini.')}`);
  }
  app.features.plans.submit = submit;

  async function submit(ctx, form) {
    const { api, state, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast, showConfirmation, showPermanentConfirmation, submitForm, renderDashboard, renderCustomers, renderPlans, renderServices, renderInvoices, renderTickets, renderUsers, renderRouters, renderSettings } = ctx;
    if (form.id === 'create-plan') return submitForm(form, async (data) => {
      ['downloadMbps', 'uploadMbps', 'monthlyPrice'].forEach((key) => {
        if (data[key] !== undefined) data[key] = Number(data[key]);
      });
      await api('/plans', { method: 'POST', body: JSON.stringify(data) });
      showToast('Paket internet berhasil dibuat.');
      await renderPlans();
    });
    if (form.id === 'update-plan') return submitForm(form, async (data) => {
      ['downloadMbps', 'uploadMbps', 'monthlyPrice'].forEach((key) => {
        if (data[key] !== undefined) data[key] = Number(data[key]);
      });
      await api(`/plans/${encodeURIComponent(form.dataset.recordId)}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      showToast('Paket internet berhasil diperbarui.');
      await renderPlans();
    });
  }
  app.features.plans.handleClick = handleClick;

  async function handleClick(ctx, event) {
    const { state, api, showToast, showConfirmation, showPermanentConfirmation, renderPlans } = ctx;
    const editPlan = event.target.closest('[data-edit-plan]');
      if (editPlan) {
        const plan = state.plans.find((item) => item.id === editPlan.dataset.editPlan);
        if (!plan) return showToast('Paket tidak ditemukan; muat ulang halaman.', true);
        return renderPlans(plan);
      }

      if (event.target.closest('[data-cancel-plan-edit]')) return renderPlans();

  
    const planActivation = event.target.closest('[data-toggle-plan-activation]');
      if (planActivation) {
        const plan = state.plans.find((item) => item.id === planActivation.dataset.togglePlanActivation);
        if (!plan) return showToast('Paket tidak ditemukan; muat ulang halaman.', true);
        const activating = !plan.is_active;
        const title = activating ? 'Aktifkan paket?' : 'Nonaktifkan paket?';
        const message = activating
          ? `Paket ${plan.name} akan tersedia untuk layanan pelanggan baru.`
          : `Paket ${plan.name} tidak bisa dipilih untuk layanan baru. Pelanggan yang sedang memakai paket ini tetap aktif dan tetap ditagih. Riwayat tetap tersimpan.`;
        return showConfirmation(title, message, activating ? 'Ya, aktifkan paket' : 'Ya, nonaktifkan paket', async () => {
          try {
            await api(`/plans/${encodeURIComponent(plan.id)}/activation`, {
              method: 'PATCH',
              body: JSON.stringify({ isActive: activating }),
            });
            showToast(activating
              ? 'Paket berhasil diaktifkan dan tersedia untuk layanan baru.'
              : 'Paket berhasil dinonaktifkan. Pelanggan yang sudah berlangganan tetap ditagih.');
            await renderPlans();
          } catch (error) {
            showToast(error.message, true);
          }
        });
      }

      const permanentPlan = event.target.closest('[data-permanent-plan]');
      if (permanentPlan) {
        const plan = state.plans.find((item) => item.id === permanentPlan.dataset.permanentPlan);
        if (!plan) return showToast('Paket tidak ditemukan; muat ulang halaman.', true);
        return showPermanentConfirmation(
          'Hapus paket internet permanen?',
          `Paket ${plan.name} akan dihapus secara permanen. Paket yang pernah dipakai oleh layanan pelanggan tidak dapat dihapus; nonaktifkan paket tersebut jika ingin menyimpannya sebagai riwayat.`,
          plan.name,
          'Hapus paket',
          async () => {
            try {
              await api(`/plans/${encodeURIComponent(plan.id)}/permanent`, { method: 'DELETE' });
              showToast(`Paket ${plan.name} berhasil dihapus.`);
              await renderPlans();
            } catch (error) {
              showToast(error.message, true);
            }
          },
        );
      }

  
  }
})();
