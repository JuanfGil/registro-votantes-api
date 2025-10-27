\
/* API Registro de Votantes con auth admin (JWT) */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'VOTANTES2025'; // cambiar en prod
const JWT_SECRET = process.env.JWT_SECRET || 'cambia-esto';
const JWT_TTL = process.env.JWT_TTL || '8h';

if (!DATABASE_URL) console.warn('⚠️  DATABASE_URL no está definida (Render la inyecta si usas la instancia de Postgres).');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL && /render\.com|amazonaws\.com/.test(DATABASE_URL) ? { rejectUnauthorized: false } : undefined
});

function validar({ nombre, cedula, telefono, municipio }) {
  const errors = [];
  if (!nombre || nombre.trim().length < 2) errors.push('Nombre inválido');
  if (!cedula || cedula.trim().length < 4) errors.push('Cédula inválida');
  if (!telefono || telefono.trim().length < 6) errors.push('Teléfono inválido');
  if (!municipio || municipio.trim().length < 2) errors.push('Municipio inválido');
  return errors;
}

function issueToken() {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: JWT_TTL });
}

function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No autorizado' });
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Prohibido' });
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// Health
app.get('/', (_,res)=> res.json({ ok: true, service: 'registro-votantes-api', auth: true }));

// Auth admin
app.post('/api/auth/login', (req,res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Falta contraseña' });
  if (String(password) !== String(ADMIN_PASSWORD)) return res.status(401).json({ error: 'Credenciales inválidas' });
  const token = issueToken();
  res.json({ token });
});

// Exists por cédula
app.get('/api/voters/exists', async (req,res) => {
  try {
    const { cedula } = req.query;
    if (!cedula) return res.status(400).json({ error: 'Falta cedula' });
    const { rows } = await pool.query('SELECT 1 FROM voters WHERE cedula=$1 LIMIT 1', [cedula]);
    res.json({ exists: rows.length > 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error' });
  }
});

// Listar (público)
app.get('/api/voters', async (req, res) => {
  try {
    const { q, municipio } = req.query;
    let sql = 'SELECT id, nombre, cedula, telefono, municipio, created_at FROM voters';
    const params = [];
    const conds = [];
    if (municipio) { params.push(municipio); conds.push(`LOWER(municipio) = LOWER($${params.length})`); }
    if (q) {
      params.push(`%${q}%`);
      const p = `$${params.length}`;
      conds.push(`(LOWER(nombre) LIKE LOWER(${p}) OR LOWER(cedula) LIKE LOWER(${p}) OR LOWER(telefono) LIKE LOWER(${p}) OR LOWER(municipio) LIKE LOWER(${p}))`);
    }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error listando' });
  }
});

// Crear (público)
app.post('/api/voters', async (req, res) => {
  try {
    const { nombre, cedula, telefono, municipio } = req.body;
    const errors = validar({ nombre, cedula, telefono, municipio });
    if (errors.length) return res.status(400).json({ errors });
    const { rows } = await pool.query(
      'INSERT INTO voters(nombre, cedula, telefono, municipio) VALUES ($1,$2,$3,$4) RETURNING *',
      [nombre.trim(), cedula.trim(), telefono.trim(), municipio.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    if (String(e.message).includes('duplicate key')) return res.status(409).json({ error: 'La cédula ya existe' });
    res.status(500).json({ error: 'Error creando' });
  }
});

// Actualizar (protegido)
app.put('/api/voters/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nombre, cedula, telefono, municipio } = req.body;
    const errors = validar({ nombre, cedula, telefono, municipio });
    if (errors.length) return res.status(400).json({ errors });
    const { rows } = await pool.query(
      'UPDATE voters SET nombre=$1, cedula=$2, telefono=$3, municipio=$4 WHERE id=$5 RETURNING *',
      [nombre.trim(), cedula.trim(), telefono.trim(), municipio.trim(), id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    if (String(e.message).includes('duplicate key')) return res.status(409).json({ error: 'La cédula ya existe' });
    res.status(500).json({ error: 'Error actualizando' });
  }
});

// Eliminar (protegido)
app.delete('/api/voters/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await pool.query('DELETE FROM voters WHERE id=$1', [id]);
    if (!r.rowCount) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error eliminando' });
  }
});

app.listen(PORT, () => console.log(`✅ API + Auth escuchando en puerto ${PORT}`));
