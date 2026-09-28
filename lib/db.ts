import { Pool } from 'pg'

// Neon отдаёт sslmode=require; pg и так проверяет сертификат (verify-full), пишем это явно — без шумного предупреждения в логах
export const pool = new Pool({ connectionString: process.env.DATABASE_URL?.replace('sslmode=require', 'sslmode=verify-full') })
