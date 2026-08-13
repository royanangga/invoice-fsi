-- Jalankan ini di Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Aman dijalankan berkali-kali.
--
-- Setiap manager sekarang bisa punya tanda tangan (gambar) & jabatan sendiri,
-- yang otomatis dipasang di invoice begitu manager tsb meng-approve invoice
-- (lihat kolom approved_by di tabel invoices, dan endpoint /api/me/signature).

alter table users add column if not exists title text;
alter table users add column if not exists signature text; -- base64 data URL gambar ttd

notify pgrst, 'reload schema';
