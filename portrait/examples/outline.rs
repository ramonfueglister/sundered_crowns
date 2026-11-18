//! The face's outline as the portrait shows it (round 115): how broad the drawn head stands in the picture at the
//! line of the eyes, at the mouth and half way from the mouth to the chin, in lengths from the line of the eyes to
//! the chin, for the people of a sample (`tests/portrait/sample_england.json` unless `--sample` names another).
//! Round 114 read the same three on a face of the reference by hand: about 1.4, 1.0 and 0.7; ours 1.4, 1.4, 1.2.
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
    let tries: Vec<(String, f32)> = option("--try").map_or(Vec::new(), |s| {
        s.split(',').map(|t| { let (n, w) = t.split_once('=').expect("name=weight"); (n.to_string(), w.parse().expect("a weight")) }).collect()
    });
    let sample = option("--sample").unwrap_or_else(|| "../tests/portrait/sample_england.json".to_string());
    let text = std::fs::read_to_string(&sample).expect("the sample");
    let num = |line: &str, key: &str| -> f32 {
        let at = line.find(&format!("\"{key}\":")).unwrap_or_else(|| panic!("no {key}")) + key.len() + 3;
        line[at..].split(|c: char| c == ',' || c == '}').next().unwrap().trim().parse().unwrap()
    };
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
        let s = shares(&head, &pp);
        println!("{pid} {} {age:>4}  {:.2} {:.2} {:.2}", if female { "w" } else { "m" }, s[0], s[1], s[2]);
        if age >= 17.0 {
            let x = (!female) as usize;
            for i in 0..3 { sums[x][i] += s[i]; }
            count[x] += 1;
        }
    }
    for (x, who) in ["grown women", "grown men"].iter().enumerate() {
        let m = sums[x].map(|v| v / count[x] as f32);
        println!("{who:<12} eyes {:.2}  mouth {:.2}  under the mouth {:.2}   (the reference's woman A: 1.4, 1.0, 0.7)", m[0], m[1], m[2]);
    }
}
