//! The face's outline as the portrait shows it (round 115): how broad the drawn head stands in the picture at the
//! line of the eyes, at the mouth and half way from the mouth to the chin, in lengths from the line of the eyes to
//! the chin, for the people of a sample (`tests/portrait/sample_england.json` unless `--sample` names another).
//! Round 114 read the same three on a face of the reference by hand: about 1.4, 1.0 and 0.7; ours 1.4, 1.4, 1.2.
//! Round 117 read them again with a ruler laid over two faces of the reference (A and C of tools/portrait/
//! beside.mjs; the chin's lowest point, not the mark of the chin): 1.41, 1.14, 0.9 and 1.16, 1.08, 0.83, and the
//! far cheek at the mouth 13 and 5 mm inside its top. `--chin` prints the breadth near the chin's end instead,
//! `--what a,b` what targets of MakeHuman move, `--targets` their names.
//!
//!   cargo run --release --example outline -- ../public/portrait [--sample <json>] [--try name=w,name=w]
//!
//! The head is turned by the stage's turn (`STAGE_TURN`) about the upright and seen from in front, as the picture
//! sees it (the bust's lean left out); at a height the outline runs from the skin that stands furthest left to the
//! skin that stands furthest right, of the skin that lies more than 12 mm in front of the jaw's corners (the ears
//! left out, as `far_outline` does). `--try` adds MakeHuman's targets by these weights on top of the morphed head
//! (linear, as the morph adds them), to look for the weights before they go into the dress table.

use sc_portrait::measure::{JAW, LIDS, MENTON, STAGE_TURN, STOMION};
use sc_portrait::person::{look_of, Lived};
use sc_portrait::{morph_test, real, Head};

/// (left, right) of the outline at height `y`, in the turned picture's units.
fn across(h: &Head, pp: &[[f32; 3]], y: f32, turn: f32) -> (f32, f32) {
    let (c, s) = (turn.cos(), turn.sin());
    let back = JAW.iter().map(|&(a, b)| pp[a][2] + pp[b][2]).sum::<f32>() / (2 * JAW.len()) as f32 + 0.12;
    let (mut lo, mut hi) = (f32::MAX, f32::MIN);
    for t in h.body_full().chunks_exact(3) {
        for k in 0..3 {
            let (p, q) = (pp[t[k] as usize], pp[t[(k + 1) % 3] as usize]);
            if (p[1] - y) * (q[1] - y) < 0.0 {
                let f = (y - p[1]) / (q[1] - p[1]);
                let (x, z) = (p[0] + f * (q[0] - p[0]), p[2] + f * (q[2] - p[2]));
                if z > back {
                    let u = x * c - z * s;
                    lo = lo.min(u);
                    hi = hi.max(u);
                }
            }
        }
    }
    (lo, hi)
}

/// Breadth at the eyes, at the mouth, half way from mouth to chin, in lengths from the eyes' line to the chin.
pub fn shares(h: &Head, pp: &[[f32; 3]]) -> [f32; 3] {
    let eye = (pp[LIDS[0].0][1] + pp[LIDS[0].1][1] + pp[LIDS[1].0][1] + pp[LIDS[1].1][1]) / 4.0;
    let mouth = (pp[STOMION[0]][1] + pp[STOMION[1]][1]) / 2.0;
    let chin = pp[MENTON][1];
    let len = eye - chin;
    [eye, mouth, (mouth + chin) / 2.0].map(|y| {
        let (lo, hi) = across(h, pp, y, STAGE_TURN);
        (hi - lo) / len
    })
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let dir = args.first().expect("outline <folder of the portraits' files> [--grown n] [--try name=w,...]").clone();
    let option = |name: &str| args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned();
    let head = Head::load(&std::fs::read(format!("{dir}/head.bin.zst")).expect("the head file")).expect("the head");
    for entry in std::fs::read_dir(format!("{dir}/real")).expect("the folder of the real look") {
        let path = entry.unwrap().path();
        let name = format!("real/{}", path.file_name().unwrap().to_str().unwrap());
        if name.ends_with(".webp") || name.ends_with(".png") { real::name(&name) } else { real::put(&name, std::fs::read(&path).unwrap()) }
    }
    real::set_real(Some("real".to_string()));
    if args.iter().any(|a| a == "--targets") {
        let mut names: Vec<&String> = head.targets.keys().collect();
        names.sort();
        for n in names { println!("{n}"); }
        return;
    }
    if let Some(names) = option("--what") {
        // what a target does at weight 1: how far it moves the jaw's corners, the chin's lowest point and the
        // vertex it moves most, in mm (x out from the middle, y up, z forward)
        for name in names.split(',') {
            let t = head.targets.get(name).unwrap_or_else(|| panic!("no target {name}"));
            let at = |v: usize| -> [f32; 3] {
                t.ids.iter().position(|&i| i as usize == v).map_or([0.0; 3], |j| [0, 1, 2].map(|c| t.d[j][c] as f32 * sc_portrait::head::DELTA_SCALE * 100.0))
            };
            let (a, b) = (at(JAW[0].0), at(MENTON));
            let most = (0..t.ids.len()).max_by(|&i, &j| { let l = |k: usize| (0..3).map(|c| (t.d[k][c] as f32).powi(2)).sum::<f32>(); l(i).partial_cmp(&l(j)).unwrap() }).unwrap();
            let (m, q) = (at(t.ids[most] as usize), head.base[t.ids[most] as usize]);
            println!("{name:<32} jaw's corner {:5.1} {:5.1} {:5.1}   chin {:5.1} {:5.1} {:5.1}   most {:5.1} {:5.1} {:5.1} at ({:.2} {:.2} {:.2}), {} vertices", a[0], a[1], a[2], b[0], b[1], b[2], m[0], m[1], m[2], q[0], q[1], q[2], t.ids.len());
        }
        println!("base: jaw's corner {:?}, chin {:?}", head.base[JAW[0].0], head.base[MENTON]);
        println!("base: tragion {:?}, jaw {:?}, the lips' line {:?}, cheekbones {:?}", head.base[sc_portrait::measure::TRAGION.0], JAW.map(|j| head.base[j.0]), head.base[STOMION[0]], sc_portrait::measure::CHEEKBONES.map(|j| head.base[j.0]));
        return;
    }
    let tries: Vec<(String, f32)> = option("--try").map_or(Vec::new(), |s| {
        s.split(',').map(|t| { let (n, w) = t.split_once('=').expect("name=weight"); (n.to_string(), w.parse().expect("a weight")) }).collect()
    });
    let sample = option("--sample").unwrap_or_else(|| "../tests/portrait/sample_england.json".to_string());
    let text = std::fs::read_to_string(&sample).expect("the sample");
    let num = |line: &str, key: &str| -> f32 {
        let at = line.find(&format!("\"{key}\":")).unwrap_or_else(|| panic!("no {key}")) + key.len() + 3;
        line[at..].split(|c: char| c == ',' || c == '}').next().unwrap().trim().parse().unwrap()
    };
    let mut far = [0.0f32; 2];
    let mut sums = [[0.0f32; 3]; 2];
    let mut count = [0u32; 2];
    for line in text.lines().filter(|l| l.contains("\"pid\"")) {
        let pid = num(line, "pid") as u32;
        let female = line.contains("\"female\":true");
        let age = num(line, "age");
        let dna = &line[line.find("\"dna\":[").unwrap() + 7..];
        let genes: Vec<u8> = dna[..dna.find(']').unwrap()].split(',').map(|g| g.trim().parse().unwrap()).collect();
        let origin = { let a = line.find("\"origin\":\"").unwrap() + 10; &line[a..a + line[a..].find('"').unwrap()] };
        let look = look_of(&genes, female, age, num(line, "stand") as u8, "Bauern", num(line, "health"), num(line, "fed"), pid, origin, Lived { loss_days: None, rank: Some(num(line, "rank")), clothes_pct: Some(num(line, "clothes_pct")) });
        let mut pp = morph_test(&head, &look);
        for (name, w) in &tries {
            let t = head.targets.get(name.as_str()).unwrap_or_else(|| panic!("no target {name}"));
            for (j, &i) in t.ids.iter().enumerate() {
                for c in 0..3 {
                    pp[i as usize][c] += w * t.d[j][c] as f32 * sc_portrait::head::DELTA_SCALE;
                }
            }
        }
        if args.iter().any(|a| a == "--chin") && age >= 17.0 {
            // the breadth of the chin's end, in mm, at these heights above the chin's lowest point
            let chin = pp[MENTON][1];
            let w: Vec<String> = [0.02f32, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4].iter().map(|d| { let (lo, hi) = across(&head, &pp, chin + d, STAGE_TURN); format!("{:5.1}", (hi - lo) * 100.0) }).collect();
            println!("{pid} {}  chin's end: {}", if female { "w" } else { "m" }, w.join(" "));
            continue;
        }
        let s = shares(&head, &pp);
        println!("{pid} {} {age:>4}  {:.2} {:.2} {:.2}", if female { "w" } else { "m" }, s[0], s[1], s[2]);
        if age >= 17.0 {
            let x = (!female) as usize;
            for i in 0..3 { sums[x][i] += s[i]; }
            far[x] += sc_portrait::measure::far_at_mouth(&head, &pp, STAGE_TURN);
            count[x] += 1;
        }
    }
    for (x, who) in ["grown women", "grown men"].iter().enumerate() {
        let m = sums[x].map(|v| v / count[x] as f32);
        println!("{who:<12} eyes {:.2}  mouth {:.2}  under the mouth {:.2}   (the reference's women A and C: 1.41, 1.14, 0.9 and 1.16, 1.08, 0.83)   the far cheek at the mouth {:.1} mm inside its top (theirs 13 and 5)", m[0], m[1], m[2], far[x] / count[x] as f32);
    }
}
