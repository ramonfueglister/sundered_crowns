// The realms as the HUD needs them (src/ui/realms.ts): by id, the one the player rules, and the coats of arms that are
// drawn. The server's realms and the player are set by hand on the client's signals.
import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { me, realms } from '../src/net/client';
import type { Me, RealmInfo } from '../src/net/protocol';
import { ARMS, myRealm, realmById } from '../src/ui/realms';

const realm = (id: number, key: string): RealmInfo => ({
  id,
  key,
  name: { en: key, de: key },
  short: { en: key, de: key },
  adjective: { en: key, de: key },
  color: 0,
  capital: 0,
  faith: 0,
  places: 1,
  ruler: null,
});
const player = (r: number): Me => ({ uid: 'u', name: 'a player', admin: false, realm: r });
afterEach(() => {
  realms.value = [];
  me.value = null;
});

describe('the realms of the HUD', () => {
  it('are found by their id, and follow what the server last told', () => {
    realms.value = [realm(3, 'venice'), realm(7, 'france')];
    expect(realmById.value.get(7)?.key).toBe('france');
    expect(realmById.value.get(3)?.key).toBe('venice');
    expect(realmById.value.get(5)).toBeUndefined();
    realms.value = [realm(5, 'bohemia')];
    expect([...realmById.value.keys()]).toEqual([5]);
  });

  it('give the realm the player rules, and none to a player without one or before the player is known', () => {
    realms.value = [realm(3, 'venice'), realm(0, 'castile')];
    expect(myRealm.value).toBeUndefined();
    me.value = player(3);
    expect(myRealm.value?.key).toBe('venice');
    me.value = player(0);
    expect(myRealm.value?.key).toBe('castile');
    me.value = player(-1);
    expect(myRealm.value).toBeUndefined();
    me.value = player(9); // a realm the server has not told of
    expect(myRealm.value).toBeUndefined();
  });

  it('draw a coat of arms only from a picture that is there', () => {
    expect(Object.keys(ARMS).length).toBeGreaterThan(0);
    for (const [key, path] of Object.entries(ARMS)) expect(existsSync(`public${path}`), key).toBe(true);
  });
});
