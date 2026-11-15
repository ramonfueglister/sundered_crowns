"""Builds src/sim/content/cities_1356.json: the 30 largest cities on our map in 1356 after Chandler.

Source: Reba, M., Reitsma, F. & Seto, K. C. (2016). Spatializing 6,000 years of global urbanization from 3700 BC
to AD 2000. Scientific Data 3, 160034, doi:10.1038/sdata.2016.34, data set "chandlerV2.csv"
(doi:10.6084/m9.figshare.2059494.v3, licence CC BY 4.0), the digitised tables of T. Chandler (1987), Four Thousand
Years of Urban Growth. The CSV is not kept in the repository; download it and pass its path:

    curl -L -o chandlerV2.csv https://s3-eu-west-1.amazonaws.com/pfigshare-u-files/5407640/chandlerV2.csv
    python3 tools/people/build_cities.py chandlerV2.csv

Rules (docs/PEOPLE_DESIGN.md):
- the population of 1356 is interpolated linearly between the nearest years Chandler gives before and after 1356, each
  at most 60 years away; with no later year within 60 years the earlier value stands;
- only cities inside the map (public/data/geo.json) count; the 30 with the most people are kept;
- each city lies in the land place of the map whose centre is nearest to its coordinates, except where the data set's
  coordinates are known to be wrong (OVERRIDES).
"""
import csv, hashlib, json, math, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHA256 = '5b8df64e46988b216988eef18b46ebc2cba57ecc1adc8a5c2e1e6d5b78068031'
YEAR, WINDOW, KEEP = 1356, 60, 30
# Chandler's Sarai lies at 53.7 N 41.0 E (near Tambov). Sarai, the Golden Horde's capital in 1356 (New Sarai, Sarai
# al-Jadid), lay on the Akhtuba at about 48.7 N 45.2 E, which is our place "Sarai".
OVERRIDES = {'Sarai': 'Sarai'}


def at_year(row, years):
    pts = sorted((y, float(row[c])) for y, c in years if row[c] not in ('', None))
    before = [p for p in pts if p[0] <= YEAR]
    after = [p for p in pts if p[0] > YEAR]
    if not before or YEAR - before[-1][0] > WINDOW:
        return None
    a = before[-1]
    if after and after[0][0] - YEAR <= WINDOW:
        b = after[0]
        return a[1] + (b[1] - a[1]) * (YEAR - a[0]) / (b[0] - a[0]), [a[0], b[0]]
    return a[1], [a[0]]


def main(csv_path):
    raw = Path(csv_path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != SHA256:
        sys.exit('chandlerV2.csv differs from the published file (SHA-256)')
    rows = list(csv.DictReader(raw.decode('latin-1').splitlines()))
    years = [(int(c[3:]), c) for c in rows[0] if c.startswith('AD_')]
    geo = json.loads((ROOT / 'public/data/geo.json').read_text())
    loc = geo['loc']
    found = []
    for r in rows:
        try:
            lat, lon = float(r['Latitude']), float(r['Longitude'])
        except ValueError:
            continue
        if not (geo['lon0'] <= lon <= geo['lon1'] and geo['latS'] <= lat <= geo['latN']):
            continue
        v = at_year(r, years)
        if v and v[0] > 0:
            found.append((v[0], v[1], r, lat, lon))
    found.sort(key=lambda x: (-x[0], x[2]['City']))
    out = []
    for pop, from_years, r, lat, lon in found[:KEEP]:
        if r['City'] in OVERRIDES:
            place = loc['name'].index(OVERRIDES[r['City']])
        else:
            c = math.cos(math.radians(lat))
            place = min(range(geo['L']), key=lambda k: (loc['lat'][k] - lat) ** 2 + ((loc['lon'][k] - lon) * c) ** 2)
        out.append({'name': r['City'], 'country': r['Country'], 'people': round(pop), 'certainty': int(r['Certainty']),
                    'years': from_years, 'place': place, 'placeName': loc['name'][place]})
    doc = {
        'year': YEAR,
        'source': 'Reba, Reitsma & Seto (2016), Scientific Data 3, 160034, chandlerV2.csv (CC BY 4.0), after Chandler (1987)',
        'note': 'written by tools/people/build_cities.py; people = inhabitants in 1356, real scale (the game divides by 100)',
        'cities': out,
    }
    dst = ROOT / 'src/sim/content/cities_1356.json'
    dst.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n')
    print(f'{len(out)} cities, {sum(c["people"] for c in out)} inhabitants -> {dst.relative_to(ROOT)}')


if __name__ == '__main__':
    main(sys.argv[1])
