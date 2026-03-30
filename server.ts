import express from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Cria tabela se não existir
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inspections (
      id serial PRIMARY KEY,
      created_at timestamptz DEFAULT now(),
      image_base64 text,
      quality_score integer,
      summary text,
      imperfections jsonb,
      detections jsonb
    );
  `);
  console.log('✅ Tabela inspections pronta');
}

// GET /api/inspections — lista últimas 20 inspeções
app.get('/api/inspections', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, created_at, quality_score, summary, imperfections, detections FROM inspections ORDER BY created_at DESC LIMIT 20'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar inspeções' });
  }
});

// POST /api/inspections — salva nova inspeção
app.post('/api/inspections', async (req, res) => {
  const { image_base64, quality_score, summary, imperfections, detections } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO inspections (image_base64, quality_score, summary, imperfections, detections)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [image_base64, quality_score, summary, JSON.stringify(imperfections), JSON.stringify(detections)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar inspeção' });
  }
});

// DELETE /api/inspections/:id — remove inspeção
app.delete('/api/inspections/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM inspections WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao deletar inspeção' });
  }
});

const PORT = process.env.PORT || 3001;

initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 API rodando em http://localhost:${PORT}`));
});
