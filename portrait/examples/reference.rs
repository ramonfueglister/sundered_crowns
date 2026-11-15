//! The portraits of the test people as numbers, for the tests of the game (tests/portrait.test.ts) to hold the
//! WebAssembly build against, and to hold this builder against Apoleia's (tests/portrait/golden.json was written
//! by the same lines running on Apoleia's own crate at commit c30a107).
//!
//!   cargo run --release --example reference -- people.txt public/portrait
//!
//! people.txt: one person a line: pid female age stand job origin health fed loss_days|- rank clothes_pct genes(hex).
//! Prints one JSON object a person: the frame, and per surface its material, images, vertex count and the sums of
//! its positions, colours, texture coordinates and normals; last the xxh3 of all the bytes of the portrait.

use sc_portrait::person::{look_of, Lived};
use sc_portrait::{build, real, Head};

/// The files of the real look from a folder on disk, under the name `real`.
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
    let args: Vec<String> = std::env::args().collect();
    let (people, dir) = (&args[1], &args[2]);
    let head = Head::load(&std::fs::read(format!("{dir}/head.bin.zst")).expect("the head file")).expect("the head");
    if args.get(3).map(String::as_str) != Some("simple") {
        real_look(dir);
    }
    println!("[");
    let text = std::fs::read_to_string(people).expect("the people");
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    for (n, line) in lines.iter().enumerate() {
        let f: Vec<&str> = line.split_whitespace().collect();
        let genes: Vec<u8> = (0..f[11].len() / 2).map(|i| u8::from_str_radix(&f[11][2 * i..2 * i + 2], 16).unwrap()).collect();
        let lived = Lived { loss_days: f[8].parse().ok(), rank: f[9].parse().ok(), clothes_pct: f[10].parse().ok() };
        let look = look_of(&genes, f[1] == "1", f[2].parse().unwrap(), f[3].parse().unwrap(), f[4], f[6].parse().unwrap(), f[7].parse().unwrap(), f[0].parse().unwrap(), f[5], lived);
        let p = build(&head, &look, 1);
        let mut all = Vec::new();
        let mut surfaces = Vec::new();
        for s in &p.surfaces {
            let sum3 = |v: &[[f32; 3]]| v.iter().flatten().map(|x| *x as f64).sum::<f64>();
            let sum2 = |v: &[[f32; 2]]| v.iter().flatten().map(|x| *x as f64).sum::<f64>();
            for x in s.pos.iter().chain(&s.col).chain(&s.nrm).flatten().chain(s.uv.iter().flatten()) {
                all.extend(x.to_le_bytes());
            }
            surfaces.push(format!(
                "{{\"rough\":{},\"metal\":{},\"double\":{},\"tex\":\"{}\",\"nmap\":\"{}\",\"verts\":{},\"pos\":{:.4},\"col\":{:.4},\"uv\":{:.4},\"nrm\":{:.4}}}",
                s.mat.rough, s.mat.metal, s.mat.double, s.tex.as_deref().unwrap_or(""), s.nmap.as_deref().unwrap_or(""), s.pos.len(), sum3(&s.pos), sum3(&s.col), sum2(&s.uv), sum3(&s.nrm)
            ));
        }
        println!(
            "  {{\"pid\":{},\"top\":{:.5},\"chin\":{:.5},\"cx\":{:.5},\"cz\":{:.5},\"fill\":{},\"tris\":{},\"hash\":\"{:016x}\",\"surfaces\":[\n    {}]}}{}",
            f[0], p.top, p.chin, p.cx, p.cz, p.fill, p.tris, xxhash_rust::xxh3::xxh3_64(&all), surfaces.join(",\n    "), if n + 1 < lines.len() { "," } else { "" }
        );
    }
    println!("]");
}
