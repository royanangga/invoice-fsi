const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const XLSX = require('xlsx');
const { getSupabase } = require('../lib/supabaseClient');
const { nextInvoiceNumber, numFmt, numFmtValuta } = require('../lib/utils');
const { importXlsBuffer } = require('../lib/importXls');
const { COOKIE_NAME, hashPassword, verifyPassword, signToken, requireAuth, requireRole } = require('../lib/auth');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

// ---------- Auth ----------
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi' });
    const supabase = getSupabase();
    const { data: user, error } = await supabase.from('users').select('*').eq('username', username).single();
    if (error || !user) return res.status(401).json({ error: 'Username atau password salah' });
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Username atau password salah' });
    const token = signToken({ sub: user.id, username: user.username, role: user.role, name: user.name });
    res.cookie(COOKIE_NAME, token, cookieOpts);
    res.json({ username: user.username, role: user.role, name: user.name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  const { verifyToken } = require('../lib/auth');
  const user = token ? verifyToken(token) : null;
  if (!user) return res.json(null);
  res.json({ username: user.username, role: user.role, name: user.name });
});

// Info branding minimal (logo & nama perusahaan) dipakai untuk favicon — sengaja tanpa auth
// karena dibutuhkan di halaman login sebelum user masuk, dan tidak berisi data sensitif.
app.get('/api/public/branding', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.from('settings').select('value').eq('key', 'company').single();
    const co = data ? data.value : null;
    res.json({ logo: (co && co.logo) || null, name: (co && co.name) || null });
  } catch (e) {
    res.json({ logo: null, name: null });
  }
});

// Semua route /api/* di bawah ini wajib login
app.use('/api', requireAuth);

// ---------- Kelola akun staff/manager ----------
app.get('/api/users', requireRole('manager'), async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('users').select('id, username, name, role, created_at').order('created_at');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/users', requireRole('manager'), async (req, res) => {
  try {
    const supabase = getSupabase();
    const { username, password, name, role } = req.body;
    if (!username || !password || !name || !role) return res.status(400).json({ error: 'Semua field wajib diisi' });
    if (!['staff', 'manager'].includes(role)) return res.status(400).json({ error: 'Role tidak valid' });
    if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
    const password_hash = await hashPassword(password);
    const { error } = await supabase.from('users').insert({ username, password_hash, name, role });
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Username sudah dipakai' });
      throw error;
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/users/:id', requireRole('manager'), async (req, res) => {
  try {
    const supabase = getSupabase();
    if (String(req.user.sub) === String(req.params.id)) {
      return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri yang sedang login' });
    }
    const { error } = await supabase.from('users').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Tanda tangan pribadi manager (dipasang otomatis di invoice yang mereka approve) ----------
app.get('/api/me/signature', requireRole('manager'), async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('users').select('title, signature').eq('id', req.user.sub).single();
    if (error) throw error;
    res.json(data || { title: null, signature: null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/me/signature', requireRole('manager'), async (req, res) => {
  try {
    const supabase = getSupabase();
    const { title, signature } = req.body;
    const { error } = await supabase.from('users').update({
      title: title || null,
      signature: signature || null
    }).eq('id', req.user.sub);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Import data lama dari Excel (upload lewat browser) ----------
app.post('/api/import-xls', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan' });
    const supabase = getSupabase();
    const result = await importXlsBuffer(supabase, req.file.buffer);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Settings ----------
app.get('/api/settings', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('settings').select('key, value');
    if (error) throw error;
    const out = { customers: [], number_format: '{seq}/INV/FJI-FA/{roman}/{year}', company: null };
    (data || []).forEach(row => {
      if (row.key === 'customers') out.customers = row.value;
      else if (row.key === 'number_format') out.number_format = row.value;
      else if (row.key === 'company') out.company = row.value;
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { customers, number_format, company } = req.body;
    const rows = [];
    if (customers) rows.push({ key: 'customers', value: customers });
    if (number_format) rows.push({ key: 'number_format', value: number_format });
    if (company) rows.push({ key: 'company', value: company });
    if (rows.length) {
      const { error } = await supabase.from('settings').upsert(rows, { onConflict: 'key' });
      if (error) throw error;
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Next invoice number preview ----------
app.get('/api/next-number', async (req, res) => {
  try {
    const supabase = getSupabase();
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const year = new Date(date).getFullYear();
    const { data: nfRow } = await supabase.from('settings').select('value').eq('key', 'number_format').single();
    const template = nfRow ? nfRow.value : '{seq}/INV/FJI-FA/{roman}/{year}';
    const { data: existing, error } = await supabase.from('invoices').select('invoice_no').like('invoice_no', `%/${year}`);
    if (error) throw error;
    const invoice_no = nextInvoiceNumber((existing || []).map(r => r.invoice_no), date, template);
    res.json({ invoice_no });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Invoices CRUD ----------
app.get('/api/invoices', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { q, status, customer, approval_status } = req.query;
    let query = supabase.from('invoices').select('*, items:invoice_items(*)').order('invoice_date', { ascending: false }).order('id', { ascending: false });
    if (status) query = query.eq('status', status);
    if (approval_status) query = query.eq('approval_status', approval_status);
    if (customer) query = query.eq('customer_name', customer);
    if (q) query = query.or(`invoice_no.ilike.%${q}%,remark.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    (data || []).forEach(inv => {
      inv.total = (inv.items || []).reduce((s, it) => s + (it.amount * (it.qty || 1)), 0);
    });
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Bulk print (dipilih dari Daftar Invoice) — satu dokumen, satu invoice per halaman.
// Didaftarkan SEBELUM /api/invoices/:id supaya "print-batch" tidak ketangkap sebagai :id.
app.get('/api/invoices/print-batch', async (req, res) => {
  try {
    const supabase = getSupabase();
    const ids = (req.query.ids || '').toString().split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return res.status(400).send('Tidak ada invoice dipilih');
    const { data: invoices, error } = await supabase.from('invoices').select('*, items:invoice_items(*)').in('id', ids);
    if (error) throw error;
    if (!invoices || invoices.length === 0) return res.status(404).send('Invoice tidak ditemukan');
    // Urutkan sesuai urutan ids yang dipilih di UI
    const order = new Map(ids.map((id, i) => [String(id), i]));
    invoices.sort((a, b) => (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0));
    const co = await getCompanySettings();
    const approvedUsernames = [...new Set(invoices.filter(i => i.approval_status === 'approved' && i.approved_by).map(i => i.approved_by))];
    let approverMap = {};
    if (approvedUsernames.length > 0) {
      const { data: users } = await supabase.from('users').select('username, name, title, signature').in('username', approvedUsernames);
      (users || []).forEach(u => { approverMap[u.username] = u; });
    }
    const entries = invoices.map(inv => ({
      inv,
      approver: (inv.approval_status === 'approved' && inv.approved_by) ? (approverMap[inv.approved_by] || null) : null
    }));
    res.send(buildBatchInvoiceHtml(entries, co));
  } catch (e) {
    res.status(500).send('Error: ' + e.message);
  }
});

app.get('/api/invoices/:id', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('invoices').select('*, items:invoice_items(*)').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/invoices', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { invoice_no, invoice_date, due_date, customer_name, customer_address, attn, currency, batch, remark, items, status, exchange_rate } = req.body;
    // Invoice berstatus 'Draft' boleh disimpan belum lengkap (belum ada no./tanggal/
    // customer/item). Validasi ketat hanya berlaku untuk invoice resmi.
    const isDraft = status === 'Draft';
    if (!isDraft && (!invoice_no || !invoice_date || !customer_name)) {
      return res.status(400).json({ error: 'invoice_no, invoice_date, customer_name wajib diisi' });
    }
    // invoice_no kosong disimpan sebagai NULL (bukan string kosong) supaya beberapa
    // draft tanpa nomor tidak bentrok dengan constraint unique di kolom invoice_no.
    const { data: inv, error: invErr } = await supabase.from('invoices').insert({
      invoice_no: (invoice_no || '').trim() || null,
      invoice_date: invoice_date || null,
      due_date: due_date || null,
      customer_name: customer_name || null,
      customer_address: customer_address || '', attn: attn || '', currency: currency || 'IDR',
      batch: batch || '', remark: remark || '', status: isDraft ? 'Draft' : 'Diajukan',
      exchange_rate: exchange_rate || null,
      created_by: req.user.username,
      created_by_role: req.user.role,
      // Semua invoice non-draft — termasuk buatan manager sendiri — wajib melalui menu
      // Approval dulu (approval_status selalu 'pending' saat dibuat/diajukan). Tanda
      // tangan cuma muncul setelah benar-benar di-approve lewat POST /:id/approve.
      approval_status: 'pending',
      approved_by: null,
      approved_at: null
    }).select().single();
    if (invErr) {
      if (invErr.code === '23505') return res.status(400).json({ error: 'Nomor invoice sudah digunakan' });
      throw invErr;
    }
    const itemRows = (items || []).map(it => ({ invoice_id: inv.id, item_name: it.item_name, description: it.description || null, qty: it.qty || 1, amount: it.amount || 0 }));
    if (itemRows.length) {
      const { error: itemErr } = await supabase.from('invoice_items').insert(itemRows);
      if (itemErr) throw itemErr;
    }
    res.json({ id: inv.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/invoices/:id', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { invoice_no, invoice_date, due_date, customer_name, customer_address, attn, currency, batch, remark, items, status, exchange_rate } = req.body;
    const isDraft = status === 'Draft';
    if (!isDraft && (!invoice_no || !invoice_date || !customer_name)) {
      return res.status(400).json({ error: 'invoice_no, invoice_date, customer_name wajib diisi' });
    }
    // Invoice yang sudah disetujui Manager terkunci total — tidak bisa diedit lewat API
    // sampai approval-nya dibatalkan dulu (lihat POST /api/invoices/:id/unapprove).
    const { data: current, error: curErr } = await supabase.from('invoices').select('approval_status').eq('id', req.params.id).single();
    if (curErr || !current) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
    if (current.approval_status === 'approved') {
      return res.status(403).json({ error: 'Invoice ini sudah disetujui Manager dan terkunci — tidak bisa diedit. Batalkan approval-nya dulu kalau perlu revisi.' });
    }
    const { error: updErr } = await supabase.from('invoices').update({
      invoice_no: (invoice_no || '').trim() || null,
      invoice_date: invoice_date || null,
      due_date: due_date || null,
      customer_name: customer_name || null,
      customer_address: customer_address || '', attn: attn || '', currency: currency || 'IDR',
      batch: batch || '', remark: remark || '', status: isDraft ? 'Draft' : 'Diajukan',
      exchange_rate: exchange_rate || null,
      // Sama seperti saat dibuat: edit tidak pernah auto-approve, tetap 'pending'
      // sampai benar-benar di-approve lewat menu Approval.
      approval_status: 'pending',
      approved_by: null,
      approved_at: null
    }).eq('id', req.params.id);
    if (updErr) {
      if (updErr.code === '23505') return res.status(400).json({ error: 'Nomor invoice sudah digunakan' });
      throw updErr;
    }
    await supabase.from('invoice_items').delete().eq('invoice_id', req.params.id);
    const itemRows = (items || []).map(it => ({ invoice_id: req.params.id, item_name: it.item_name, description: it.description || null, qty: it.qty || 1, amount: it.amount || 0 }));
    if (itemRows.length) {
      const { error: itemErr } = await supabase.from('invoice_items').insert(itemRows);
      if (itemErr) throw itemErr;
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Manager menyetujui invoice buatan staff — tanda tangan baru muncul di print setelah ini,
// dan invoice langsung terkunci (tidak bisa diedit/dihapus lagi).
app.post('/api/invoices/:id/approve', requireRole('manager'), async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: current, error: curErr } = await supabase.from('invoices').select('status').eq('id', req.params.id).single();
    if (curErr || !current) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
    if (current.status === 'Draft') {
      return res.status(400).json({ error: 'Invoice ini masih Draft — lengkapi dan ajukan dulu sebelum bisa di-approve.' });
    }
    const { error } = await supabase.from('invoices').update({
      approval_status: 'approved',
      approved_by: req.user.username,
      approved_at: new Date().toISOString()
    }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Manager membatalkan approval (kembali ke "Menunggu Approval") — dipakai kalau
// ternyata ada kesalahan dan invoice perlu direvisi lagi setelah terlanjur di-approve.
app.post('/api/invoices/:id/unapprove', requireRole('manager'), async (req, res) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('invoices').update({
      approval_status: 'pending',
      approved_by: null,
      approved_at: null
    }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/invoices/:id', async (req, res) => {
  try {
    const supabase = getSupabase();
    // Invoice resmi yang sudah disetujui tidak boleh dihapus begitu saja.
    const { data: current } = await supabase.from('invoices').select('approval_status').eq('id', req.params.id).single();
    if (current && current.approval_status === 'approved') {
      return res.status(403).json({ error: 'Invoice ini sudah disetujui Manager dan tidak bisa dihapus. Batalkan approval-nya dulu kalau memang perlu dihapus.' });
    }
    const { error } = await supabase.from('invoices').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Print / Preview HTML builder (dipakai oleh /print dan /preview) ----------
const DEFAULT_COMPANY = {
  name: 'PT. FUJI SEAT INDONESIA', subtitle: '', address_line1: '', address_line2: '', phone: '',
  bank_name: '', bank_branch: '', swift_code: '', account_number: '', signer_name: '', signer_title: '', logo: null
};

async function getCompanySettings() {
  const supabase = getSupabase();
  const { data: companyRow } = await supabase.from('settings').select('value').eq('key', 'company').single();
  return companyRow ? companyRow.value : DEFAULT_COMPANY;
}

function invoiceStyleTag() {
  return `<style>
      @page { size: A4; margin: 18mm 15mm; }
      * { box-sizing: border-box; }
      body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #000; margin:0; padding: 0; }
      .co-header { display:flex; align-items:center; gap:14px; }
      .co-logo { width:80px; height:80px; object-fit:contain; flex-shrink:0; }
      .co-info { text-align:left; }
      .co-name { font-size: 17pt; font-weight: bold; text-align:left; margin:0 0 2px; }
      .co-line { font-size: 10.5pt; text-align:left; margin:1px 0; }
      .spacer-sm { height: 14px; }
      .spacer-md { height: 22px; }
      .to-label { font-weight:bold; }
      .customer-name { font-weight:bold; font-size:12pt; }
      .attn-row { font-weight:bold; }
      .invoice-head { display:flex; justify-content:space-between; align-items:flex-start; margin-top: 20px; }
      .invoice-title { font-size:20pt; font-weight:bold; flex:1; text-align:center; }
      .meta-table td { padding: 2px 6px; font-weight:bold; font-size: 11pt; }
      .meta-table td.label { text-align:left; }
      .meta-table td.colon { text-align:center; width:10px; }
      .meta-table td.value { text-align:right; }
      table.items { width:100%; border-collapse: collapse; margin-top: 14px; }
      table.items th { border-top: 2px solid #000; border-bottom: 1px solid #000; padding: 5px 6px; font-weight:bold; font-size:11pt; }
      table.items td { padding: 4px 6px; font-size: 11pt; }
      .c-no { text-align:center; width: 5%; }
      .c-item { text-align:left; width: 55%; }
      .c-item-desc { font-size:9.5pt; font-weight:normal; color:#333; margin-top:2px; white-space:pre-line; }
      .c-qty { text-align:center; width: 15%; }
      .c-amt { text-align:right; width: 25%; }
      table.items.dual-amt .c-item { width: 40%; }
      table.items.dual-amt .c-qty { width: 12%; }
      table.items.dual-amt .c-amt { width: 21.5%; }
      tr.group-header td { font-weight:bold; text-align:left; padding-top:10px; padding-bottom:6px; border-bottom:1px solid #000; }
      .ex-rate { text-align:right; margin-top: 10px; font-size:11pt; }
      .ex-rate span { margin-right: 10px; }
      tr.total-row td { font-weight:bold; border-top: 2px solid #000; padding-top:8px; }
      .footer { display:flex; justify-content:space-between; margin-top: 50px; }
      .footer .bank-block { font-size: 10pt; }
      .footer .bank-block .co-repeat { font-size: 11pt; font-weight:bold; margin-bottom:4px; }
      .footer .sig-block { text-align:center; font-size: 11pt; min-width: 260px; }
      .footer .sig-issuer { font-weight:bold; margin-bottom: 6px; }
      .footer .sig-img-wrap { height:58px; display:flex; align-items:center; justify-content:center; margin-bottom:2px; }
      .footer .sig-img-wrap img { max-height:58px; max-width:250px; object-fit:contain; }
      .footer .sig-name { font-weight:bold; border-top: 1px solid #000; padding-top:4px; display:inline-block; min-width:260px; }
      .footer .sig-title { font-weight:bold; }
      @media print { .no-print { display:none; } }
      .draft-watermark { margin: 0 0 14px; padding: 8px 14px; border: 1px solid #b8860b; color: #8a6300; background:#fff8e1; font-family: Arial, sans-serif; font-size: 10.5pt; font-weight: bold; text-align:center; }
      .print-page { page-break-after: always; }
      .print-page:last-child { page-break-after: auto; }
      @media screen {
        .print-page + .print-page { margin-top: 40px; padding-top: 40px; border-top: 3px dashed #ccc; }
      }
    </style>`;
}

function buildInvoiceBody(inv, co, approver) {
    const items = inv.items || [];
    const total = items.reduce((s, it) => s + (it.amount * (it.qty || 1)), 0);
    const isDraft = inv.status === 'Draft';
    const invoiceNoDisplay = inv.invoice_no || '(Belum diisi)';
    const customerDisplay = inv.customer_name || '(Belum diisi)';
    const isIDR = inv.currency === 'IDR';
    // Invoice mata uang asing (reimbursement ke perusahaan luar negeri): jumlah selalu
    // dimasukkan dalam IDR, lalu nominal valuta dihitung otomatis dari Exchange Rate.
    const hasValuta = !isIDR && !!inv.exchange_rate;
    const totalValuta = hasValuta ? total / inv.exchange_rate : null;

    const rows = items.map((it, i) => {
      const lineIdr = it.amount * (it.qty || 1);
      const valutaCell = hasValuta
        ? `<td class="c-amt">${numFmtValuta(lineIdr / inv.exchange_rate, inv.currency)}</td>`
        : '';
      return `
      <tr>
        <td class="c-no">${i + 1}</td>
        <td class="c-item">${it.item_name}${it.description ? `<div class="c-item-desc">${it.description}</div>` : ''}</td>
        <td class="c-qty">${it.qty || ''}</td>
        <td class="c-amt">${numFmt(lineIdr)}</td>
        ${valutaCell}
      </tr>`;
    }).join('');

    const exRateLine = (!isIDR && inv.exchange_rate) ? `
      <div class="ex-rate"><span>Exchange Rate :</span><strong>${Number(inv.exchange_rate).toLocaleString('en-US')}</strong></div>` : '';

    return `
      ${isDraft ? `<div class="draft-watermark">DRAFT — Invoice ini belum resmi, masih bisa diubah dari menu Daftar Invoice.</div>` : ''}
      <div class="co-header">
        ${co.logo ? `<img class="co-logo" src="${co.logo}">` : ''}
        <div class="co-info">
          <p class="co-name">${co.name}</p>
          <p class="co-line">${co.subtitle}</p>
          <p class="co-line">${co.address_line1}</p>
          <p class="co-line">${co.address_line2}</p>
          <p class="co-line">${co.phone}</p>
        </div>
      </div>
      <div class="spacer-md"></div>
      <div class="to-label">TO :</div>
      <div class="customer-name">${customerDisplay}</div>
      <div style="white-space:pre-line">${(inv.customer_address || '').split('//').map(s => s.trim()).filter(Boolean).join('\n')}</div>
      <div class="spacer-sm"></div>
      ${inv.attn ? `<div class="attn-row">ATTN : ${inv.attn}</div>` : ''}
      <div class="invoice-head">
        <div class="invoice-title">INVOICE</div>
        <table class="meta-table">
          <tr><td class="label">INVOICE DATE</td><td class="colon">:</td><td class="value">${inv.invoice_date || '-'}</td></tr>
          <tr><td class="label">DUE DATE</td><td class="colon">:</td><td class="value">${inv.due_date || '-'}</td></tr>
          <tr><td class="label">INVOICE NO.</td><td class="colon">:</td><td class="value">${invoiceNoDisplay}</td></tr>
        </table>
      </div>
      <table class="items ${hasValuta ? 'dual-amt' : ''}">
        <thead><tr>
          <th class="c-no">NO.</th><th class="c-item">ITEM</th>
          <th class="c-qty">Number of Persons</th><th class="c-amt">AMOUNT (IDR)</th>
          ${hasValuta ? `<th class="c-amt">AMOUNT (${inv.currency})</th>` : ''}
        </tr></thead>
        <tbody>
          ${inv.remark ? `<tr class="group-header"><td colspan="${hasValuta ? 5 : 4}">${inv.remark}</td></tr>` : ''}
          ${rows}
          <tr class="total-row"><td colspan="3" style="text-align:right">TOTAL</td><td class="c-amt">${numFmt(total)}</td>${hasValuta ? `<td class="c-amt">${numFmtValuta(totalValuta, inv.currency)}</td>` : ''}</tr>
        </tbody>
      </table>
      ${exRateLine}
      ${(!isDraft && inv.approval_status !== 'approved') ? `
      <div class="pending-notice no-print" style="margin-top:16px;padding:10px 14px;border:1px solid #c0392b;color:#c0392b;font-family:Arial,sans-serif;font-size:10pt;">
        ⚠ Invoice ini belum disetujui Manager — tanda tangan belum muncul. Status akan berubah otomatis setelah di-approve.
      </div>` : ''}
      <div class="footer">
        <div class="bank-block">
          <div class="co-repeat">${co.name}</div>
          <div><strong>Bank :</strong> ${co.bank_name}</div>
          <div>${co.bank_branch}</div>
          <div>SWIFT CODE : ${co.swift_code}</div>
          <div>(${inv.currency}) ${co.account_number}</div>
        </div>
        <div class="sig-block">
          <div class="sig-issuer">${co.name}</div>
          ${inv.approval_status === 'approved' && !isDraft ? `
          <div class="sig-img-wrap">${approver && approver.signature ? `<img src="${approver.signature}">` : ''}</div>
          <div class="sig-name">${(approver && approver.name) || co.signer_name || inv.approved_by || ''}</div>
          <div class="sig-title">${(approver && approver.title) || co.signer_title || ''}</div>` : `
          <div class="sig-img-wrap" style="height:59px;font-size:9pt;color:#999;font-family:Arial,sans-serif;">( ${isDraft ? 'Draft — belum diajukan' : 'Menunggu persetujuan Manager'} )</div>
          <div class="sig-title" style="visibility:hidden">-</div>`}
        </div>
      </div>`;
}

function buildInvoiceHtml(inv, co, approver) {
    const invoiceNoDisplay = inv.invoice_no || '(Belum diisi)';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${invoiceNoDisplay}</title>
    ${invoiceStyleTag()}</head><body>
      ${buildInvoiceBody(inv, co, approver)}
      <button class="no-print" onclick="window.print()" style="margin-top:30px;padding:8px 16px;">Print / Save as PDF</button>
    </body></html>`;
}

// Cetak banyak invoice sekaligus dalam satu dokumen (satu dialog print, satu invoice per halaman)
function buildBatchInvoiceHtml(entries, co) {
  const pages = entries.map(({ inv, approver }) => `<div class="print-page">${buildInvoiceBody(inv, co, approver)}</div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Print ${entries.length} Invoice</title>
    ${invoiceStyleTag()}</head><body>
      ${pages}
      <button class="no-print" onclick="window.print()" style="margin:20px 0;padding:8px 16px;">Print / Save as PDF (${entries.length} invoice)</button>
    </body></html>`;
}

// ---------- Print view (invoice tersimpan) ----------
app.get('/api/invoices/:id/print', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: inv, error } = await supabase.from('invoices').select('*, items:invoice_items(*)').eq('id', req.params.id).single();
    if (error || !inv) return res.status(404).send('Invoice tidak ditemukan');
    const co = await getCompanySettings();
    let approver = null;
    if (inv.approval_status === 'approved' && inv.approved_by) {
      const { data: u } = await supabase.from('users').select('name, title, signature').eq('username', inv.approved_by).single();
      approver = u || null;
    }
    res.send(buildInvoiceHtml(inv, co, approver));
  } catch (e) {
    res.status(500).send('Error: ' + e.message);
  }
});

// ---------- Preview view (invoice belum tersimpan, dipakai panel Preview di form Tambah Invoice) ----------
app.post('/api/invoices/preview', async (req, res) => {
  try {
    const { invoice_no, invoice_date, due_date, customer_name, customer_address, attn, currency, batch, remark, items, exchange_rate, status } = req.body;
    const inv = {
      invoice_no: invoice_no || null,
      invoice_date: invoice_date || null,
      due_date: due_date || null,
      customer_name: customer_name || null,
      customer_address: customer_address || '',
      attn: attn || '',
      currency: currency || 'IDR',
      batch: batch || '',
      remark: remark || '',
      status: status === 'Draft' ? 'Draft' : 'Diajukan',
      exchange_rate: exchange_rate || null,
      // Preview adalah invoice yang BELUM tersimpan sama sekali, jadi tidak mungkin
      // sudah di-approve — selalu 'pending' supaya TTD tidak muncul duluan di preview.
      approval_status: 'pending',
      approved_by: null,
      items: (items || []).map(it => ({ item_name: it.item_name, description: it.description || '', qty: it.qty || 1, amount: it.amount || 0 }))
    };
    const co = await getCompanySettings();
    res.send(buildInvoiceHtml(inv, co, null));
  } catch (e) {
    res.status(500).send('Error: ' + e.message);
  }
});

// ---------- Excel export ----------
app.get('/api/export', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: invoices, error } = await supabase.from('invoices').select('*, items:invoice_items(*)').order('invoice_date');
    if (error) throw error;
    const summaryRows = (invoices || []).map(inv => {
      const total = (inv.items || []).reduce((s, it) => s + (it.amount * (it.qty || 1)), 0);
      const stage = inv.status === 'Draft' ? 'Draft' : (inv.approval_status === 'approved' ? 'Disetujui' : 'Menunggu Approval');
      return {
        'INVOICE NO.': inv.invoice_no, 'INVOICE DATE': inv.invoice_date, 'DUE DATE': inv.due_date,
        'CUSTOMER': inv.customer_name, 'REMARK': inv.remark, 'BATCH': inv.batch,
        'CURRENCY': inv.currency, 'TOTAL': total, 'STATUS': stage
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=invoice_export.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Untuk `vercel dev` / deploy: export app langsung sebagai handler.
module.exports = app;

// Untuk jalan lokal biasa (node api/index.js) saat development/testing.
if (require.main === module) {
  const PORT = process.env.PORT || 3210;
  app.listen(PORT, () => console.log(`Invoice app (Supabase) jalan di http://localhost:${PORT}`));
}
