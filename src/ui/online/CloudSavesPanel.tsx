// Cloud saves for single player: list local and cloud saves side by side, upload, load, delete,
// and resolve conflicts (compares save timestamps and in-game dates, then asks which copy to keep).
import { useEffect, useState } from 'preact/hooks';
import { sim } from '../../game/client';
import { online, session } from '../../online/supabase';
import { syncPlan, keepLocal, downloadSave, deleteCloudSave, adoptCloudSave, type SyncRow } from '../../online/cloudSaves';
import { screen, showToast } from '../store';
import { lang } from '../i18n';
import { fmtDate } from '../../sim/calendar';
import { tt } from './strings';
import { onlineOpen } from './state';

export function CloudSavesPanel() {
  const [rows, setRows] = useState<SyncRow[] | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => { setErr(null); syncPlan().then(setRows).catch((e) => { setRows([]); setErr(String(e?.message ?? e)); }); };
  useEffect(() => { if (online.available && session.value) refresh(); }, [session.value?.user.id]);
  if (!online.available) return <p class="muted">{tt('not_configured')}</p>;
  if (!session.value) return <p class="sc-note">{tt('sign_in_first')}</p>;
  const when = (ms: number) => new Date(ms).toLocaleString(lang.value === 'de' ? 'de-DE' : 'en-GB');
  const act = async (key: string, f: () => Promise<any>) => { setBusy(key); try { await f(); } catch (e: any) { setErr(String(e?.message ?? e)); } setBusy(null); refresh(); };
  const play = (row: SyncRow) => act(row.key, async () => {
    const data = await downloadSave(row.cloud!);
    screen.value = 'loading'; onlineOpen.value = false;
    await sim().init({ seed: 0, year: row.cloud!.start_year, player: null, save: data, devtools: true });
    await adoptCloudSave(row, data);
    screen.value = 'game';
  });
  return <div class="sc-saves">
    <div class="row"><button class="btn small" onClick={refresh}>{tt('refresh')}</button></div>
    {err && <p class="sc-note err">{err}</p>}
    {rows === null && <p class="muted">…</p>}
    <table class="sc-table">
      <thead><tr><th /><th>{tt('local')}</th><th>{tt('cloud')}</th><th /></tr></thead>
      <tbody>{(rows ?? []).map((r) => <tr class={`st-${r.status}`}>
        <td><b>{r.local?.label ?? r.cloud?.label}</b><div class={`sc-sync ${r.status}`}>{tt(r.status)}</div></td>
        <td>{r.local ? <>{r.local.date}<div class="muted">{when(r.local.real)}</div></> : '—'}</td>
        <td>{r.cloud ? <>{r.cloud.game_date ?? fmtDate(r.cloud.game_day, r.cloud.start_year, lang.value)}<div class="muted">{when(Date.parse(r.cloud.client_saved_at))}</div></> : '—'}</td>
        <td class="sc-actions">
          {r.status === 'local_only' && <button class="btn small" disabled={!!busy} onClick={() => act(r.key, () => keepLocal(r))}>{tt('upload')}</button>}
          {r.status === 'cloud_only' && <button class="btn small gold" disabled={!!busy} onClick={() => play(r)}>{tt('download')}</button>}
          {(r.status === 'local_newer' || r.status === 'cloud_newer' || r.status === 'conflict') && <>
            <button class={`btn small ${r.recommend === 'local' ? 'gold' : ''}`} disabled={!!busy} onClick={() => act(r.key, () => keepLocal(r)).then(() => showToast(tt('saved')))}>{tt('keep_local')}{r.recommend === 'local' ? ` (${tt('recommended')})` : ''}</button>
            <button class={`btn small ${r.recommend === 'cloud' ? 'gold' : ''}`} disabled={!!busy} onClick={() => play(r)}>{tt('keep_cloud')}{r.recommend === 'cloud' ? ` (${tt('recommended')})` : ''}</button>
          </>}
          {r.status === 'in_sync' && <button class="btn small" disabled={!!busy} onClick={() => play(r)}>{tt('download')}</button>}
          {r.cloud && <button class="btn small danger" disabled={!!busy} onClick={() => { if (confirm(tt('confirm_delete'))) act(r.key, () => deleteCloudSave(r.cloud!)); }}>{tt('delete')}</button>}
          {busy === r.key && <span class="muted"> …</span>}
        </td>
      </tr>)}</tbody>
    </table>
  </div>;
}
