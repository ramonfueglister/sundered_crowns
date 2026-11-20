//! People of rank in England's dress of 1356 (round 144): the court's cloth, buttons of metal, mi-parti, and a
//! crown on a crowned head (the real look: files of its own, see tests/common).

mod common;

use common::{head, person, person_of};
use sc_portrait::dress::{Dress, COURT_1356, CROWNED_1356, ENGLAND_1356};
use sc_portrait::fasten::Fasten;
use sc_portrait::look::{BAUER, DECURIO, KAISER, SENATOR};
use sc_portrait::{build, Surface};

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

type V3 = [f32; 3];

fn dist(a: &V3, b: &V3) -> f32 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}

/// How strong a colour is: its largest part over its smallest (linear light).
fn strength(c: &[f32; 3]) -> f32 {
    c.iter().cloned().fold(f32::MIN, f32::max) / c.iter().cloned().fold(f32::MAX, f32::min).max(1e-4)
}

fn mean(cols: impl Iterator<Item = [f32; 3]>) -> [f32; 3] {
    let (mut sum, mut n) = ([0f32; 3], 0f32);
    for c in cols {
        (sum, n) = ([sum[0] + c[0], sum[1] + c[1], sum[2] + c[2]], n + 1.0);
    }
    sum.map(|s| s / n.max(1.0))
}

/// The surfaces of metal, of polished stone and of pearl: without an image, by how the builder says they shine.
fn pieces(s: &[Surface]) -> (Vec<&Surface>, Vec<&Surface>, Vec<&Surface>) {
    let plain = |f: &dyn Fn(&Surface) -> bool| s.iter().filter(|s| s.tex.is_none() && !s.pos.is_empty() && f(s)).collect::<Vec<_>>();
    (plain(&|s| s.mat.metal == 1.0), plain(&|s| s.mat.metal == 0.0 && s.mat.rough < 0.2), plain(&|s| s.mat.metal == 0.0 && s.mat.rough >= 0.2 && s.mat.rough < 0.5))
}

#[test]
fn who_is_of_rank_wears_the_courts_dress_and_nobody_else() {
    // Until round 144 England's table knew one estate: a king stood in a villager's russet gown, since the game
    // hands over every person as one of the common people and the table did not ask.
    assert_eq!(person(7, false, 30.0).stand, BAUER);
    assert_eq!(person(7, false, 30.0).dress, Dress::England1356);
    assert_eq!((person_of(7, false, 30.0, 3).stand, person_of(7, false, 30.0, 3).dress), (SENATOR, Dress::Court1356));
    assert_eq!((person_of(7, false, 30.0, 2).stand, person_of(7, false, 30.0, 2).dress), (DECURIO, Dress::Court1356));
    assert_eq!((person_of(7, false, 30.0, 4).stand, person_of(7, false, 30.0, 4).dress), (KAISER, Dress::Crowned1356));
    // every other dress knows one estate: the plain dress of 1356 and Apoleia's Roman dress stay what they were
    for st in [BAUER, DECURIO, SENATOR, KAISER] {
        assert_eq!(Dress::Plain1356.ranked(st), Dress::Plain1356);
        assert_eq!(Dress::Roman.ranked(st), Dress::Roman);
    }
    assert_eq!(Dress::England1356.ranked(BAUER), Dress::England1356);
    // the court's table is England's in all that is of the face, the hair and the gown's cut: the stage lights
    // it by the same name
    let (e, c, k) = (&ENGLAND_1356, &COURT_1356, &CROWNED_1356);
    assert_eq!((c.key, k.key), (e.key, e.key));
    assert_eq!((c.gown, c.gown_cut, c.under, c.linen, c.hair, c.hood), (e.gown, e.gown_cut, e.under, e.linen, e.hair, e.hood));
    assert!(c.origins.is_empty() && k.origins.is_empty(), "no origin names the court: a person's stand does");
    assert!(e.buttons.is_empty() && e.crown.is_empty() && e.parted.iter().all(|p| !p), "the common people's table has none of it");
    // the court's cloth is strongly dyed: each of its wools at least twice as strong in its strongest part as in
    // its weakest, and the six together twice as strong as the common people's (whose dyed ones are 1.5 to 2.1
    // times, the undyed less)
    let strong = |hex: &str| strength(&[1, 3, 5].map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap() as f32 / 255.0));
    let all = |d: &sc_portrait::dress::DressSet| d.wool.iter().map(|w| strong(w)).sum::<f32>() / d.wool.len() as f32;
    for w in c.wool {
        assert!(strong(w) >= 2.0, "{w}: {}", strong(w));
    }
    assert!(all(c) > 1.9 * all(e) && all(e) < 1.7, "the court's {} against {}", all(c), all(e));
    // most of the court buttons the gown, and three men in ten wear it of two cloths; a crowned head does not
    let count = |row: &[Fasten; 10], kind: Fasten| row.iter().filter(|f| **f == kind).count();
    assert_eq!((count(&c.fastens[0], Fasten::Buttons), count(&c.fastens[0], Fasten::Laced), count(&c.fastens[1], Fasten::Buttons)), (6, 3, 8));
    assert_eq!((c.parted.iter().filter(|p| **p).count(), k.parted.iter().filter(|p| **p).count()), (3, 0));
    assert!(!c.parted_of(true, 30.0, 10_000_000) && !c.parted_of(false, 12.0, 10_000_000) && c.parted_of(false, 30.0, 10_000_000));
    // and each of the two tables names what it was made after
    assert!(c.sources.len() >= 5 && k.sources.len() == c.sources.len());
}

#[test]
fn the_courts_gown_is_of_strong_cloth_with_buttons_of_metal_and_some_of_two_cloths() {
    let Some(h) = head() else { return };
    let d = &COURT_1356;
    let (mut buttoned, mut parted, mut seen, mut strong) = (0, 0, 0, (0f32, 0f32));
    for k in 0..40u32 {
        let (female, age) = (k % 2 == 0, [24.0f32, 35.0, 50.0, 17.0][(k / 2) as usize % 4]);
        let (low, high) = (person(k, female, age), person_of(k, female, age, 3));
        let (a, b) = (build(&h, &low, 1), build(&h, &high, 1));
        let gown = |s: &'_ [Surface]| -> usize { s.iter().position(|s| s.tex.as_deref().is_some_and(|t| t.contains("/cloth_cote.") || t.contains("/cloth_kirtle."))).unwrap_or_else(|| panic!("person {k}: no gown")) };
        let (ga, gb) = (&a.surfaces[gown(&a.surfaces)], &b.surfaces[gown(&b.surfaces)]);
        // the same gown, in another cloth
        assert_eq!(ga.tex, gb.tex, "person {k}: the gown's cut is the common people's");
        let (ca, cb) = (mean(ga.col.iter().copied()), mean(gb.col.iter().copied()));
        // (in linear light, as the builder hands it over; the common people's wools are 1.5 to 5 times there)
        assert!(strength(&cb) > 3.0 && (0..3).any(|i| (cb[i] - ca[i]).abs() > 0.02), "person {k}: the court's cloth {cb:?} against {ca:?}");
        (strong.0, strong.1) = (strong.0 + strength(&ca), strong.1 + strength(&cb));
        // buttons of metal: balls of 80 triangles each, in a surface of their own without an image
        let (metal, stones, pearls) = pieces(&b.surfaces);
        assert!(stones.is_empty() && pearls.is_empty(), "person {k}: no stones without a crown");
        assert!(pieces(&a.surfaces).0.is_empty(), "person {k}: the common people have no metal");
        let kind = d.fasten_of(female, age, high.seed);
        if kind == Fasten::Buttons && !metal.is_empty() {
            buttoned += 1;
            assert_eq!(metal.len(), 1);
            assert_eq!(metal[0].pos.len() % 240, 0, "person {k}: whole buttons");
            assert!(metal[0].pos.len() / 240 >= 4, "person {k}: {} buttons", metal[0].pos.len() / 240);
            let gilt = mean(metal[0].col.iter().copied());
            assert!(gilt[0] > gilt[1] && gilt[1] > 2.0 * gilt[2], "person {k}: gilt, {gilt:?}");
        } else if kind != Fasten::Buttons {
            assert!(metal.is_empty(), "person {k}: metal without buttons");
        }
        // mi-parti: the gown's wearer's right and left of two cloths (the gown's own middle: the picture's is the pose's)
        let mid = gb.pos.iter().map(|q| q[0]).sum::<f32>() / gb.pos.len() as f32;
        let half = |s: &Surface, right: bool| mean(s.pos.iter().zip(&s.col).filter(|(q, _)| (q[0] - mid).abs() > 0.3 && (q[0] < mid) == right).map(|(_, c)| *c));
        let apart = |s: &Surface| {
            let (l, r) = (half(s, false), half(s, true));
            (0..3).map(|i| (l[i] - r[i]).abs()).fold(0.0, f32::max) / (0..3).map(|i| l[i].max(r[i])).fold(1e-4, f32::max)
        };
        if d.parted_of(female, age, high.seed) {
            parted += 1;
            assert!(apart(gb) > 0.3, "person {k}: two cloths, {}", apart(gb));
        } else {
            assert!(apart(gb) < 0.12, "person {k}: one cloth, {}", apart(gb));
        }
        assert!(apart(ga) < 0.12, "person {k}: the common people's gown is of one cloth, {}", apart(ga));
        seen += 1;
    }
    if show() {
        println!("{seen} people of rank: {buttoned} with buttons of metal showing, {parted} in mi-parti; a gown's colour {:.2} times as strong in its strongest part as in its weakest, the common people's {:.2}", strong.1 / seen as f32, strong.0 / seen as f32);
    }
    assert!(strong.1 > 1.5 * strong.0, "the court's cloth {} against {}", strong.1, strong.0);
    assert!(buttoned >= 12 && parted >= 2, "{buttoned} buttoned, {parted} in two cloths");
}

#[test]
fn a_crowned_head_wears_a_crown_of_gold_on_the_hair_and_nothing_else_on_it() {
    let Some(h) = head() else { return };
    let d = &CROWNED_1356;
    let mut worst = (0f32, 0f32, 0f32, f32::MIN);
    for k in 0..24u32 {
        let (female, age) = (k % 2 == 0, [24.0f32, 50.0, 68.0, 13.0, 5.0, 35.0][(k / 2) as usize % 6]);
        let p = person_of(k, female, age, 4);
        let out = build(&h, &p, 1);
        // nothing else on the head
        for name in [d.hood_up, d.hood_back, d.veil, d.veil_back, d.wimple, ENGLAND_1356.fillet, ENGLAND_1356.coif, ENGLAND_1356.hat] {
            assert!(!out.surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains(&format!("/{name}.")))), "person {k}: {name} on a crowned head");
        }
        let (metal, stones, pearls) = pieces(&out.surfaces);
        // the crown's gold is the larger piece of metal (the buttons' the other), its stones and pearls each one surface
        let gold = metal.iter().max_by_key(|s| s.pos.len()).unwrap_or_else(|| panic!("person {k}: no crown"));
        assert!(gold.pos.len() / 3 > 2500, "person {k}: {} triangles of gold", gold.pos.len() / 3);
        assert_eq!((stones.len(), pearls.len()), (1, 1), "person {k}");
        // 64 triangles a stone: twelve on the circlet, six on the large fleurons, six on the small; three pearls
        // on each large one
        assert_eq!((stones[0].pos.len() / 3, pearls[0].pos.len() / 3), (24 * 64, 18 * 64), "person {k}");
        // it is one piece on every head: each stone and pearl lies on the gold (its middle within a centimetre of it)
        for part in stones.iter().chain(&pearls) {
            for ball in part.pos.chunks_exact(192) {
                let mid: V3 = std::array::from_fn(|a| ball.iter().map(|q| q[a]).sum::<f32>() / 192.0);
                let near = gold.pos.iter().map(|q| dist(q, &mid)).fold(f32::MAX, f32::min);
                worst.0 = worst.0.max(near);
                assert!(near < 0.1, "person {k}: a stone {near} off the gold");
            }
        }
        // it sits on the head: its foot over the chin by more than half the head's height, and its fleurons' tips
        // no more than 3 cm over the top the picture is framed by (the skull's top and 1.2 cm: a crown does not
        // make the head smaller in the picture, and the picture has that room over the head)
        let (lo, hi) = gold.pos.iter().fold((f32::MAX, f32::MIN), |(lo, hi), q| (lo.min(q[1]), hi.max(q[1])));
        let high = out.top - out.chin;
        worst.3 = worst.3.max(hi - out.top);
        assert!(lo > out.chin + 0.5 * high && hi < out.top + 0.3 && hi - lo > 0.55 && hi - lo < 1.1, "person {k}: the crown from {lo} to {hi}, the head from {} to {}", out.chin, out.top);
        // and round it: the gold's breadth and depth against the head's height (a grown head is some 15 cm broad
        // and 19 deep on 22 of height)
        let span = |a: usize| gold.pos.iter().fold((f32::MAX, f32::MIN), |(lo, hi), q| (lo.min(q[a]), hi.max(q[a])));
        let (bx, bz) = (span(0).1 - span(0).0, span(2).1 - span(2).0);
        worst.1 = worst.1.max(bx / high);
        worst.2 = worst.2.max(bz / high);
        assert!(bx / high > 0.6 && bx / high < 1.0 && bz / high > 0.7 && bz / high < 1.15, "person {k}: the crown {bx} broad and {bz} deep on a head {high} high");
    }
    if show() {
        println!("a stone's middle off the gold at most {:.3}; the crown at most {:.2} of the head's height broad and {:.2} deep, its tips at most {:.3} over the picture's top", worst.0, worst.1, worst.2, worst.3);
    }
}
