"""Extracts the cities of Chandler with people in a start year inside the world frame:
data/history/<year>/chandler_<year>.json (derived values only; the CSV is not kept in the repository).

Source: Reba, M., Reitsma, F. & Seto, K. C. (2016). Spatializing 6,000 years of global urbanization from 3700 BC
to AD 2000. Scientific Data 3, 160034, doi:10.1038/sdata.2016.34, "chandlerV2.csv" (doi:10.6084/m9.figshare.2059494.v3,
CC BY 4.0), the digitised tables of T. Chandler (1987), Four Thousand Years of Urban Growth.

The value of a year is interpolated as tools/people/build_cities.py does for 1356 (nearest years before and after, each
at most 60 years away). Each city gets the place of the gazetteer it stands at (build_cities.site), the town of the
world graphic. The 30 largest also go to src/sim/content/cities_<year>.json, the cities whose persons the simulation
founds.

    curl -L -o chandlerV2.csv https://s3-eu-west-1.amazonaws.com/pfigshare-u-files/5407640/chandlerV2.csv
    python3 tools/history/1291/chandler.py chandlerV2.csv [year]
"""
import csv, hashlib, json, math, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools' / 'people'))
import build_cities  # noqa: E402


def main(csv_path, year=1291):
    raw = Path(csv_path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != build_cities.SHA256:
        sys.exit('chandlerV2.csv differs from the published file (SHA-256)')
    rows = list(csv.DictReader(raw.decode('latin-1').splitlines()))
    years = [(int(c[3:]), c) for c in rows[0] if c.startswith('AD_')]
    ext = json.loads((ROOT / 'data/content/world_extent.json').read_text())
    gaz = json.loads((ROOT / 'data/content/gazetteer.json').read_text())['places']
    build_cities.YEAR = year
    out = []
    for r in rows:
        try:
            lat, lon = float(r['Latitude']), float(r['Longitude'])
        except ValueError:
            continue
        if not (ext['west'] <= lon <= ext['east'] and ext['south'] <= lat <= ext['north']):
            continue
        v = build_cities.at_year(r, years)
        if not v or v[0] <= 0:
            continue
        k = build_cities.site(gaz, r['City'], lat, lon)
        out.append({'name': r['City'], 'country': r['Country'], 'people': round(v[0]), 'years': v[1],
                    'certainty': int(r['Certainty']), 'lat': lat, 'lon': lon, 'site': k, 'siteName': gaz[k]['name']})
    out.sort(key=lambda c: (-c['people'], c['name']))
    doc = {'year': year,
           'source': 'Reba, Reitsma & Seto (2016), Scientific Data 3, 160034, chandlerV2.csv (CC BY 4.0), after Chandler (1987)',
           'note': 'written by tools/history/1291/chandler.py; people of the time, interpolated between the nearest years '
                   'within 60 years; site = index of the nearest place in data/content/gazetteer.json',
           'cities': out}
    dst = ROOT / 'data' / 'history' / str(year) / f'chandler_{year}.json'
    dst.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n')
    print(f'{len(out)} cities in the frame, {sum(c["people"] for c in out)} people -> {dst.relative_to(ROOT)}')
    # the 30 largest are the cities whose persons the simulation founds (src/sim/systems/people.ts), in the shape of
    # src/sim/content/cities_1356.json: the place of the map is the one whose centre is nearest to the town
    geo = json.loads((ROOT / 'public/data/geo.json').read_text())
    loc = geo['loc']
    cities = []
    for c in out[:build_cities.KEEP]:
        # by the town's own point (its gazetteer place), as towns.py places a town, so the setup holds its people there
        g = gaz[c['site']]; k = math.cos(math.radians(g['lat']))
        place = min(range(geo['L']), key=lambda i: (loc['lat'][i] - g['lat']) ** 2 + ((loc['lon'][i] - g['lon']) * k) ** 2)
        cities.append({'name': c['name'], 'country': c['country'], 'people': c['people'], 'certainty': c['certainty'],
                       'years': c['years'], 'place': place, 'placeName': loc['name'][place],
                       'lon': round(loc['lon'][place], 3), 'lat': round(loc['lat'][place], 3), 'site': c['site']})
    doc = {'year': year, 'source': doc['source'],
           'note': f'written by tools/history/1291/chandler.py; the {build_cities.KEEP} largest cities inside the world frame '
                   f'(data/content/world_extent.json) in {year}; people = inhabitants of the time (the game divides by 100)',
           'cities': cities}
    dst = ROOT / 'src' / 'sim' / 'content' / f'cities_{year}.json'
    dst.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n')
    print(f'{len(cities)} cities, {sum(c["people"] for c in cities)} people -> {dst.relative_to(ROOT)}')


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1291)
