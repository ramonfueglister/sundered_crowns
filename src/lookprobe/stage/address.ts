// The stage's address options (the page's ?key=value): each is listed where it is used, and in the head of ./index.ts.
export const q = new URLSearchParams(location.search);
export const flag = (k: string, fallback: boolean) => (q.has(k) ? q.get(k) !== '0' : fallback);
export const number = (k: string, fallback: number) =>
  q.has(k) && Number.isFinite(+q.get(k)!) ? +q.get(k)! : fallback;
