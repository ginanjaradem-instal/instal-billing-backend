(() => {
  const app = window.InstaLinkAdmin || (window.InstaLinkAdmin = { features: {} });
  app.features.actions = { bind };

  function bind(ctx) {
    const { pageContent, state, api, showToast, showConfirmation, showPermanentConfirmation, formatMoney, navigate, renderSettings, renderRouters, renderDashboard, renderServices, renderCustomers, renderPlans, renderInvoices } = ctx;
    pageContent.addEventListener('click', async (event) => {
      const pageButton = event.target.closest('[data-page]');
      if (pageButton) return navigate(pageButton.dataset.page);

      const toggle = event.target.closest('[data-toggle]');
      if (toggle) {
        const form = document.getElementById(toggle.dataset.toggle);
        if (form) {
          form.hidden = !form.hidden;
          if (!form.hidden) form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        return;
      }
      for (const featureName of ['settings', 'routers', 'dashboard', 'services', 'customers', 'plans', 'invoices']) {
        await app.features[featureName]?.handleClick(ctx, event);
      }
    });

  }
})();
