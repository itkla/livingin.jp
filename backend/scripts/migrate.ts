import { createPgDatabase } from '../src/db/client';
import { appliedMigrations, loadMigrations, migrateDown, migrateUp } from '../src/db/migrate';

const [command = 'status', arg] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required (see backend/.env.example).');
  process.exit(1);
}

const db = createPgDatabase(url);
try {
  if (command === 'up') {
    const ran = await migrateUp(db);
    console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Already up to date.');
  } else if (command === 'down') {
    const steps = arg ? Number(arg) : 1;
    if (!Number.isInteger(steps) || steps < 1) throw new Error(`down takes a positive step count, got "${arg}"`);
    const reverted = await migrateDown(db, steps);
    console.log(reverted.length ? `Reverted: ${reverted.join(', ')}` : 'Nothing to revert.');
  } else if (command === 'status') {
    const applied = new Map((await appliedMigrations(db)).map((a) => [a.version, a]));
    for (const m of loadMigrations()) {
      const a = applied.get(m.version);
      console.log(`${a ? 'applied' : 'pending'}  ${m.version}_${m.name}${a ? `  (${a.applied_at})` : ''}`);
    }
  } else {
    throw new Error(`Unknown command "${command}". Use up, down [steps] or status.`);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await db.close();
}
