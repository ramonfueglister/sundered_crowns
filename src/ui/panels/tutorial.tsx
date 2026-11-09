// Guided tour for the first half hour (15 steps) and contextual hints afterwards.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { I18n } from '../../sim/types';
import { view, nations } from '../../game/client';
import { tutorialStep, selectedLoc, selectedNation, selectedArmies, panel, playerId, openPanel, type PanelId } from '../store';
import { t, L, lastCmd, realm, selectLoc } from './common';
import { sfx } from '../audio';

interface Step { title: I18n; text: I18n; target?: string; check?: (ctx: { since: number; wheel: number; start: Snap }) => boolean }
interface Snap { moving: number; sieges: number }

const snap = (): Snap => { const v = view.value; const pid = playerId.value; return { moving: v ? v.armies.filter((a) => a.owner === pid && a.path.length).length : 0, sieges: v ? v.sieges.filter((s) => s.nation === pid).length : 0 }; };
const cmdSince = (since: number, f: (c: any) => boolean) => { const c = lastCmd.value; return !!c && c.at >= since && f(c.cmd); };

const STEPS: Step[] = [
  { title: { en: 'Welcome to your realm', de: 'Willkommen in deinem Reich' }, text: { en: 'It is the year 1356. Plague, debt and ambitious neighbours threaten your crown. This short tour shows the essentials; every step continues by itself once you have done it, or press Next.', de: 'Wir schreiben das Jahr 1356. Pest, Schulden und ehrgeizige Nachbarn bedrohen deine Krone. Diese kurze Führung zeigt das Wichtigste; jeder Schritt geht von selbst weiter, sobald du ihn erledigt hast – oder klicke auf Weiter.' } },
  { title: { en: 'The map', de: 'Die Karte' }, text: { en: 'Drag with the left mouse button to move the map and turn the mouse wheel to zoom. Zoom in once to continue.', de: 'Ziehe mit der linken Maustaste, um die Karte zu verschieben, und drehe das Mausrad zum Zoomen. Zoome einmal, um fortzufahren.' }, check: (c) => c.wheel > 0 },
  { title: { en: 'Select a location', de: 'Einen Ort wählen' }, text: { en: 'Left-click one of your locations. The panel on the left shows its people, buildings, unrest and what you can do there. Hover over any number to see where it comes from.', de: 'Klicke mit links auf einen deiner Orte. Links siehst du Bevölkerung, Gebäude, Unruhe und was du dort tun kannst. Fahre über eine Zahl, um zu sehen, woher sie kommt.' }, check: () => selectedLoc.value >= 0 },
  { title: { en: 'The top bar', de: 'Die obere Leiste' }, target: '.topbar .stat', text: { en: 'Treasury (marks), manpower, Concord (inner peace), Mandate (how rightful your rule appears), Authority (political capital for reforms), prestige and Insight (for doctrines). Watch Concord: below zero the realm grows restless.', de: 'Schatz (Mark), Wehrkraft, Eintracht (innerer Friede), Mandat (wie rechtmäßig deine Herrschaft erscheint), Autorität (politisches Kapital für Reformen), Ansehen und Einsicht (für Doktrinen). Achte auf die Eintracht: unter null wird das Reich unruhig.' } },
  { title: { en: 'The economy', de: 'Die Wirtschaft' }, target: '.tb-menu > :nth-child(1)', text: { en: 'Open the Economy panel (button in the top bar or key E). Taxes per class, the army budget, loans and the markets live here. High taxes on peasants raise unrest.', de: 'Öffne die Wirtschaft (Knopf oben oder Taste E). Hier findest du Steuern je Stand, das Heeresbudget, Kredite und die Märkte. Hohe Bauernsteuern erhöhen die Unruhe.' }, check: () => panel.value === 'economy' },
  { title: { en: 'Build something', de: 'Etwas bauen' }, text: { en: 'Close the panel, select one of your locations and order a building in the Buildings list – field improvements are cheap and raise yields. Two works can be under way per location.', de: 'Schließe das Fenster, wähle einen deiner Orte und gib in der Gebäudeliste einen Bau in Auftrag – Feldverbesserungen sind günstig und steigern den Ertrag. Pro Ort sind zwei Bauten gleichzeitig möglich.' }, check: (c) => cmdSince(c.since, (x) => x.t === 'build') },
  { title: { en: 'Your armies', de: 'Deine Heere' }, target: '.outliner', text: { en: 'Click one of your armies on the map or in the outliner on the right. Hold Shift to select several.', de: 'Klicke eines deiner Heere auf der Karte oder rechts in der Übersicht an. Mit Shift wählst du mehrere.' }, check: () => selectedArmies.value.length > 0 },
  { title: { en: 'Marching', de: 'Marschieren' }, text: { en: 'With the army selected, right-click a location to march there. Hovering shows how many days it takes. Winter, mountains and enemy forts slow you down.', de: 'Mit gewähltem Heer rechtsklickst du auf einen Ort, um dorthin zu marschieren. Beim Überfahren siehst du die Dauer in Tagen. Winter, Gebirge und feindliche Festungen bremsen.' }, check: (c) => snap().moving > c.start.moving || cmdSince(c.since, (x) => x.t === 'move') },
  { title: { en: 'Diplomacy and alliances', de: 'Diplomatie und Bündnisse' }, text: { en: 'Click a neighbouring realm. Its panel shows what they think of you and, for every proposal, whether they would accept – hover the answer for the reasons. Send an envoy to propose an alliance or a royal marriage.', de: 'Klicke ein Nachbarreich an. Sein Fenster zeigt, was es von dir hält, und bei jedem Vorschlag, ob es annehmen würde – fahre über die Antwort für die Gründe. Sende einen Gesandten für ein Bündnis oder eine königliche Heirat.' }, check: (c) => cmdSince(c.since, (x) => x.t === 'diplo') },
  { title: { en: 'A just war', de: 'Ein gerechter Krieg' }, text: { en: 'Wars without a justification cost Concord, Mandate and make everyone fear you (Dread). Declare a rival or let your clerks fabricate a claim (Espionage), then declare war with a war goal. Press Next if you prefer peace for now.', de: 'Kriege ohne Rechtfertigung kosten Eintracht und Mandat und lassen alle dich fürchten (Furcht). Erkläre einen Rivalen oder lass deine Schreiber einen Anspruch fabrizieren (Spionage) und erkläre dann mit einem Kriegsziel den Krieg. Klicke auf Weiter, wenn du vorerst Frieden willst.' }, check: (c) => cmdSince(c.since, (x) => x.t === 'declare' || (x.t === 'spy' && x.action === 'fabricate') || (x.t === 'diplo' && (x.action === 'fabricate' || x.action === 'rival'))) },
  { title: { en: 'Sieges', de: 'Belagerungen' }, text: { en: 'March an army into an enemy location with walls to besiege it. Progress is shown on the map and in the outliner; occupied land raises your war score. Hunger and disease thin the besiegers too.', de: 'Marschiere mit einem Heer in einen befestigten Feindort, um ihn zu belagern. Der Fortschritt steht auf der Karte und in der Übersicht; besetztes Land erhöht deine Kriegspunkte. Hunger und Seuchen zehren auch an den Belagerern.' }, check: (c) => snap().sieges > c.start.sieges },
  { title: { en: 'Making peace', de: 'Frieden schließen' }, target: '.outliner', text: { en: 'Click a war in the outliner (or Diplomacy → Wars) to negotiate. Pick occupied locations, gold or vassalage; the panel tells you live whether the enemy would sign. Press Next if you are not at war.', de: 'Klicke einen Krieg in der Übersicht (oder Diplomatie → Kriege) an, um zu verhandeln. Wähle besetzte Orte, Gold oder Vasallität; das Fenster zeigt sofort, ob der Feind unterschreiben würde. Klicke auf Weiter, wenn du keinen Krieg führst.' }, check: () => panel.value === 'peace' },
  { title: { en: 'Laws and the Powers of the Realm', de: 'Gesetze und die Mächte des Reiches' }, target: '.tb-menu > :nth-child(2)', text: { en: 'Open Government (G). Reforms cost Authority and please some Powers of the Realm while angering others. Keep magnates, prelates, burghers and commons content enough – or grant them privileges.', de: 'Öffne die Herrschaft (G). Reformen kosten Autorität und erfreuen einige Mächte des Reiches, während sie andere verärgern. Halte Magnaten, Prälaten, Bürger und Gemeine zufrieden genug oder gewähre ihnen Privilegien.' }, check: () => panel.value === 'government' },
  { title: { en: 'Knowledge', de: 'Wissen' }, target: '.tb-menu > :nth-child(5)', text: { en: 'Open Knowledge (K). Choose a focus among Governance, Commerce & Learning and Warfare. Insight buys doctrines – seven picks in each of ten groups. New ideas spread from city to city across the map.', de: 'Öffne Wissen (K). Wähle einen Schwerpunkt zwischen Staatskunst, Handel & Gelehrsamkeit und Kriegswesen. Mit Einsicht erwirbst du Doktrinen – sieben Stufen in zehn Gruppen. Neue Ideen breiten sich von Stadt zu Stadt aus.' }, check: () => panel.value === 'knowledge' },
  { title: { en: 'Your reign begins', de: 'Deine Herrschaft beginnt' }, text: { en: 'Unpause with Space, speed up with + and −. Events will ask for your judgement, the Chronicle records your deeds. Good fortune – and beware of the plague.', de: 'Mit der Leertaste geht es weiter, mit + und − änderst du das Tempo. Ereignisse verlangen dein Urteil, die Chronik hält deine Taten fest. Viel Glück – und hüte dich vor der Pest.' } },
];

const HINTS: { id: string; when: () => boolean; text: I18n; open?: PanelId; loc?: () => number }[] = [
  { id: 'debt', when: () => (view.value?.player?.treasury ?? 0) < 0, text: { en: 'Your treasury is empty. Raise taxes, lower the army budget or take a loan in the Economy panel before the bankers lose patience.', de: 'Deine Kasse ist leer. Erhöhe die Steuern, senke das Heeresbudget oder nimm in der Wirtschaft einen Kredit auf, bevor die Bankiers die Geduld verlieren.' }, open: 'economy' },
  { id: 'concord', when: () => (view.value?.player?.concord ?? 0) < -20, text: { en: 'Concord is falling. Lower taxes on the commons, appease a Power of the Realm or make peace – revolts are near.', de: 'Die Eintracht sinkt. Senke die Steuern der Gemeinen, besänftige eine Macht des Reiches oder schließe Frieden, sonst drohen Aufstände.' }, open: 'government' },
  { id: 'manpower', when: () => { const p = view.value?.player; return !!p && p.atWar && p.manpower < p.maxManpower * 0.1; }, text: { en: 'Manpower is nearly exhausted. Hire mercenaries in a location panel or seek peace.', de: 'Die Wehrkraft ist fast erschöpft. Wirb in einem Ortsfenster Söldner an oder suche den Frieden.' } },
  { id: 'doctrine', when: () => { const r = realm.value; return !!r && r.insight >= r.doctrineCost; }, text: { en: 'You have enough Insight for a new doctrine. Open Knowledge to choose one.', de: 'Du hast genug Einsicht für eine neue Doktrin. Öffne Wissen, um eine zu wählen.' }, open: 'knowledge' },
  { id: 'decision', when: () => { const r = realm.value; return !!r && r.decisions.some((d: any) => !d.why); }, text: { en: 'A decision is available to your realm. Open Goals & decisions to see it.', de: 'Deinem Reich steht ein Beschluss offen. Öffne Ziele & Beschlüsse, um ihn anzusehen.' }, open: 'decisions' },
  // the first minutes: point to the next sensible step
  { id: 'paused', when: () => { const v = view.value; return !!v && v.day < 3 && v.speed === 0; }, text: { en: 'Time stands still until you start it: press Space or a speed button at the top right. Hover over any number to see where it comes from.', de: 'Die Zeit steht, bis du sie startest: Leertaste oder ein Tempoknopf oben rechts. Fahre über eine Zahl, um zu sehen, woher sie kommt.' } },
  { id: 'goals', when: () => { const r = realm.value; return !!r && (r.goals ?? []).some((g: any) => g.open); }, text: { en: 'Your realm has ambitions with rewards. Open Goals & decisions to see what to aim for first.', de: 'Dein Reich hat Ziele mit Belohnungen. Öffne Ziele & Beschlüsse, um zu sehen, was du zuerst anstreben solltest.' }, open: 'decisions' },
  { id: 'focus', when: () => { const r = realm.value; return !!r && r.focus < 0; }, text: { en: 'No research focus yet. In Knowledge a focus gives +35 % research in one branch.', de: 'Noch kein Forschungsschwerpunkt. In Wissen bringt ein Schwerpunkt +35 % Forschung in einem Zweig.' }, open: 'knowledge' },
  { id: 'build', when: () => { const r = realm.value; const p = view.value?.player; return !!r && !!p && (view.value?.day ?? 0) > 20 && !r.constructions.length && p.treasury > 150; }, text: { en: 'Gold lies idle in the treasury. Open your capital and order a building: farms and markets pay back over the years.', de: 'Gold liegt ungenutzt im Schatz. Öffne deine Hauptstadt und gib einen Bau in Auftrag: Höfe und Märkte zahlen sich über die Jahre aus.' }, loc: () => nations.value[playerId.value]?.capital ?? -1 },
  { id: 'exhaustion', when: () => (view.value?.player?.warExhaustion ?? 0) > 40, text: { en: 'War exhaustion is high: the people want peace. Even a modest peace now may be better than a ruined realm.', de: 'Die Kriegsmüdigkeit ist hoch: das Volk will Frieden. Selbst ein bescheidener Frieden kann besser sein als ein ruiniertes Reich.' } },
];

export function Tutorial() {
  const step = tutorialStep.value;
  if (step >= 0) return <Tour step={step} />;
  return <Hints />;
}

function Tour({ step }: { step: number }) {
  const s = STEPS[step];
  const since = useRef(Date.now()); const start = useRef<Snap>(snap());
  const [wheel, setWheel] = useState(0);
  useEffect(() => { since.current = Date.now(); start.current = snap(); setWheel(0); }, [step]);
  useEffect(() => { const f = () => setWheel((w) => w + 1); window.addEventListener('wheel', f, { passive: true }); return () => window.removeEventListener('wheel', f); }, []);
  useEffect(() => {
    if (!s?.target) return;
    const els = [...document.querySelectorAll(s.target)].slice(0, 8);
    els.forEach((e) => e.classList.add('tut-glow'));
    return () => els.forEach((e) => e.classList.remove('tut-glow'));
  }, [step, panel.value]);
  // read the signals the checks depend on so this component re-renders when they change
  void view.value; void selectedLoc.value; void selectedArmies.value; void selectedNation.value; void panel.value; void lastCmd.value;
  const done = !!s?.check?.({ since: since.current, wheel, start: start.current });
  useEffect(() => { if (done) { sfx('page'); const h = setTimeout(() => next(), 900); return () => clearTimeout(h); } }, [done, step]);
  if (!s) return null;
  const next = () => { if (tutorialStep.value !== step) return; if (step + 1 >= STEPS.length) finish(); else tutorialStep.value = step + 1; };
  const finish = () => { tutorialStep.value = -1; try { localStorage.setItem('sc.tutorial', 'done'); } catch { /* ignore */ } };
  return <div class={`tutorial pnl ${done ? 'done' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
    <div class="tut-h"><span class="tut-n">{step + 1} / {STEPS.length}</span><b>{L(s.title)}</b>{done && <span class="pos">✔</span>}</div>
    <div class="tut-t">{L(s.text)}</div>
    <div class="tut-dots">{STEPS.map((_, i) => <i class={i < step ? 'on' : i === step ? 'cur' : ''} />)}</div>
    <div class="act-row">
      <button class="btn small" onClick={finish}>{t('skip_tour')}</button><span class="spacer" />
      {step > 0 && <button class="btn small" onClick={() => { tutorialStep.value = step - 1; }}>{t('back')}</button>}
      <button class="btn small gold" onClick={next}>{step + 1 >= STEPS.length ? t('finish') : t('next')}</button>
    </div>
  </div>;
}

const shownHints = new Set<string>();
function Hints() {
  const [cur, setCur] = useState<string | null>(null);
  const v = view.value; const lastDay = useRef(-99);
  const enabled = (() => { try { return localStorage.getItem('sc.tutorial') === 'done'; } catch { return false; } })();
  useEffect(() => {
    if (!enabled || cur || !v || v.day - lastDay.current < 7) return;
    lastDay.current = v.day;
    const h = HINTS.find((x) => !shownHints.has(x.id) && x.when());
    if (h) { shownHints.add(h.id); setCur(h.id); }
  }, [v?.day]);
  const h = cur ? HINTS.find((x) => x.id === cur) : undefined;
  // a hint whose reason is gone (time runs, debt paid, focus chosen) closes by itself
  useEffect(() => { if (h && (!h.when() || (h.open && panel.value === h.open))) setCur(null); }, [v?.day, v?.speed, realm.value, panel.value]);
  if (!h) return null;
  const go = () => { setCur(null); if (h.open) openPanel(h.open); else if (h.loc) { const l = h.loc(); if (l >= 0) selectLoc(l); } };
  return <div class="hint-card pnl" onPointerDown={(e) => e.stopPropagation()}>
    <span class="hint-ic">ℹ</span><span class="tut-t">{L(h.text)}</span>
    <div class="act-row"><span class="spacer" />{(h.open || h.loc) && <button class="btn small gold" onClick={go}>{t('x_hint_go')}</button>}<button class="btn small" onClick={() => setCur(null)}>{t('got_it')}</button></div>
  </div>;
}
