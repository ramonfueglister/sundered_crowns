"""Lineages: the same state under another Cliopatria name counts as the same owner (amendment to the plan, written on
the fitting years only, before any selection or test run).

Two rules, both about labels, not about territory:
  1. Parentheses: Cliopatria writes a polity in parentheses when it is shown as a group of smaller units
     ("(Holy Roman Empire)" next to "Holy Roman Empire", "(Kingdom of England)"); the name without them is the same
     state.
  2. Succession of a whole state: when a polity B appears in year y+1, at least 80 % of its places were held by one
     polity A in year y, and A is gone in y+1, B continues A (Ayyubid -> Mamluk Sultanate, a regime change over the
     same land). A border model has nothing to say about who rules a state; that is the ruler list of the game.
"""

import numpy as np

SHARE = 0.8


def canonical(names):
    base = [n[1:-1].strip() if n.startswith('(') and n.endswith(')') else n for n in names]
    uniq = {}
    return np.array([uniq.setdefault(b, len(uniq)) for b in base]), list(uniq)


def lineages(arr, names):
    """arr: years x places of polity indices (-1 none). Returns the same shape with lineage ids."""
    canon, _ = canonical(list(names))
    c = np.where(arr >= 0, canon[np.maximum(arr, 0)], -1)
    line_of = {}  # canonical polity -> lineage id (first canonical id of the chain)
    out = np.full_like(c, -1)
    prev_ids = set()
    for y in range(c.shape[0]):
        row = c[y]
        ids = set(np.unique(row[row >= 0]).tolist())
        if y > 0:
            for b in ids - prev_ids:
                if b in line_of:
                    continue
                pl = row == b
                before = c[y - 1][pl]
                before = before[before >= 0]
                if len(before) == 0:
                    continue
                vals, cnt = np.unique(before, return_counts=True)
                a = int(vals[cnt.argmax()])
                if cnt.max() >= SHARE * pl.sum() and a not in ids:
                    line_of[b] = line_of.get(a, a)
        for b in ids:
            line_of.setdefault(b, b)
        m = row >= 0
        lut = np.vectorize(line_of.get)
        out[y][m] = lut(row[m]) if m.any() else []
        prev_ids = ids
    return out
