# API Billing & CRM ISP

Backend MVP menggunakan Express 5 dan PostgreSQL. Proyek ini mencakup situs publik InstaLink, dashboard admin di `/admin`, autentikasi staf berbasis JWT, pengelolaan pelanggan dan layanan, paket internet, pembuatan tagihan bulanan di muka, tautan pembayaran/webhook Xendit, tiket dukungan, ajuan pemasangan, serta laporan gangguan pelanggan.

## Menjalankan di komputer lokal

1. Pasang dependensi dengan `npm install`.
2. Buat database PostgreSQL, lalu salin `.env.example` menjadi `.env`. Atur `DATABASE_URL`, `JWT_SECRET` acak minimal 32 karakter, dan `CORS_ORIGIN`.
3. Jalankan migrasi dengan `npm run migrate`.
4. Atur `ADMIN_NAME`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD` di `.env`. Kata sandi admin harus minimal 12 karakter. Jalankan `npm run create-admin`.
5. Jalankan `npm run dev`, lalu buka `http://localhost:3000` untuk situs publik InstaLink atau `http://localhost:3000/admin` untuk masuk ke dashboard. Halaman publik yang tersedia: `/`, `/pasang-wifi-sumedang`, `/pasang-wifi-sumedang-murah`, `/lapor-gangguan`, `/galeri`, `/berita`, `/bayar`, `/kontak`, dan `/corporate`. Masuk ke dashboard menggunakan kredensial admin dari langkah 4. `GET /health` memeriksa kesehatan proses aplikasi, sedangkan `GET /ready` memeriksa koneksi database.

Migrasi dijalankan menurut urutan nama file dan dicatat di `schema_migrations`. Migrasi yang sudah tercatat akan dilewati pada proses berikutnya.

Jangan commit file `.env` atau membagikan kredensial database dan penyedia layanan. Untuk deployment, gunakan HTTPS dan akun database dengan hak akses terbatas.

## Ringkasan API

Semua endpoint API selain `/health`, `/ready`, `/api/auth/login`, endpoint di bawah `/api/public`, dan `/api/webhooks/xendit` memerlukan header `Authorization: Bearer <token>`.

| Metode | Path | Keterangan |
| --- | --- | --- |
| POST | `/api/auth/login` | Login staf |
| GET | `/api/public/plans` | Daftar publik paket standar yang aktif untuk situs pemasaran |
| POST | `/api/public/payment-link` | Memeriksa nomor invoice dan kode pelanggan, lalu mengembalikan tautan pembayaran untuk tagihan yang dapat dibayar (maksimal 10 percobaan per IP setiap 15 menit) |
| POST | `/api/public/coverage-check` | Memeriksa koordinat peta/perangkat terhadap rute kabel pada KML privat dan hanya mengembalikan perkiraan ketersediaan (maksimal 30 percobaan per IP setiap 15 menit) |
| POST | `/api/public/installation-requests` | Menerima ajuan pemasangan publik (maksimal 5 pengajuan per IP setiap 15 menit) |
| POST | `/api/public/trouble-reports` | Menerima laporan gangguan publik (berbagi batas 5 pengajuan per IP setiap 15 menit dengan ajuan pemasangan) |
| GET | `/api/overview` | Metrik ringkasan, tren tagihan 6 bulan, pelanggan aktif per paket, invoice terbaru, dan tiket dukungan prioritas |
| GET, POST | `/api/customers` | Melihat daftar pelanggan beserta ringkasan koneksi/IP PPPoE dan membuat pelanggan |
| PATCH | `/api/customers/:id` | Memperbarui detail pelanggan |
| PATCH | `/api/customers/:id/activation` | Admin mengaktifkan kembali pelanggan yang dibatalkan; layanan lama yang dibatalkan tetap tersimpan |
| DELETE | `/api/customers/:id` | Admin menonaktifkan pelanggan secara lunak dan membatalkan layanan aktif; riwayat tetap disimpan |
| DELETE | `/api/customers/:id/permanent` | Admin menghapus pelanggan dan riwayat terkait yang belum lunas secara permanen; ditolak jika ada invoice lunas atau tautan Xendit aktif |
| GET | `/api/customers/:id` | Detail pelanggan beserta layanannya |
| GET, POST | `/api/plans` | Melihat paket; admin dapat membuat paket |
| PATCH | `/api/plans/:id` | Admin memperbarui paket; perubahan berlaku untuk invoice berikutnya |
| PATCH | `/api/plans/:id/activation` | Admin mengaktifkan atau menonaktifkan paket dengan `{ "isActive": true/false }` |
| DELETE | `/api/plans/:id` | Admin menonaktifkan paket; pelanggan yang sudah berlangganan tetap aktif dan ditagih |
| DELETE | `/api/plans/:id/permanent` | Admin menghapus paket secara permanen hanya jika belum pernah digunakan oleh layanan |
| GET, POST | `/api/routers` | Admin melihat router MikroTik tanpa rahasia kredensial dan menambahkan router dengan kredensial terenkripsi |
| PATCH | `/api/routers/:id` | Admin mengubah pengaturan router atau mengaktifkan/menonaktifkan router yang belum digunakan |
| POST | `/api/routers/:id/test` | Admin menguji koneksi API dan akses baca ke sesi PPPoE aktif |
| POST | `/api/routers/:id/script` | Admin membuat skrip konfigurasi RouterOS untuk API router dan RADIUS |
| GET | `/api/routers/:id/sessions` | Admin melihat hingga 100 sesi accounting RADIUS terbaru |
| DELETE | `/api/routers/:id` | Admin menghapus router yang tidak memiliki layanan aktif |
| GET, POST | `/api/services` | Melihat layanan beserta status PPPoE MikroTik, IP, caller-id, dan uptime; admin menetapkan paket, nama pengguna PPPoE, dan router |
| PATCH | `/api/services/:id` | Admin mengubah paket, nama pengguna PPPoE, atau router pelanggan |
| DELETE | `/api/services/:id` | Admin membatalkan layanan; riwayat tetap disimpan |
| DELETE | `/api/services/:id/permanent` | Admin menghapus layanan permanen hanya jika pelanggan tidak memiliki invoice |
| GET | `/api/invoices` | Melihat dan memfilter invoice |
| DELETE | `/api/invoices/:id` | Admin menghapus invoice yang belum lunas dan catatan pembayarannya secara permanen; invoice lunas atau tautan Xendit aktif dilindungi |
| POST | `/api/invoices/generate` | Admin membuat invoice untuk `{ "period": "YYYY-MM" }`; aman dijalankan ulang |
| POST | `/api/invoices/:id/payment-link` | Admin membuat tautan pembayaran invoice Xendit |
| GET, PUT | `/api/settings/general` | Admin membaca atau menyimpan identitas perusahaan untuk invoice, satu atau dua rekening bank, dan jadwal pengingat invoice |
| GET | `/api/settings/invoice` | Admin membaca desain header invoice dan pratinjau logo |
| PUT, DELETE | `/api/settings/invoice/logo/:side` | Admin mengunggah atau menghapus logo invoice kiri/kanan (PNG, JPEG, atau WebP; maksimal 2 MB) |
| GET, POST | `/api/tickets` | Melihat atau membuat tiket dukungan |
| PATCH | `/api/tickets/:id` | Memperbarui status, prioritas, atau petugas tiket |
| GET, PATCH | `/api/requests/installation` dan `/api/requests/installation/:id` | Melihat ajuan pemasangan dan memperbarui status/catatan tindak lanjut |
| GET, PATCH | `/api/requests/trouble` dan `/api/requests/trouble/:id` | Melihat laporan gangguan dan memperbarui status/catatan tindak lanjut |
| GET, POST | `/api/users` | Admin melihat daftar staf dan membuat akun (kata sandi minimal 12 karakter) |
| POST | `/api/webhooks/xendit` | Callback invoice dari Xendit |

Dashboard menyediakan formulir untuk operasi tersebut dan disajikan dari origin yang sama dengan API, sehingga tampilan browser tidak memerlukan server frontend terpisah atau konfigurasi CORS. Formulir ajuan pemasangan dan laporan gangguan mengirim data ke backend untuk ditindaklanjuti staf; formulir kontak menyiapkan pesan agar pengunjung mengirimkannya melalui WhatsApp atau email. Situs hanya menampilkan nomor pengajuan/laporan setelah penyimpanan berhasil. Halaman pembayaran memerlukan nomor invoice dan kode pelanggan, serta hanya mengembalikan nominal, tanggal jatuh tempo, status, dan URL pembayaran Xendit dari invoice yang cocok. Pemeriksa jangkauan menggunakan peta Leaflet interaktif: pengunjung dapat memilih lokasi pemasangan di peta atau menggunakan lokasi perangkat. Koordinat terpilih hanya dikirim ke API pengecekan jangkauan dan tidak dikembalikan atau disimpan; layanan ubin OpenStreetMap dapat menerima permintaan untuk area peta yang dilihat pengunjung. Hasil menunjukkan apakah rute kabel berada dalam jarak 100 meter; hasil positif hanya perkiraan awal dan harus dikonfirmasi tim. Pembuatan invoice atau tautan pembayaran Xendit mengubah data nyata dan dashboard meminta konfirmasi terlebih dahulu.

Halaman admin **Pengaturan Umum** menyimpan nama, alamat, nomor telepon, deskripsi invoice, satu atau dua rekening bank, dan pilihan waktu pengingat invoice (3, 5, 7, atau 10 hari sebelum jatuh tempo). Saat ini waktu pengingat hanya disimpan sebagai konfigurasi. Pengiriman otomatis melalui email atau WhatsApp belum aktif sampai integrasi tersebut tersedia dan dikonfigurasi.

Halaman pengaturan **Invoice** menyimpan logo kiri dan kanan secara terpisah di PostgreSQL serta menampilkannya di sisi nama dan alamat perusahaan dari **Pengaturan Umum**. Unggahan logo menerima PNG, JPEG, atau WebP hingga 2 MB dan memeriksa signature file. Pratinjau hanya untuk desain; pembuatan PDF invoice belum tersedia.

Tempatkan sumber data jangkauan di `data/coverage/titik-pelanggan.kml` pada server. KML privat ini memuat lokasi pelanggan/jaringan, dikecualikan dari Git, dan tidak boleh ditempatkan di bawah `public/` atau dibuka ke browser. Distribusikan melalui transfer file server yang aksesnya dibatasi atau mekanisme penyediaan data/rahasia. Geolokasi perangkat memerlukan HTTPS (kecuali di localhost) dan izin pengunjung. Peta menggunakan ubin OpenStreetMap dan memerlukan koneksi internet.

Pelanggan yang dibatalkan dapat diaktifkan kembali dari daftar pelanggan. Pengaktifan kembali tidak memulai ulang layanan yang sebelumnya dibatalkan; tambahkan layanan baru dari halaman layanan PPPoE untuk melanjutkan penagihan, sementara riwayat layanan dan invoice lama tetap dipertahankan.

Paket standar memiliki kecepatan katalog dan harga bulanan tetap. Layanan OHO menggunakan profil tetap 100/50 Mbps dengan rasio contention 1:2; layanan Dedicated menggunakan profil tetap 100/100 Mbps dengan rasio 1:1. Hanya harga bulanan yang dinegosiasikan per pelanggan. Profil ditampilkan pada daftar paket dan layanan serta tidak dapat diubah per layanan. Pembuatan invoice menggunakan harga bulanan yang disepakati untuk layanan OHO/Dedicated dan harga katalog untuk layanan standar. Perubahan harga berlaku untuk invoice berikutnya dan tidak mengubah invoice lama. Jenis paket tidak dapat diubah setelah dibuat; buat paket baru jika memerlukan jenis paket berbeda.

Dashboard menyediakan penonaktifan dan penghapusan permanen data pelanggan. Penghapusan permanen pelanggan menghapus layanan, tiket, invoice yang belum lunas, dan catatan pembayaran terkait dalam satu transaksi; tindakan ini ditolak jika pelanggan memiliki invoice lunas atau invoice Xendit aktif. Penghapusan invoice permanen juga menghapus catatan pembayarannya dan ditolak untuk invoice lunas atau invoice Xendit aktif. Untuk mengonfirmasi tindakan tersebut, ketik kode pelanggan atau nomor invoice. Penghapusan permanen paket memerlukan nama paket dan ditolak jika paket tersebut pernah digunakan oleh layanan, termasuk layanan lama yang dibatalkan. Penghapusan permanen layanan memerlukan nama pengguna PPPoE dan ditolak jika pelanggan memiliki riwayat invoice. Gunakan penghapusan permanen hanya untuk data uji; riwayat akuntansi/pembayaran tidak seharusnya dihapus. Paket dan layanan dapat dinonaktifkan tanpa menghapus riwayatnya. Paket dapat diaktifkan kembali dari daftar paket; langganan aktif ke paket nonaktif tetap berjalan dan ditagih, tetapi paket tersebut tidak dapat dipilih untuk layanan baru.

Atur `XENDIT_SECRET_KEY` dan `XENDIT_CALLBACK_TOKEN`, lalu tetapkan URL callback di Xendit menjadi `https://<domain-anda>/api/webhooks/xendit`. Callback memeriksa token callback Xendit, ID invoice, dan nominal, serta menangani percobaan ulang dengan aman.

## Cakupan saat ini

Pembuatan invoice menagih layanan aktif satu kali per pelanggan untuk setiap bulan penagihan. `billing_day` dapat diatur dari tanggal 1 sampai 28. Nominal menggunakan rupiah bulat.

API membaca status sesi PPPoE terkini dari `/ppp/active/print` di MikroTik dan mencocokkan router yang dipilih serta nama pengguna PPP untuk setiap layanan. Admin dapat menambahkan beberapa router melalui menu dashboard **Router MikroTik**, menguji koneksi API, membuat skrip RouterOS, dan menetapkan router saat membuat atau mengedit layanan. Skrip yang dibuat akan membuat atau memperbarui akun API RouterOS hanya-baca, mengatur zona waktu dan PPP RADIUS, serta mengaktifkan accounting. Periksa skrip sebelum menjalankannya karena skrip memuat kata sandi API dan shared secret RADIUS. Akun PPP lokal yang sudah ada tidak dihapus. Kata sandi API router, shared secret RADIUS, dan kata sandi pelanggan PPPoE dienkripsi dengan AES-256-GCM sebelum disimpan di PostgreSQL; kunci enkripsi tidak disimpan di database. Buat kunci persisten 32 byte, misalnya dengan `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, lalu atur sebagai `MIKROTIK_ENCRYPTION_KEY` di lingkungan server sebelum menyimpan kredensial. Nilainya harus terdiri dari 64 karakter heksadesimal. Cadangkan kunci ini secara terpisah dari database; jika kunci hilang atau diganti tanpa mengenkripsi ulang kredensial tersimpan, kredensial tersebut tidak dapat digunakan.

Server RADIUS PPPoE bawaan bersifat opsional dan mendengarkan UDP 1812 untuk autentikasi serta UDP 1813 untuk accounting. Aktifkan dengan `RADIUS_ENABLED=true`, atur `RADIUS_BIND_ADDRESS` bila perlu (nilai bawaan `0.0.0.0`), dan izinkan port UDP tersebut hanya dari alamat klien/sumber MikroTik yang dikonfigurasi pada firewall server. `RADIUS_AUTH_PORT` dan `RADIUS_ACCOUNTING_PORT` dapat diubah, tetapi pengaturan router harus menggunakan nilai yang sama. Alamat klien RADIUS pada formulir router harus sama dengan IP sumber yang mencapai backend (termasuk melalui VPN/NAT). Autentikasi saat ini mendukung PAP dan CHAP; konfigurasi akses PPPoE baru agar menggunakan PAP atau CHAP. MS-CHAP tidak didukung oleh layanan RADIUS ini. Shared secret RADIUS minimal 16 karakter dan kata sandi PPPoE minimal 1 karakter; kata sandi pelanggan tidak pernah dikembalikan oleh API. Pembaruan accounting Start/Interim/Stop disimpan di `radius_accounting_sessions`.

RADIUS menggunakan protokol shared secret melalui UDP, bukan TLS. Jaga lalu lintas di jaringan privat atau VPN tepercaya, gunakan shared secret acak yang panjang dan unik untuk setiap router, serta batasi port RADIUS dan API RouterOS pada firewall hanya untuk perangkat yang diharapkan. Jangan membuka layanan tersebut ke internet publik.

Daftar layanan dan pelanggan menampilkan status koneksi langsung, alamat PPP yang ditetapkan, caller-id (biasanya MAC router pelanggan), dan uptime. Data tersebut merupakan snapshot langsung yang di-cache hingga 10 detik, bukan log accounting historis. Jika router belum dikonfigurasi atau tidak dapat dijangkau, status koneksi ditampilkan sebagai tidak diketahui, bukan terputus. Integrasi hanya membaca data sesi; integrasi ini tidak membuat konfigurasi, menangguhkan, atau mengubah konfigurasi router. Setiap router yang dikonfigurasi memerlukan layanan API RouterOS yang dapat dijangkau dan akun khusus hanya-baca; batasi akses firewall router hanya untuk server backend.

Untuk kompatibilitas lama, satu router dapat dikonfigurasi melalui `MIKROTIK_HOST`, `MIKROTIK_USER`, dan `MIKROTIK_PASSWORD` di lingkungan server. `MIKROTIK_TLS` secara bawaan bernilai `true` dan menggunakan API-SSL pada port 8729; atur `MIKROTIK_PORT` secara eksplisit bila perlu, dan gunakan API tanpa enkripsi hanya melalui jaringan privat atau VPN tepercaya. Nilai bawaan `MIKROTIK_TIMEOUT_SECONDS` adalah 5. Konfigurasi multi-router baru sebaiknya dikelola dari menu admin. Aktifkan layanan API RouterOS dan gunakan akun khusus dengan izin hanya-baca. Batasi firewall router agar hanya menerima koneksi dari IP server backend dan jangan membuka port API ke internet publik. RouterOS harus mengizinkan `/ppp/active/print` untuk akun yang dipilih.
