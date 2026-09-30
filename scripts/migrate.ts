// схема идемпотентна (if not exists) — применяем файл целиком: node --env-file=.env.local scripts/migrate.ts
import { readFileSync } from 'node:fs'
import { pool } from '../lib/db.ts'

await pool.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'))
console.log('schema applied')
await pool.end()
