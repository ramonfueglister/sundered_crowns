//! Faces measured as with a caliper: distances between landmarks of the morphed head, in millimetres, for a sample
//! of people as the game founds them (the people of examples/sample.rs), beside a survey of real heads.
//!
//!   cargo run --release --example face_measure -- England Gallia 36 ../public/portrait
//!   ... --grown             the people are that many grown ones instead (of 24, 35 and 50 in turn), for steadier means
//!   ... --dump <folder>     also writes each morphed head as <pid>.f32 (x y z per vertex, little endian), the
//!                           skin's triangles as body.u32 (three vertex numbers each), the eyeballs' vertices
//!                           as leye.u32 and reye.u32 and MakeHuman's head before any target as base.f32
//!   ... --target <name>     how far one of MakeHuman's targets moves the landmarks at weight 1 (mm: x y z)
//!   ... --marks             where the landmarks lie on the skin's image (u v), for tools/portrait/face_colour.mjs
//!   ... --children          that many girls and that many boys at each of the ages 2, 5, 8, 13 and 17 (or those of
//!                           --ages 2,3,4), measured as a survey of children's heads measures (measure.rs `CHILDREN`);
//!                           with --skull bx,lz,hy,bx,lz,hy the braincase larger by these factors (boys' breadth,
//!                           length and height, then girls') instead of the dress table's: 1,1,1,1,1,1 is MakeHuman's
//!   ... --made <person>     the targets of MakeHuman the head of one of the people is made of (its number as printed, 940000
//!                           and up): the weight of each, how many vertices it moves and how far at that weight (mm)
//!
//! The survey, the lips' reference (three measures) and the landmarks: src/measure.rs. After them the outline of the
//! cheek that is turned away from the viewer (`far_cheek`, two measures, no survey read), the survey's four arcs
//! from ear to ear (`arcs`), the breadth of the jaw's front 5 mm over the menton (`jaw_front`, no survey read),
//! how far the far cheek's outline has run in at the mouth's height (`far_at_mouth`, no survey read), the
//! neck's circumference (`neck`; lean people's beside the survey's: measure.rs `NECK_LEAN`) and how far the
//! lips stand apart along their seam where that is most (`seam`, no survey read).

use sc_portrait::dna::{founder, ORIGINS};
use sc_portrait::measure::{arcs, children, children_at, face, far_at_mouth, far_cheek, jaw_front, lips, marks, neck, seam, ARCS, CHEEK, CHEEKBONES, FAR_MOUTH, JAW, JAW_FRONT, LIDS, LIPS, MEASURES, MENTON, CHILDREN, NECK, NOSE, SEAM, SELLION, STAGE_TURN, SUBNASALE};
use sc_portrait::person::{look_of, Lived};
use sc_portrait::{build, morph_targets, morph_test, morph_test_skull, real, Head, LODS};

/// SplitMix64, as in examples/sample.rs.
fn draws(seed: u64, n: usize) -> Vec<u64> {
    (0..n as u64)
        .map(|k| {
            let mut z = seed.wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(k.wrapping_mul(0xBF58_476D_1CE4_E5B9)).wrapping_add(1);
            z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
            z ^ (z >> 31)
        })
        .collect()
}

fn real_look(dir: &str) {
    for entry in std::fs::read_dir(format!("{dir}/real")).expect("the folder of the real look") {
        let path = entry.unwrap().path();
        let name = format!("real/{}", path.file_name().unwrap().to_str().unwrap());
        if name.ends_with(".webp") || name.ends_with(".png") {
            real::name(&name);
        } else {
            real::put(&name, std::fs::read(&path).unwrap());
        }
    }
    real::set_real(Some("real".to_string()));
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (origin, pool, n, dir) = match args.as_slice() {
        [origin, pool, n, dir, ..] => (origin.as_str(), pool.as_str(), n.parse::<u32>().expect("how many people"), dir.as_str()),
        _ => panic!("face_measure <origin of the people> <pool of genes> <how many> <folder of the portraits' files> [--grown] [--dump <folder>] [--target <name>] [--marks] [--children [--ages <a,b,c>] [--skull <bx,lz,hy,bx,lz,hy>]] [--made <person>]"),
    };
    let option = |name: &str| args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned();
    let head = Head::load(&std::fs::read(format!("{dir}/head.bin.zst")).expect("the head file")).expect("the head");
    real_look(dir);
    if let Some(name) = option("--target") {
        let mut names: Vec<&String> = head.targets.keys().filter(|k| k.contains(name.as_str())).collect();
        names.sort();
        for t in names {
            let tg = &head.targets[t];
            let at = |v: usize| tg.ids.iter().position(|&i| i as usize == v).map_or([0.0; 3], |j| tg.d[j].map(|d| d as f32 / 30.0));
            let show = |v: usize| { let d = at(v); format!("{:5.1} {:5.1} {:5.1}", d[0], d[1], d[2]) };
            println!("{t}: {} vertices; sellion {} | subnasale {} | menton {} | nose's wing {} | cheekbone {} | jaw {} | upper lid {}", tg.ids.len(), show(SELLION), show(SUBNASALE), show(MENTON), show(NOSE[0].0), show(CHEEKBONES[1].0), show(JAW[0].0), show(LIDS[0].0));
        }
        return;
    }
    if args.iter().any(|a| a == "--marks") {
        // a portrait's skin lists the corners of its triangles in the order of the head's own list, each with its
        // place on the skin's image: the same for everyone
        let r = draws(7000, 68);
        let genes = founder(0, |i| r[i as usize]).bytes();
        let look = look_of(&genes, true, 30.0, 1, "Bauern", 1000.0, 1000.0, 940000, origin, Lived { loss_days: None, rank: Some(0.5), clothes_pct: Some(100.0) });
        let out = build(&head, &look, 1);
        let idx = &head.parts["body"][LODS - 1];
        let skin = out.surfaces.iter().find(|s| s.pos.len() >= idx.len() && s.tex.as_deref().is_some_and(|t| t.contains("skin"))).expect("the skin");
        for (name, v) in marks() {
            let uv = skin.uv[idx.iter().position(|&i| i as usize == v).expect("a landmark on the skin")];
            println!("  [\"{name}\", {:.4}, {:.4}],", uv[0], uv[1]);
        }
        return;
    }
    let o = ORIGINS.iter().position(|k| *k == pool).unwrap_or_else(|| panic!("no pool {pool}: {ORIGINS:?}")) as u8;
    if args.iter().any(|a| a == "--children") {
        // that many girls and that many boys at each age (the genes of the people of --grown), beside the survey
        // of children's heads (measure.rs `CHILDREN`)
        // --skull bx,lz,hy,bx,lz,hy: the braincase larger by these factors instead of the dress table's (boys', girls')
        let skull: Option<[[f32; 3]; 2]> = option("--skull").map(|s| {
            let f: Vec<f32> = s.split(',').map(|a| a.parse().expect("a factor")).collect();
            [[f[0], f[1], f[2]], [f[3], f[4], f[5]]]
        });
        let ages: Vec<f32> = option("--ages").map_or(vec![2.0, 5.0, 8.0, 13.0, 17.0], |s| s.split(',').map(|a| a.parse().expect("an age")).collect());
        for &age in &ages {
            let mut rows: [Vec<[f32; 11]>; 2] = [Vec::new(), Vec::new()];
            for k in 0..n {
                for female in [false, true] {
                    let r = draws(8000 + k as u64, 68);
                    let genes = founder(o, |i| r[i as usize]).bytes();
                    let look = look_of(&genes, female, age, 1, "Bauern", 1000.0, 1000.0, 940000 + k, origin, Lived { loss_days: None, rank: Some(0.5), clothes_pct: Some(100.0) });
                    let by = skull.map(|by| by[female as usize]);
                    rows[female as usize].push(children(&head, &by.map_or_else(|| morph_test(&head, &look), |by| morph_test_skull(&head, &look, by))));
                }
            }
            println!("\nage {age}: ours (SD), the survey's (SD), how many of the survey's SDs ours lies from it");
            println!("{:<40} {:>34} {:>34}", "", "boys", "girls");
            for (m, by_age) in CHILDREN.iter().enumerate() {
                let cell = |sex: usize| {
                    let mean = rows[sex].iter().map(|r| r[m]).sum::<f32>() / n as f32;
                    let sd = (rows[sex].iter().map(|r| (r[m] - mean).powi(2)).sum::<f32>() / n as f32).sqrt();
                    let s = children_at(m, sex == 1, age);
                    format!("{mean:6.1} ({sd:4.1}) {:6.1} ({:4.1}) {:+5.1}", s[0], s[1], (mean - s[0]) / s[1])
                };
                println!("{:<40} {:>34} {:>34}", by_age.name, cell(0), cell(1));
            }
        }
        return;
    }
    let (ages, small) = ([8.0, 13.0, 17.0, 24.0, 35.0, 50.0, 68.0], [2.0, 5.0]);
    let dump = option("--dump");
    if let Some(folder) = &dump {
        // the skin's triangles (three corners each, as numbers of the head's vertices), for tools that need normals
        let bytes: Vec<u8> = head.parts["body"][LODS - 1].iter().flat_map(|i| (*i as u32).to_le_bytes()).collect();
        std::fs::write(format!("{folder}/body.u32"), bytes).expect("the folder to dump into");
        // MakeHuman's head as it comes, before any target (x y z per vertex, as the people's heads)
        let bytes: Vec<u8> = head.base.iter().flatten().flat_map(|x| x.to_le_bytes()).collect();
        std::fs::write(format!("{folder}/base.f32"), bytes).expect("the folder to dump into");
        // and the eyeballs' vertices (the eye at positive x first)
        for part in ["leye", "reye"] {
            let bytes: Vec<u8> = head.parts[part][0].iter().flat_map(|i| (*i as u32).to_le_bytes()).collect();
            std::fs::write(format!("{folder}/{part}.u32"), bytes).expect("the folder to dump into");
        }
    }
    let many = args.iter().any(|a| a == "--grown");
    let made = option("--made");
    let mut grown: [Vec<Vec<f32>>; 2] = [Vec::new(), Vec::new()];
    println!("{:>7} {:>3} {:>4} {}", "person", "sex", "age", (1..=MEASURES.len() + LIPS.len() + CHEEK.len() + ARCS.len() + JAW_FRONT.len() + FAR_MOUTH.len() + NECK.len() + SEAM.len()).map(|k| format!("{k:>6}")).collect::<String>());
    for k in 0..n {
        let r = draws(if many { 8000 } else { 7000 } + k as u64, 68);
        let genes = founder(o, |i| r[i as usize]).bytes();
        let (female, age) = (k % 2 == 0, if many { [24.0, 35.0, 50.0][(k / 2) as usize % 3] } else if k < 28 { ages[(k / 2) as usize % ages.len()] } else { small[(k / 2) as usize % small.len()] });
        let look = look_of(&genes, female, age, 1, "Bauern", 1000.0, 1000.0, 940000 + k, origin, Lived { loss_days: None, rank: Some(0.5), clothes_pct: Some(100.0) });
        if made.as_deref() == Some((940000 + k).to_string().as_str()) {
            // a target may come more than once (genes, the dress table's rest, age): summed, in the order of their first coming
            let mut sums: Vec<(String, f32)> = Vec::new();
            for (name, w) in morph_targets(&head, &look) {
                match sums.iter_mut().find(|s| s.0 == name) {
                    Some(s) => s.1 += w,
                    None => sums.push((name, w)),
                }
            }
            println!("{}, {} of {age}: {} targets", 940000 + k, if female { "a woman" } else { "a man" }, sums.len());
            for (name, w) in sums {
                let t = &head.targets[name.as_str()];
                let far = t.d.iter().map(|d| (d[0] as f32).hypot(d[1] as f32).hypot(d[2] as f32) / 30.0).fold(0.0, f32::max);
                println!("{w:7.3}  {name:<56} {:5} vertices, {:5.1} mm at most", t.ids.len(), far * w);
            }
            return;
        }
        let pp = morph_test(&head, &look);
        if let Some(folder) = &dump {
            let bytes: Vec<u8> = pp.iter().flatten().flat_map(|x| x.to_le_bytes()).collect();
            std::fs::write(format!("{folder}/{}.f32", 940000 + k), bytes).expect("the folder to dump into");
        }
        let mut m = face(&head, &pp);
        m.extend(lips(&pp));
        m.extend(far_cheek(&head, &pp, STAGE_TURN));
        m.extend(arcs(&head, &pp));
        m.push(jaw_front(&head, &pp, 5.0));
        m.push(far_at_mouth(&head, &pp, STAGE_TURN));
        m.push(neck(&head, &pp));
        m.push(seam(&head, &pp));
        if !many {
            println!("{:>7} {:>3} {:>4} {}", 940000 + k, if female { "f" } else { "m" }, age, m.iter().map(|x| format!("{x:6.1}")).collect::<String>());
        }
        if age >= 20.0 {
            grown[if female { 1 } else { 0 }].push(m);
        }
    }
    println!("\nthe grown (20 and older): ours (SD), the survey's (SD), how many of the survey's SDs ours lies from it; women as a share of men, ours and the survey's");
    println!("{:>2} {:<32} {:>34} {:>34} {:>14}", "", "", "men", "women", "women / men");
    let mean = |g: &Vec<Vec<f32>>, k: usize| g.iter().map(|m| m[k]).sum::<f32>() / g.len().max(1) as f32;
    let spread = |g: &Vec<Vec<f32>>, k: usize| (g.iter().map(|m| (m[k] - mean(g, k)).powi(2)).sum::<f32>() / g.len().max(1) as f32).sqrt();
    for (k, &(name, men, women)) in MEASURES.iter().chain(&LIPS).chain(&CHEEK).chain(&ARCS).chain(&JAW_FRONT).chain(&FAR_MOUTH).chain(&NECK).chain(&SEAM).enumerate() {
        let (a, b) = (mean(&grown[0], k), mean(&grown[1], k));
        let cell = |x: f32, sd: f32, s: [f32; 2]| if s[0] > 0.0 { format!("{x:6.1} ({sd:4.1}) {:6.1} ({:4.1}) {:+5.1}", s[0], s[1], (x - s[0]) / s[1]) } else { format!("{x:6.1} ({sd:4.1}) {:>19}", "") };
        let ratio = if men[0] > 0.0 { format!("{:5.3} {:5.3}", b / a, women[0] / men[0]) } else { format!("{:5.3}", b / a) };
        println!("{:>2} {name:<32} {:>34} {:>34} {ratio:>14}", k + 1, cell(a, spread(&grown[0], k), men), cell(b, spread(&grown[1], k), women));
    }
}
