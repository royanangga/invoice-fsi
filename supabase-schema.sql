-- Jalankan seluruh file ini di Supabase Dashboard → SQL Editor → New Query → Run

create table if not exists invoices (
  id bigint generated always as identity primary key,
  invoice_no text unique not null,
  invoice_date date not null,
  due_date date,
  customer_name text not null,
  customer_address text,
  attn text,
  currency text not null default 'IDR',
  batch text,
  remark text,
  status text not null default 'Belum Dibayar',
  exchange_rate numeric,
  created_by text,
  created_by_role text,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved')),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists invoice_items (
  id bigint generated always as identity primary key,
  invoice_id bigint not null references invoices(id) on delete cascade,
  item_name text not null,
  qty numeric default 1,
  amount numeric not null default 0
);

create table if not exists settings (
  key text primary key,
  value jsonb
);

create table if not exists users (
  id bigint generated always as identity primary key,
  username text unique not null,
  password_hash text not null,
  name text not null,
  role text not null check (role in ('staff', 'manager')),
  created_at timestamptz default now()
);
-- Catatan: akun login TIDAK diisi lewat SQL ini. Buat akun lewat script
-- `create-user.js` (lihat README) supaya password di-hash dengan aman,
-- bukan disimpan sebagai teks biasa.

-- Data awal: daftar customer & format nomor invoice
insert into settings (key, value) values
('customers', '[
  {"name":"FUJI SEATS (MALAYSIA) SDN BHD","address":"5, Jalan Jasmine 3, Kawasan Perindustrian Bukti Beruntung, Sek. BB 10, Bandar Bukit Beruntung, 48300 Rawang, Selangor Darul Ehsan","currency":"USD","code":"FJM"},
  {"name":"FUJI SEAT CO., LTD","address":"","currency":"JPY","code":"FJ"}
]'::jsonb)
on conflict (key) do nothing;

insert into settings (key, value) values
('number_format', '"{seq}/INV/FJI-FA/{roman}/{year}"'::jsonb)
on conflict (key) do nothing;

insert into settings (key, value) values
('company', '{
  "name": "PT. FUJI SEAT INDONESIA",
  "subtitle": "( A FOREIGN INVESTMENT COMPANY )",
  "address_line1": "JL. Agung Perkasa IX Blok K-1 No. 9-15",
  "address_line2": "Sunter Podomoro, Jakarta Utara 14350",
  "phone": "TELP. 62-21-6530 2228  FAX. 62-21-6530 3486",
  "bank_name": "MUFG Bank, Ltd.",
  "bank_branch": "JAKARTA BRANCH",
  "swift_code": "BOTKIDJX",
  "account_number": "5300911224",
  "signer_name": "Nono Suhena",
  "signer_title": "Finance Manager"
}'::jsonb)
on conflict (key) do nothing;

-- Catatan: tabel di atas dibuat TANPA Row Level Security aktif secara default,
-- dan aplikasi mengaksesnya dari server (Vercel) memakai SERVICE ROLE KEY,
-- jadi aman meski RLS belum diaktifkan. Jangan pernah pakai service role key di frontend.
