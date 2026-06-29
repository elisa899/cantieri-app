// seed.js — inserisce l'elenco reale di titolare/capisquadra/operai.
// ATTENZIONE: questo script SVUOTA le tabelle dipendenti/cantieri/assegnazioni
// prima di reinserire i dati. Usalo solo per la configurazione iniziale,
// non quando l'app è già in uso con dati reali da non perdere.
'use strict';
const { db } = require('./db');

const employees = [
  { name: 'Andrea Ciaponi', isCapo: 1, roleLabel: 'Titolare' },

  { name: 'Ilie Achitei', isCapo: 1 },
  { name: 'Davide Ciaponi', isCapo: 1 },
  { name: 'Luca Ciaponi', isCapo: 1 },
  { name: 'Constantin Cosofret', isCapo: 1 },
  { name: 'Gheorghe Dumitrascu', isCapo: 1 },
  { name: 'Ioan Giurgi', isCapo: 1 },
  { name: 'Alexandru Florin Oltean', isCapo: 1 },
  { name: 'Gheorghe Tamas', isCapo: 1 },
  { name: 'Antonio Cosmin Vintur', isCapo: 1 },

  { name: 'Constantin Burea', isCapo: 0 },
  { name: 'Mario Colli', isCapo: 0 },
  { name: 'Giorgio De Giovanetti', isCapo: 0 },
  { name: 'Ioan Dolhescu', isCapo: 0 },
  { name: 'Vasile Dumitrascu', isCapo: 0 },
  { name: 'Luca Gatti', isCapo: 0 },
  { name: 'Stefano Gianatti', isCapo: 0 },
  { name: 'Davide Gregorini', isCapo: 0 },
  { name: 'Alex Moroni', isCapo: 0 },
  { name: 'Ionut Florin Negru', isCapo: 0 },
  { name: 'Angelo Paredi', isCapo: 0 },
  { name: 'Gheorghe Pascal', isCapo: 0 },
  { name: 'Matteo Piani', isCapo: 0 },
  { name: 'Ioan Pop', isCapo: 0 },
  { name: 'Dan Podina', isCapo: 0 },
  { name: 'Matteo Scherini', isCapo: 0 },
  { name: 'Cosmin Tamas', isCapo: 0 },
  { name: 'Ion Tamas', isCapo: 0 },
  { name: 'Ioan Florin Tupita', isCapo: 0 },
  { name: 'Francesco Zani', isCapo: 0 },
];

// Cantieri di esempio: modificali pure dal pannello ufficio con i nomi reali dei vostri cantieri.
const worksites = [
  { name: 'Cantiere 1 (da rinominare)' },
  { name: 'Cantiere 2 (da rinominare)' },
  { name: 'Cantiere 3 (da rinominare)' },
];

db.exec('DELETE FROM assignments');
db.exec('DELETE FROM daily_notes');
db.exec('DELETE FROM employees');
db.exec('DELETE FROM worksites');
db.exec("DELETE FROM sqlite_sequence WHERE name IN ('assignments','daily_notes','employees','worksites')");

const insEmp = db.prepare(
  'INSERT INTO employees (name, is_capo, role_label, active) VALUES (?, ?, ?, 1)'
);
for (const e of employees) insEmp.run(e.name, e.isCapo, e.roleLabel || null);

const insSite = db.prepare('INSERT INTO worksites (name, active) VALUES (?, 1)');
for (const w of worksites) insSite.run(w.name);

console.log(`Inseriti ${employees.length} dipendenti (di cui ${employees.filter(e => e.isCapo).length} capisquadra/titolare) e ${worksites.length} cantieri di esempio.`);
console.log('Ricorda di rinominare i cantieri con i nomi reali dal pannello Ufficio.');
