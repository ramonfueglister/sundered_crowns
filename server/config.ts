// The settings of a world server, read from the environment (docs/DEPLOY.md).
export interface WorldConfig {
  id: string;
  name: string;
  dataDir: string;
  /** real seconds per in-game day */
  secondsPerDay: number;
  snapshotEveryDays: number;
  /** in-game days between snapshot uploads to Supabase Storage */
  uploadEveryDays: number;
  /** in-game days between uploads of the log since the last snapshot to Supabase Storage */
  logUploadEveryDays: number;
  /** real minutes at least between two snapshot uploads (a fast clock would otherwise send one every few seconds) */
  uploadMinMinutes: number;
  seed: number;
  startYear: number;
  maxPlayers: number;
  /** real time without a login after which a player's realm is free again */
  inactiveReleaseMs: number;
  /** commands a player may give per in-game day */
  cmdsPerDay: number;
  /** account ids or display names with admin rights (besides the store's admin table) */
  admins: string[];
  devAuth: boolean;
  /** who may pause the world and change its speed (the time control top left): admins (in a DEV world everyone), or everyone */
  timeControl?: 'admins' | 'all';
  log?: (msg: string) => void;
}
export function configFromEnv(env: Record<string, string | undefined> = process.env): WorldConfig {
  const num = (k: string, d: number) => {
    const v = Number(env[k]);
    return env[k] !== undefined && env[k] !== '' && Number.isFinite(v) ? v : d;
  };
  return {
    id: (env.WORLD_ID || 'europa-1')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 32),
    name: env.WORLD_NAME || 'Europa I',
    dataDir: env.WORLD_DATA_DIR || './world-data',
    secondsPerDay: num('SECONDS_PER_DAY', 240),
    snapshotEveryDays: Math.max(1, num('SNAPSHOT_EVERY_DAYS', 30)),
    uploadEveryDays: Math.max(1, num('SNAPSHOT_UPLOAD_EVERY_DAYS', 30)),
    logUploadEveryDays: Math.max(1, num('LOG_UPLOAD_EVERY_DAYS', 1)),
    uploadMinMinutes: Math.max(0, num('SNAPSHOT_UPLOAD_MIN_MINUTES', 60)),
    seed: num('WORLD_SEED', 1356),
    startYear: num('WORLD_START_YEAR', 1356),
    maxPlayers: num('MAX_PLAYERS', 100),
    inactiveReleaseMs: num('INACTIVE_RELEASE_DAYS', 7) * 86400_000,
    cmdsPerDay: num('CMDS_PER_DAY', 60),
    admins: (env.ADMIN_USERS || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    devAuth: !(env.SUPABASE_JWT_SECRET || env.SUPABASE_JWKS_URL || env.SUPABASE_URL),
    timeControl: env.TIME_CONTROL === 'all' ? 'all' : 'admins',
  };
}
