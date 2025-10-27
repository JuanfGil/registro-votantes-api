CREATE TABLE IF NOT EXISTS voters (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  cedula VARCHAR(30) NOT NULL UNIQUE,
  telefono VARCHAR(30) NOT NULL,
  municipio TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voters_municipio ON voters (municipio);
CREATE INDEX IF NOT EXISTS idx_voters_created_at ON voters (created_at);
