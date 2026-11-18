"""A river's bed: the height of its water at every point of its line, worked out once for the whole river.

The world draws a river as water that lies in its valley floor and never rises on its way down (world.ts). Worked out
on the piece of ground that is being drawn, as it was, the level of a river depended on where that ground began: a
river lay a block higher or lower on one piece than on the piece beside it. Here it is settled for the whole world
beforehand, step by step of the map (build_overviews.py), and written into the river lists beside the lines.

The lines of a region come cut into the stretches that cross each tile, and the same stretch lies in two tiles where
they meet. They are joined again by their points: every point is a node, every pair of points that follow each other
an edge, and a reach is a run of edges between two nodes where lines end or meet.

Along a reach the valley floor is read from the heights: the lowest height within a cell of the line. A reach runs
one way, as the rivers it belongs to run to the sea: from the nodes that lie in the sea the reaches are followed
upstream, always first over the lowest way, and each runs towards the node it was reached from (a river that reaches
no sea runs to its lowest node). Only a reach that closes a ring has no such way: its water starts at the point from
which it cuts least into the land, and runs from there to both ends. The bed of a reach is the lowest floor its water
has passed, so that it never rises: a river drawn up a slope for a stretch is cut through it. Where a reach ends at a
node at which others begin, the water runs on, and those begin no higher.

At the coarser steps the lines are thinned copies of the same stretches and the heights are those of the step; where
the water starts is taken from the finest step, so that a river runs the same way at every step.
"""
import heapq
import numpy as np

# the floor is read at points this far apart along a line, in cells of the step
EVERY = 0.5
# and is the lowest height this far to each side, in cells
REACH = 1.0
# a stretch between two points of a line is given as few heights as describe its bed to within this many metres
WITHIN = 2.0


class Land:
    """The heights of one step: `shaped[y, x]` is the cell (x0 + x, y0 + y) of the step's whole map, which begins again after `lap` cells."""

    def __init__(self, shaped, x0=0, y0=0, lap=None):
        self.shaped, self.x0, self.y0, self.lap = shaped, x0, y0, lap

    def height(self, cx, cy):
        """Heights between the cells' middles, blended from the four around (as `sample` in region.ts)."""
        h, w = self.shaped.shape
        x, y = cx - 0.5, np.clip(cy - 0.5 - self.y0, 0, h - 1.001)
        xi, yi = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
        fx, fy = x - xi, y - yi
        if self.lap: xa, xb = xi % self.lap - self.x0, (xi + 1) % self.lap - self.x0
        else: xa = np.clip(xi - self.x0, 0, w - 1); xb = np.clip(xi + 1 - self.x0, 0, w - 1)
        s = self.shaped
        return (s[yi, xa] * (1 - fx) + s[yi, xb] * fx) * (1 - fy) + (s[yi + 1, xa] * (1 - fx) + s[yi + 1, xb] * fx) * fy

    def sea(self, cx, cy):
        """Whether the cell under each point is sea (the sea lies at 0, the land at 1 m and more)."""
        h, w = self.shaped.shape
        xi, yi = np.floor(cx).astype(np.int64), np.clip(np.floor(cy).astype(np.int64) - self.y0, 0, h - 1)
        return self.shaped[yi, xi % self.lap - self.x0 if self.lap else np.clip(xi - self.x0, 0, w - 1)] == 0

    def floor(self, cx, cy, reach=REACH):
        out = np.full(len(cx), np.inf)
        for at in range(0, len(cx), 1 << 20):
            part = slice(at, at + (1 << 20))
            for dy in (-reach, 0, reach):
                for dx in (-reach, 0, reach): out[part] = np.minimum(out[part], self.height(cx[part] + dx, cy[part] + dy))
        return out


def _least_cut(f):
    """The index at which the water of a reach with floors `f` starts so that it cuts least into the land, and that cut."""
    n = len(f)
    total = np.concatenate([[0.0], np.cumsum(f)])

    def cut_from(g):
        # for every start: the sum, from there on, of what lies above the lowest floor passed
        low = np.zeros(n + 1); stack = []
        for i in range(n - 1, -1, -1):
            while stack and g[stack[-1]] >= g[i]: stack.pop()
            nxt = stack[-1] if stack else n
            low[i] = g[i] * (nxt - i) + low[nxt]
            stack.append(i)
        return low[:n]
    ahead = total[n] - total[:n] - cut_from(f)
    behind = (total[1:] - cut_from(f[::-1])[::-1])
    cut = ahead + behind
    at = int(np.argmin(cut))
    # of equal cuts the water starts at an end rather than within, and at the higher end
    for end in ((0, n - 1) if f[0] >= f[-1] else (n - 1, 0)):
        if cut[end] <= cut[at] + 1e-6: return end, cut[end]
    return at, cut[at]


class Reaches:
    """The reaches of the finest step's river pieces (`pieces`: dicts with `pts` in cells of the whole map, which begins again after `lap` cells)."""

    def __init__(self, pieces, lap=None):
        ids, xy = {}, []
        of = []
        lap10 = round(lap * 10) if lap else None
        for p in pieces:
            nodes = []
            for x, y in p['pts']:
                key = (round(x * 10) % lap10 if lap10 else round(x * 10), round(y * 10))
                n = ids.get(key)
                if n is None: n = ids[key] = len(xy); xy.append((key[0] / 10, key[1] / 10))
                nodes.append(n)
            of.append(nodes)
        self.xy = xy
        near = [[] for _ in xy]
        for nodes in of:
            for a, b in zip(nodes, nodes[1:]):
                if a != b and b not in near[a]: near[a].append(b); near[b].append(a)
        # the reaches: from every node that is not simply passed through, along every edge, to the next such node; then the rings
        done, self.nodes = set(), []

        def walk(a, b):
            run = [a, b]; done.add((min(a, b), max(a, b)))
            while len(near[run[-1]]) == 2:
                c = near[run[-1]][0] if near[run[-1]][0] != run[-2] else near[run[-1]][1]
                e = (min(run[-1], c), max(run[-1], c))
                if e in done: break
                done.add(e); run.append(c)
            self.nodes.append(run)
        for a in range(len(xy)):
            if len(near[a]) != 2:
                for b in near[a]:
                    if (min(a, b), max(a, b)) not in done: walk(a, b)
        for a in range(len(xy)):
            for b in near[a]:
                if (min(a, b), max(a, b)) not in done: walk(a, b)
        # the way along each reach, in cells, and where every edge lies on its reach
        self.length, where = [], {}
        for c, run in enumerate(self.nodes):
            p = np.array([xy[n] for n in run])
            d = np.diff(p, axis=0)
            if lap: d[:, 0] = (d[:, 0] + lap / 2) % lap - lap / 2
            s = np.concatenate([[0.0], np.cumsum(np.hypot(d[:, 0], d[:, 1]))])
            self.length.append(s[-1])
            for j in range(len(run) - 1):
                a, b = run[j], run[j + 1]
                where[(a, b)] = (c, s[j], s[j + 1]); where[(b, a)] = (c, s[j + 1], s[j])
        # of every piece: the way along it to each of its points, and the reach of each of its stretches with the way along that
        self.along, self.reach, self.s0, self.s1 = [], [], [], []
        for p, nodes in zip(pieces, of):
            pts = np.array(p['pts'], np.float64)
            d = np.diff(pts, axis=0)
            self.along.append(np.concatenate([[0.0], np.cumsum(np.hypot(d[:, 0], d[:, 1]))]))
            got = [where.get((a, b)) for a, b in zip(nodes, nodes[1:])]
            # a stretch of no length lies where the stretch before or after it ends
            last = None
            for k, g in enumerate(got):
                if g is None and last is not None: got[k] = (last[0], last[2], last[2])
                last = got[k] or last
            for k in range(len(got) - 1, -1, -1):
                if got[k] is None: got[k] = (last[0], last[1], last[1]) if last else (-1, 0.0, 0.0)
                last = got[k]
            self.reach.append(np.array([g[0] for g in got], np.int64)); self.s0.append(np.array([g[1] for g in got])); self.s1.append(np.array([g[2] for g in got]))
        self.begins = [n[0] for n in self.nodes]; self.ends = [n[-1] for n in self.nodes]
        # where the water of each reach starts, as the way along it: set by the finest step
        self.source = None

    def _sources(self, there, ss_o, f_o, land):
        """Where the water of every reach starts, as the way along it (see the head of the file); `there`: the reach's floors f_o[a:b] in the order of the way."""
        floor, links, high = {}, {}, {}
        for c, (a, b) in there.items():
            high[c] = float(f_o[a:b].max())
            for node, other, v in ((self.begins[c], self.ends[c], float(f_o[a])), (self.ends[c], self.begins[c], float(f_o[b - 1]))):
                floor[node] = min(floor.get(node, np.inf), v); links.setdefault(node, []).append((c, other))
        nodes = sorted(floor)
        at = np.array([self.xy[n] for n in nodes])
        roots = {n for n, wet in zip(nodes, land.sea(at[:, 0], at[:, 1])) if wet}
        # a river system that reaches no sea runs to its lowest node
        seen = set()
        for n in nodes:
            if n in seen: continue
            group, todo = [n], [n]; seen.add(n)
            while todo:
                for _, other in links[todo.pop()]:
                    if other not in seen: seen.add(other); group.append(other); todo.append(other)
            if not roots.intersection(group): roots.add(min(group, key=lambda m: (floor[m], m)))
        self.roots = len(roots)
        # upstream from the roots, the lowest way first
        heap, reached, source = [(floor[n], n, -1) for n in sorted(roots)], set(), {}
        heapq.heapify(heap)
        while heap:
            level, node, by = heapq.heappop(heap)
            if node in reached: continue
            reached.add(node)
            if by >= 0: source[by] = 0.0 if node == self.begins[by] else self.length[by]
            for c, other in links[node]:
                if other not in reached and c not in source: heapq.heappush(heap, (max(level, high[c]), other, c))
        # the reaches that close a ring
        self.rings = 0
        for c, (a, b) in there.items():
            if c in source: continue
            self.rings += 1
            at, _ = _least_cut(f_o[a:b])
            source[c] = 0.0 if at == 0 else self.length[c] if at == b - a - 1 else float(ss_o[a + at])
        return source

    def beds(self, lines, land):
        """
        The beds of `lines` on the heights `land`. A line is (piece, kept, pts): the points `pts` (cells of the step) are
        the points `kept` (their indices, rising) of the finest piece number `piece`. Returns for every line the bed at
        its points, in whole metres, and for the stretches whose bed does not run straight from point to point a list
        [stretch, heights between its ends at even distances].
        """
        # the floor at points along every stretch, its two ends among them
        seg_line, seg_k, seg_n, xs, ys, cs, ss = [], [], [], [], [], [], []
        for number, (piece, kept, pts) in enumerate(lines):
            pts, kept = np.asarray(pts, np.float64), np.asarray(kept)
            d = np.diff(pts, axis=0)
            n = np.maximum(1, np.ceil(np.hypot(d[:, 0], d[:, 1]) / EVERY)).astype(np.int64)
            seg = np.repeat(np.arange(len(n)), n + 1)
            first = np.cumsum(n + 1) - (n + 1)
            t = (np.arange(len(seg)) - first[seg]) / n[seg]
            xs.append(pts[seg, 0] + t * d[seg, 0]); ys.append(pts[seg, 1] + t * d[seg, 1])
            along = self.along[piece]
            u = along[kept[seg]] + t * (along[kept[seg + 1]] - along[kept[seg]])
            e = np.clip(np.searchsorted(along, u, side='right') - 1, kept[seg], np.maximum(kept[seg], kept[seg + 1] - 1))
            part = np.clip((u - along[e]) / np.maximum(along[e + 1] - along[e], 1e-9), 0, 1)
            cs.append(self.reach[piece][e]); ss.append(self.s0[piece][e] + part * (self.s1[piece][e] - self.s0[piece][e]))
            seg_line.append(np.full(len(n), number)); seg_k.append(np.arange(len(n))); seg_n.append(n)
        seg_line, seg_k, seg_n = np.concatenate(seg_line), np.concatenate(seg_k), np.concatenate(seg_n)
        cs, ss = np.concatenate(cs), np.concatenate(ss)
        xs, ys = np.concatenate(xs), np.concatenate(ys)
        floor = land.floor(xs, ys)
        # reach by reach, in the order of the way along it
        order = np.lexsort((ss, cs))
        cs_o, ss_o, f_o = cs[order], ss[order], floor[order]
        cuts = np.flatnonzero(np.diff(cs_o)) + 1
        starts, stops = np.concatenate([[0], cuts]), np.concatenate([cuts, [len(cs_o)]])
        there = {int(cs_o[a]): (a, b) for a, b in zip(starts, stops) if cs_o[a] >= 0}
        if self.source is None: self.source = self._sources(there, ss_o, f_o, land)
        bed_o = f_o.copy()
        # a reach's water runs on into the reaches that begin where it ends: those begin no higher
        begin_at, cap, low = {}, {}, {}
        for c in there:
            src = self.source.get(c, 0.0)
            if src <= 0: begin_at.setdefault(self.begins[c], []).append(c)
            elif src >= self.length[c]: begin_at.setdefault(self.ends[c], []).append(c)

        def run(c):
            a, b = there[c]
            src, top = self.source.get(c, 0.0), cap.get(c, np.inf)
            if src <= 0:
                bed_o[a:b] = np.minimum.accumulate(np.minimum(f_o[a:b], top))
                return [(self.ends[c], bed_o[b - 1])]
            if src >= self.length[c]:
                bed_o[a:b] = np.minimum.accumulate(np.minimum(f_o[a:b], top)[::-1])[::-1]
                return [(self.begins[c], bed_o[a])]
            # from a point within, down both ways
            m, out = a + int(np.searchsorted(ss_o[a:b], src, side='left')), []
            if m < b:
                bed_o[m:b] = np.minimum.accumulate(f_o[m:b])
                out.append((self.ends[c], bed_o[b - 1]))
            if m > a:
                bed_o[a:m] = np.minimum.accumulate(np.concatenate([[f_o[m] if m < b else np.inf], f_o[a:m][::-1]]))[:0:-1]
                out.append((self.begins[c], bed_o[a]))
            return out
        todo = list(there)
        while todo:
            c = todo.pop()
            for node, value in run(c):
                if value < low.get(node, np.inf):
                    low[node] = value
                    for d in begin_at.get(node, []):
                        if d != c and value < cap.get(d, np.inf): cap[d] = value; todo.append(d)
        bed = np.empty(len(floor)); bed[order] = bed_o
        # (a line of no length belongs to no reach and lies on its floor)
        self.cut = float(np.mean(floor - bed)), float(np.max(floor - bed))
        # line by line: the bed at its points, and the stretches that need more than their two ends
        first = np.cumsum(seg_n + 1) - (seg_n + 1)
        at_start, at_end = np.round(bed[first]), np.round(bed[first + seg_n])
        line_first = np.concatenate([[0], np.flatnonzero(np.diff(seg_line)) + 1])
        out = []
        for number, a in enumerate(line_first):
            b = line_first[number + 1] if number + 1 < len(line_first) else len(seg_line)
            # a point between two stretches takes the lower of their beds there
            v = np.concatenate([[at_start[a]], np.minimum(at_end[a:b - 1], at_start[a + 1:b]), [at_end[b - 1]]])
            out.append(([int(x) for x in v], []))
        ends0, ends1 = np.empty(len(seg_n)), np.empty(len(seg_n))
        for number, a in enumerate(line_first):
            b = line_first[number + 1] if number + 1 < len(line_first) else len(seg_line)
            v = out[number][0]
            ends0[a:b], ends1[a:b] = v[:-1], v[1:]
        for D in np.unique(seg_n):
            if D < 2: continue
            which = np.flatnonzero(seg_n == D)
            dense = bed[first[which][:, None] + np.arange(D + 1)]
            dense[:, 0], dense[:, -1] = ends0[which], ends1[which]
            left = np.ones(len(which), bool)
            for n in [k for k in (1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64) if k < D] + [int(D)]:
                # the heights at n even parts, and what they give back at the points the bed is known at
                x = np.arange(n + 1) * D / n
                i = np.minimum(np.floor(x).astype(int), D - 1)
                held = dense[:, i] * (1 - (x - i)) + dense[:, i + 1] * (x - i)
                y = np.arange(D + 1) * n / D
                j = np.minimum(np.floor(y).astype(int), n - 1)
                back = held[:, j] * (1 - (y - j)) + held[:, j + 1] * (y - j)
                fits = left & ((np.abs(back - dense).max(axis=1) <= WITHIN) | (n == D))
                if n > 1:
                    for r in np.flatnonzero(fits): out[seg_line[which[r]]][1].append([int(seg_k[which[r]])] + [int(round(h)) for h in held[r, 1:-1]])
                left &= ~fits
                if not left.any(): break
        for _, mid in out: mid.sort()
        return out


def cut_run(r, i0, i1):
    """The piece of river `r` from its point i0 to its point i1, with the bed of that stretch."""
    piece = {'name': r['name'], 'rank': r['rank'], 'pts': r['pts'][i0:i1 + 1]}
    if 'bed' in r:
        piece['bed'] = r['bed'][i0:i1 + 1]
        mid = [[m[0] - i0] + m[1:] for m in r.get('mid', []) if i0 <= m[0] < i1]
        if mid: piece['mid'] = mid
    return piece
