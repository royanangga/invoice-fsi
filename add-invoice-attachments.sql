-- Jalankan file ini di Supabase Dashboard → SQL Editor → New Query → Run
-- Menambahkan fitur Lampiran Invoice (upload dokumen pendukung: PO, bukti transfer, kwitansi, dll)

create table if not exists invoice_attachments (
  id bigint generated always as identity primary key,
  invoice_id bigint not null references invoices(id) on delete cascade,
  filename text not null,
  mimetype text not null,
  size bigint not null,
  data text not null, -- isi file dalam base64 (konsisten dengan cara logo & tanda tangan disimpan di app ini)
  uploaded_by text,
  created_at timestamptz default now()
);

create index if not exists idx_invoice_attachments_invoice_id on invoice_attachments(invoice_id);
