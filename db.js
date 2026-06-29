// db.js — livello di accesso al database SQLite (modulo nativo node:sqlite)
'use strict';

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'cantieri.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    is_capo INTEGER NOT NULL DEFAULT 0,
    role_label TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS worksites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    capo_id INTEGER NOT NULL,
    worksite_id INTEGER NOT NULL,
    work_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    end_reason TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (capo_id) REFERENCES employees(id),
    FOREIGN KEY (worksite_id) REFERENCES worksites(id)
  );

  CREATE INDEX IF NOT EXISTS idx_assignments_date ON assignments(work_date);
  CREATE INDEX IF NOT EXISTS idx_assignments_employee ON assignments(employee_id);
  CREATE INDEX IF NOT EXISTS idx_assignments_open ON assignments(employee_id, end_time);

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS daily_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capo_id INTEGER NOT NULL,
    work_date TEXT NOT NULL,
    note TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(capo_id, work_date),
    FOREIGN KEY (capo_id) REFERENCES employees(id)
  );
`);

// --- Migrazione automatica: chiude le assegnazioni rimaste aperte da giorni precedenti ---
function closeStaleOpenAssignments() {
  const today = new Date().toISOString().slice(0, 10);
  const stale = db.prepare(
    `SELECT id, work_date FROM assignments WHERE end_time IS NULL AND work_date < ?`
  ).all(today);
  const closeStmt = db.prepare(
    `UPDATE assignments SET end_time = ?, end_reason = 'chiusura_automatica' WHERE id = ?`
  );
  for (const row of stale) {
    closeStmt.run(`${row.work_date}T23:59:00.000Z`, row.id);
  }
  return stale.length;
}

module.exports = { db, closeStaleOpenAssignments };
