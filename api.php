<?php
// Small JSON API used by script.js:
//   api.php?aksi=produk                      -> list products
//   api.php?aksi=cek_kembalian&jumlah=30000  -> does the machine hold enough change?
//   api.php?aksi=beli (POST json)            -> reduce stock + save transaction (sp_beli)
require __DIR__ . '/config.php';
header('Content-Type: application/json; charset=utf-8');

function out($data, int $code = 200): void {
  http_response_code($code);
  echo json_encode($data);
  exit;
}

try {
  $aksi = $_GET['aksi'] ?? '';

  if ($aksi === 'produk') {
    out(db()->query('SELECT id_produk, kode_slot, nama, kategori, harga, stok, gambar
                     FROM produk ORDER BY kode_slot')->fetchAll());
  }

  if ($aksi === 'cek_kembalian') {
    $perlu = (int)($_GET['jumlah'] ?? 0);
    $punya = (int)db()->query('SELECT COALESCE(SUM(nominal * jumlah), 0) FROM kembalian_mesin')->fetchColumn();
    out(['cukup' => $punya >= $perlu]);
  }

  if ($aksi === 'beli' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $b = json_decode(file_get_contents('php://input'), true) ?? [];
    $metode = $b['metode'] ?? '';
    if (!in_array($metode, ['cash', 'qris', 'kartu'], true)) out(['error' => 'Metode pembayaran tidak valid'], 400);

    // Price and stock are checked on the server (inside sp_beli), not trusted from the browser
    $st = db()->prepare('CALL sp_beli(?, ?, ?, ?)');
    $st->execute([
      (int)($b['id_produk'] ?? 0),
      (int)($b['kuantitas'] ?? 0),
      $metode,
      $metode === 'cash' ? (int)($b['uang'] ?? 0) : null,
    ]);
    $hasil = $st->fetch();
    $st->closeCursor();
    out($hasil);
  }

  out(['error' => 'Aksi tidak dikenal'], 404);
} catch (PDOException $e) {
  // 45000 = message raised by sp_beli (e.g. "Stok tidak cukup")
  $pesan = $e->getCode() === '45000' ? $e->errorInfo[2] : 'Tidak bisa terhubung ke database';
  // 'detail' shows the real reason (wrong password, driver missing, database not found...)
  out(['error' => $pesan, 'detail' => $e->getMessage()], 500);
}