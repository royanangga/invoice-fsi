-- Jalankan ini di Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Aman dijalankan berkali-kali.
--
-- Setiap item invoice sekarang bisa punya deskripsi tersendiri (lebih panjang dari
-- nama item), yang muncul juga di hasil cetak/PDF.

alter table invoice_items add column if not exists description text;

notify pgrst, 'reload schema';
