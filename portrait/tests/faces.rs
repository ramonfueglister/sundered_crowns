//! The faces of England's dress table held against measured heads: a survey of real ones (src/measure.rs) and the
//! place of a young woman's brows. These tests use the real look, which is set once for the whole program: they
//! stand in a file of their own so that the library's tests keep Apoleia's faceted look.

use sc_portrait::dna::{founder, ORIGINS};
use sc_portrait::measure::{face, MEASURES, MENTON, SELLION};
use sc_portrait::person::{look_of, Lived};
use sc_portrait::{build, morph_test, real, Head, Look, LODS};
use std::path::Path;
use std::sync::Once;

static REAL: Once = Once::new();

/// The head and the files of the real look from public/portrait; None where they are not there.
fn head() -> Option<Head> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../public/portrait");
    let bytes = std::fs::read(dir.join("head.bin.zst")).ok()?;
    REAL.call_once(|| {
        for entry in std::fs::read_dir(dir.join("real")).expect("the folder of the real look") {
            let path = entry.unwrap().path();
            let name = format!("real/{}", path.file_name().unwrap().to_str().unwrap());
            if name.ends_with(".webp") || name.ends_with(".png") {
                real::name(&name);
            } else {
                real::put(&name, std::fs::read(&path).unwrap());
            }
        }
        real::set_real(Some("real".to_string()));
    });
    Some(Head::load(&bytes).expect("the head"))
}

/// A founder of the pool England draws from, as examples/sample.rs founds them (SplitMix64).
fn person(k: u32, female: bool, age: f32) -> Look {
    let r: Vec<u64> = (0..68u64)
        .map(|i| {
            let mut z = (8000 + k as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(i.wrapping_mul(0xBF58_476D_1CE4_E5B9)).wrapping_add(1);
            z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
            z ^ (z >> 31)
        })
        .collect();
    let pool = ORIGINS.iter().position(|o| *o == "Gallia").unwrap() as u8;
    let genes = founder(pool, |i| r[i as usize]).bytes();
    look_of(&genes, female, age, 1, "Bauern", 1000.0, 1000.0, 940000 + k, "England", Lived { loss_days: None, rank: Some(0.5), clothes_pct: Some(100.0) })
}

#[test]
fn the_grown_of_england_have_faces_of_human_measure() {
    // Until round 69 the women's faces were as long as the men's and broader (face length 0.99 of the men's where
    // the survey's women have 0.92, the cheekbones 152 mm across, two and a half standard deviations over the
    // survey's women), and the men's were short: a woman read as a man. Now every measure the survey has lies
    // within half a standard deviation of its mean for either sex.
    let Some(h) = head() else { return };
    let mut sums = [vec![0.0; MEASURES.len()], vec![0.0; MEASURES.len()]];
    let n = 150;
    for k in 0..2 * n {
        let female = k % 2 == 0;
        let m = face(&h, &morph_test(&h, &person(k, female, [24.0, 35.0, 50.0][(k / 2) as usize % 3])));
        for (s, x) in sums[female as usize].iter_mut().zip(&m) {
            *s += x / n as f32;
        }
    }
    for (k, &(name, men, women)) in MEASURES.iter().enumerate() {
        if men[0] == 0.0 {
            continue;
        }
        for (sex, ours, real) in [("men", sums[0][k], men), ("women", sums[1][k], women)] {
            assert!(((ours - real[0]) / real[1]).abs() < 0.5, "{name}, {sex}: {ours} mm, the survey {} ({})", real[0], real[1]);
        }
        // and a woman's is the smaller, by about as much as in the survey
        let (share, real) = (sums[1][k] / sums[0][k], women[0] / men[0]);
        assert!(share < 1.0 && (share - real).abs() < 0.06, "{name}: women {share} of men, the survey {real}");
    }
}

/// The brow as the builder made it and as MakeHuman's card lies on the same head (the binding of real_look.rs
/// `mh_hair2`), per corner of its triangles: how far the builder moved it, in millimetres, in the head's own
/// frame (the bust's lean taken out by two points of the skin), and where it stands along the eye.
fn brow_moved(h: &Head, p: &Look) -> Vec<([f32; 3], f32)> {
    let pp = morph_test(h, p);
    let out = build(h, p, 1);
    let idx = &h.parts["body"][LODS - 1];
    // the skin: its triangles' corners in the order of the head's own list (a strip that closes the lips after them)
    let skin = out.surfaces.iter().find(|s| s.pos.len() >= idx.len() && s.tex.as_deref().is_some_and(|t| t.contains("skin"))).expect("the skin");
    let at = |v: usize| skin.pos[idx.iter().position(|&i| i as usize == v).unwrap()];
    // the lean: the angle about the axis from ear to ear between the line sellion to menton as built and as morphed
    let dir = |a: [f32; 3], b: [f32; 3]| (b[2] - a[2]).atan2(b[1] - a[1]);
    let lean = dir(pp[SELLION], pp[MENTON]) - dir(at(SELLION), at(MENTON));
    let (cs, sn) = (lean.cos(), lean.sin());
    let rows = real::rows("real/eyebrow001.txt").expect("the brow's card");
    let (nv, nt) = (rows[0][0] as usize, rows[0][1] as usize);
    let (mut lo, mut hi) = ([[f32::MAX; 3]; 2], [[f32::MIN; 3]; 2]);
    for f in &rows[1..=nv] {
        for &i in &f[..3] {
            for a in 0..3 {
                for (k, q) in [h.base[i as usize], pp[i as usize]].iter().enumerate() {
                    lo[k][a] = lo[k][a].min(q[a]);
                    hi[k][a] = hi[k][a].max(q[a]);
                }
            }
        }
    }
    let card: Vec<[f32; 3]> = rows[1..=nv]
        .iter()
        .map(|f| std::array::from_fn(|a| (0..3).map(|k| f[3 + k] * pp[f[k] as usize][a]).sum::<f32>() + f[6 + a] * (hi[1][a] - lo[1][a]) / (hi[0][a] - lo[0][a]).max(1e-4)))
        .collect();
    let brow = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("eyebrow"))).expect("the brow");
    assert_eq!(brow.pos.len(), 3 * nt);
    let anchor = at(SELLION);
    rows[1 + nv..1 + nv + nt]
        .iter()
        .flat_map(|f| f[..3].to_vec())
        .zip(&brow.pos)
        .map(|(v, q)| {
            let (dy, dz) = (q[1] - anchor[1], q[2] - anchor[2]);
            let back = [q[0] - anchor[0], dy * cs - dz * sn, dz * cs + dy * sn];
            let was = card[v as usize];
            (std::array::from_fn(|a| 100.0 * (back[a] - (was[a] - pp[SELLION][a]))), was[0].abs())
        })
        .collect()
}

#[test]
fn a_woman_of_england_wears_her_brows_higher_and_narrower_than_makehuman_draws_them() {
    // MakeHuman's brow lies on the rim of the eye's socket, its upper edge 17 mm above the line through the eyes'
    // inner corners over the pupil; a young woman's lies at 19.8 mm (Matros, Garcia & Yaremchuk 2009). Low and
    // broad over the eye it made the women read as men, and as glowering (until round 69).
    let Some(h) = head() else { return };
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    for k in 0..6 {
        // a man's brow, and a child's, lie where MakeHuman's card lies: which also says that the lean is taken out
        for p in [person(2 * k + 1, false, 35.0), person(2 * k, true, 8.0)] {
            let most = brow_moved(&h, &p).iter().map(|(d, _)| d.iter().map(|x| x.abs()).fold(0.0, f32::max)).fold(0.0, f32::max);
            assert!(most < 0.05, "person {k}: moved by {most} mm");
        }
        let moved = brow_moved(&h, &person(2 * k, true, 35.0));
        // every corner goes up; on the average by the table's lift, and nowhere sideways
        let up = moved.iter().map(|(d, _)| d[1]).sum::<f32>() / moved.len() as f32;
        let (least, most) = (set.brow_lift[0].iter().copied().fold(f32::MAX, f32::min), set.brow_lift[0].iter().copied().fold(0.0, f32::max));
        assert!(up > least - 0.3 && up < most + 0.3, "woman {k}: up by {up} mm");
        let side = moved.iter().map(|(d, _)| d[0].abs()).fold(0.0, f32::max);
        assert!(side < 1.0 && moved.iter().all(|(d, _)| d[1] > 0.0), "woman {k}: sideways by {side} mm");
        // the band is narrower: its upper corners go up less than its lower ones, by the band's own breadth
        let (mut high, mut low) = (f32::MIN, f32::MAX);
        for (d, _) in &moved {
            high = high.max(d[1]);
            low = low.min(d[1]);
        }
        assert!(high - low > 1.0 && high - low < 6.0, "woman {k}: {low} to {high} mm");
        if std::env::var("SHOW").is_ok() {
            println!("woman {k}: up {up:.2} mm on the average, {low:.2} to {high:.2}, sideways {side:.2}");
        }
    }
}
