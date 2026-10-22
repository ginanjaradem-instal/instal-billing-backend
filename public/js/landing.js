(() => {
  const page = document.getElementById('page-content');
  const nav = document.getElementById('site-nav');
  const menuToggle = document.querySelector('.menu-toggle');
  const whatsapp = '6285139514123';
  const email = 'sindi@instalink.id';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(Number(value));
  }

  function hero(title, description, image, eyebrow = 'INSTALINK') {
    return `<section class="page-hero">
      <div class="page-hero-copy"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${description}</p></div>
      ${image ? `<img src="${image}" alt="" class="page-hero-image">` : ''}
    </section>`;
  }

  function installForm() {
    return `<form class="lead-form" id="install-form">
      <label>Nama lengkap<input name="name" autocomplete="name" required maxlength="120"></label>
      <label>Email (opsional)<input name="email" type="email" autocomplete="email" maxlength="255"></label>
      <label>Nomor WhatsApp<input name="phone" type="tel" autocomplete="tel" required maxlength="32"></label>
      <label class="field-wide">Alamat pemasangan<textarea name="address" autocomplete="street-address" rows="3" required maxlength="500"></textarea></label>
      <label>Paket yang diminati (opsional)<input name="preferredPlan" maxlength="120" placeholder="Contoh: InstaHome 50 Mbps"></label>
      <p class="field-wide form-privacy">Data kontak dan alamat digunakan tim InstaLink untuk menindaklanjuti ajuan pemasangan.</p>
      <button class="button button-primary" type="submit">Kirim ajuan pemasangan <span>→</span></button>
    </form>`;
  }

  function contactForm() {
    return `<form class="lead-form" id="contact-form">
      <label>Nama lengkap<input name="name" autocomplete="name" required maxlength="120"></label>
      <label>Email<input name="email" type="email" autocomplete="email" required maxlength="160"></label>
      <label>Nomor WhatsApp<input name="phone" type="tel" autocomplete="tel" required maxlength="32"></label>
      <label class="field-wide">Pesan atau kendala<textarea name="message" rows="4" required maxlength="1000"></textarea></label>
      <button class="button button-primary" type="submit">Siapkan pesan <span>→</span></button>
    </form>`;
  }

  function troubleReportForm() {
    return `<form class="lead-form" id="trouble-report-form">
      <label>Nama lengkap<input name="name" autocomplete="name" required maxlength="120"></label>
      <label>Nomor WhatsApp<input name="phone" type="tel" autocomplete="tel" required maxlength="32"></label>
      <label>Kode pelanggan (opsional)<input name="customerCode" maxlength="32" placeholder="Contoh: CUST-0001"></label>
      <label>Jenis gangguan<select name="category" required>
        <option value="">Pilih jenis gangguan</option>
        <option value="connection_down">Internet tidak tersambung</option>
        <option value="slow_connection">Internet lambat</option>
        <option value="unstable_connection">Koneksi tidak stabil</option>
        <option value="other">Lainnya</option>
      </select></label>
      <label class="field-wide">Judul laporan<input name="subject" required maxlength="200"></label>
      <label class="field-wide">Ceritakan gangguan yang dialami<textarea name="description" rows="4" required minlength="10" maxlength="5000"></textarea></label>
      <p class="field-wide form-privacy">Data kontak dan laporan digunakan tim InstaLink untuk menindaklanjuti dan menangani gangguan.</p>
      <button class="button button-primary" type="submit">Kirim laporan gangguan <span>→</span></button>
    </form>`;
  }

  function coverageChecker() {
    return `<section class="coverage-section" id="cek-jangkauan">
      <div class="coverage-card">
        <div class="coverage-copy">
          <p class="eyebrow">CEK JANGKAUAN INSTALINK</p>
          <h2>Cek jaringan di sekitar lokasi Anda.</h2>
          <p>Pilih lokasi pemasangan dengan mengeklik peta—Anda bisa mengecek rumah dari jarak jauh. Atau gunakan lokasi perangkat ini. Hasilnya menunjukkan apakah jalur kabel terdeteksi dalam jarak 100 meter dan tetap perlu dikonfirmasi tim InstaLink.</p>
          <div class="coverage-actions">
            <button class="button button-primary" type="button" data-check-selected disabled>Periksa lokasi terpilih <span>→</span></button>
            <button class="button button-secondary" type="button" data-use-device-location>Gunakan lokasi perangkat</button>
          </div>
          <p class="coverage-selection" data-coverage-selection aria-live="polite">Klik pada peta untuk memilih lokasi yang ingin diperiksa.</p>
          <p class="coverage-privacy">Lokasi terpilih hanya dikirim ke InstaLink untuk pengecekan dan tidak disimpan. Ubin peta dimuat dari OpenStreetMap, yang dapat menerima informasi koneksi dan area peta yang sedang dilihat.</p>
          <div class="coverage-result" data-coverage-result role="status" aria-live="polite"></div>
          <a class="coverage-contact" href="https://wa.me/${whatsapp}?text=${encodeURIComponent('Halo InstaLink, saya ingin mengonfirmasi jangkauan jaringan dan pemasangan di alamat saya.')}" target="_blank" rel="noopener noreferrer">Butuh konfirmasi? Hubungi tim via WhatsApp ↗</a>
        </div>
        <div class="coverage-map" id="coverage-map" role="application" aria-label="Peta interaktif. Klik untuk memilih lokasi pemasangan."></div>
      </div>
    </section>`;
  }

  function homePage() {
    return `<section class="home-hero">
      <div class="home-hero-copy"><p class="eyebrow">KONEKSI RUMAH KECEPATAN SIMETRIS</p>
        <h1>Internet cepat,<br><span>tanpa batas.</span></h1>
        <p>Internet broadband untuk rumah dan bisnis. Nikmati koneksi andal tanpa FUP, dengan dukungan tim InstaLink.</p>
        <div class="hero-actions"><a class="button button-primary" href="/pasang-wifi-sumedang-murah">Pasang sekarang <span>→</span></a><a class="button button-secondary" href="/pasang-wifi-sumedang">Lihat paket internet</a></div>
        <div class="home-stats"><div><strong>1:1</strong><span>Rasio bandwidth dedicated</span></div><div><strong>2 Jam</strong><span>Respons awal tim</span></div><div><strong>99,8%</strong><span>Komitmen ketersediaan</span></div></div>
      </div><img class="home-hero-image" src="/assets/reference/hero.png" alt="Koneksi internet InstaLink untuk rumah">
    </section>
    ${coverageChecker()}
    <section class="content-section commitments"><div><p class="eyebrow">KONEKSI YANG BISA DIANDALKAN</p><h2>Terhubung untuk hal yang penting.</h2><p>Mulai dari belajar, bekerja, hiburan keluarga hingga operasional bisnis, InstaLink membantu Anda tetap terhubung.</p></div><a class="text-link" href="/pasang-wifi-sumedang-murah">Cek ketersediaan pemasangan <span>→</span></a></section>
    <section class="image-feature"><img src="/assets/reference/contact.png" alt="Tim InstaLink siap membantu pelanggan"><div><p class="eyebrow">LAYANAN INSTALINK</p><h2>Internet rumah dan solusi bisnis dalam satu jaringan.</h2><p>Pilih paket rumah dari daftar layanan kami atau konsultasikan kebutuhan koneksi bisnis dengan tim InstaLink.</p><a class="button button-primary" href="/pasang-wifi-sumedang">Jelajahi layanan <span>→</span></a></div></section>
    <section class="content-section centered-cta"><p class="eyebrow">SIAP MULAI?</p><h2>Temukan koneksi yang tepat untuk Anda.</h2><a class="button button-primary" href="/pasang-wifi-sumedang-murah">Ajukan pemasangan <span>→</span></a></section>`;
  }

  function planCards(plans) {
    if (!plans.length) return '<p class="loading-state">Informasi paket reguler akan segera tersedia.</p>';
    return plans.map((plan) => `<article class="plan-card">
      <span class="plan-tag">INSTAHOME</span><h3>${escapeHtml(plan.name)}</h3>
      <p class="plan-speed">${escapeHtml(plan.download_mbps)} Mbps download · ${escapeHtml(plan.upload_mbps)} Mbps upload</p>
      <p class="plan-price">${formatMoney(plan.monthly_price)} <span>/ bulan</span></p>
      <p class="plan-detail">Paket internet rumah</p>
      <a class="plan-action" href="/pasang-wifi-sumedang-murah">Tanyakan ketersediaan <span>→</span></a>
    </article>`).join('');
  }

  async function renderPlans() {
    const container = document.getElementById('public-plans');
    if (!container) return;
    try {
      const response = await fetch('/api/public/plans');
      if (!response.ok) throw new Error(`Permintaan paket gagal (${response.status})`);
      const result = await response.json();
      if (!Array.isArray(result.data)) throw new Error('Format data paket tidak valid');
      container.innerHTML = planCards(result.data);
    } catch (error) {
      container.innerHTML = '<p class="plan-error" role="status">Paket internet belum dapat dimuat. Silakan coba muat ulang halaman.</p>';
      console.error('Failed to load public plans:', error);
    }
  }

  function packagesPage() {
    return `${hero('Paket internet<br>untuk rumah dan bisnis.', 'Pilih layanan internet yang sesuai dengan kebutuhan Anda. Detail paket reguler ditampilkan sesuai informasi layanan yang tersedia.', '/assets/reference/hero.png', 'PILIHAN PAKET INSTALINK')}
      <section class="content-section"><div class="section-heading"><div><p class="eyebrow">PAKET INTERNET RUMAH</p><h2>Pilihan InstaHome</h2></div><p>Paket reguler aktif untuk koneksi rumah.</p></div><div id="public-plans" class="plan-grid"><p class="loading-state">Memuat paket internet…</p></div></section>
      <section class="business-offers"><div><p class="eyebrow">INSTALINK BUSINESS</p><h2>Solusi sesuai kebutuhan bisnis.</h2><p><strong>OHO</strong> · 100/50 Mbps · rasio 1:2<br><strong>Dedicated</strong> · 100/100 Mbps · rasio 1:1</p><p>Harga paket bisnis ditentukan melalui kesepakatan dan kerja sama dengan pelanggan.</p><a class="button button-primary" href="/corporate">Konsultasikan kebutuhan <span>→</span></a></div></section>`;
  }

  function installPage() {
    return `${hero('Pemasangan internet<br>yang tepat waktu.', 'Ajukan pemasangan InstaLink dengan mengisi detail kontak dan alamat. Tim kami akan menghubungi Anda untuk konfirmasi area dan jadwal.', '/assets/reference/hero.png', 'PASANG BARU')}
      ${coverageChecker()}
      <section class="content-section install-layout"><div><p class="eyebrow">TIGA LANGKAH MUDAH</p><h2>Mulai terhubung dengan InstaLink.</h2><ol class="steps-list"><li><strong>Isi permintaan</strong><span>Berikan detail kontak dan alamat pemasangan.</span></li><li><strong>Konfirmasi area</strong><span>Tim InstaLink memeriksa ketersediaan jaringan.</span></li><li><strong>Jadwalkan instalasi</strong><span>Kami menghubungi Anda untuk mengatur langkah berikutnya.</span></li></ol></div><div class="form-card"><h2>Ajukan pemasangan</h2><p>Tim InstaLink akan menindaklanjuti ajuan Anda melalui nomor WhatsApp yang diberikan.</p>${installForm()}<div id="form-result" class="form-result" aria-live="polite"></div></div></section>`;
  }

  function troubleReportPage() {
    return `${hero('Laporkan gangguan<br>layanan internet.', 'Sampaikan kendala koneksi Anda kepada tim InstaLink. Laporan akan tersimpan agar dapat ditindaklanjuti.', '/assets/reference/contact.png', 'BANTUAN PELANGGAN')}
      <section class="content-section contact-layout">
        <div><p class="eyebrow">KAMI SIAP MEMBANTU</p><h2>Jelaskan kendala yang Anda alami.</h2>
          <p>Isi nomor WhatsApp yang dapat dihubungi dan detail gangguan. Tim kami akan memeriksa laporan dan menghubungi Anda.</p>
          <div class="contact-details"><a href="tel:+6285139514123"><small>WHATSAPP ADMIN</small><strong>+62 851-3951-4123</strong></a><div><small>JAM OPERASIONAL</small><strong>Setiap hari, 08.00–17.00 WIB</strong></div></div>
        </div>
        <div class="form-card"><h2>Form laporan gangguan</h2>${troubleReportForm()}<div id="trouble-report-result" class="form-result" aria-live="polite"></div></div>
      </section>`;
  }

  function galleryPage() {
    const images = [
      ['gallery-1.png', 'Dokumentasi instalasi jaringan rumah 1'],
      ['gallery-2.png', 'Dokumentasi instalasi jaringan rumah 2'],
      ['gallery-3.png', 'Dokumentasi instalasi jaringan rumah 3'],
      ['gallery-4.png', 'Dokumentasi instalasi jaringan rumah 4'],
      ['gallery-5.png', 'Dokumentasi instalasi jaringan rumah 5'],
      ['gallery-6.png', 'Dokumentasi instalasi jaringan rumah 6'],
    ];
    return `${hero('Dokumentasi instalasi<br>rumah nyata.', 'Lihat beberapa dokumentasi layanan dan instalasi InstaLink untuk pelanggan rumah dan bisnis.', '/assets/reference/gallery-1.png', 'GALERI INSTALINK')}
      <section class="content-section"><div class="section-heading"><div><p class="eyebrow">MOMEN DI LAPANGAN</p><h2>Galeri InstaLink</h2></div><p>Dokumentasi layanan dan jaringan kami.</p></div><div class="gallery-grid">${images.map(([src, alt]) => `<figure><img src="/assets/reference/${src}" alt="${alt}" loading="lazy"></figure>`).join('')}</div></section>
      <section class="centered-cta"><h2>Ingin menjadi bagian dari cerita kami?</h2><a class="button button-primary" href="/pasang-wifi-sumedang-murah">Ajukan pemasangan <span>→</span></a></section>`;
  }

  function newsPage() {
    const stories = [
      ['news-1.png', 'Pemeliharaan jaringan untuk koneksi yang lebih andal', 'Kami melakukan pemeliharaan jaringan secara berkala untuk menjaga kualitas layanan. Informasi jadwal disampaikan kepada pelanggan yang terdampak.'],
      ['news-2.png', 'Perluasan area distribusi InstaLink', 'InstaLink terus mengembangkan jangkauan jaringan. Hubungi tim kami untuk memeriksa ketersediaan layanan di alamat Anda.'],
      ['news-3.png', 'Panduan sederhana menjaga koneksi Wi-Fi', 'Letakkan router di area terbuka dan strategis, hindari penghalang tebal, serta pastikan perangkat jaringan memiliki ventilasi yang baik.'],
    ];
    return `${hero('Transparansi dan perluasan<br>jaringan rumah.', 'Kabar layanan, informasi jaringan, dan panduan sederhana agar Anda tetap terhubung.', '/assets/reference/news-1.png', 'KABAR INSTALINK')}
      <section class="content-section"><div class="section-heading"><div><p class="eyebrow">INFO & PANDUAN</p><h2>Kabar terbaru</h2></div><p>Informasi layanan dari InstaLink.</p></div><div class="news-grid">${stories.map(([src, title, copy]) => `<article class="news-card"><img src="/assets/reference/${src}" alt="" loading="lazy"><div><span class="news-label">INFO INSTALINK</span><h3>${title}</h3><p>${copy}</p></div></article>`).join('')}</div></section>`;
  }

  function paymentPage() {
    return `${hero('Pembayaran tagihan<br>InstaLink.', 'Verifikasi tagihan menggunakan nomor invoice dan kode pelanggan. Informasi yang ditampilkan hanya mencakup tagihan yang cocok.', '/assets/reference/contact.png', 'PEMBAYARAN')}
      <section class="content-section payment-layout"><div><p class="eyebrow">PEMBAYARAN AMAN</p><h2>Bayar tagihan Anda dengan mudah.</h2><p>Masukkan nomor invoice dan kode pelanggan yang tertera pada tagihan. Jika cocok dan tagihan masih dapat dibayar, Anda dapat melanjutkan ke halaman pembayaran.</p><ul class="payment-methods"><li>QRIS</li><li>Virtual account</li><li>Gerai mitra</li></ul><p class="muted-note">Metode pembayaran yang tersedia akan ditampilkan oleh halaman pembayaran resmi.</p></div>
        <div class="form-card"><h2>Cek tagihan</h2><form class="lead-form payment-form" id="payment-form"><label>Nomor invoice<input name="invoiceNumber" autocomplete="off" required maxlength="50" placeholder="Contoh: INV-202501-ABC123"></label><label>Kode pelanggan<input name="customerCode" autocomplete="off" required maxlength="32"></label><button class="button button-primary" type="submit">Verifikasi tagihan <span>→</span></button></form><div id="payment-result" class="form-result" aria-live="polite"></div></div></section>`;
  }

  function contactPage() {
    return `${hero('Kami siap membantu<br>Anda terhubung.', 'Hubungi InstaLink untuk pertanyaan paket, ketersediaan jaringan, atau bantuan layanan.', '/assets/reference/contact.png', 'KONTAK INSTALINK')}
      <section class="content-section contact-layout"><div><p class="eyebrow">HUBUNGI KAMI</p><h2>Dukungan pelanggan InstaLink.</h2><div class="contact-details"><a href="tel:+6285139514123"><small>WHATSAPP ADMIN</small><strong>+62 851-3951-4123</strong></a><a href="mailto:sindi@instalink.id"><small>EMAIL</small><strong>sindi@instalink.id</strong></a><div><small>JAM OPERASIONAL</small><strong>Setiap hari, 08.00–17.00 WIB</strong></div><div><small>WHATSAPP TEKNISI</small><strong>0811-920-800</strong></div></div><a class="button button-primary" href="https://wa.me/${whatsapp}" target="_blank" rel="noopener noreferrer">Chat WhatsApp admin <span>↗</span></a></div><div class="form-card"><h2>Kirim pesan</h2><p>Siapkan pesan lalu pilih WhatsApp atau email untuk mengirimkannya.</p>${contactForm()}<div id="form-result" class="form-result" aria-live="polite"></div></div></section>`;
  }

  function corporatePage() {
    return `${hero('Company Profile<br>PT Sinergi Infrastruktur Digital.', 'Mitra infrastruktur telekomunikasi berlisensi yang menghadirkan tulang punggung serat optik, konektivitas enterprise simetris, dan managed IT services terintegrasi untuk Sumedang, Darmaraja, hingga Wado.', '/assets/reference/corporate.png', 'INSTALINK CORPORATE')}
      <section class="corporate-facts" aria-label="Ringkasan operasional">
        <article><strong>99,9%</strong><span>Komitmen service level agreement</span></article>
        <article><strong>100% Fiber</strong><span>Infrastruktur jaringan serat optik</span></article>
        <article><strong>24/7</strong><span>Kesiagaan Network Operations Center</span></article>
        <article><strong>Sumedang Raya</strong><span>Sumedang, Darmaraja, dan Wado</span></article>
      </section>
      <section class="content-section corporate-profile">
        <div class="corporate-profile-copy"><p class="eyebrow">PROFIL PERUSAHAAN</p><h2>Membangun konektivitas andal untuk pertumbuhan.</h2>
          <p>PT Sinergi Infrastruktur Digital mengembangkan layanan internet dan teknologi informasi untuk mendukung kebutuhan masyarakat, institusi, dan dunia usaha. Berangkat dari komitmen menghadirkan internet tanpa batasan kuota, InstaLink tumbuh menjadi mitra infrastruktur bagi sektor komersial, perbankan, dan manufaktur.</p>
          <p>Didukung jaringan serat optik, konektivitas simetris, jalur redundan, dan layanan purnajual, kami membantu menjaga kesinambungan operasional serta pertukaran data mitra.</p>
        </div>
        <figure class="corporate-profile-image"><img src="/assets/reference/gallery-1.png" alt="Infrastruktur dan dokumentasi jaringan InstaLink" loading="lazy"><figcaption>Dokumentasi infrastruktur jaringan InstaLink</figcaption></figure>
      </section>
      <section class="corporate-vision">
        <div><p class="eyebrow">VISI KAMI</p><h2>Menjadi penggerak inklusi digital regional.</h2><p>Mewujudkan konektivitas digital yang tangguh melalui transparansi operasional, integritas teknis, dan kepatuhan terhadap regulasi.</p></div>
        <div><p class="eyebrow">MISI KAMI</p><h2>Memperluas akses dan menjaga keandalan.</h2><ul><li>Memperluas jangkauan serat optik terdedikasi.</li><li>Mengembangkan jalur redundan yang mendukung kesinambungan layanan.</li><li>Menghadirkan layanan purnajual dan dukungan teknis yang responsif.</li><li>Mendukung literasi teknologi serta konektivitas fasilitas publik.</li></ul></div>
      </section>
      <section class="content-section corporate-solutions">
        <div class="section-heading"><div><p class="eyebrow">LAYANAN ISP & SOLUSI IT</p><h2>Solusi teknologi untuk kebutuhan organisasi.</h2></div><p>Ruang lingkup layanan dibahas bersama agar sesuai dengan kebutuhan dan lingkungan operasional mitra.</p></div>
        <div class="corporate-services">
          <article><span>01</span><h3>Dedicated Internet & leased line</h3><p>Konektivitas simetris 1:1 dan tautan privat untuk mendukung aplikasi bisnis, pertukaran data, dan koneksi antarlokasi.</p></article>
          <article><span>02</span><h3>Managed IT & security</h3><p>Dukungan pengelolaan jaringan, keamanan terkelola, dan kebutuhan infrastruktur teknologi informasi.</p></article>
          <article><span>03</span><h3>Cloud & infrastruktur data</h3><p>Integrasi cloud serta dukungan pemeliharaan infrastruktur data terpadu sesuai kebutuhan institusi.</p></article>
          <article><span>04</span><h3>Redundansi & dukungan layanan</h3><p>Perencanaan rute redundan, dukungan teknis, dan komitmen layanan yang diselaraskan dalam kerja sama.</p></article>
        </div>
      </section>
      <section class="corporate-values">
        <div class="corporate-values-heading"><p class="eyebrow">NILAI PERUSAHAAN</p><h2>Standar mutu tanpa kompromi.</h2><p>Tiga fondasi untuk menjaga kelancaran pertukaran data dan produktivitas mitra.</p></div>
        <div class="corporate-values-grid">
          <article><span>01</span><h3>Kecepatan simetris 1:1</h3><p>Keseimbangan kecepatan unduh dan unggah untuk mendukung cloud, transfer data, dan komunikasi daring.</p></article>
          <article><span>02</span><h3>Keandalan & SLA</h3><p>Perencanaan keandalan jaringan dan target layanan dibahas secara transparan sesuai kebutuhan kerja sama.</p></article>
          <article><span>03</span><h3>Dukungan ahli</h3><p>Tim operasional jaringan dan dukungan teknis membantu menangani kebutuhan serta eskalasi layanan.</p></article>
        </div>
      </section>
      <section class="corporate-impact">
        <div><p class="eyebrow">KESIAPAN & DAMPAK SOSIAL</p><h2>Infrastruktur yang tumbuh bersama masyarakat.</h2><p>Pengembangan jaringan dan kesiapan rute redundan berjalan seiring dengan komitmen untuk memperluas literasi teknologi serta konektivitas fasilitas publik di Sumedang Raya.</p></div>
        <a class="button button-primary" href="/kontak">Hubungi tim InstaLink <span>→</span></a>
      </section>
      <section class="corporate-cta"><p class="eyebrow">JADWALKAN KONSULTASI</p><h2>Konsultasikan kebutuhan jaringan Anda.</h2><p>Diskusikan konfigurasi fiber optic khusus, dedicated internet, atau interkoneksi antarcabang bersama tim InstaLink.</p><a class="button button-primary" href="/kontak">Hubungi tim korporat <span>→</span></a></section>`;
  }

  const routes = {
    '/': { title: 'Internet cepat untuk rumah dan bisnis — InstaLink', render: homePage },
    '/pasang-wifi-sumedang': { title: 'Paket Internet — InstaLink', render: packagesPage },
    '/pasang-wifi-sumedang-murah': { title: 'Pasang Baru — InstaLink', render: installPage },
    '/lapor-gangguan': { title: 'Lapor Gangguan — InstaLink', render: troubleReportPage },
    '/galeri': { title: 'Galeri — InstaLink', render: galleryPage },
    '/berita': { title: 'Kabar — InstaLink', render: newsPage },
    '/bayar': { title: 'Pembayaran — InstaLink', render: paymentPage },
    '/kontak': { title: 'Kontak — InstaLink', render: contactPage },
    '/corporate': { title: 'Corporate — InstaLink', render: corporatePage },
  };
  const route = routes[window.location.pathname] || routes['/'];
  page.innerHTML = route.render();
  document.title = route.title;
  document.getElementById('current-year').textContent = new Date().getFullYear();

  const currentLink = [...nav.querySelectorAll('a')].find((link) => link.pathname === window.location.pathname);
  if (currentLink) currentLink.setAttribute('aria-current', 'page');
  menuToggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });
  nav.addEventListener('click', (event) => {
    if (!event.target.closest('a')) return;
    nav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  });

  renderPlans();

  function initializeCoverageMap() {
    const mapElement = document.getElementById('coverage-map');
    if (!mapElement) return;

    const card = mapElement.closest('.coverage-card');
    const result = card.querySelector('[data-coverage-result]');
    const selection = card.querySelector('[data-coverage-selection]');
    const checkButton = card.querySelector('[data-check-selected]');
    const deviceButton = card.querySelector('[data-use-device-location]');
    if (typeof L === 'undefined') {
      result.textContent = 'Peta tidak dapat dimuat. Muat ulang halaman atau hubungi tim InstaLink.';
      console.error('Leaflet map library is unavailable');
      return;
    }

    const map = L.map(mapElement).setView([-6.945, 108.084], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    }).addTo(map);

    let marker;
    let selectedPosition;
    const setSelection = (latitude, longitude, zoom = 16) => {
      selectedPosition = { latitude, longitude };
      if (marker) marker.setLatLng([latitude, longitude]);
      else marker = L.marker([latitude, longitude], { draggable: true }).addTo(map);
      marker.bindPopup('Lokasi pemasangan yang dipilih');
      marker.off('dragend');
      marker.on('dragend', () => {
        const position = marker.getLatLng();
        selectedPosition = { latitude: position.lat, longitude: position.lng };
        selection.textContent = 'Pin dipindahkan. Periksa lokasi untuk melihat indikasi jangkauan.';
        result.textContent = '';
      });
      checkButton.disabled = false;
      selection.textContent = 'Lokasi dipilih. Tekan “Periksa lokasi terpilih” untuk melihat hasil.';
      result.textContent = '';
      map.setView([latitude, longitude], Math.max(map.getZoom(), zoom));
    };

    map.on('click', (event) => setSelection(event.latlng.lat, event.latlng.lng));
    checkButton.addEventListener('click', async () => {
      if (!selectedPosition) return;
      checkButton.disabled = true;
      deviceButton.disabled = true;
      result.textContent = 'Sedang memeriksa jangkauan jaringan…';
      try {
        const response = await fetch('/api/public/coverage-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(selectedPosition),
        });
        const body = await response.json();
        if (!response.ok) {
          if (response.status === 429) throw new Error('Pengecekan terlalu sering. Silakan coba beberapa saat lagi.');
          throw new Error('Jangkauan belum dapat diperiksa. Silakan coba lagi atau hubungi tim kami.');
        }
        if (!body.data || !['near_network', 'not_detected'].includes(body.data.status)
          || typeof body.data.message !== 'string') {
          throw new Error('Respons pengecekan jangkauan tidak valid.');
        }
        result.textContent = body.data.message;
      } catch (error) {
        result.textContent = error.message;
      } finally {
        checkButton.disabled = !selectedPosition;
        deviceButton.disabled = false;
      }
    });

    deviceButton.addEventListener('click', () => {
      if (!navigator.geolocation) {
        result.textContent = 'Browser ini tidak mendukung akses lokasi. Silakan hubungi tim InstaLink untuk mengecek alamat Anda.';
        return;
      }
      deviceButton.disabled = true;
      result.textContent = 'Meminta izin lokasi…';
      navigator.geolocation.getCurrentPosition(async (position) => {
        if (position.coords.accuracy > 100) {
          result.textContent = 'Akurasi lokasi belum cukup untuk pengecekan 100 meter. Coba lagi di area terbuka atau hubungi tim InstaLink.';
          deviceButton.disabled = false;
          return;
        }
        setSelection(position.coords.latitude, position.coords.longitude);
        checkButton.click();
        deviceButton.disabled = false;
      }, (error) => {
        const messages = {
          1: 'Akses lokasi ditolak. Izinkan lokasi di pengaturan browser atau hubungi tim InstaLink untuk memeriksa alamat Anda.',
          2: 'Lokasi perangkat tidak tersedia. Coba lagi atau hubungi tim InstaLink.',
          3: 'Permintaan lokasi melewati batas waktu. Coba lagi di area dengan sinyal yang lebih baik.',
        };
        result.textContent = messages[error.code] || 'Lokasi tidak dapat diperoleh. Silakan coba lagi atau hubungi tim InstaLink.';
        deviceButton.disabled = false;
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });
    window.setTimeout(() => map.invalidateSize(), 0);
  }

  initializeCoverageMap();

  const installFormElement = document.getElementById('install-form');
  const contactFormElement = document.getElementById('contact-form');
  if (installFormElement) {
    installFormElement.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      const result = document.getElementById('form-result');
      button.disabled = true;
      result.textContent = 'Mengirim ajuan pemasangan…';
      try {
        const fields = Object.fromEntries(new FormData(form).entries());
        const response = await fetch('/api/public/installation-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });
        const body = await response.json();
        if (!response.ok) {
          if (response.status === 429) throw new Error('Pengajuan terlalu sering. Silakan coba kembali 15 menit lagi.');
          if (response.status === 400) throw new Error(body.error || 'Periksa kembali data yang Anda masukkan.');
          throw new Error('Ajuan belum dapat dikirim. Silakan coba kembali atau hubungi tim InstaLink.');
        }
        result.textContent = `Ajuan pemasangan berhasil dikirim. Nomor ajuan: ${body.data.requestNumber}. Tim InstaLink akan menghubungi Anda.`;
        form.reset();
      } catch (error) {
        result.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }
  if (contactFormElement) {
    contactFormElement.addEventListener('submit', (event) => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(contactFormElement).entries());
      const heading = 'Pesan untuk InstaLink';
      const details = `Nama: ${fields.name}\nEmail: ${fields.email}\nWhatsApp: ${fields.phone}\nPesan: ${fields.message}`;
      const message = `${heading}\n${details}`;
      const result = document.getElementById('form-result');
      result.innerHTML = `<p>Detail sudah disiapkan. Pilih cara untuk mengirimnya:</p>
        <div class="form-result-actions"><a class="button button-primary" href="https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener noreferrer">Kirim via WhatsApp ↗</a>
        <a class="button button-secondary" href="mailto:${email}?subject=${encodeURIComponent(heading)}&body=${encodeURIComponent(details)}">Kirim via email ↗</a></div>`;
    });
  }

  const troubleReportFormElement = document.getElementById('trouble-report-form');
  if (troubleReportFormElement) {
    troubleReportFormElement.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      const result = document.getElementById('trouble-report-result');
      button.disabled = true;
      result.textContent = 'Mengirim laporan gangguan…';
      try {
        const fields = Object.fromEntries(new FormData(form).entries());
        const response = await fetch('/api/public/trouble-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });
        const body = await response.json();
        if (!response.ok) {
          if (response.status === 429) throw new Error('Laporan terlalu sering. Silakan coba kembali 15 menit lagi.');
          if (response.status === 400) throw new Error(body.error || 'Periksa kembali data yang Anda masukkan.');
          throw new Error('Laporan belum dapat dikirim. Silakan coba kembali atau hubungi tim InstaLink.');
        }
        result.textContent = `Laporan berhasil dikirim. Nomor laporan: ${body.data.reportNumber}. Tim InstaLink akan menghubungi Anda.`;
        form.reset();
      } catch (error) {
        result.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }

  const paymentFormElement = document.getElementById('payment-form');
  if (paymentFormElement) {
    paymentFormElement.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const result = document.getElementById('payment-result');
      button.disabled = true;
      result.textContent = 'Memeriksa tagihan…';
      try {
        const fields = Object.fromEntries(new FormData(form).entries());
        const response = await fetch('/api/public/payment-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });
        const body = await response.json();
        if (!response.ok) {
          if (response.status === 404) throw new Error('Tagihan tidak ditemukan. Periksa kembali nomor invoice dan kode pelanggan.');
          if (response.status === 409) throw new Error('Tagihan ini tidak dapat dibayar.');
          if (response.status === 429) throw new Error('Terlalu banyak percobaan. Silakan coba kembali beberapa saat lagi.');
          if (response.status === 503) throw new Error('Pembayaran online belum tersedia. Silakan hubungi InstaLink.');
          throw new Error('Tagihan belum dapat diverifikasi. Silakan coba kembali.');
        }
        if (!body.data || typeof body.data.payment_url !== 'string') throw new Error('Respons pembayaran tidak valid.');
        result.innerHTML = `<div class="invoice-summary"><p>Invoice <strong>${escapeHtml(body.data.invoice_number)}</strong></p><p>Status <strong>${escapeHtml(body.data.status)}</strong></p><p>Total <strong>${formatMoney(body.data.amount)}</strong></p><p>Jatuh tempo <strong>${escapeHtml(new Date(`${body.data.due_date}T00:00:00`).toLocaleDateString('id-ID'))}</strong></p><a class="button button-primary" href="${escapeHtml(body.data.payment_url)}" target="_blank" rel="noopener noreferrer">Lanjutkan pembayaran ↗</a></div>`;
      } catch (error) {
        result.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }
})();
