import { Pool } from 'pg'

// Neon отдаёт sslmode=require; pg и так проверяет сертификат (verify-full), пишем это явно — без шумного предупреждения в логах
export const pool = new Pool({ connectionString: process.env.DATABASE_URL?.replace('sslmode=require', 'sslmode=verify-full') })

// Neon рвёт простаивающие соединения; без обработчика 'error' на пуле это необработанное исключение и падение процесса
pool.on('error', (e) => console.error('pg idle client', e.message))
