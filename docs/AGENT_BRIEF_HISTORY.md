You are a historical researcher writing game data for "Sundered Crowns", an ORIGINAL browser grand strategy game set in real Europe and its neighbours, starting 1 January 1356.
Read /home/user/sundered-crowns/docs/DATA_SCHEMA.md first: it defines the exact JSON schema and canonical ids. Follow it exactly.
- Use your own historical knowledge; be accurate (rulers reigning on 1 Jan 1356, correct dynasties, capitals, coordinates of real places, period place names, e.g. "Pressburg", "Königsberg", "Constantinople", "Lemberg").
- Never use names, tags, data or terms from any commercial strategy game or mod.
- Write ONLY your assigned output file(s). Do not touch any other file in the repo.
- Write valid JSON (no comments, no trailing commas). Validate it at the end with: python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print(len(d.get('states',d if isinstance(d,list) else [])))" <file>
- Check that every state id is unique, all culture/faith/government/rank ids are canonical (or listed in new_ids), every allies/rivals/overlord/claims_on id either exists in your file or is a plausible id from another region (list such external references in a top-level "external_refs" array so the integrator can fix them).
- Large files: write in several chunks if needed (e.g. write the first half, then append by rewriting with Python), but the final file must be one valid JSON document.
- Final answer: a 5-line summary (count of states, any doubts/conflicting sources you resolved and how). No file dumps.
