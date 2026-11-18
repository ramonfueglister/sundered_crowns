//! Looks (Ramon, 30.10.2026: CK3-like portraits, drawn first in the browser
//! Portrait-Werkstatt, https://claude.ai/artifact/JebbURXz29FK155RntzXLL):
//! every person carries 50 genes of two alleles, one byte each, 100 bytes in
//! all (34 and 68 up to round 111); what shows is the mean of the two. A child takes one allele of each
//! gene from either parent, plus a small mutation, as in the Werkstatt. The
//! face is drawn from them by apoleia-portrait (sim/portrait); the
//! simulation does nothing else with them.
//!
//! Status `implementiert`. The genes are a design choice (the morph targets
//! and colours of the MakeHuman base mesh the portraits use), not a model
//! of human genetics: no dominance, no linkage, independent genes.

/// Genes per person.
pub const NG: usize = 50;
/// How many of them are Apoleia's (the first: a founder's and a child's draws for them are as they were).
pub const NG_APOLEIA: usize = 34;

/// The genes in their byte order; the builder reads them in the same
/// order (look.rs; a test checks that both lists agree).
pub const GENES: [&str; NG] = [
    // face, each one MakeHuman morph target pair (decr/incr)
    "headW", "headH", "headF", "fore", "jaw", "chin", "chinH", "cheek", "noseL", "noseW", "hump", "tip", "eyeS", "eyeD", "brow",
    "browA", "ear", "earF", "mouthW", "lips", "neck",
    // body and base type (MakeHuman macro targets)
    "weight", "muscle", "typA", "typB", "typC",
    // colours
    "skin", "hairL", "hairR", "eye",
    // dispositions
    "curl", "bald", "grey", "beardG",
    // (round 112) more of the face, for a dress with a table (dress.rs `DressSet::loads`, `brow_gene`,
    // `flush_gene`; Apoleia's dress draws nothing from them): what Apoleia's 21 genes of the face move together or
    // not at all. The head's depth; the chin from pointed to broad; the eyes' tilt, the fold of the
    // upper lid, how high the eyes lie and how deep; how high the mouth lies, its corners, which lip is the fuller
    // and how far the mouth stands forward; the nose's bridge from narrow to broad; the neck's length; the bags
    // under the eyes; the folds from the nose's wings to the mouth's corners; how heavy the brows are; and
    // how much blood shows in the cheeks. All drawn around the middle, in every pool.
    "headD", "chinW", "eyeT", "lid", "eyeH", "eyeP", "mouthH", "mouthC", "lipB", "mouthF", "noseB", "neckL", "bags", "folds", "browT", "ruddy",
];

/// Two alleles per gene.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Dna {
    pub a: [u8; NG],
    pub b: [u8; NG],
}

impl Dna {
    /// The bytes, first allele then second.
    pub fn bytes(&self) -> [u8; 2 * NG] {
        let mut out = [0; 2 * NG];
        out[..NG].copy_from_slice(&self.a);
        out[NG..].copy_from_slice(&self.b);
        out
    }

    pub fn hash(&self) -> u64 {
        xxhash_rust::xxh3::xxh3_64(&self.bytes())
    }
}

/// Where the founders' looks come from: the pools of genes. The first seven are the regions of Apoleia's
/// Werkstatt (`ROMAN`), unchanged; the pools after them (round 111) are the rest of the world, so that the game can
/// found people of every part of it. Which culture draws from which pool is the game's (src/sim/people/pools.ts);
/// a place without a known culture still draws by `origin`.
pub const ORIGINS: [&str; 23] = [
    "Italia", "Gallia", "Germania", "Graecia", "Syria", "Aegyptus", "Africa",
    "Maghreb", "Arabia", "Iran", "Horn", "Guinea", "Kalahari", "Steppe", "Siberia", "China", "Tibet", "Hindustan", "Deccan", "Indochina", "Oceania", "Australia", "America",
];
/// How many of the pools are Apoleia's.
pub const ROMAN: usize = 7;
pub const ITALIA: u8 = 0;
pub const GALLIA: u8 = 1;
pub const GERMANIA: u8 = 2;
pub const GRAECIA: u8 = 3;
pub const SYRIA: u8 = 4;
pub const AEGYPTUS: u8 = 5;
pub const AFRICA: u8 = 6;

/// PLACEHOLDER (unsourced, the Werkstatt's): per origin the range a
/// founder's alleles of these genes are drawn from, evenly; every other gene
/// is drawn around the middle (`founder`).
const RANGES: [&[(&str, u8, u8)]; 23] = [
    &[("skin", 40, 130), ("hairL", 10, 120), ("hairR", 0, 60), ("eye", 0, 140), ("curl", 40, 150), ("typA", 0, 50), ("typB", 0, 40), ("typC", 170, 255)],
    &[("skin", 0, 80), ("hairL", 50, 220), ("hairR", 20, 170), ("eye", 50, 255), ("curl", 0, 100), ("typA", 0, 20), ("typB", 0, 30), ("typC", 210, 255)],
    &[("skin", 0, 60), ("hairL", 90, 240), ("hairR", 10, 150), ("eye", 100, 255), ("curl", 0, 80), ("typA", 0, 15), ("typB", 0, 30), ("typC", 220, 255)],
    &[("skin", 50, 130), ("hairL", 0, 90), ("hairR", 0, 50), ("eye", 0, 110), ("curl", 60, 170), ("typA", 0, 50), ("typB", 0, 50), ("typC", 170, 255)],
    &[("skin", 70, 160), ("hairL", 0, 60), ("hairR", 0, 40), ("eye", 0, 80), ("curl", 60, 190), ("typA", 0, 60), ("typB", 20, 100), ("typC", 140, 230)],
    &[("skin", 100, 190), ("hairL", 0, 50), ("hairR", 0, 30), ("eye", 0, 60), ("curl", 100, 220), ("typA", 60, 170), ("typB", 0, 60), ("typC", 90, 200)],
    &[("skin", 110, 240), ("hairL", 0, 40), ("hairR", 0, 20), ("eye", 0, 50), ("curl", 140, 255), ("typA", 120, 255), ("typB", 0, 30), ("typC", 30, 140)],
    // (round 111) The rest of the world. PLACEHOLDER, by what is commonly described, not from tables read for this:
    // the skin after the map of skin reflectance by people in Jablonski & Chaplin 2000 (Journal of Human Evolution
    // 39: 57-106; from memory of its table, the paper could not be reached from here), set on the skin's seven
    // colours by eye; hair and eyes dark outside Europe and its eastern neighbours; the hair's form straight in
    // east Asia, Siberia and the Americas, wavy from the Mediterranean to India, tightly curled south of the
    // Sahara; the three base types of MakeHuman mixed by eye on rendered heads (its east Asian head in full is a
    // caricature: at most four fifths of it). Beards grow thinner and heads go bald less often in east Asia and
    // the Americas ("beardG", "bald"; by common description). No shift of the face's genes (`FACE_SHIFT`):
    // Howells' measures of these peoples' skulls could not be reached from here.
    // Maghreb: the Mediterranean's south coast west of Egypt, the Sahara's Berbers
    &[("skin", 70, 150), ("hairL", 0, 50), ("hairR", 0, 30), ("eye", 0, 90), ("curl", 80, 190), ("typA", 15, 60), ("typB", 0, 25), ("typC", 180, 245)],
    // Arabia: the peninsula
    &[("skin", 95, 170), ("hairL", 0, 35), ("hairR", 0, 20), ("eye", 0, 50), ("curl", 70, 180), ("typA", 15, 65), ("typB", 0, 25), ("typC", 175, 240)],
    // Iran: Anatolia, the Caucasus, Persia
    &[("skin", 55, 135), ("hairL", 0, 60), ("hairR", 0, 35), ("eye", 0, 110), ("curl", 50, 160), ("typA", 0, 30), ("typB", 5, 45), ("typC", 190, 250)],
    // Horn: Nubia, Ethiopia, Somalia
    &[("skin", 150, 215), ("hairL", 0, 20), ("hairR", 0, 10), ("eye", 0, 35), ("curl", 185, 250), ("typA", 110, 190), ("typB", 0, 20), ("typC", 70, 140)],
    // Guinea: west, central and southern Africa
    &[("skin", 175, 240), ("hairL", 0, 15), ("hairR", 0, 10), ("eye", 0, 25), ("curl", 228, 255), ("typA", 200, 255), ("typB", 0, 15), ("typC", 0, 45)],
    // Kalahari: the Khoisan
    &[("skin", 110, 165), ("hairL", 0, 15), ("hairR", 0, 10), ("eye", 0, 30), ("curl", 240, 255), ("typA", 150, 215), ("typB", 40, 90), ("typC", 0, 30)],
    // Steppe: the Turkic peoples of the steppe and of central Asia
    &[("skin", 45, 120), ("hairL", 0, 70), ("hairR", 0, 35), ("eye", 0, 110), ("curl", 10, 90), ("typA", 0, 15), ("typB", 80, 160), ("typC", 100, 180), ("beardG", 50, 150), ("bald", 0, 200)],
    // Siberia: Mongols, the peoples of Siberia and of the Arctic
    &[("skin", 55, 120), ("hairL", 0, 25), ("hairR", 0, 15), ("eye", 0, 35), ("curl", 0, 40), ("typA", 0, 10), ("typB", 170, 235), ("typC", 45, 100), ("beardG", 20, 110), ("bald", 0, 160)],
    // China: with Korea and Japan
    &[("skin", 35, 105), ("hairL", 0, 25), ("hairR", 0, 15), ("eye", 0, 35), ("curl", 0, 35), ("typA", 0, 10), ("typB", 155, 225), ("typC", 55, 115), ("beardG", 20, 110), ("bald", 0, 160)],
    // Tibet: the highlands
    &[("skin", 75, 140), ("hairL", 0, 25), ("hairR", 0, 15), ("eye", 0, 35), ("curl", 0, 45), ("typA", 0, 15), ("typB", 140, 205), ("typC", 70, 130), ("beardG", 20, 110), ("bald", 0, 160)],
    // Hindustan: northern India
    &[("skin", 90, 170), ("hairL", 0, 30), ("hairR", 0, 15), ("eye", 0, 50), ("curl", 40, 150), ("typA", 10, 45), ("typB", 10, 50), ("typC", 180, 245)],
    // Deccan: southern India, Ceylon
    &[("skin", 140, 215), ("hairL", 0, 15), ("hairR", 0, 10), ("eye", 0, 30), ("curl", 60, 170), ("typA", 30, 80), ("typB", 10, 40), ("typC", 150, 225)],
    // Indochina: south-east Asia with its islands
    &[("skin", 90, 160), ("hairL", 0, 20), ("hairR", 0, 10), ("eye", 0, 30), ("curl", 10, 80), ("typA", 10, 45), ("typB", 125, 195), ("typC", 60, 120), ("beardG", 20, 110), ("bald", 0, 160)],
    // Oceania: Polynesia
    &[("skin", 105, 165), ("hairL", 0, 30), ("hairR", 0, 15), ("eye", 0, 30), ("curl", 60, 170), ("typA", 20, 60), ("typB", 90, 150), ("typC", 90, 150)],
    // Australia (MakeHuman has no head of its own for it: its African and its European one, half and half)
    &[("skin", 180, 235), ("hairL", 0, 40), ("hairR", 0, 20), ("eye", 0, 30), ("curl", 100, 200), ("typA", 110, 175), ("typB", 0, 25), ("typC", 85, 145)],
    // America: both continents
    &[("skin", 100, 165), ("hairL", 0, 15), ("hairR", 0, 10), ("eye", 0, 30), ("curl", 0, 40), ("typA", 0, 15), ("typB", 115, 185), ("typC", 75, 135), ("beardG", 20, 110), ("bald", 0, 160)],
];

/// Per origin a shift of the founders' face genes away
/// from the middle (in allele units; one within-group sd of a measure is
/// about 24), fitted to craniometric means (Howells, 1973, 1989, 1995) by
/// face_shift.py (Howells summary of NORSE, ZALAVAR, BERG, EGYPT, data via
/// web.utk.edu/~auerbach/HOWL.htm, Internet Archive copy of 2024-11-18).
// Italia, Gallia, Germania, Graecia, Syria, Aegyptus, Africa; Germania from
// NORSE + BERG, Aegyptus from EGYPT, the rest PLACEHOLDER by latitude;
// headW, headH, noseW solved together against the base types' own effect
const FACE_SHIFT: [&[(&str, i32)]; 23] = [
    &[("noseL", -1), ("eyeS", 0), ("eyeD", 4), ("headW", 7), ("headH", -1), ("noseW", 3)],
    &[("noseL", -2), ("eyeS", 1), ("eyeD", 9), ("headW", 17), ("headH", -1), ("noseW", 2)],
    &[("noseL", 1), ("eyeS", 3), ("eyeD", 6), ("headW", 15), ("headH", 2), ("noseW", 2)],
    &[("noseL", 0), ("eyeS", -1), ("eyeD", -1), ("headW", -2), ("headH", 0), ("noseW", 6)],
    &[("noseL", 0), ("eyeS", -1), ("eyeD", -4), ("headW", -10), ("headH", 2), ("noseW", 9)],
    &[("noseL", 1), ("eyeS", -2), ("eyeD", -11), ("headW", -21), ("headH", 1), ("noseW", -2)],
    &[("noseL", 0), ("eyeS", -1), ("eyeD", -3), ("headW", -6), ("headH", -3), ("noseW", -21)],
    // (round 111) the rest of the world: none, see `RANGES`
    &[], &[], &[], &[], &[], &[], &[], &[], &[], &[], &[], &[], &[], &[], &[], &[],
];

/// The origin of a place. PLACEHOLDER (open): coarse boxes around the
/// Werkstatt's regions, drawn along coasts and rivers by eye.
pub fn origin(lon: f64, lat: f64) -> u8 {
    if lat < 31.6 && lon > 24.5 && lon < 36.0 {
        return AEGYPTUS;
    }
    if lon >= 34.5 && lat < 38.5 {
        return SYRIA;
    }
    // North Africa below Spain's south coast, Sicily and the Peloponnese
    let africa_north = if lon < -1.0 {
        36.0
    } else if lon < 1.5 {
        36.3
    } else if lon < 11.6 {
        37.6
    } else if lon < 16.0 {
        35.6
    } else {
        33.5
    };
    if lon < 24.5 && lat < africa_north {
        return AFRICA;
    }
    if lat >= 47.0 && lon > 5.5 {
        return GERMANIA;
    }
    if lon < 3.5 && lat < 43.8 {
        return ITALIA; // Hispania
    }
    if lon < 7.5 {
        return GALLIA; // and Britannia
    }
    if lon < 19.0 && lat < 47.0 {
        return ITALIA;
    }
    GRAECIA
}

/// A founder of the first generation from `origin`, with the random bits
/// `r(k)` for k = 0, 1, … (one draw per allele).
pub fn founder(origin: u8, r: impl Fn(u32) -> u64) -> Dna {
    let ranges = RANGES[(origin as usize).min(RANGES.len() - 1)];
    let shifts = FACE_SHIFT[(origin as usize).min(FACE_SHIFT.len() - 1)];
    let mut d = Dna { a: [0; NG], b: [0; NG] };
    for (i, name) in GENES.iter().enumerate() {
        for (k, out) in [&mut d.a[i], &mut d.b[i]].into_iter().enumerate() {
            let h = r((2 * i + k) as u32);
            *out = if let Some(&(_, lo, hi)) = ranges.iter().find(|g| g.0 == *name) {
                lo + (h % (hi as u64 - lo as u64 + 1)) as u8
            } else if *name == "bald" || *name == "grey" {
                h as u8
            } else {
                let shift = shifts.iter().find(|g| g.0 == *name).map_or(0, |g| g.1);
                (around_middle(h) as i32 + shift).clamp(0, 255) as u8
            };
        }
    }
    d
}

/// 128 with a spread of about 34 (the Werkstatt's 48 × 1.22 times the
/// sd of a centred sum of four uniforms), in integers: the sum of four
/// random bytes, centred and scaled.
fn around_middle(h: u64) -> u8 {
    let sum: i64 = (0..4).map(|k| (h >> (8 * k)) as u8 as i64).sum();
    (128 + (sum - 510) * 48 * 122 / (255 * 100)).clamp(0, 255) as u8
}

/// A child of `f` and `m`: per gene one allele from either parent, each
/// moved by a mutation of about ±5 (at most ±15), with the random bits
/// `r(k)` for k = 0, 1, ….
pub fn child(f: &Dna, m: &Dna, r: impl Fn(u32) -> u64) -> Dna {
    let mut d = Dna { a: [0; NG], b: [0; NG] };
    for i in 0..NG {
        let h = r(i as u32);
        let from_f = if h & 1 == 0 { f.a[i] } else { f.b[i] };
        let from_m = if h & 2 == 0 { m.a[i] } else { m.b[i] };
        d.a[i] = (from_f as i32 + mutation(h >> 8)).clamp(0, 255) as u8;
        d.b[i] = (from_m as i32 + mutation(h >> 32)).clamp(0, 255) as u8;
    }
    d
}

/// round((u1 + u2 + u3 − 1.5) × 10) for three uniforms, from three bytes.
fn mutation(h: u64) -> i32 {
    let sum: i32 = (0..3).map(|k| (h >> (8 * k)) as u8 as i32).sum();
    let x = sum * 20 - 7650; // (sum / 255 − 1.5) × 10 × 510
    if x >= 0 {
        (x + 255) / 510
    } else {
        (x - 255) / 510
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use xxhash_rust::xxh3::xxh3_64;

    #[test]
    fn both_gene_lists_agree() {
        assert_eq!(crate::look::GENES, GENES);
        assert_eq!(crate::look::NG, NG);
    }

    fn bits(seed: u64) -> impl Fn(u32) -> u64 {
        move |k| xxh3_64(&[seed.to_le_bytes(), (k as u64).to_le_bytes()].concat())
    }

    #[test]
    fn founders_follow_their_origin() {
        let skin = GENES.iter().position(|g| *g == "skin").unwrap();
        let mean = |o: u8| (0..400u64).map(|s| founder(o, bits(s)).a[skin] as f64).sum::<f64>() / 400.0;
        // the ranges' middles: Germania 30, Africa 175
        assert!((mean(GERMANIA) - 30.0).abs() < 5.0);
        assert!((mean(AFRICA) - 175.0).abs() < 8.0);
        for s in 0..50 {
            let d = founder(ITALIA, bits(s));
            assert!((40..=130).contains(&d.a[skin]) && (40..=130).contains(&d.b[skin]));
        }
    }

    #[test]
    fn middle_genes_spread_as_in_the_werkstatt() {
        let v: Vec<f64> = (0..20_000u64).map(|s| around_middle(bits(s)(0)) as f64).collect();
        let m = v.iter().sum::<f64>() / v.len() as f64;
        let sd = (v.iter().map(|x| (x - m) * (x - m)).sum::<f64>() / v.len() as f64).sqrt();
        assert!((m - 128.0).abs() < 1.0, "{m}");
        assert!((sd - 48.0 * 1.22 / 3f64.sqrt()).abs() < 1.5, "{sd}");
    }

    #[test]
    fn children_take_one_allele_from_each_parent() {
        let (f, m) = (founder(GALLIA, bits(1)), founder(AFRICA, bits(2)));
        for s in 0..200 {
            let c = child(&f, &m, bits(100 + s));
            for i in 0..NG {
                let near = |x: u8, ys: [u8; 2]| ys.iter().any(|&y| (x as i32 - y as i32).abs() <= 15);
                assert!(near(c.a[i], [f.a[i], f.b[i]]) && near(c.b[i], [m.a[i], m.b[i]]));
            }
        }
        let ms: Vec<i32> = (0..30_000u64).map(|s| mutation(bits(s)(0))).collect();
        assert!(ms.iter().all(|x| x.abs() <= 15));
        let sd = (ms.iter().map(|&x| (x * x) as f64).sum::<f64>() / ms.len() as f64).sqrt();
        assert!((sd - 5.0).abs() < 0.3, "{sd}");
    }

    #[test]
    fn origins_of_known_places() {
        for (lon, lat, o) in [
            (12.5, 41.9, ITALIA),   // Roma
            (14.3, 37.5, ITALIA),   // Sicilia
            (-3.7, 40.4, ITALIA),   // Hispania (Toledo)
            (-6.29, 36.53, ITALIA), // Gades, north of the strait
            (2.35, 48.85, GALLIA),  // Lutetia
            (-0.1, 51.5, GALLIA),   // Londinium
            (6.96, 50.94, GERMANIA), // Colonia Agrippina
            (16.4, 48.2, GERMANIA), // Vindobona
            (23.7, 37.98, GRAECIA), // Athenae
            (28.98, 41.0, GRAECIA), // Byzantium
            (27.3, 37.9, GRAECIA),  // Ephesus
            (36.2, 36.2, SYRIA),    // Antiochia
            (35.2, 31.8, SYRIA),    // Hierosolyma
            (29.9, 31.2, AEGYPTUS), // Alexandria
            (10.3, 36.85, AFRICA),  // Carthago
            (3.06, 36.77, AFRICA),  // Icosium
            (-5.8, 35.8, AFRICA),   // Tingis
            (20.1, 32.1, AFRICA),   // Berenice
        ] {
            assert_eq!(ORIGINS[origin(lon, lat) as usize], ORIGINS[o as usize], "{lon} {lat}");
        }
    }
}
