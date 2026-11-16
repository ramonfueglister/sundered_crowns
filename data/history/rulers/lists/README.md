# Ruler lists 1291–1848, from English Wikipedia

One CSV per realm of `../realms_frame.json` (`<realm id>.csv`), listing who held the
realm's title from 1 January 1291 to 31 December 1848, or until the title ended.
`INDEX.csv` gives the status of every realm.

## Source and licence

Every fact comes from the English Wikipedia revision named in the row:
`source_url` is the page, `source_revid` the exact revision that was read
(`https://en.wikipedia.org/w/index.php?oldid=<source_revid>` opens it). Wikipedia text is
licensed CC BY-SA 4.0; these rows are attributed to the authors of that page through
those two columns. Nothing was added from memory: a date or person the source does not
give is left empty. `qid` is the Wikidata item of the person's article as linked from the
list (pageprops `wikibase_item`), empty when the list does not link an article.

The fetch helper is `tools/history/rulers/wp_lists.py` (MediaWiki API, about one request
per second, raw wikitext cached locally and not committed).

## Columns

| Column | Meaning |
|---|---|
| `order` | 1, 2, 3 … Row 1 is the holder on 1 January 1291 (its `reign_start` may be before 1291) |
| `name` | Name as the source gives it (with regnal number) |
| `born`, `died` | Birth and death date of the person |
| `reign_start`, `reign_end` | Start and end of the tenure of this title |
| `precision` | `day`, `month`, `year` or `circa`: the coarsest precision of `reign_start` and `reign_end` (`circa` when the source marks a date as approximate) |
| `house` | Dynasty or family as the source gives it |
| `qid` | Wikidata id of the person, see above |
| `note` | Co-rule, disputed or contested tenure, title held by another crown, how the title ended, difference from the work list |
| `source_url`, `source_revid` | Page and revision the row was read from |

Dates are `YYYY-MM-DD`, `YYYY-MM` or `YYYY`, exactly as precise as the source; empty when
the source does not give them.

## Rules

- **Title holder.** The list follows the real holder of the title. When the title passes
  into another crown (Brittany to the kings of France, Bohemia to the Habsburgs), the list
  goes on with the holders of that title as long as the title itself existed, with note
  `title held by the king of X`. When the title ends (extinct, abolished, conquered without
  the title continuing, merged into a new title), the list stops and the last row's note
  says how and when it ended.
- **Co-rulers** each get their own row, with a note. Regents are not holders.
- **Collective government.** Republics, communes and free cities governed by councils get a
  single row with note `collective government, no single ruler` (and, when the source says,
  when their independence ended), unless there is a single head of state with a list: doges
  of Venice and Genoa, bishops of prince-bishoprics, grand masters of orders, popes for the
  Papal States.

## INDEX.csv

`realm_id,status,rows,source_url,remark`, status one of `done` (full list for the period),
`partial` (source list has gaps or ends early), `no_list` (no usable Wikipedia list found),
`collective` (single collective row).
