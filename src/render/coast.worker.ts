// Worker: coast signed distance field (see coast.ts).
import { sdfFromMask } from './coast';

self.onmessage = (e: MessageEvent<{ mask: Uint8Array; w: number; h: number }>) => {
  const { mask, w, h } = e.data;
  const out = sdfFromMask(mask, w, h);
  (self as unknown as Worker).postMessage(out, [out.buffer]);
};
