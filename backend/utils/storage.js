// backend/utils/storage.js
const fs = require('fs');
const path = require('path');

function getData(filename) {
  try {
    const dir = path.join(__dirname, '../data');
    const p = path.join(dir, filename);
    if (!fs.existsSync(p)) return null;   // return null when file missing
    const raw = fs.readFileSync(p, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('getData error', e);
    return null;
  }
}

function saveData(filename, data) {
  try {
    const dir = path.join(__dirname, '../data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, filename);
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, p); // atomic on most OS
  } catch (e) {
    console.error('saveData error', e);
  }
}

module.exports = { getData, saveData };
