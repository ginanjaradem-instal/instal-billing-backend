(() => {
  const app = window.InstaLinkAdmin || (window.InstaLinkAdmin = { features: {} });
  app.features.requests = { renderInstallationRequests, renderTroubleReports, submit };

  const installationStatuses = [
    ['new', 'Baru'],
    ['contacted', 'Sudah dihubungi'],
    ['survey_scheduled', 'Survei dijadwalkan'],
    ['approved', 'Disetujui'],
    ['rejected', 'Tidak dapat diproses'],
    ['completed', 'Selesai'],
  ];
  const troubleStatuses = [
    ['open', 'Terbuka'],
    ['in_progress', 'Sedang ditangani'],
    ['need_customer', 'Menunggu pelanggan'],
    ['resolved', 'Selesai diperbaiki'],
    ['closed', 'Ditutup'],
  ];
  const categories = {
    connection_down: 'Internet tidak tersambung',
    slow_connection: 'Internet lambat',
    unstable_connection: 'Koneksi tidak stabil',
    other: 'Lainnya',
  };

  async function renderInstallationRequests(ctx) {
    const { api, escapeHtml, formatDate, pageHeading, dataTable, setPage } = ctx;
    const result = await api('/requests/installation');
    const rows = result.data.map((item) => `<tr>
      <td><strong>${escapeHtml(item.name)}</strong><span class="cell-sub">${escapeHtml(item.phone)}</span><span class="cell-sub">${escapeHtml(item.email || 'Email tidak diisi')}</span></td>
      <td>${escapeHtml(item.address)}${item.preferred_plan ? `<span class="cell-sub">Paket minat: ${escapeHtml(item.preferred_plan)}</span>` : ''}</td>
      <td>${formatDate(item.created_at)}</td>
      <td>${requestForm(item, installationStatuses)}</td>
    </tr>`).join('');
    setPage('installation-requests', `${pageHeading('Ajuan pemasangan', 'Tinjau permintaan pemasangan baru dan catat tindak lanjut tim.')}
      ${dataTable(['PEMOHON', 'ALAMAT / MINAT PAKET', 'DITERIMA', 'TINDAK LANJUT'], rows, 'Ajuan pemasangan dari landing page akan muncul di sini.')}`);
  }

  async function renderTroubleReports(ctx) {
    const { api, escapeHtml, formatDate, pageHeading, dataTable, setPage } = ctx;
    const result = await api('/requests/trouble');
    const rows = result.data.map((item) => `<tr>
      <td><strong>${escapeHtml(item.subject)}</strong><span class="cell-sub">${escapeHtml(item.description)}</span><span class="cell-sub">${escapeHtml(categories[item.category] || item.category)}</span></td>
      <td><strong>${escapeHtml(item.name)}</strong><span class="cell-sub">${escapeHtml(item.phone)}</span><span class="cell-sub">${escapeHtml(item.customer_code || 'Kode pelanggan tidak diisi')}</span></td>
      <td>${formatDate(item.created_at)}</td>
      <td>${requestForm(item, troubleStatuses)}</td>
    </tr>`).join('');
    setPage('trouble-reports', `${pageHeading('Laporan gangguan', 'Pantau laporan gangguan pelanggan yang masuk dari landing page dan catat penyelesaiannya.')}
      ${dataTable(['LAPORAN', 'PELAPORAN', 'DITERIMA', 'TINDAK LANJUT'], rows, 'Laporan gangguan pelanggan akan muncul di sini.')}`);
  }

  function requestForm(item, statuses) {
    return `<form class="request-followup-form" data-request-type="${item.category ? 'trouble' : 'installation'}" data-request-id="${escapeHtml(item.id)}">
      <select name="status" aria-label="Status tindak lanjut">
        ${statuses.map(([value, label]) => `<option value="${value}" ${item.status === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
      <textarea name="staffNotes" maxlength="5000" rows="2" placeholder="Catatan internal tim">${escapeHtml(item.staff_notes || '')}</textarea>
      <button class="small-button" type="submit">Simpan tindak lanjut</button>
    </form>`;
  }

  async function submit(ctx, form) {
    if (!form.matches('.request-followup-form')) return;
    const { api, showToast, submitForm } = ctx;
    await submitForm(form, async (data) => {
      const type = form.dataset.requestType;
      const id = encodeURIComponent(form.dataset.requestId);
      await api(`/requests/${type}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: data.status, staffNotes: data.staffNotes }),
      });
      showToast('Tindak lanjut berhasil disimpan.');
      if (type === 'installation') await renderInstallationRequests(ctx);
      else await renderTroubleReports(ctx);
    });
  }
})();
