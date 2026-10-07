// Snack Station: screen flow + calls to api.php (PHP + MySQL)
// Flow: menu -> qty -> summary -> payment method (3 min timer) -> cash / qris / card -> result

const $ = id => document.getElementById(id);
const rp = n => 'Rp ' + Number(n).toLocaleString('id-ID');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const WAKTU_BAYAR = 180;                                   // seconds
const NOMINAL = [1000, 2000, 5000, 10000, 20000, 50000, 100000];
const JUDUL = {
  menu: 'Pilih produk', qty: 'Atur jumlah', ringkasan: 'Cek pesanan', metode: 'Metode pembayaran',
  tunai: 'Bayar tunai', qris: 'Bayar digital', hasil: ''
};

const state = {
  produk: [], filter: 'semua', pilih: null, qty: 1,
  metode: null, total: 0, masuk: 0, sisa: 0, timer: null, sibuk: false
};

/* ---------- helpers ---------- */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function gambarProduk(p) {
  if (!p.gambar) return null;
  const img = document.createElement('img');
  img.src = 'assets/img/' + encodeURIComponent(p.gambar);
  img.alt = p.nama;
  return img;
}

function show(id, judul) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('aktif', s.id === id));
  $('judul').textContent = judul ?? JUDUL[id] ?? '';
}

async function api(aksi, opsi, query = '') {
  const r = await fetch('api.php?aksi=' + aksi + query, opsi);
  let data;
  try { data = await r.json(); }
  catch (e) { throw new Error('api.php tidak dijalankan sebagai PHP (HTTP ' + r.status + '). Buka lewat http://localhost:8000, bukan Go Live.'); }
  if (!r.ok || data.error) throw new Error((data.error || 'Terjadi kesalahan') + (data.detail ? ' [' + data.detail + ']' : ''));
  return data;
}

/* ---------- scale the 1280x720 stage to the window ---------- */
function fit() {
  const s = Math.min(innerWidth / 1280, innerHeight / 720);
  const st = $('stage').style;
  st.transform = 'scale(' + s + ')';
  st.left = (innerWidth - 1280 * s) / 2 + 'px';
  st.top = (innerHeight - 720 * s) / 2 + 'px';
}

/* ---------- 1. menu ---------- */
async function muatProduk() {
  try {
    state.produk = await api('produk');
    renderGrid();
  } catch (e) {
    $('grid').replaceChildren(el('p', 'galat', e.message));
  }
}

function renderGrid() {
  const daftar = state.produk.filter(p => state.filter === 'semua' || p.kategori === state.filter);
  const kartu = daftar.map(p => {
    const habis = p.stok <= 0;
    const b = el('button', 'kartu glass' + (habis ? ' habis' : '') + (state.pilih?.id_produk === p.id_produk ? ' pilih' : ''));
    b.setAttribute('aria-pressed', String(state.pilih?.id_produk === p.id_produk));
    if (habis) b.setAttribute('aria-disabled', 'true');
    const gbr = el('div', 'gbr');
    const img = gambarProduk(p);
    if (img) gbr.append(img);
    b.append(el('span', 'kode', p.kode_slot), gbr, el('span', 'nama', p.nama), el('span', 'harga', rp(p.harga)));
    b.addEventListener('click', () => { if (!habis) pilihProduk(p); });
    return b;
  });
  $('grid').replaceChildren(...kartu);
}

function pilihProduk(p) {
  state.pilih = p;
  renderGrid();
  $('psnNama').textContent = p.nama;
  $('psnHarga').textContent = rp(p.harga);
  const gbr = document.querySelector('#panel .gbr');
  gbr.replaceChildren(...[gambarProduk(p)].filter(Boolean));
  $('lanjut1').disabled = false;
}

function kosongkanPanel() {
  state.pilih = null;
  $('psnNama').textContent = '';
  $('psnHarga').textContent = '';
  $('err').textContent = '';
  document.querySelector('#panel .gbr').replaceChildren();
  $('lanjut1').disabled = true;
}

function setFilter(f) {
  state.filter = f;
  document.querySelectorAll('#kategori .btn').forEach(b => {
    const aktif = b.dataset.f === f;
    b.classList.toggle('hijau', aktif);
    b.classList.toggle('biru', !aktif);
  });
  renderGrid();
}

function keMenu() {
  hentikanTimer();
  state.masuk = 0; state.sibuk = false;
  kosongkanPanel();
  muatProduk();
  show('menu');
}

/* ---------- 2. quantity ---------- */
function bukaQty() {
  state.qty = 1;
  const p = state.pilih;
  $('qNama').textContent = p.nama;
  $('qHarga').textContent = rp(p.harga) + ' per item';
  $('qStok').textContent = 'Stok tersedia: ' + p.stok;
  renderQty();
  show('qty');
}

function renderQty() {
  $('qJml').textContent = state.qty;
  $('kurang').disabled = state.qty <= 1;
  $('tambah').disabled = state.qty >= state.pilih.stok;   // max = stock
}

/* ---------- 3. summary ---------- */
function bukaRingkasan() {
  const p = state.pilih;
  state.total = p.harga * state.qty;
  $('rNama').textContent = p.nama;
  $('rJml').textContent = state.qty;
  $('rTotal').textContent = rp(state.total);
  show('ringkasan');
}

/* ---------- timer (starts when payment method is chosen) ---------- */
function mulaiTimer() {
  hentikanTimer();
  let sisa = WAKTU_BAYAR;
  const tampil = () => {
    $('timer').textContent = '⏱ ' + Math.floor(sisa / 60) + ':' + String(sisa % 60).padStart(2, '0');
  };
  tampil();
  $('timer').hidden = false;
  state.timer = setInterval(() => {
    sisa--;
    tampil();
    if (sisa <= 0) batal('Waktu pembayaran habis.');
  }, 1000);
}

function hentikanTimer() {
  clearInterval(state.timer);
  state.timer = null;
  $('timer').hidden = true;
}

/* ---------- 4. payment ---------- */
function mulaiBayar(metode) {
  state.metode = metode;
  state.masuk = 0;
  state.sibuk = false;
  mulaiTimer();
  if (metode === 'cash') {
    renderTunai();
    show('tunai');
  } else {
    $('dJudul').textContent = metode === 'qris' ? 'Scan QRIS untuk membayar' : 'Tempelkan kartu di pembaca NFC';
    $('dTotal').textContent = 'Total ' + rp(state.total);
    $('dPesan').textContent = '';
    gambarQR(metode === 'qris');
    show('qris');
  }
}

// Cash
function renderTunai() {
  const kurang = Math.max(0, state.total - state.masuk);
  $('tTotal').textContent = rp(state.total);
  $('tMasuk').textContent = rp(state.masuk);
  $('tKurang').textContent = rp(kurang);
}

async function masukkanUang(n) {
  if (state.sibuk) return;
  state.masuk += n;
  renderTunai();
  if (state.masuk < state.total) return;          // not enough yet: keep adding, timer keeps running
  state.sibuk = true;
  hentikanTimer();
  const kembalian = state.masuk - state.total;
  if (kembalian > 0) {
    try {
      const r = await api('cek_kembalian', undefined, '&jumlah=' + kembalian);
      if (!r.cukup) return gagal('Maaf, tidak ada kembalian', 'Mesin tidak punya cukup kembalian.', state.masuk);
    } catch (e) {
      return gagal('Gagal memeriksa kembalian', e.message, state.masuk);
    }
  }
  selesaiBayar();
}

// QRIS / card (simulated)
function gambarQR(qr) {
  const kotak = $('qr');
  kotak.replaceChildren();
  kotak.style.display = '';
  if (!qr) {
    kotak.style.display = 'flex';
    kotak.style.alignItems = 'center';
    kotak.style.justifyContent = 'center';
    kotak.style.fontSize = '120px';
    kotak.textContent = '💳';
    return;
  }
  const N = 15;
  let seed = 7 + state.total;
  const acak = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const finder = (r, c) => {                      // 7x7 corner squares
    const pojok = [[0, 0], [0, N - 7], [N - 7, 0]];
    for (const [r0, c0] of pojok) {
      const y = r - r0, x = c - c0;
      if (y >= 0 && y < 7 && x >= 0 && x < 7) {
        return y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4);
      }
    }
    return null;
  };
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const i = document.createElement('i');
      const f = finder(r, c);
      if (f === null ? acak() > 0.5 : f) i.className = 'on';
      kotak.append(i);
    }
  }
}

function bayarDigital() {
  if (state.sibuk) return;
  if ($('dGagal').checked) {                      // demo switch: show the "payment failed, retry" branch
    $('dPesan').textContent = 'Pembayaran gagal. Silakan coba lagi.';
    return;
  }
  $('dPesan').textContent = '';
  state.sibuk = true;
  hentikanTimer();
  selesaiBayar();
}

/* ---------- 5. results ---------- */
function hasil(ikon, judul, teks, bisaKembali = true) {
  $('hIkon').textContent = ikon;
  $('hJudul').textContent = judul;
  $('hTeks').textContent = teks;
  $('hMenu').disabled = !bisaKembali;
  show('hasil', '');
}

function jumlahRefund() {
  return state.metode === 'cash' ? state.masuk : state.total;
}

function teksRefund(n) {
  return n > 0 ? ' Uang ' + rp(n) + ' dikembalikan.' : '';
}

// Cancelled by the customer or by the 3 minute timer
function batal(alasan) {
  hentikanTimer();
  const refund = state.metode === 'cash' ? state.masuk : 0;
  state.masuk = 0;
  hasil('🚫', 'Pembayaran dibatalkan', alasan + teksRefund(refund));
}

function gagal(judul, alasan, refund) {
  hasil('⚠️', judul, alasan + teksRefund(refund));
}

// Payment OK -> dispense -> (only if the product dropped) reduce stock + save transaction
async function selesaiBayar() {
  hasil('✅', 'Pembayaran berhasil', 'Mengeluarkan produk...', false);
  await sleep(1500);

  if ($('dStuck').checked) {                      // demo switch: product stuck
    return gagal('Produk gagal keluar', 'Pembayaran dikembalikan.', jumlahRefund());
  }

  try {
    const r = await api('beli', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_produk: state.pilih.id_produk,
        kuantitas: state.qty,
        metode: state.metode,
        uang: state.metode === 'cash' ? state.masuk : null
      })
    });
    const kembali = Number(r.kembalian) > 0 ? ' Kembalian ' + rp(r.kembalian) + '.' : '';
    hasil('🎉', 'Pembayaran berhasil', 'Silakan ambil ' + state.qty + ' x ' + state.pilih.nama + '.' + kembali);
  } catch (e) {
    gagal('Transaksi gagal', e.message + '.', jumlahRefund());
  }
}

/* ---------- wire up ---------- */
function init() {
  fit();
  addEventListener('resize', fit);

  // Menu
  document.querySelectorAll('#kategori .btn').forEach(b => b.addEventListener('click', () => setFilter(b.dataset.f)));
  $('lanjut1').addEventListener('click', bukaQty);

  // Quantity
  $('kurang').addEventListener('click', () => { state.qty--; renderQty(); });
  $('tambah').addEventListener('click', () => { state.qty++; renderQty(); });
  $('qKembali').addEventListener('click', () => show('menu'));
  $('qLanjut').addEventListener('click', bukaRingkasan);

  // Summary
  $('rBatal').addEventListener('click', keMenu);
  $('rOk').addEventListener('click', () => show('metode'));

  // Payment method
  document.querySelectorAll('.opsi').forEach(b => b.addEventListener('click', () => mulaiBayar(b.dataset.m)));
  $('mBatal').addEventListener('click', keMenu);

  // Cash
  NOMINAL.forEach(n => {
    const b = el('button', 'btn hijau', rp(n));
    b.addEventListener('click', () => masukkanUang(n));
    $('uang').append(b);
  });
  $('tBatal').addEventListener('click', () => { if (!state.sibuk) batal('Dibatalkan oleh pelanggan.'); });

  // QRIS / card
  $('dBayar').addEventListener('click', bayarDigital);
  $('dBatal').addEventListener('click', () => { if (!state.sibuk) batal('Dibatalkan oleh pelanggan.'); });

  // Result
  $('hMenu').addEventListener('click', keMenu);

  keMenu();
}

init();