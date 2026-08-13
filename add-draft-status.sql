-- Jalankan ini di Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Aman dijalankan berkali-kali.
--
-- Fitur "Draft": invoice bisa disimpan dalam keadaan belum lengkap
-- (misalnya belum ada No. Invoice / Tanggal / Item) selama statusnya
-- masih "Draft". Supaya itu bisa tersimpan ke database, kolom-kolom
-- yang tadinya wajib (NOT NULL) perlu dilonggarkan.

alter table invoices alter column invoice_no drop not null;
alter table invoices alter column invoice_date drop not null;
alter table invoices alter column customer_name drop not null;

-- Wajib: refresh schema cache PostgREST supaya perubahan langsung dikenali
notify pgrst, 'reload schema';
