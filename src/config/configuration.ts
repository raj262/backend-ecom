/**
 * Strongly-typed configuration factory. Loaded into `ConfigModule.forRoot`
 * (see `app.module.ts`). Env vars are always strings, so any numeric/boolean
 * field is coerced here once and read directly elsewhere.
 */
export type AppConfig = ReturnType<typeof configuration>;

export const configuration = () => ({
  node: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '4000', 10),

  cors: {
    origins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  mongo: {
    uri: process.env.MONGODB_URI ?? '',
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },

  auth: {
    bcryptRounds: Number.parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10', 10),
  },
});
