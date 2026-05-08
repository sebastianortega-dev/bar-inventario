const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const db = new sqlite3.Database('inventario.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS inventario (
      fecha TEXT NOT NULL,
      producto TEXT NOT NULL,
      cantidad INTEGER DEFAULT 0,
      PRIMARY KEY (fecha, producto)
    )
  `);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PINS = {
  '101010': 'bartender',
  '262617': 'admin'
};

app.post('/api/login', (req, res) => {
  const { pin } = req.body;
  const role = PINS[pin];
  if (!role) return res.status(401).json({ error: 'PIN incorrecto' });
  res.json({ role });
});

app.get('/api/inventario/:fecha', (req, res) => {
  const { fecha } = req.params;
  db.all('SELECT producto, cantidad FROM inventario WHERE fecha = ?', [fecha], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length === 0) {
      db.all(`
        SELECT producto, cantidad FROM inventario
        WHERE fecha = (SELECT MAX(fecha) FROM inventario WHERE fecha < ?)
      `, [fecha], (err2, prev) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ data: prev, from_previous: prev.length > 0 });
      });
    } else {
      res.json({ data: rows, from_previous: false });
    }
  });
});

app.post('/api/inventario/:fecha', (req, res) => {
  const { fecha } = req.params;
  const { productos } = req.body;
  const today = new Date().toISOString().slice(0, 10);
  if (fecha !== today) return res.status(403).json({ error: 'Solo puedes editar el día de hoy' });

  const stmt = db.prepare('INSERT OR REPLACE INTO inventario (fecha, producto, cantidad) VALUES (?, ?, ?)');
  productos.forEach(item => stmt.run(fecha, item.producto, item.cantidad));
  stmt.finalize();
  res.json({ ok: true });
});

app.get('/api/historial', (req, res) => {
  db.all(`
    SELECT fecha, SUM(cantidad) as total, COUNT(CASE WHEN cantidad > 0 THEN 1 END) as productos_con_stock
    FROM inventario GROUP BY fecha ORDER BY fecha DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/historial/:fecha', (req, res) => {
  const { fecha } = req.params;
  db.all('SELECT producto, cantidad FROM inventario WHERE fecha = ? ORDER BY producto', [fecha], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
