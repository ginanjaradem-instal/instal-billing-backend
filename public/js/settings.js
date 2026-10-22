(() => {
  const app = window.InstaLinkAdmin || (window.InstaLinkAdmin = { features: {} });
  app.features.settings = { renderSettings };

  async function renderSettings(ctx, page) {
    const {
      api, state, labels, settingsPages, escapeHtml, formatMoney, formatDate, formatMonth,
      statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast,
    } = ctx;
    const title = labels[page];
    if (page === 'settings-invoice') {
      const result = await api('/settings/invoice');
      const design = result.data;
      const logoSlot = (side, label, logo) => `
        <div class="content-card invoice-logo-card">
          <h3>Logo ${label}</h3>
          <div class="invoice-logo-preview${logo ? '' : ' is-empty'}" data-logo-preview="${side}">
            ${logo ? `<img src="${escapeHtml(logo)}" alt="Logo invoice ${label}">` : 'Belum ada logo'}
          </div>
          <label>Unggah logo ${label}<input type="file" name="logo${side[0].toUpperCase()}${side.slice(1)}" accept="image/png,image/jpeg,image/webp"></label>
          <p class="settings-help">Format PNG, JPG, atau WebP. Maksimal 2 MB.</p>
          ${logo ? `<button class="small-button small-button-danger" type="button" data-remove-invoice-logo="${side}">Hapus logo ${label}</button>` : ''}
        </div>`;
      setPage(page, `${pageHeading(title, settingsPages[page])}
        <div class="content-card invoice-design-preview">
          <h2>Pratinjau header invoice</h2>
          <div class="invoice-preview-header">
            <div class="invoice-preview-logo">${design.logoLeft ? `<img src="${escapeHtml(design.logoLeft)}" alt="Logo kiri">` : '<span>Logo kiri</span>'}</div>
            <div class="invoice-preview-company">
              <strong>${escapeHtml(design.companyName || 'Nama perusahaan')}</strong>
              <span>${escapeHtml(design.companyAddress || 'Alamat perusahaan')}</span>
            </div>
            <div class="invoice-preview-logo">${design.logoRight ? `<img src="${escapeHtml(design.logoRight)}" alt="Logo kanan">` : '<span>Logo kanan</span>'}</div>
          </div>
        </div>
        <form id="update-invoice-design" class="form-grid">
          ${logoSlot('left', 'kiri', design.logoLeft)}
          ${logoSlot('right', 'kanan', design.logoRight)}
          <div class="form-actions span-two"><button class="button button-primary" type="submit">Simpan logo invoice</button></div>
        </form>
        <p class="settings-help invoice-design-note">Nama dan alamat pada pratinjau mengikuti Pengaturan Umum. Desain tersimpan dan dapat dipratinjau; pembuatan atau perubahan file PDF invoice belum tersedia.</p>`);
      return;
    }
    if (page === 'settings-general') {
      const result = await api('/settings/general');
      const settings = result.data;
      const banks = Array.from({ length: 2 }, (_, index) => (
        settings.bankAccounts?.[index] || { bankName: '', accountName: '', accountNumber: '' }
      ));
      const field = (name, label, value, type = 'text', options = '') => `
        <label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${options} required></label>`;
      const bankFields = banks.map((bank, index) => {
        const disabled = index >= settings.bankCount ? 'disabled' : '';
        return `
        <div class="content-card settings-bank-card" data-bank-card="${index}" ${disabled ? 'hidden' : ''}>
          <h3>Rekening bank ${index + 1}</h3>
          ${field(`bankName${index}`, 'Nama bank', bank.bankName, 'text', `maxlength="100" ${disabled}`)}
          ${field(`accountName${index}`, 'Nama pemilik rekening', bank.accountName, 'text', `maxlength="160" ${disabled}`)}
          ${field(`accountNumber${index}`, 'Nomor rekening', bank.accountNumber, 'text', `maxlength="64" ${disabled}`)}
        </div>`;
      }).join('');
      setPage(page, `${pageHeading(title, settingsPages[page])}
        <form id="update-general-settings" class="form-grid settings-form">
          <div class="content-card settings-section">
            <h2>Informasi perusahaan</h2>
            ${field('companyName', 'Nama perusahaan', settings.companyName, 'text', 'maxlength="160"')}
            <label>Alamat<textarea name="companyAddress" maxlength="2000" required>${escapeHtml(settings.companyAddress)}</textarea></label>
            ${field('companyPhone', 'Nomor HP', settings.companyPhone, 'tel', 'maxlength="32"')}
            <label>Deskripsi invoice<textarea name="invoiceDescription" maxlength="2000">${escapeHtml(settings.invoiceDescription)}</textarea></label>
          </div>
          <div class="content-card settings-section">
            <h2>Rekening bank untuk invoice</h2>
            <label>Jumlah bank<select name="bankCount" id="settings-bank-count">
              <option value="1" ${settings.bankCount === 1 ? 'selected' : ''}>1 bank</option>
              <option value="2" ${settings.bankCount === 2 ? 'selected' : ''}>2 bank</option>
            </select></label>
            <div id="settings-bank-fields" class="settings-bank-fields">${bankFields}</div>
          </div>
          <div class="content-card settings-section">
            <h2>Pengingat invoice otomatis</h2>
            <label>Waktu sebelum jatuh tempo<select name="invoiceReminderDays">
              ${[3, 5, 7, 10].map((days) => `<option value="${days}" ${settings.invoiceReminderDays === days ? 'selected' : ''}>${days} hari sebelum jatuh tempo</option>`).join('')}
            </select></label>
            <p class="settings-help">Pilihan waktu ini disimpan sebagai konfigurasi pengingat. Pengiriman otomatis melalui email atau WhatsApp belum aktif sampai integrasi saluran tersebut tersedia.</p>
          </div>
          <div class="form-actions span-two"><button class="button button-primary" type="submit">Simpan pengaturan umum</button></div>
        </form>`);
      return;
    }
    setPage(page, `${pageHeading(title, settingsPages[page])}
      <div class="content-card settings-placeholder">
        <span class="badge">Menu pengaturan</span>
        <h2>${escapeHtml(title)}</h2>
        <p>Halaman navigasi sudah disiapkan. Form, penyimpanan, dan penerapan pengaturan ini belum tersedia.</p>
      </div>`);
  }
  app.features.settings.submit = submit;

  async function submit(ctx, form) {
    const { api, state, escapeHtml, formatMoney, formatDate, formatMonth, statusBadge, routerNotice, pageHeading, dataTable, setPage, showToast, showConfirmation, showPermanentConfirmation, submitForm, renderDashboard, renderCustomers, renderPlans, renderServices, renderInvoices, renderTickets, renderUsers, renderRouters, renderSettings } = ctx;
    if (form.id === 'update-general-settings') return submitForm(form, async (data) => {
      const bankCount = Number(data.bankCount);
      const bankAccounts = Array.from({ length: bankCount }, (_, index) => ({
        bankName: data[`bankName${index}`],
        accountName: data[`accountName${index}`],
        accountNumber: data[`accountNumber${index}`],
      }));
      const result = await api('/settings/general', {
        method: 'PUT',
        body: JSON.stringify({
          companyName: data.companyName,
          companyAddress: data.companyAddress,
          companyPhone: data.companyPhone,
          invoiceDescription: data.invoiceDescription,
          bankCount,
          bankAccounts,
          invoiceReminderDays: Number(data.invoiceReminderDays),
        }),
      });
      showToast('Pengaturan umum berhasil disimpan.');
      await renderSettings('settings-general');
      return result;
    });
    if (form.id === 'update-invoice-design') return submitForm(form, async () => {
      const files = [
        ['left', form.elements.logoLeft.files[0]],
        ['right', form.elements.logoRight.files[0]],
      ].filter(([, file]) => file);
      if (!files.length) throw new Error('Pilih setidaknya satu file logo untuk diunggah.');
      for (const [side, file] of files) {
        if (file.size > 2 * 1024 * 1024) {
          throw new Error('Ukuran setiap file logo maksimal 2 MB.');
        }
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
          throw new Error('Format logo harus PNG, JPG, atau WebP.');
        }
        await api(`/settings/invoice/logo/${side}`, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });
      }
      showToast('Logo invoice berhasil disimpan.');
      await renderSettings('settings-invoice');
    });
  }
  app.features.settings.handleClick = handleClick;
  async function handleClick(ctx, event) {
    const { api, showToast, renderSettings } = ctx;
    const removeInvoiceLogo = event.target.closest('[data-remove-invoice-logo]');
    if (!removeInvoiceLogo) return;
    try {
      await api(`/settings/invoice/logo/${removeInvoiceLogo.dataset.removeInvoiceLogo}`, { method: 'DELETE' });
      showToast('Logo invoice berhasil dihapus.');
      await renderSettings('settings-invoice');
    } catch (error) { showToast(error.message, true); }
  }
})();
