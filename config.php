<?php
// Edit these to match your MySQL server (the same login you use in Workbench)
const DB_HOST = '127.0.0.1';
const DB_PORT = 3306;
const DB_NAME = 'vending_db';
const DB_USER = 'root';
const DB_PASS = 'aabbccdd123';   // put your MySQL root password here

function db(): PDO {
  static $pdo = null;
  if (!$pdo) {
    $pdo = new PDO(
      'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4',
      DB_USER, DB_PASS,
      [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
  }
  return $pdo;
}
