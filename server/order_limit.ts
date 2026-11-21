// How many commands a ruler may give (WorldConfig.cmdsPerDay): a bucket of tokens per ruler, which a command takes
// one of and which fills again with time.

/** A bucket that holds `cap` tokens at most and fills by `perSec` tokens a second; it starts full. */
class Bucket {
  t: number;
  last = Date.now();
  constructor(
    private cap: number,
    private perSec: number,
  ) {
    this.t = cap;
  }
  take(): boolean {
    const now = Date.now();
    this.t = Math.min(this.cap, this.t + ((now - this.last) / 1000) * this.perSec);
    this.last = now;
    if (this.t < 1) return false;
    this.t -= 1;
    return true;
  }
}

/** The buckets of the rulers: `perDay` commands at once, and as many again in each day of the game at its own pace
 *  (`secondsPerDay` real seconds). A ruler's bucket is made, full, at the ruler's first command. */
export class OrderLimit {
  private readonly buckets = new Map<string, Bucket>();
  private readonly perSec: number;
  constructor(
    private readonly perDay: number,
    secondsPerDay: number,
  ) {
    this.perSec = perDay / Math.max(0.05, secondsPerDay);
  }
  /** Whether the ruler may give a command now; if so, it takes a token of the ruler's bucket. */
  take(uid: string): boolean {
    let b = this.buckets.get(uid);
    if (!b) {
      b = new Bucket(this.perDay, this.perSec);
      this.buckets.set(uid, b);
    }
    return b.take();
  }
}
