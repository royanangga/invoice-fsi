// Membuat akun login (staff/manager) di Supabase.
// Cara pakai:
//   node create-user.js --username budi --password rahasia123 --role staff --name "Budi Santoso"
//   node create-user.js --username nono --password rahasia456 --role manager --name "Nono Suhena"
require('dotenv').config();
const { getSupabase } = require('./lib/supabaseClient');
const { hashPassword } = require('./lib/auth');

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] = argv[i + 1];
  }
  return args;
}

async function main() {
  const { username, password, role, name } = parseArgs();
  if (!username || !password || !role || !name) {
    console.error('Cara pakai: node create-user.js --username <username> --password <password> --role <staff|manager> --name "<Nama Lengkap>"');
    process.exit(1);
  }
  if (!['staff', 'manager'].includes(role)) {
    console.error('Role harus "staff" atau "manager"');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('Password minimal 6 karakter');
    process.exit(1);
  }

  const supabase = getSupabase();
  const password_hash = await hashPassword(password);

  const { data: existing } = await supabase.from('users').select('id').eq('username', username).single();
  if (existing) {
    const { error } = await supabase.from('users').update({ password_hash, role, name }).eq('username', username);
    if (error) { console.error('Gagal update:', error.message); process.exit(1); }
    console.log(`Akun "${username}" sudah ada — password/role/nama diperbarui.`);
  } else {
    const { error } = await supabase.from('users').insert({ username, password_hash, role, name });
    if (error) { console.error('Gagal membuat akun:', error.message); process.exit(1); }
    console.log(`Akun "${username}" (${role}) berhasil dibuat.`);
  }
}

main();
