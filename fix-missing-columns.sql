-- Jalankan ini di Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Aman dijalankan berkali-kali, hanya menambah kolom yang belum ada.

alter table invoices add column if not exists created_by text;
alter table invoices add column if not exists created_by_role text;
alter table invoices add column if not exists approval_status text not null default 'pending';
alter table invoices add column if not exists approved_by text;
alter table invoices add column if not exists approved_at timestamptz;

-- Pastikan constraint check untuk approval_status ada (skip kalau sudah ada)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_approval_status_check'
  ) then
    alter table invoices add constraint invoices_approval_status_check
      check (approval_status in ('pending', 'approved'));
  end if;
end $$;

-- Data invoice lama yang belum punya approval_status dianggap sudah disetujui
update invoices set approval_status = 'approved' where approval_status is null;

-- Wajib: refresh schema cache PostgREST supaya kolom baru langsung dikenali
notify pgrst, 'reload schema';
