const app = document.getElementById('app');
let state = { invoices: [], settings: { customers: [] }, filters: { q: '', status: '', customer: '' }, me: null };

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (res.status === 401) { window.location.href = 'login.html'; throw new Error('Belum login'); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Terjadi kesalahan' }));
    throw new Error(err.error || 'Terjadi kesalahan');
  }
  return res.json();
}

async function checkAuth() {
  const me = await fetch('/api/me').then(r => r.json());
  if (!me) { window.location.href = 'login.html'; return false; }
  state.me = me;
  return true;
}

async function loadAll() {
  const [invoices, settings] = await Promise.all([
    api('/api/invoices' + buildQuery()),
    api('/api/settings')
  ]);
  state.invoices = invoices;
  state.settings = settings;
  render();
}

function buildQuery() {
  const p = new URLSearchParams();
  if (state.filters.q) p.set('q', state.filters.q);
  if (state.filters.status) p.set('status', state.filters.status);
  if (state.filters.customer) p.set('customer', state.filters.customer);
  const s = p.toString();
  return s ? `?${s}` : '';
}

function fmt(n, cur) {
  if (n === null || n === undefined) return '';
  return `${cur} ${Number(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function render() {
  const me = state.me;
  app.innerHTML = `
    <header class="topbar">
      <div>
        <h1>Aplikasi Invoice</h1>
        <div class="sub">PT. Fuji Seat Indonesia — masuk sebagai ${me.name} (${me.role === 'manager' ? 'Manager' : 'Staff'})</div>
      </div>
      <div>
        <button class="btn-secondary" id="btnExport">Export Excel</button>
        <button class="btn-secondary" id="btnSettings">Pengaturan Perusahaan</button>
        <button class="btn-primary" id="btnNew">+ Invoice Baru</button>
        <button class="btn-secondary" id="btnLogout">Keluar</button>
      </div>
    </header>

    <div class="toolbar">
      <input id="q" placeholder="Cari no. invoice / remark..." value="${state.filters.q}">
      <select id="filterCustomer">
        <option value="">Semua Customer</option>
        ${state.settings.customers.map(c => `<option value="${c.name}" ${state.filters.customer === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}
      </select>
      <select id="filterStatus">
        <option value="">Semua Status</option>
        <option value="Belum Dibayar" ${state.filters.status === 'Belum Dibayar' ? 'selected' : ''}>Belum Dibayar</option>
        <option value="Sudah Dibayar" ${state.filters.status === 'Sudah Dibayar' ? 'selected' : ''}>Sudah Dibayar</option>
      </select>
      <div class="spacer"></div>
      <div class="sub">${state.invoices.length} invoice</div>
    </div>

    ${state.invoices.length === 0 ? `<div class="empty-state">Belum ada invoice. Klik "+ Invoice Baru" untuk mulai.</div>` : `
    <table class="list">
      <thead><tr><th>No. Invoice</th><th>Tanggal</th><th>Customer</th><th>Remark</th><th>Total</th><th>Status</th><th>Approval</th><th></th></tr></thead>
      <tbody>
        ${state.invoices.map(inv => `
          <tr>
            <td>${inv.invoice_no}</td>
            <td>${inv.invoice_date}</td>
            <td>${inv.customer_name}</td>
            <td>${inv.remark || ''}</td>
            <td class="total-badge">${fmt(inv.total, inv.currency)}</td>
            <td><span class="badge ${inv.status === 'Sudah Dibayar' ? 'badge-paid' : 'badge-unpaid'}">${inv.status}</span></td>
            <td>
              <span class="badge ${inv.approval_status === 'approved' ? 'badge-paid' : 'badge-unpaid'}">
                ${inv.approval_status === 'approved' ? 'Disetujui' : 'Menunggu Approval'}
              </span>
              ${inv.approval_status !== 'approved' && me.role === 'manager' ? `<button class="btn-primary btn-icon" style="margin-left:6px" onclick="approveInvoice(${inv.id})">Approve</button>` : ''}
            </td>
            <td>
              <button class="btn-secondary btn-icon" onclick="printInvoice(${inv.id})">Print</button>
              <button class="btn-secondary btn-icon" onclick="editInvoice(${inv.id})">Edit</button>
              <button class="btn-danger btn-icon" onclick="deleteInvoice(${inv.id})">Hapus</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`}
  `;

  document.getElementById('btnNew').onclick = () => openForm();
  document.getElementById('btnExport').onclick = () => window.open('/api/export', '_blank');
  document.getElementById('btnSettings').onclick = () => openSettingsForm();
  document.getElementById('btnLogout').onclick = async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = 'login.html'; };
  document.getElementById('q').oninput = debounce(e => { state.filters.q = e.target.value; loadAll(); }, 350);
  document.getElementById('filterCustomer').onchange = e => { state.filters.customer = e.target.value; loadAll(); };
  document.getElementById('filterStatus').onchange = e => { state.filters.status = e.target.value; loadAll(); };
}

window.approveInvoice = async (id) => {
  await api(`/api/invoices/${id}/approve`, { method: 'POST' });
  loadAll();
};

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

window.printInvoice = (id) => window.open(`/api/invoices/${id}/print`, '_blank');

window.deleteInvoice = async (id) => {
  if (!confirm('Hapus invoice ini?')) return;
  await api(`/api/invoices/${id}`, { method: 'DELETE' });
  loadAll();
};

window.editInvoice = async (id) => {
  const inv = await api(`/api/invoices/${id}`);
  openForm(inv);
};

async function openForm(existing) {
  const isEdit = !!existing;
  const customers = state.settings.customers;
  let items = existing ? existing.items.map(it => ({ ...it })) : [{ item_name: '', qty: 1, amount: 0 }];
  let invoiceNo = existing ? existing.invoice_no : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>${isEdit ? 'Edit Invoice' : 'Invoice Baru'}</h2>
      <div class="form-row">
        <div class="form-group">
          <label>Customer</label>
          <select id="f_customer">
            ${customers.map(c => `<option value="${c.name}" data-currency="${c.currency}" data-address="${c.address}" ${existing && existing.customer_name === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Currency</label>
          <select id="f_currency">
            <option value="IDR" ${existing && existing.currency === 'IDR' ? 'selected' : ''}>IDR</option>
            <option value="USD" ${existing && existing.currency === 'USD' ? 'selected' : ''}>USD</option>
            <option value="JPY" ${existing && existing.currency === 'JPY' ? 'selected' : ''}>JPY</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>No. Invoice ${isEdit ? '' : '(auto, bisa diubah)'}</label>
          <input id="f_no" value="${invoiceNo}">
        </div>
        <div class="form-group">
          <label>Tanggal Invoice</label>
          <input type="date" id="f_date" value="${existing ? existing.invoice_date : new Date().toISOString().slice(0,10)}">
        </div>
        <div class="form-group">
          <label>Due Date</label>
          <input type="date" id="f_due" value="${existing && existing.due_date ? existing.due_date : ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>ATTN</label>
          <input id="f_attn" value="${existing ? (existing.attn || '') : ''}">
        </div>
        <div class="form-group">
          <label>Batch</label>
          <input id="f_batch" value="${existing ? (existing.batch || '') : ''}">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="f_status">
            <option value="Belum Dibayar" ${existing && existing.status === 'Belum Dibayar' ? 'selected' : ''}>Belum Dibayar</option>
            <option value="Sudah Dibayar" ${existing && existing.status === 'Sudah Dibayar' ? 'selected' : ''}>Sudah Dibayar</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Exchange Rate (opsional, tampil di print jika bukan IDR)</label>
          <input type="number" step="any" id="f_exrate" value="${existing && existing.exchange_rate ? existing.exchange_rate : ''}" placeholder="mis. 17502">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label>Remark</label>
        <textarea id="f_remark" rows="2">${existing ? (existing.remark || '') : ''}</textarea>
      </div>

      <label style="font-size:12px;color:var(--muted);font-weight:600">Item</label>
      <table class="items-table" id="itemsTable">
        <thead><tr><th style="width:50%">Nama Item</th><th style="width:15%">Qty</th><th style="width:25%">Jumlah</th><th></th></tr></thead>
        <tbody id="itemsBody"></tbody>
      </table>
      <button class="btn-secondary btn-icon" id="btnAddItem" type="button">+ Tambah Item</button>

      <div id="formError" class="error-msg"></div>
      <div class="modal-actions">
        <button class="btn-secondary" id="btnCancel">Batal</button>
        <button class="btn-primary" id="btnSave">Simpan</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  function renderItems() {
    const body = overlay.querySelector('#itemsBody');
    body.innerHTML = items.map((it, i) => `
      <tr>
        <td><input value="${it.item_name}" data-i="${i}" data-field="item_name"></td>
        <td><input type="number" step="any" value="${it.qty}" data-i="${i}" data-field="qty"></td>
        <td><input type="number" step="any" value="${it.amount}" data-i="${i}" data-field="amount"></td>
        <td><button class="btn-danger btn-icon" data-remove="${i}" type="button">×</button></td>
      </tr>
    `).join('');
    body.querySelectorAll('input').forEach(inp => {
      inp.oninput = e => {
        const i = +e.target.dataset.i;
        const field = e.target.dataset.field;
        items[i][field] = field === 'item_name' ? e.target.value : Number(e.target.value);
      };
    });
    body.querySelectorAll('[data-remove]').forEach(btn => {
      btn.onclick = () => { items.splice(+btn.dataset.remove, 1); renderItems(); };
    });
  }
  renderItems();

  overlay.querySelector('#btnAddItem').onclick = () => { items.push({ item_name: '', qty: 1, amount: 0 }); renderItems(); };

  const customerSel = overlay.querySelector('#f_customer');
  const currencySel = overlay.querySelector('#f_currency');
  customerSel.onchange = () => {
    const opt = customerSel.selectedOptions[0];
    if (opt.dataset.currency) currencySel.value = opt.dataset.currency;
  };

  const dateInput = overlay.querySelector('#f_date');
  if (!isEdit) {
    const fillNextNumber = async () => {
      const r = await api(`/api/next-number?date=${dateInput.value}`);
      overlay.querySelector('#f_no').value = r.invoice_no;
    };
    dateInput.onchange = fillNextNumber;
    fillNextNumber();
    customerSel.dispatchEvent(new Event('change'));
  }

  overlay.querySelector('#btnCancel').onclick = () => overlay.remove();

  overlay.querySelector('#btnSave').onclick = async () => {
    const opt = customerSel.selectedOptions[0];
    const payload = {
      invoice_no: overlay.querySelector('#f_no').value.trim(),
      invoice_date: dateInput.value,
      due_date: overlay.querySelector('#f_due').value || null,
      customer_name: customerSel.value,
      customer_address: opt.dataset.address || '',
      attn: overlay.querySelector('#f_attn').value,
      currency: currencySel.value,
      batch: overlay.querySelector('#f_batch').value,
      remark: overlay.querySelector('#f_remark').value,
      status: overlay.querySelector('#f_status').value,
      exchange_rate: overlay.querySelector('#f_exrate').value ? Number(overlay.querySelector('#f_exrate').value) : null,
      items: items.filter(it => it.item_name.trim() !== '')
    };
    if (!payload.invoice_no || !payload.invoice_date || payload.items.length === 0) {
      overlay.querySelector('#formError').textContent = 'No. invoice, tanggal, dan minimal 1 item wajib diisi.';
      return;
    }
    try {
      if (isEdit) {
        await api(`/api/invoices/${existing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        await api('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      overlay.remove();
      loadAll();
    } catch (e) {
      overlay.querySelector('#formError').textContent = e.message;
    }
  };
}

(async () => {
  const ok = await checkAuth();
  if (ok) loadAll();
})();

async function openSettingsForm() {
  const co = state.settings.company || {
    name: 'PT. FUJI SEAT INDONESIA', subtitle: '', address_line1: '', address_line2: '', phone: '',
    bank_name: '', bank_branch: '', swift_code: '', account_number: '', signer_name: '', signer_title: ''
  };
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>Pengaturan Perusahaan (untuk cetak invoice)</h2>
      <div class="form-row"><div class="form-group"><label>Nama Perusahaan</label><input id="s_name" value="${co.name}"></div></div>
      <div class="form-row"><div class="form-group"><label>Subtitle</label><input id="s_subtitle" value="${co.subtitle}"></div></div>
      <div class="form-row"><div class="form-group"><label>Alamat Baris 1</label><input id="s_addr1" value="${co.address_line1}"></div></div>
      <div class="form-row"><div class="form-group"><label>Alamat Baris 2</label><input id="s_addr2" value="${co.address_line2}"></div></div>
      <div class="form-row"><div class="form-group"><label>Telepon/Fax</label><input id="s_phone" value="${co.phone}"></div></div>
      <div class="form-row">
        <div class="form-group"><label>Nama Bank</label><input id="s_bank" value="${co.bank_name}"></div>
        <div class="form-group"><label>Cabang</label><input id="s_branch" value="${co.bank_branch}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Swift Code</label><input id="s_swift" value="${co.swift_code}"></div>
        <div class="form-group"><label>No. Rekening</label><input id="s_acc" value="${co.account_number}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Nama Penandatangan</label><input id="s_signer" value="${co.signer_name}"></div>
        <div class="form-group"><label>Jabatan</label><input id="s_title" value="${co.signer_title}"></div>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" id="btnCancelS">Batal</button>
        <button class="btn-primary" id="btnSaveS">Simpan</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#btnCancelS').onclick = () => overlay.remove();
  overlay.querySelector('#btnSaveS').onclick = async () => {
    const company = {
      name: overlay.querySelector('#s_name').value,
      subtitle: overlay.querySelector('#s_subtitle').value,
      address_line1: overlay.querySelector('#s_addr1').value,
      address_line2: overlay.querySelector('#s_addr2').value,
      phone: overlay.querySelector('#s_phone').value,
      bank_name: overlay.querySelector('#s_bank').value,
      bank_branch: overlay.querySelector('#s_branch').value,
      swift_code: overlay.querySelector('#s_swift').value,
      account_number: overlay.querySelector('#s_acc').value,
      signer_name: overlay.querySelector('#s_signer').value,
      signer_title: overlay.querySelector('#s_title').value
    };
    await api('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company }) });
    state.settings.company = company;
    overlay.remove();
  };
}