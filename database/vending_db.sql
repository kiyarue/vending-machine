-- =====================================================
-- Vending Machine Database (MySQL 8.0.16+)
-- kalau mau ngulang,run nih punya kode(kalau rusak bodo amat):
-- DROP DATABASE vending_db;
-- for the nerd,kalau di output ada duplicate biarin aja,failsafe
CREATE DATABASE IF NOT EXISTS vending_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE vending_db;

-- -----------------------------------------------------
-- 1. produk: menu momento
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS produk (
  id_produk  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  kode_slot  VARCHAR(4)   NOT NULL,                     -- A1, A2, B1, ...
  nama       VARCHAR(60)  NOT NULL,
  kategori   ENUM('snack','minuman') NOT NULL,
  harga      INT UNSIGNED NOT NULL,                     -- in rupiah
  stok       INT UNSIGNED NOT NULL DEFAULT 0,
  gambar     VARCHAR(255) NULL,                         -- image file name
  PRIMARY KEY (id_produk),
  UNIQUE KEY uq_kode_slot (kode_slot),
  CONSTRAINT ck_harga CHECK (harga > 0)
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- 2. transaksi: maling pangsit
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS transaksi (
  id_transaksi  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_produk     INT UNSIGNED NOT NULL,
  kuantitas     INT UNSIGNED NOT NULL,
  total_harga   INT UNSIGNED NOT NULL,                  -- harga x kuantitas
  metode_bayar  ENUM('cash','qris','kartu') NOT NULL,
  uang_diterima INT UNSIGNED NULL,                      -- cash only
  kembalian     INT UNSIGNED NULL,                      -- cash only
  status        ENUM('berhasil','dibatalkan','gagal_bayar','gagal_keluar')
                NOT NULL DEFAULT 'berhasil',
  waktu         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_transaksi),
  KEY idx_waktu (waktu),
  CONSTRAINT fk_transaksi_produk FOREIGN KEY (id_produk)
    REFERENCES produk (id_produk) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT ck_kuantitas CHECK (kuantitas > 0)
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- 3. maling dua pangsit
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS kembalian_mesin (
  nominal INT UNSIGNED NOT NULL,                        -- 1000, 2000, 5000, ...
  jumlah  INT UNSIGNED NOT NULL DEFAULT 0,              -- number of notes/coins
  PRIMARY KEY (nominal)
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- DA BIG DATAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
-- -----------------------------------------------------
INSERT IGNORE INTO produk (kode_slot, nama, kategori, harga, stok) VALUES
('A1','Chitato',   'snack',   10000, 8),
('A2','Oreo',      'snack',    9000, 6),
('A3','Beng-Beng', 'snack',    3000, 10),
('A4','Roti Sobek','snack',    8000, 5),
('B1','Aqua',      'minuman',  4000, 12),
('B2','Teh Pucuk', 'minuman',  4000, 9),
('B3','Ultra Milk','minuman',  6000, 0),   -- stok 0 = sold out example
('B4','Pocky',     'snack',   10000, 7);

INSERT IGNORE INTO kembalian_mesin (nominal, jumlah) VALUES
(1000,20),(2000,20),(5000,15),(10000,10);

-- -----------------------------------------------------
-- prosedurnya kalau ngikut flow "Pembayaran berhasil"
-- check stock -> reduce stock -> save transaction (ada atau enggak)
-- call kalo produk keluar.
-- -----------------------------------------------------
DROP PROCEDURE IF EXISTS sp_beli;
DELIMITER //
CREATE PROCEDURE sp_beli (
  IN p_id_produk INT UNSIGNED,
  IN p_kuantitas INT UNSIGNED,
  IN p_metode    VARCHAR(10),      -- 'cash', 'qris', 'kartu'
  IN p_uang      INT UNSIGNED      -- cash received, NULL for qris/kartu
)
BEGIN
  DECLARE v_harga INT UNSIGNED;
  DECLARE v_stok  INT UNSIGNED;
  DECLARE v_total INT UNSIGNED;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT harga, stok INTO v_harga, v_stok
  FROM produk WHERE id_produk = p_id_produk FOR UPDATE;

  IF v_harga IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Produk tidak ditemukan';
  END IF;
  IF p_kuantitas < 1 OR p_kuantitas > v_stok THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stok tidak cukup';
  END IF;

  SET v_total = v_harga * p_kuantitas;

  IF p_metode = 'cash' AND (p_uang IS NULL OR p_uang < v_total) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Uang kurang';
  END IF;

  UPDATE produk SET stok = stok - p_kuantitas WHERE id_produk = p_id_produk;

  INSERT INTO transaksi
    (id_produk, kuantitas, total_harga, metode_bayar, uang_diterima, kembalian, status)
  VALUES
    (p_id_produk, p_kuantitas, v_total, p_metode,
     IF(p_metode = 'cash', p_uang, NULL),
     IF(p_metode = 'cash', p_uang - v_total, NULL),
     'berhasil');

  COMMIT;

  SELECT LAST_INSERT_ID() AS id_transaksi, v_total AS total_harga,
         IF(p_metode = 'cash', p_uang - v_total, 0) AS kembalian;
END //
DELIMITER ;

-- =====================================================
-- Test queries (run one at a time)
-- =====================================================

-- Menu for the screen (available = 0 means show the what idk)
SELECT kode_slot, nama, kategori, harga, stok, (stok > 0) AS tersedia
FROM produk ORDER BY kode_slot;

-- Buy 2 x A1 with cash Rp 50.000 (change Rp 30.000)
-- Run this line by itself: each run lowers stock and adds a transaction
-- CALL sp_beli(1, 2, 'cash', 50000);

-- Check stock went down and the transaction was saved
SELECT kode_slot, nama, stok FROM produk WHERE id_produk = 1;
SELECT * FROM transaksi;

-- kalau sold "Stok tidak cukup"
-- CALL sp_beli(7, 1, 'qris', NULL);

-- kembalian cukup?
SELECT SUM(nominal * jumlah) AS total_kembalian_mesin,
       SUM(nominal * jumlah) >= 30000 AS cukup
FROM kembalian_mesin;

-- Sales report(successful sales only)
SELECT p.nama, SUM(t.kuantitas) AS terjual, SUM(t.total_harga) AS pendapatan
FROM transaksi t JOIN produk p ON p.id_produk = t.id_produk
WHERE t.status = 'berhasil'
GROUP BY p.id_produk, p.nama ORDER BY pendapatan DESC;

-- refill
SELECT kode_slot, nama, stok FROM produk WHERE stok <= 2 ORDER BY stok;
