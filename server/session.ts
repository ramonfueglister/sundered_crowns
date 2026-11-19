// One connection to the world server: who is on it and what goes out to it. The transport (server/main.ts) hands each
// socket to WorldCore.attach and gets its Session back; a closed socket only ends the session.
import type { ClientMsg, ServerMsg } from '../src/net/protocol';
import type { WorldCore } from './world';

export interface UserAuth {
  uid: string;
  name: string;
  admin: boolean;
  /** connected without signing in: sees the world, rules nothing */
  observer?: boolean;
}
export interface Conn {
  send(m: ServerMsg): void;
  sendBin(b: Uint8Array): void;
  close(code: number, reason: string): void;
}

export class Session {
  closed = false;
  constructor(
    readonly core: WorldCore,
    readonly conn: Conn,
    readonly user: UserAuth,
  ) {}
  send(m: ServerMsg) {
    if (!this.closed)
      try {
        this.conn.send(m);
      } catch {
        /* socket gone */
      }
  }
  sendBin(b: Uint8Array) {
    if (!this.closed)
      try {
        this.conn.sendBin(b);
      } catch {
        /* socket gone */
      }
  }
  handle(m: ClientMsg) {
    if (!this.closed) this.core.handle(this, m);
  }
  disconnect() {
    if (this.closed) return;
    this.closed = true;
    this.core.detach(this);
  }
}
