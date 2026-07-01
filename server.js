// server.js — server HTTP puro (nessuna dipendenza esterna)
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { db, closeStaleOpenAssignments } = require('./db');

// Carica le variabili da .env, se presente (nessuna dipendenza esterna richiesta)
(function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
})();

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cantieri2026';
const PUBLIC_DIR = path.join(__dirname, 'public');

closeStaleOpenAssignments();
// Richiude le assegnazioni rimaste aperte da giorni precedenti una volta al giorno
setInterval(closeStaleOpenAssignments, 60 * 60 * 1000);

// ---------- Utility ----------
function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function isAdmin(req) {
  const cookies = parseCookies(req);
  const token = cookies.admin_session;
  if (!token) return false;
  const row = db.prepare('SELECT token FROM sessions WHERE token = ?').get(token);
  return !!row;
}

function nowISO() {
  return new Date().toISOString();
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/home.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendText(res, 403, 'Forbidden');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      return sendText(res, 404, 'Non trovato');
    }
    const ext = path.extname(filePath);
    sendText(res, 200, content, MIME[ext] || 'application/octet-stream');
  });
}

// ---------- API handlers ----------
async function handleApi(req, res, pathname, query) {
  const method = req.method;

  // ----- AUTH -----
  if (pathname === '/api/admin/login' && method === 'POST') {
    const body = await readBody(req);
    if ((body.password || '') !== ADMIN_PASSWORD) {
      return sendJSON(res, 401, { error: 'Password errata' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token) VALUES (?)').run(token);
    res.setHeader(
      'Set-Cookie',
      `admin_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`
    );
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/logout' && method === 'POST') {
    const cookies = parseCookies(req);
    if (cookies.admin_session) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(cookies.admin_session);
    }
    res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; Path=/; Max-Age=0');
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/check' && method === 'GET') {
    return sendJSON(res, 200, { isAdmin: isAdmin(req) });
  }

  // Da qui in poi: alcune rotte richiedono privilegi admin
  const ADMIN_ONLY_PREFIXES = ['/api/admin/employees', '/api/admin/worksites', '/api/admin/report', '/api/admin/reset-data'];
  if (ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p)) && !isAdmin(req)) {
    return sendJSON(res, 401, { error: 'Accesso riservato all\'ufficio' });
  }

  // ----- CAPISQUADRA (pubblico, solo lettura nomi) -----
  if (pathname === '/api/capisquadra' && method === 'GET') {
    const rows = db
      .prepare(
        'SELECT id, name, role_label FROM employees WHERE is_capo = 1 AND active = 1 ORDER BY name'
      )
      .all();
    return sendJSON(res, 200, rows);
  }

  // Lista dipendenti attivi selezionabili come operai
  if (pathname === '/api/employees' && method === 'GET') {
    const rows = db
      .prepare('SELECT id, name, is_capo, role_label FROM employees WHERE active = 1 ORDER BY name')
      .all();
    return sendJSON(res, 200, rows);
  }

  if (pathname === '/api/worksites' && method === 'GET') {
    const rows = db
      .prepare('SELECT id, name FROM worksites WHERE active = 1 ORDER BY name')
      .all();
    return sendJSON(res, 200, rows);
  }

  // ----- SQUADRA (operazioni dei capisquadra, senza password) -----
  if (pathname === '/api/team' && method === 'GET') {
    const capoId = Number(query.get('capoId'));
    const date = query.get('date') || todayStr();
    if (!capoId) return sendJSON(res, 400, { error: 'capoId richiesto' });
    const rows = db
      .prepare(
        `SELECT a.id, a.employee_id, e.name AS employee_name, a.worksite_id, w.name AS worksite_name,
                a.start_time, a.end_time, a.end_reason
         FROM assignments a
         JOIN employees e ON e.id = a.employee_id
         JOIN worksites w ON w.id = a.worksite_id
         WHERE a.capo_id = ? AND a.work_date = ?
         ORDER BY a.end_time IS NULL DESC, a.start_time DESC`
      )
      .all(capoId, date);
    return sendJSON(res, 200, rows);
  }

  if (pathname === '/api/team/add' && method === 'POST') {
    const body = await readBody(req);
    const capoId = Number(body.capoId);
    const employeeId = Number(body.employeeId);
    const worksiteId = Number(body.worksiteId);
    if (!capoId || !employeeId || !worksiteId) {
      return sendJSON(res, 400, { error: 'Dati incompleti' });
    }
    const date = todayStr();
    const openExisting = db
      .prepare(
        `SELECT a.id, w.name AS worksite_name, e2.name AS capo_name
         FROM assignments a
         JOIN worksites w ON w.id = a.worksite_id
         JOIN employees e2 ON e2.id = a.capo_id
         WHERE a.employee_id = ? AND a.work_date = ? AND a.end_time IS NULL`
      )
      .get(employeeId, date);
    if (openExisting) {
      return sendJSON(res, 409, {
        error: `Questo operaio è già assegnato oggi a "${openExisting.worksite_name}" con ${openExisting.capo_name}. Rimuovilo prima da quella squadra.`,
      });
    }
    db.prepare(
      `INSERT INTO assignments (employee_id, capo_id, worksite_id, work_date, start_time)
       VALUES (?, ?, ?, ?, ?)`
    ).run(employeeId, capoId, worksiteId, date, nowISO());
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/team/change-site' && method === 'POST') {
    const body = await readBody(req);
    const assignmentId = Number(body.assignmentId);
    const newWorksiteId = Number(body.newWorksiteId);
    if (!assignmentId || !newWorksiteId) {
      return sendJSON(res, 400, { error: 'Dati incompleti' });
    }
    const current = db
      .prepare('SELECT * FROM assignments WHERE id = ? AND end_time IS NULL')
      .get(assignmentId);
    if (!current) return sendJSON(res, 404, { error: 'Assegnazione non trovata o già chiusa' });
    const ts = nowISO();
    db.prepare(
      `UPDATE assignments SET end_time = ?, end_reason = 'cambio_cantiere' WHERE id = ?`
    ).run(ts, assignmentId);
    db.prepare(
      `INSERT INTO assignments (employee_id, capo_id, worksite_id, work_date, start_time)
       VALUES (?, ?, ?, ?, ?)`
    ).run(current.employee_id, current.capo_id, newWorksiteId, current.work_date, ts);
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/team/change-site-bulk' && method === 'POST') {
    const body = await readBody(req);
    const capoId = Number(body.capoId);
    const newWorksiteId = Number(body.newWorksiteId);
    if (!capoId || !newWorksiteId) {
      return sendJSON(res, 400, { error: 'Dati incompleti' });
    }
    const date = todayStr();
    const open = db
      .prepare(
        `SELECT * FROM assignments WHERE capo_id = ? AND work_date = ? AND end_time IS NULL`
      )
      .all(capoId, date);
    const ts = nowISO();
    const closeStmt = db.prepare(
      `UPDATE assignments SET end_time = ?, end_reason = 'cambio_cantiere' WHERE id = ?`
    );
    const insertStmt = db.prepare(
      `INSERT INTO assignments (employee_id, capo_id, worksite_id, work_date, start_time)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const a of open) {
      if (a.worksite_id === newWorksiteId) continue;
      closeStmt.run(ts, a.id);
      insertStmt.run(a.employee_id, a.capo_id, newWorksiteId, a.work_date, ts);
    }
    return sendJSON(res, 200, { ok: true, changed: open.length });
  }

  if (pathname === '/api/team/remove' && method === 'POST') {
    const body = await readBody(req);
    const assignmentId = Number(body.assignmentId);
    const reason = String(body.reason || 'rimosso');
    if (!assignmentId) return sendJSON(res, 400, { error: 'Dati incompleti' });
    const current = db
      .prepare('SELECT * FROM assignments WHERE id = ? AND end_time IS NULL')
      .get(assignmentId);
    if (!current) return sendJSON(res, 404, { error: 'Assegnazione non trovata o già chiusa' });
    db.prepare(`UPDATE assignments SET end_time = ?, end_reason = ? WHERE id = ?`).run(
      nowISO(),
      reason,
      assignmentId
    );
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/team/note' && method === 'GET') {
    const capoId = Number(query.get('capoId'));
    const date = query.get('date') || todayStr();
    if (!capoId) return sendJSON(res, 400, { error: 'capoId richiesto' });
    const row = db
      .prepare('SELECT note FROM daily_notes WHERE capo_id = ? AND work_date = ?')
      .get(capoId, date);
    return sendJSON(res, 200, { note: row ? row.note : '' });
  }

  if (pathname === '/api/team/note' && method === 'POST') {
    const body = await readBody(req);
    const capoId = Number(body.capoId);
    const date = body.date || todayStr();
    const note = String(body.note || '');
    if (!capoId) return sendJSON(res, 400, { error: 'capoId richiesto' });
    db.prepare(
      `INSERT INTO daily_notes (capo_id, work_date, note, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(capo_id, work_date) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`
    ).run(capoId, date, note, nowISO());
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/team/close-day' && method === 'POST') {
    const body = await readBody(req);
    const capoId = Number(body.capoId);
    if (!capoId) return sendJSON(res, 400, { error: 'capoId richiesto' });
    const date = todayStr();
    const ts = nowISO();
    const result = db
      .prepare(
        `UPDATE assignments SET end_time = ?, end_reason = 'fine_giornata'
         WHERE capo_id = ? AND work_date = ? AND end_time IS NULL`
      )
      .run(ts, capoId, date);
    return sendJSON(res, 200, { ok: true, closed: result.changes });
  }

  // ----- ADMIN: dipendenti -----
  if (pathname === '/api/admin/employees' && method === 'GET') {
    const rows = db.prepare('SELECT * FROM employees ORDER BY active DESC, name').all();
    return sendJSON(res, 200, rows);
  }

  if (pathname === '/api/admin/employees' && method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return sendJSON(res, 400, { error: 'Nome richiesto' });
    const isCapo = body.isCapo ? 1 : 0;
    const roleLabel = body.roleLabel ? String(body.roleLabel).trim() : null;
    const info = db
      .prepare('INSERT INTO employees (name, is_capo, role_label, active) VALUES (?, ?, ?, 1)')
      .run(name, isCapo, roleLabel);
    return sendJSON(res, 200, { ok: true, id: info.lastInsertRowid });
  }

  const empMatch = pathname.match(/^\/api\/admin\/employees\/(\d+)$/);
  if (empMatch && (method === 'PUT' || method === 'PATCH')) {
    const id = Number(empMatch[1]);
    const body = await readBody(req);
    const fields = [];
    const values = [];
    if (body.name !== undefined) { fields.push('name = ?'); values.push(String(body.name).trim()); }
    if (body.isCapo !== undefined) { fields.push('is_capo = ?'); values.push(body.isCapo ? 1 : 0); }
    if (body.roleLabel !== undefined) { fields.push('role_label = ?'); values.push(body.roleLabel ? String(body.roleLabel).trim() : null); }
    if (body.active !== undefined) { fields.push('active = ?'); values.push(body.active ? 1 : 0); }
    if (!fields.length) return sendJSON(res, 400, { error: 'Nessun campo da aggiornare' });
    values.push(id);
    db.prepare(`UPDATE employees SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return sendJSON(res, 200, { ok: true });
  }

  // ----- ADMIN: cantieri -----
  if (pathname === '/api/admin/worksites' && method === 'GET') {
    const rows = db.prepare('SELECT * FROM worksites ORDER BY active DESC, name').all();
    return sendJSON(res, 200, rows);
  }

  if (pathname === '/api/admin/worksites' && method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return sendJSON(res, 400, { error: 'Nome richiesto' });
    const info = db.prepare('INSERT INTO worksites (name, active) VALUES (?, 1)').run(name);
    return sendJSON(res, 200, { ok: true, id: info.lastInsertRowid });
  }

  const siteMatch = pathname.match(/^\/api\/admin\/worksites\/(\d+)$/);
  if (siteMatch && (method === 'PUT' || method === 'PATCH')) {
    const id = Number(siteMatch[1]);
    const body = await readBody(req);
    const fields = [];
    const values = [];
    if (body.name !== undefined) { fields.push('name = ?'); values.push(String(body.name).trim()); }
    if (body.active !== undefined) { fields.push('active = ?'); values.push(body.active ? 1 : 0); }
    if (!fields.length) return sendJSON(res, 400, { error: 'Nessun campo da aggiornare' });
    values.push(id);
    db.prepare(`UPDATE worksites SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return sendJSON(res, 200, { ok: true });
  }

  // ----- ADMIN: report ore -----
  if (pathname === '/api/admin/report' && method === 'GET') {
    return sendJSON(res, 200, computeReport(query));
  }

  if (pathname === '/api/admin/report.csv' && method === 'GET') {
    const data = computeReport(query);
    const SEP = ';';
    const lines = [`Dipendente${SEP}Cantiere${SEP}Data${SEP}Ore${SEP}Note`];
    for (const row of data.rows) {
      const note = row.inCorso ? 'IN CORSO' : '';
      const oreIT = row.hours.toFixed(2).replace('.', ',');
      lines.push(
        [row.employeeName, row.worksiteName, row.date, oreIT, note]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(SEP)
      );
    }
    const month = query.get('month') || '';
    const filename = month ? `report-${month}.csv` : 'report.csv';
    const csv = '\uFEFF' + lines.join('\r\n');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return res.end(csv);
  }

  // ----- ADMIN: reset dati di prova -----
  if (pathname === '/api/admin/reset-data' && method === 'POST') {
    db.exec('DELETE FROM assignments');
    db.exec('DELETE FROM daily_notes');
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('assignments', 'daily_notes')");
    return sendJSON(res, 200, { ok: true });
  }

  return sendJSON(res, 404, { error: 'Non trovato' });
}

function computeReport(query) {
  const month = query.get('month');
  const employeeId = query.get('employeeId');
  const worksiteId = query.get('worksiteId');

  let sql = `
    SELECT a.id, a.employee_id, e.name AS employee_name, a.worksite_id, w.name AS worksite_name,
           a.work_date, a.start_time, a.end_time
    FROM assignments a
    JOIN employees e ON e.id = a.employee_id
    JOIN worksites w ON w.id = a.worksite_id
    WHERE 1=1
  `;
  const params = [];
  if (month) { sql += ' AND a.work_date LIKE ?'; params.push(`${month}%`); }
  if (employeeId) { sql += ' AND a.employee_id = ?'; params.push(Number(employeeId)); }
  if (worksiteId) { sql += ' AND a.worksite_id = ?'; params.push(Number(worksiteId)); }
  sql += ' ORDER BY e.name, a.work_date, a.start_time';

  const raw = db.prepare(sql).all(...params);
  const now = new Date();
  const rows = raw.map((r) => {
    const start = new Date(r.start_time);
    const inCorso = !r.end_time;
    const end = r.end_time ? new Date(r.end_time) : now;
    const hours = Math.max(0, (end - start) / 3600000);
    return {
      employeeId: r.employee_id,
      employeeName: r.employee_name,
      worksiteId: r.worksite_id,
      worksiteName: r.worksite_name,
      date: r.work_date,
      hours,
      inCorso,
    };
  });

  const totalsByEmployee = {};
  const totalsByEmployeeSite = {};
  for (const r of rows) {
    totalsByEmployee[r.employeeName] = (totalsByEmployee[r.employeeName] || 0) + r.hours;
    const key = `${r.employeeName} — ${r.worksiteName}`;
    totalsByEmployeeSite[key] = (totalsByEmployeeSite[key] || 0) + r.hours;
  }

  let notesSql = `
    SELECT n.work_date, n.note, n.updated_at, e.name AS capo_name
    FROM daily_notes n
    JOIN employees e ON e.id = n.capo_id
    WHERE n.note IS NOT NULL AND TRIM(n.note) != ''
  `;
  const notesParams = [];
  if (month) { notesSql += ' AND n.work_date LIKE ?'; notesParams.push(`${month}%`); }
  notesSql += ' ORDER BY n.work_date DESC, e.name';
  const dailyNotes = db.prepare(notesSql).all(...notesParams);

  return { rows, totalsByEmployee, totalsByEmployeeSite, dailyNotes };
}

// ---------- Router principale ----------
const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(urlObj.pathname);
    if (pathname.startsWith('/api/')) {
      return await handleApi(req, res, pathname, urlObj.searchParams);
    }
    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: 'Errore interno', detail: String(err && err.message) });
  }
});

server.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});

module.exports = server;