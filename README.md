# Aplikasi Invoice — PT. Fuji Seat Indonesia (GitHub + Vercel + Supabase)

Versi ini di-deploy sepenuhnya online: kode di GitHub, hosting di Vercel,
database di Supabase (Postgres). **Semua langkah di bawah bisa dilakukan lewat
browser saja** — tidak perlu install Node.js, git, atau apapun di komputer kamu.

## Ringkasan arsitektur

- **Frontend**: HTML/CSS/JS biasa di folder `public/` (otomatis di-host statis oleh Vercel)
- **Backend**: 1 Express app di `api/index.js`, berjalan sebagai Vercel Serverless Function
- **Database**: Supabase (Postgres)

---

## Langkah 1 — Buat project Supabase

1. Daftar/login di https://supabase.com → **New Project**.
2. Setelah project selesai dibuat, buka **SQL Editor** (menu kiri) → **New query**.
3. Copy-paste seluruh isi file `supabase-schema.sql` (ada di folder ini, buka lewat GitHub setelah Langkah 2, atau buka file-nya langsung dari hasil ekstrak zip) → klik **Run**.
   Ini membuat tabel `invoices`, `invoice_items`, `settings`, `users`, plus data awal (daftar customer, format nomor, info perusahaan).
4. Buka **Project Settings → API**. Catat dua nilai ini:
   - **Project URL** (`https://xxxxx.supabase.co`)
   - **service_role key** (bagian "Project API keys" — bukan yang `anon public`!)

   ⚠️ Kunci ini rahasia — nanti hanya ditaruh sebagai Environment Variable di Vercel, **jangan** ditaruh di kode/GitHub.

## Langkah 2 — Upload kode ke GitHub (lewat browser, tanpa git)

1. Ekstrak zip project ini di komputer kamu jadi satu folder biasa.
2. Buat akun di https://github.com kalau belum punya.
3. Klik **+** di kanan atas → **New repository** → beri nama misalnya `invoice-app-fuji-seat` → **Create repository** (biarkan kosong).
4. Di halaman repo yang baru dibuat, cari link kecil **"uploading an existing file"** (atau klik tombol **Add file → Upload files**).
5. **Buka folder hasil ekstrak di File Explorer/Finder, lalu drag semua isi folder** (bukan folder itu sendiri, tapi isinya: `api`, `public`, `lib`, `package.json`, dst) ke area upload di GitHub. GitHub modern mendukung drag folder lengkap dengan struktur sub-foldernya.
   - **Jangan upload folder `node_modules`** kalau ada (biasanya sudah tidak ada di zip ini, tapi kalau ada, lewati) — Vercel akan install dependency-nya sendiri otomatis.
   - Boleh upload folder `.git` atau tidak, tidak masalah — GitHub mengabaikannya lewat upload browser.
6. Scroll ke bawah, isi commit message singkat (misal "Initial upload"), klik **Commit changes**.

Kode kamu sekarang sudah ada di GitHub, semua lewat browser.

## Langkah 3 — Deploy ke Vercel

1. Daftar/login di https://vercel.com (bisa langsung pakai akun GitHub, paling gampang).
2. Klik **Add New → Project**.
3. Pilih repo `invoice-app-fuji-seat` yang tadi kamu upload → **Import**.
4. Sebelum klik Deploy, buka bagian **Environment Variables**, tambahkan tiga ini:
   - `SUPABASE_URL` → Project URL dari Langkah 1
   - `SUPABASE_SERVICE_KEY` → service_role key dari Langkah 1
   - `JWT_SECRET` → ketik string acak apapun yang panjang (contoh: mash keyboard 40+ karakter) — dipakai untuk mengamankan sesi login
5. Klik **Deploy**. Tunggu ~1 menit.
6. Vercel akan kasih URL seperti `https://invoice-app-fuji-seat.vercel.app` — itu link aplikasinya.

## Langkah 4 — Setup akun manager pertama (lewat terminal, sekali saja)

Karena hanya manager yang boleh mengelola user, akun manager pertama harus dibuat lewat script `create-user.js` (butuh Node.js terpasang di komputer kamu):

1. Buka terminal di folder project ini, lalu jalankan `npm install`.
2. Salin `.env.example` menjadi `.env`, isi `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, dan `JWT_SECRET` sama persis seperti yang dipakai di Environment Variables Vercel.
3. Jalankan:
   ```
   node create-user.js --username admin --password rahasia123 --role manager --name "Nama Kamu"
   ```
4. Buka `https://LINK-VERCEL-KAMU.vercel.app/login.html` → masuk pakai akun yang baru dibuat.

## Langkah 5 — Tambah akun staff (lewat aplikasi, oleh manager)

Setelah login sebagai manager, klik menu **"Kelola User"** di sidebar samping →
isi nama, username, password, pilih role **Staff** → **Tambah User**.
Bisa tambah/hapus akun staff/manager lain kapan saja dari sini, tanpa perlu install apapun.
Menu ini hanya muncul dan hanya bisa diakses oleh akun dengan role **Manager**.

**Perbedaan role:**
- Staff & Manager punya akses yang sama untuk membuat, mengedit, mencetak, menghapus invoice, dan mengubah Pengaturan Perusahaan.
- Bedanya: invoice yang dibuat **staff** berstatus **"Menunggu Approval"** — di hasil cetak/PDF-nya, kolom tanda tangan masih kosong (ada catatan "Menunggu persetujuan Manager"). Setelah **manager** klik tombol **Approve** di daftar invoice, tanda tangan otomatis muncul.
- Invoice buatan **manager** langsung otomatis "Disetujui".
- Kalau staff mengedit invoice yang sudah disetujui, statusnya otomatis kembali ke "Menunggu Approval".

## Langkah 6 — Import data lama dari Excel (lewat aplikasi)

1. Login ke aplikasi (staff atau manager, sama saja).
2. Klik tombol **"Import dari Excel"** di halaman utama.
3. Pilih file `Invoice_Manual_2026.xls` dari komputer kamu.
4. Tunggu beberapa detik — muncul notifikasi jumlah invoice yang berhasil/dilewati.

Semua data lama otomatis berstatus "Disetujui" (dianggap sudah final, tidak perlu di-approve ulang oleh manager).

---

## Struktur file

```
api/index.js              → seluruh backend (Express, jadi 1 serverless function)
public/                   → frontend (otomatis di-host statis oleh Vercel)
public/login.html         → halaman login
lib/supabaseClient.js     → koneksi ke Supabase
lib/auth.js               → hashing password & sesi login (JWT + cookie)
lib/utils.js              → helper (nomor invoice otomatis, format angka)
lib/importXls.js          → logic parsing file Excel lama
supabase-schema.sql       → skema database, jalankan sekali di Supabase SQL Editor
vercel.json               → konfigurasi routing Vercel
.env.example               → contoh isi environment variables (untuk referensi Langkah 3)
```

> Catatan: `create-user.js` wajib dipakai satu kali di awal untuk membuat akun
> manager pertama (lihat Langkah 4). Setelah itu tidak wajib dipakai lagi, karena
> tambah/hapus user selanjutnya sudah bisa lewat menu "Kelola User" di aplikasi
> (khusus manager). `import-xls-supabase.js` juga opsional — sudah ada tombol
> "Import dari Excel" di aplikasi untuk keperluan yang sama.

## Kalau nanti mau ubah info perusahaan (bank, penandatangan, dll)

Login → klik **"Pengaturan Perusahaan"** → edit → simpan. Semua lewat browser.

## Troubleshooting

- **Error "SUPABASE_URL / SUPABASE_SERVICE_KEY belum diset"** → cek Environment Variables di Vercel (Project Settings → Environment Variables), pastikan sudah benar lalu **redeploy** (Deployments → titik tiga → Redeploy).
- **Lupa password manager satu-satunya / tidak ada akun manager sama sekali** → jalankan lagi `node create-user.js --username ... --password ... --role manager --name "..."` dari terminal (lihat Langkah 4). Kalau usernamenya sudah ada, script ini otomatis update password/role-nya.
- **Data tidak muncul setelah deploy** → pastikan sudah menjalankan `supabase-schema.sql` di Supabase SQL Editor.
- **Upload ke GitHub gagal/lambat** → GitHub web upload ada batas ukuran; project ini kecil (tanpa `node_modules`) jadi harusnya lancar. Kalau ada error ukuran file, cek tidak sengaja ikut upload folder `node_modules` atau `.git`.
