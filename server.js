const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const db = new Database('inventario.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS inventario (
    fecha TEXT NOT NULL,
    producto TEXT NOT NULL,
    cantidad INTEGER DEFAULT 0,
    PRIMARY KEY (fecha, producto)
  )
`);

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
  const rows = db.prepare('SELECT producto, cantidad FROM inventario WHERE fecha = ?').all(fecha);

  if (rows.length === 0) {
    const anterior = db.prepare(`
      SELECT producto, cantidad FROM inventario
      WHERE fecha = (
        SELECT MAX(fecha) FROM inventario WHERE fecha < ?
      )
    `).all(fecha);
    return res.json({ data: anterior, from_previous: anterior.length > 0 });
  }

  res.json({ data: rows, from_previous: false });
});

app.post('/api/inventario/:fecha', (req, res) => {
  const { fecha } = req.params;
  const { productos } = req.body;

  const today = new Date().toISOString().slice(0, 10);
  if (fecha !== today) return res.status(403).json({ error: 'Solo puedes editar el día de hoy' });

  const insert = db.prepare('INSERT OR REPLACE INTO inventario (fecha, producto, cantidad) VALUES (?, ?, ?)');
  const insertMany = db.transaction((items) => {
    for (const item of items) insert.run(fecha, item.producto, item.cantidad);
  });
  insertMany(productos);
  res.json({ ok: true });
});

app.get('/api/historial', (req, res) => {
  const rows = db.prepare(`
    SELECT fecha, SUM(cantidad) as total, COUNT(CASE WHEN cantidad > 0 THEN 1 END) as productos_con_stock
    FROM inventario GROUP BY fecha ORDER BY fecha DESC
  `).all();
  res.json(rows);
});

app.get('/api/historial/:fecha', (req, res) => {
  const { fecha } = req.params;
  const rows = db.prepare('SELECT producto, cantidad FROM inventario WHERE fecha = ? ORDER BY producto').all(fecha);
  res.json(rows);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
