-- Jalankan ini di Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Aman dijalankan berkali-kali.
--
-- Perubahan alur approval:
-- 1. Field status pembayaran ("Belum Dibayar" / "Sudah Dibayar") DIHAPUS dari sistem.
--    Kolom `status` sekarang cuma dipakai untuk membedakan:
--      - 'Draft'    : invoice belum lengkap/belum diajukan
--      - 'Diajukan' : invoice sudah lengkap & diajukan (resmi/menunggu approval
--                     ditentukan lewat kolom approval_status yang sudah ada)
-- 2. Invoice yang approval_status-nya 'approved' terkunci total (tidak bisa
--    diedit/dihapus lagi lewat API) sampai di-"Batalkan Approval"-nya dulu oleh manager.

-- Konversi data lama: semua yang bukan Draft dianggap 'Diajukan'
update invoices set status = 'Diajukan' where status is distinct from 'Draft';

alter table invoices alter column status set default 'Diajukan';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_status_check'
  ) then
    alter table invoices add constraint invoices_status_check
      check (status in ('Draft', 'Diajukan'));
  end if;
end $$;

-- Wajib: refresh schema cache PostgREST supaya perubahan langsung dikenali
notify pgrst, 'reload schema';
