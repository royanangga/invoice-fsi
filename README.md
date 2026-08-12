# Aplikasi Invoice — PT. Fuji Seat Indonesia (GitHub + Vercel + Supabase)

Versi ini dirancang untuk di-deploy online: kode di GitHub, hosting di Vercel,
database di Supabase (Postgres). Bisa diakses dari mana saja lewat 1 URL,
tidak bergantung ke satu komputer/browser tertentu.

## Ringkasan arsitektur

- **Frontend**: HTML/CSS/JS biasa di folder `public/` (otomatis di-host statis oleh Vercel)
- **Backend**: 1 Express app di `api/index.js`, berjalan sebagai Vercel Serverless Function
- **Database**: Supabase (Postgres) — dipilih karena Vercel tidak bisa menyimpan file SQLite secara permanen (server-nya "stateless")

---

## Langkah 1 — Buat project Supabase

1. Daftar/login di https://supabase.com → **New Project**.
2. Setelah project selesai dibuat, buka **SQL Editor** (menu kiri) → **New query**.
3. Copy-paste seluruh isi file `supabase-schema.sql` (ada di folder ini) → klik **Run**.
   Ini akan membuat tabel `invoices`, `invoice_items`, `settings`, plus data awal (daftar customer, format nomor, info perusahaan).
4. Buka **Project Settings → API**. Catat dua nilai ini:
   - **Project URL** (`https://xxxxx.supabase.co`)
   - **service_role key** (di bagian "Project API keys" — bukan yang `anon public`!)

   ⚠️ **service_role key ini rahasia**, jangan pernah taruh di kode frontend atau commit ke GitHub. Nanti hanya dipakai sebagai environment variable di Vercel.

## Langkah 2 — Push kode ke GitHub

Kalau belum pernah pakai Git/GitHub sama sekali:

1. Buat akun di https://github.com (kalau belum punya).
2. Buat repo baru: klik tombol **+** di kanan atas → **New repository** → beri nama misalnya `invoice-app-fuji-seat` → **Create repository** (biarkan kosong, jangan centang "Add README").
3. Di komputer kamu, buka folder project ini lewat terminal, lalu jalankan:
   ```
   git init
   git add .
   git commit -m "Initial commit - Aplikasi Invoice Fuji Seat"
   git branch -M main
   git remote add origin https://github.com/USERNAME-KAMU/invoice-app-fuji-seat.git
   git push -u origin main
   ```
   Ganti `USERNAME-KAMU` dengan username GitHub kamu. Saat push, browser/terminal akan minta login GitHub — ikuti saja instruksinya.

File `.gitignore` sudah disiapkan supaya `node_modules/` dan `.env` (yang berisi kunci rahasia) **tidak ikut ter-upload** ke GitHub.

## Langkah 3 — Deploy ke Vercel

1. Daftar/login di https://vercel.com (bisa langsung pakai akun GitHub).
2. Klik **Add New → Project**.
3. Pilih repo `invoice-app-fuji-seat` yang tadi kamu push → **Import**.
4. Sebelum klik Deploy, buka bagian **Environment Variables**, tambahkan:
   - `SUPABASE_URL` → isi dengan Project URL dari Langkah 1
   - `SUPABASE_SERVICE_KEY` → isi dengan service_role key dari Langkah 1
5. Klik **Deploy**. Tunggu ~1 menit.
6. Setelah selesai, Vercel kasih URL seperti `https://invoice-app-fuji-seat.vercel.app` — itu link aplikasinya, bisa dibuka dari mana saja.

## Langkah 4 — Import data lama dari Excel (sekali saja)

Ini dijalankan dari komputer kamu (bukan di Vercel), supaya bisa akses file Excel-nya:

1. Buat file `.env` di folder project ini (boleh copy dari `.env.example`), isi dengan `SUPABASE_URL` dan `SUPABASE_SERVICE_KEY` yang sama seperti di Vercel.
2. Jalankan:
   ```
   npm install
   npm run import-xls -- "/path/ke/Invoice_Manual_2026.xls"
   ```
3. Refresh halaman aplikasi di Vercel — data lama akan langsung muncul (karena sudah tersimpan di Supabase, dipakai bersama oleh semua yang buka link Vercel-nya).

## Development lokal (opsional)

Untuk coba-coba di komputer sebelum deploy:
```
npm install
npm run dev
```
Buka `http://localhost:3210`. Ini tetap terhubung ke Supabase yang sama (lewat `.env`), jadi hati-hati kalau sedang testing — datanya nyata.

## Struktur file

```
api/index.js              → seluruh backend (Express, jadi 1 serverless function)
public/                   → frontend (otomatis di-host statis oleh Vercel)
lib/supabaseClient.js     → koneksi ke Supabase
lib/utils.js              → helper (nomor invoice otomatis, format angka)
supabase-schema.sql       → skema database, jalankan sekali di Supabase SQL Editor
import-xls-supabase.js    → script import data lama dari Excel
vercel.json               → konfigurasi routing Vercel
.env.example              → contoh isi file .env
```

## Kalau nanti mau ubah info perusahaan (bank, penandatangan, dll)

Tidak perlu ubah kode — tinggal buka aplikasinya, klik tombol **"Pengaturan Perusahaan"**, edit, simpan. Datanya tersimpan di tabel `settings` di Supabase.

## Troubleshooting

- **Error "SUPABASE_URL / SUPABASE_SERVICE_KEY belum diset"** → cek environment variables di Vercel (Project Settings → Environment Variables), pastikan sudah benar lalu **redeploy**.
- **Data tidak muncul setelah deploy** → pastikan sudah menjalankan `supabase-schema.sql` di Supabase SQL Editor.
- **Nomor invoice bentrok saat dipakai 2 orang bersamaan** → sangat jarang terjadi, tapi kalau terjadi aplikasi akan menolak simpan dan minta nomor lain (validasi nomor dobel sudah aktif).
