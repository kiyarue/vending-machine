<?php
// Copy this file to config.php and fill in your own MySQL login
const DB_HOST = '127.0.0.1';
const DB_PORT = 3306;
const DB_NAME = 'vending_db';
const DB_USER = 'root';
const DB_PASS = '';   // your MySQL password

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