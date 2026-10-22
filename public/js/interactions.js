(() => {
  const app = window.InstaLinkAdmin || (window.InstaLinkAdmin = { features: {} });
  app.features.interactions = { bind };

  function bind(ctx) {
    const { pageContent, api, showToast, escapeHtml, renderTickets, renderCustomers, state } = ctx;
    pageContent.addEventListener('change', async (event) => {
      const logoInput = event.target.closest('input[type="file"][name^="logo"]');
      if (logoInput?.files[0]) {
        const preview = document.querySelector(`[data-logo-preview="${logoInput.name.slice(4).toLowerCase()}"]`);
        const reader = new FileReader();
        reader.addEventListener('load', () => {
          preview.classList.remove('is-empty');
          preview.innerHTML = `<img src="${escapeHtml(reader.result)}" alt="Pratinjau logo">`;
        });
        reader.readAsDataURL(logoInput.files[0]);
        return;
      }

      const bankCountSelect = event.target.closest('#settings-bank-count');
      if (bankCountSelect) {
        const bankFields = document.getElementById('settings-bank-fields');
        const bankCount = Number(bankCountSelect.value);
        bankFields.querySelectorAll('[data-bank-card]').forEach((card) => {
          const hidden = Number(card.dataset.bankCard) >= bankCount;
          card.hidden = hidden;
          card.querySelectorAll('input').forEach((input) => { input.disabled = hidden; });
        });
        return;
      }

      const planTypeSelect = event.target.closest('[data-plan-type-select]');
      if (planTypeSelect) {
        const form = planTypeSelect.form;
        const negotiated = planTypeSelect.value !== 'standard';
        const fields = form.querySelector('[data-plan-fields]');
        fields.hidden = negotiated;
        fields.querySelectorAll('input').forEach((input) => {
          input.disabled = negotiated;
          input.required = !negotiated;
        });
        form.querySelector('[data-plan-negotiated-note]').hidden = !negotiated;
        return;
      }

      const servicePlanSelect = event.target.closest('[data-service-plan-select]');
      if (servicePlanSelect) {
        const form = servicePlanSelect.form;
        const agreement = form.querySelector('[data-service-agreement]');
        const selectedPlan = servicePlanSelect.selectedOptions[0];
        const negotiated = selectedPlan?.dataset.pricingMode === 'negotiated';
        if (servicePlanSelect.dataset.previousPlan !== servicePlanSelect.value) {
          agreement.querySelectorAll('input').forEach((input) => { input.value = ''; });
          servicePlanSelect.dataset.previousPlan = servicePlanSelect.value;
        }
        agreement.hidden = !negotiated;
        agreement.querySelector('[data-service-profile]').textContent = negotiated
          ? `Profil tetap: ${selectedPlan.dataset.downloadMbps} / ${selectedPlan.dataset.uploadMbps} Mbps, rasio ${selectedPlan.dataset.contentionRatio}. Kecepatan tidak dapat diubah.`
          : '';
        agreement.querySelectorAll('input').forEach((input) => {
          input.disabled = !negotiated;
          input.required = negotiated;
        });
        return;
      }

      const statusSelect = event.target.closest('[data-ticket-status]');
      const assigneeSelect = event.target.closest('[data-ticket-assignee]');
      if (!statusSelect && !assigneeSelect) return;
      const ticketId = statusSelect?.dataset.ticketStatus || assigneeSelect.dataset.ticketAssignee;
      const body = statusSelect
        ? { status: statusSelect.value }
        : { assignedTo: assigneeSelect.value || null };
      try {
        await api(`/tickets/${encodeURIComponent(ticketId)}`, { method: 'PATCH', body: JSON.stringify(body) });
        showToast('Tiket berhasil diperbarui.');
        await renderTickets();
      } catch (error) {
        showToast(error.message, true);
        await renderTickets();
      }
    });
  }
})();
