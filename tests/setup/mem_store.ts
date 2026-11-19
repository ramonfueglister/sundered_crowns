// A store in memory for the tests of the world server: Storage one file per name, overwritten in place, as in the
// bucket; the tables of the rulers by their keys.
import type { WorldStore, Backup } from '../../server/store';
import type { PersonRow, ReignRow } from '../../server/rulers_copy';

export class MemStore implements WorldStore {
  readonly enabled = true;
  files = new Map<string, Uint8Array | string>();
  snapshots: number[] = [];
  logs = 0;
  persons = new Map<number, PersonRow>();
  reigns = new Map<string, ReignRow>();
  async upsertRulers(persons: PersonRow[], reigns: ReignRow[]) {
    for (const p of persons) this.persons.set(p.person, p);
    for (const r of reigns) this.reigns.set(`${r.realm}#${r.n}`, r);
    return true;
  }
  async upsertWorld() {}
  async upsertSeat() {}
  async removeSeat() {}
  async isAdmin() {
    return false;
  }
  async profileName() {
    return null;
  }
  async uploadSnapshot(world: string, day: number, bin: Uint8Array, meta: string, history: Uint8Array | null) {
    this.files.set(`${world}/snapshot.bin`, bin);
    this.files.set(`${world}/meta.json`, meta);
    this.snapshots.push(day);
    if (history) this.files.set(`${world}/borders.ndjson.gz`, history);
    return true;
  }
  async uploadLog(world: string, log: string) {
    this.files.set(`${world}/log.ndjson`, log);
    this.logs++;
    return true;
  }
  async uploadArchived(world: string, day: number, bin: Uint8Array) {
    this.files.set(`${world}/archive/dead-${day}.bin`, bin);
    return true;
  }
  async downloadArchived(world: string, day: number) {
    return (this.files.get(`${world}/archive/dead-${day}.bin`) as Uint8Array | undefined) ?? null;
  }
  async downloadBackup(world: string): Promise<Backup | null> {
    const bin = this.files.get(`${world}/snapshot.bin`) as Uint8Array | undefined;
    if (!bin) return null;
    return {
      bin,
      log: (this.files.get(`${world}/log.ndjson`) as string) ?? '',
      meta: (this.files.get(`${world}/meta.json`) as string) ?? null,
      history: (this.files.get(`${world}/borders.ndjson.gz`) as Uint8Array) ?? null,
    };
  }
}
