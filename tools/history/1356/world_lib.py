"""The record of a realm of 1 January 1356 beyond the game map, as tools/history/1356/world.py writes it to
data/history/1356/world_beyond.json: S builds a realm, P and F its persons, at a place from 'Name@lat,lon'."""


def at(spec):
    nm, c = spec.split('@')
    la, lo = map(float, c.split(','))
    return {'name': nm.strip(), 'lat': la, 'lon': lo}


def P(name, born, dyn, gov, sta, gen, traits='', female=False):
    return {
        'name': name,
        'born': born,
        'dynasty': dyn,
        'female': female,
        'skills': [gov, sta, gen],
        'traits': traits.split(),
    }


def F(name, born, dyn, gov, sta, gen, traits=''):
    return P(name, born, dyn, gov, sta, gen, traits, True)


def PLAIN(tincture):
    """No European heraldry for these realms: a plain field of the realm's customary colour."""
    return {
        'blazon': f'{tincture.capitalize()}, plain',
        'field': tincture,
        'division': 'plain',
        'field2': None,
        'ordinary': None,
        'ordinary_tincture': None,
        'charges': [],
    }


USED = set()


def S(
    id,
    n,
    sh,
    adj,
    rank,
    gov,
    cult,
    faith,
    cap,
    hold,
    ruler,
    heir=None,
    consort=None,
    note='',
    over=None,
    subj=None,
    allies='',
    rivals='',
    pers='opportunist',
    diff=3,
    en='',
    de='',
    field='gules',
    reach=None,
):
    assert id not in USED, id
    USED.add(id)
    capp = at(cap)
    return {
        'id': id,
        'name': {'en': n[0], 'de': n[1]},
        'short': {'en': sh[0], 'de': sh[1]},
        'adjective': {'en': adj[0], 'de': adj[1]},
        'rank': rank,
        'government': gov,
        'culture': cult,
        'faith': faith,
        'color': '#808080',
        'capital': capp,
        'holdings': [capp] + [at(h) for h in hold],
        'ruler': ruler,
        'heir': heir,
        'consort': consort,
        'dynasty_note': note,
        'overlord': over,
        'subject_type': (subj or 'vassal') if over else None,
        'empire_member': False,
        'elector': False,
        'allies': allies.split(),
        'rivals': rivals.split(),
        'claims_on': [],
        'personality': pers,
        'difficulty': diff,
        'summary': {'en': en, 'de': de},
        'coa': PLAIN(field),
        **({'reach_km': reach} if reach else {}),
    }
