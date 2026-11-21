"""The names of polities and realms in tools/history/borders/build.py: the core of a name to match Cliopatria's
polities with our realms, the short name for the map, and the id of a new realm.
"""

import re

STOP = (
    r'\b(kingdom|duchy|grand|county|principality|margraviate|electorate|landgraviate|republic|sultanate|empire|'
    r'dynasty|khanate|emirate|beylik|of|the|despotate|free|city|imperial|archbishopric|bishopric|prince|house|'
    r'lordship|banate|giudicato|crown|old|first|second|great|order|state|confederation|caliphate|tsardom|commonwealth)\b'
)


def core(n):
    n = n.lower()
    n = re.sub(r'\(.*?\)', '', n)
    n = re.sub(STOP, ' ', n)
    n = re.sub(r'[^a-zà-ÿ ]', ' ', n)
    return ' '.join(n.split())


def short_of(name):
    """the name for the map: after the title ("Kingdom of Great Britain" -> "Great Britain"), else the whole name"""
    name = re.sub(r'\s*\(.*?\)', '', name)
    if ' of ' not in name:
        return name
    rest = name.split(' of ', 1)[1]
    return rest[4:] if rest.startswith('the ') else rest


def slug(name):
    return 'c_' + re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')
