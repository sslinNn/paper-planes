import { betterAuth } from 'better-auth'
import { pool } from './db.ts'

export const auth = betterAuth({
  database: pool,
  account: { encryptOAuthTokens: true }, // refresh-токены X не должны лежать в базе открыто
  socialProviders: {
    twitter: {
      clientId: process.env.X_CLIENT_ID!,
      clientSecret: process.env.X_CLIENT_SECRET!,
      disableDefaultScope: true, // дефолт тянет users.email — требует отдельной настройки в X
      scope: ['users.read', 'tweet.read', 'offline.access'],
    },
  },
  user: {
    additionalFields: {
      handle: { type: 'string', required: false, input: false },
      country: { type: 'string', required: false, input: false },
      countryManual: { type: 'boolean', required: false, defaultValue: false, input: false },
      sinceId: { type: 'string', required: false, input: false },
    },
  },
})
