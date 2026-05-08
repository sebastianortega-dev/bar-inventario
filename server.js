const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query(`
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

app.get('/api/inventario/:fecha', async (req, res) => {
  const { fecha } = req.params;
  try {
    const result = await pool.query('SELECT producto, cantidad FROM inventario WHERE fecha = $1', [fecha]);
    if (result.rows.length === 0) {
      const prev = await pool.query(`
        SELECT producto, cantidad FROM inventario
        WHERE fecha = (SELECT MAX(fecha) FROM inventario WHERE fecha < $1)
      `, [fecha]);
      return res.json({ data: prev.rows, from_previous: prev.rows.length > 0 });
    }
    res.json({ data: result.rows, from_previous: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/inventario/:fecha', async (req, res) => {
  const { fecha } = req.params;
  const { productos } = req.body;
  const today = new Date().toISOString().slice(0, 10);
  if (fecha !== today) return res.status(403).json({ error: 'Solo puedes editar el día de hoy' });
  try {
    for (const item of productos) {
      await pool.query(
        'INSERT INTO inventario (fecha, producto, cantidad) VALUES ($1, $2, $3) ON CONFLICT (fecha, producto) DO UPDATE SET cantidad = $3',
        [fecha, item.producto, item.cantidad]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/historial', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT fecha, SUM(cantidad) as total, COUNT(CASE WHEN cantidad > 0 THEN 1 END) as productos_con_stock
      FROM inventario GROUP BY fecha ORDER BY fecha DESC
    `);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/historial/:fecha', async (req, res) => {
  const { fecha } = req.params;
  try {
    const result = await pool.query('SELECT producto, cantidad FROM inventario WHERE fecha = $1 ORDER BY producto', [fecha]);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
