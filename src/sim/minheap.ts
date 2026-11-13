// A binary min-heap of numbers keyed by numbers. No imports: the systems use it while setup.ts (which builds the
// list of systems) may still be loading.
export class MinHeap {
  // typed storage, grown on demand; clear() keeps the capacity so a heap can be reused between searches
  private k = new Float64Array(64); private v = new Float64Array(64); private n = 0;
  get size() { return this.n; }
  clear() { this.n = 0; }
  push(key: number, val: number) {
    if (this.n === this.k.length) {
      const k2 = new Float64Array(this.n * 2); k2.set(this.k); this.k = k2;
      const v2 = new Float64Array(this.n * 2); v2.set(this.v); this.v = v2;
    }
    const k = this.k, v = this.v; let i = this.n++;
    while (i > 0) { const p = (i - 1) >> 1; const kp = k[p]; if (kp <= key) break; k[i] = kp; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  /** key of the smallest element (call before popVal) */
  peekKey() { return this.n ? this.k[0] : undefined as unknown as number; }
  popVal(): number {
    const k = this.k, v = this.v; const rv = v[0];
    const n = --this.n; const lk = k[n], lv = v[n];
    if (n) {
      let i = 0;
      for (;;) { const l = 2 * i + 1; if (l >= n) break; const r = l + 1; const m = r < n && k[r] < k[l] ? r : l; if (k[m] >= lk) break; k[i] = k[m]; v[i] = v[m]; i = m; }
      k[i] = lk; v[i] = lv;
    }
    return rv;
  }
  pop(): [number, number] { const key = this.k[0]; const val = this.popVal(); return [key, val]; }
}
