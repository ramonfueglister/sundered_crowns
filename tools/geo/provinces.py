"""How stage C (build_export.py) and the lands beyond (merge_beyond.py) group the locations of the map: into
provinces of about 6 to 18 locations along the historical province names where they are known, and the provinces
into areas of up to seven within one region.
"""

import math

import numpy as np


def build_provinces(L, adj, prov_name, names, size, area, px, py, lat):
    """Group locations into provinces of ~6–18 locations following historical province names where known."""
    lab = [-1] * (L + 1)
    groups = []
    for i in range(1, L + 1):
        if lab[i] >= 0:
            continue
        key = prov_name[i]
        comp = [i]
        lab[i] = len(groups)
        q = [i]
        while q:
            u = q.pop()
            for v in adj[u]:
                if v <= L and lab[v] < 0 and key is not None and prov_name[v] == key:
                    lab[v] = len(groups)
                    comp.append(v)
                    q.append(v)
        groups.append(comp)
    # split large groups with BFS from k seeds (largest towns)
    out = []
    for comp in groups:
        if len(comp) <= 26:
            out.append(comp)
            continue
        k = int(math.ceil(len(comp) / 16))
        cs = set(comp)
        seeds_ = sorted(comp, key=lambda i: (-size[i], i))
        chosen = [seeds_[0]]
        cpts = np.array([[px[i], py[i]] for i in comp])
        while len(chosen) < k:
            d = np.min(np.stack([((cpts - [px[c], py[c]]) ** 2).sum(1) for c in chosen]), 0)
            chosen.append(comp[int(np.argmax(d))])
        own = {c: j for j, c in enumerate(chosen)}
        q = list(chosen)
        parts = [[c] for c in chosen]
        while q:
            nq = []
            for u in q:
                for v in adj[u]:
                    if v in cs and v not in own:
                        own[v] = own[u]
                        parts[own[u]].append(v)
                        nq.append(v)
            q = nq
        for v in comp:
            if v not in own:
                parts[0].append(v)
        out.extend([p for p in parts if p])
    # merge small groups (< 5 locations) into the smallest adjacent group
    lab = [-1] * (L + 1)
    for gi, g in enumerate(out):
        for i in g:
            lab[i] = gi
    alive = [True] * len(out)
    changed = True
    while changed:
        changed = False
        for gi in sorted(range(len(out)), key=lambda g: len(out[g])):
            if not alive[gi] or len(out[gi]) >= 9:
                continue
            nb = {}
            for u in out[gi]:
                for v in adj[u]:
                    if v <= L and lab[v] != gi and lab[v] >= 0 and alive[lab[v]]:
                        nb[lab[v]] = nb.get(lab[v], 0) + 1
            if not nb:
                continue
            tgt = min(
                nb,
                key=lambda g: (
                    len(out[g]) > 22,
                    -nb[g] if prov_name[out[g][0]] == prov_name[out[gi][0]] else 0,
                    len(out[g]),
                ),
            )
            if len(out[tgt]) + len(out[gi]) > 32:
                continue
            for u in out[gi]:
                lab[u] = tgt
            out[tgt].extend(out[gi])
            out[gi] = []
            alive[gi] = False
            changed = True
    provs = []
    used_names = {}
    for g in out:
        if not g:
            continue
        big = max(g, key=lambda i: (size[i], -i))
        nm = prov_name[big] or names[big] or None
        if nm is None:
            nm = next((names[i] for i in sorted(g, key=lambda i: -size[i]) if names[i]), None)
        if nm in used_names and names[big]:
            nm = f'{nm} – {names[big]}' if prov_name[big] else names[big]
        used_names[nm] = 1
        provs.append({'name': nm, 'locs': sorted(g), 'capital': big})
    return provs


def build_areas(provs, prov_of, adj, region_key, L):
    P = len(provs)
    padj = [set() for _ in range(P)]
    for pi, p in enumerate(provs):
        for u in p['locs']:
            for v in adj[u]:
                if v <= L and prov_of[v] != pi:
                    padj[pi].add(int(prov_of[v]))
    reg = []
    for p in provs:
        ks = [region_key[i] for i in p['locs'] if region_key[i]]
        reg.append(max(set(ks), key=ks.count) if ks else 'unknown')
    lab = [-1] * P
    areas = []
    order = sorted(range(P), key=lambda p: -len(provs[p]['locs']))
    for p in order:
        if lab[p] >= 0:
            continue
        a = [p]
        lab[p] = len(areas)
        frontier = [p]
        while frontier and len(a) < 7:
            nf = []
            for u in frontier:
                for v in sorted(padj[u]):
                    if lab[v] < 0 and reg[v] == reg[p] and len(a) < 7:
                        lab[v] = len(areas)
                        a.append(v)
                        nf.append(v)
            frontier = nf
        areas.append({'name': provs[p]['name'], 'provinces': a, 'region': reg[p]})
    for ai, a in enumerate(areas):
        for p in a['provinces']:
            provs[p]['area'] = ai
        for p in a['provinces']:
            provs[p]['region'] = a['region']
    return areas
