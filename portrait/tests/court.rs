//! People of rank in England's dress of 1356 (round 144): the court's cloth, buttons of metal, mi-parti, and a
//! crown on a crowned head, a circlet on a lady's plaits (round 146) (the real look: files of its own, see
//! tests/common).

mod common;

use common::{head, person, person_of};
use sc_portrait::dress::{Dress, Veil, COURT_1356, CROWNED_1356, ENGLAND_1356};
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

/// A band's foot and top in front, over the face's middle.
fn front_of(band: &Surface, cz: f32) -> (f32, f32) {
    band.pos.iter().filter(|q| q[0].abs() < 0.15 && q[2] > cz).fold((f32::MAX, f32::MIN), |(lo, hi), q| (lo.min(q[1]), hi.max(q[1])))
}

/// Hair through a band, as the fillet's test counts it: round the band's middle in 72 directions, corners of the
/// hair's bundles and strands at the band's height there that stand further out than it.
fn hair_through(surfaces: &[Surface], band: &Surface) -> usize {
    let range = |a: usize| band.pos.iter().fold((f32::MAX, f32::MIN), |(lo, hi), q| (lo.min(q[a]), hi.max(q[a])));
    let mid = [(range(0).0 + range(0).1) / 2.0, (range(2).0 + range(2).1) / 2.0];
    let bin = |q: &V3| (((q[0] - mid[0]).atan2(q[2] - mid[1]).to_degrees() + 180.0) / 5.0).min(71.0) as usize;
    let far = |q: &V3| (q[0] - mid[0]).hypot(q[2] - mid[1]);
    let mut ring = [(f32::MAX, f32::MIN, 0f32); 72];
    for q in &band.pos {
        let r = &mut ring[bin(q)];
        *r = (r.0.min(q[1]), r.1.max(q[1]), r.2.max(far(q)));
    }
    let strands = surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains("_body.") || t.contains("_rope.")));
    strands.flat_map(|s| &s.pos).filter(|q| { let r = ring[bin(q)]; q[1] > r.0 + 0.03 && q[1] < r.1 - 0.03 && far(q) > r.2 }).count()
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
    // the court's table is England's in all that is of the face, the hair and a man's gown: the stage lights
    // it by the same name (round 149: a lady's gown has a cut of its own, wide and low, and no smock in its neck;
    // tests/clothes.rs)
    let (e, c, k) = (&ENGLAND_1356, &COURT_1356, &CROWNED_1356);
    assert_eq!((c.key, k.key), (e.key, e.key));
    assert_eq!((c.gown, c.gown_cut[1], c.under[1], c.linen, c.hair, c.hood), (e.gown, e.gown_cut[1], e.under[1], e.linen, e.hair, e.hood));
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
        // (round 146: a lady's circlet is metal with stones too, on the head, and since round 147 a lord's; the
        // buttons lie under the chin)
        let (metal, stones, pearls) = pieces(&b.surfaces);
        let circlet = usize::from(d.circlet_of(female, age, high.seed).is_some());
        assert!(stones.len() == circlet && pearls.is_empty(), "person {k}: no stones without a crown or a circlet");
        let metal: Vec<&Surface> = metal.into_iter().filter(|s| s.pos.iter().all(|q| q[1] < b.chin)).collect();
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
        // the crown's gold is the largest piece of metal (the buttons' and, since round 145, the mantle's brooches'
        // the others), its stones the larger piece of stone (the brooches' two the other), its pearls one surface
        let gold = metal.iter().max_by_key(|s| s.pos.len()).unwrap_or_else(|| panic!("person {k}: no crown"));
        assert!(gold.pos.len() / 3 > 2500, "person {k}: {} triangles of gold", gold.pos.len() / 3);
        assert_eq!((stones.len(), pearls.len()), (2, 1), "person {k}");
        let stone = *stones.iter().max_by_key(|s| s.pos.len()).unwrap();
        // 64 triangles a stone: twelve on the circlet, six on the large fleurons, six on the small; three pearls
        // on each large one
        assert_eq!((stone.pos.len() / 3, pearls[0].pos.len() / 3), (24 * 64, 18 * 64), "person {k}");
        // it is one piece on every head: each stone and pearl lies on the gold (its middle within a centimetre of it)
        for part in [stone].iter().chain(&pearls) {
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

#[test]
fn a_lady_shows_her_plaits_until_fifty_and_seven_in_ten_of_those_wear_a_circlet() {
    // (round 146) The court's ladies wore the villagers' linen veil. By the pages read a lady's hair is in plaits
    // beside the face, with a circlet of gilt metal on it; the wimple is the older women's.
    let (c, e) = (&COURT_1356, &ENGLAND_1356);
    let count = |d: &sc_portrait::dress::DressSet, age: f32, f: &dyn Fn(&sc_portrait::dress::DressSet, u32) -> bool| (0..100_000u32).filter(|&s| f(d, s)).map(|_| age).count();
    let bare = |age: f32| move |d: &sc_portrait::dress::DressSet, s: u32| d.veil_of(true, age, s) == Veil::None;
    assert_eq!((count(c, 17.0, &bare(17.0)), count(c, 25.0, &bare(25.0)), count(c, 45.0, &bare(45.0)), count(c, 50.0, &bare(50.0))), (100_000, 60_000, 60_000, 0));
    assert_eq!((count(e, 25.0, &bare(25.0)), count(e, 45.0, &bare(45.0))), (30_000, 0));
    let worn = |age: f32, female: bool| move |d: &sc_portrait::dress::DressSet, s: u32| d.fillet_of(female, age, s);
    assert_eq!((count(c, 14.0, &worn(14.0, true)), count(c, 17.0, &worn(17.0, true)), count(c, 35.0, &worn(35.0, true)), count(c, 55.0, &worn(55.0, true)), count(c, 35.0, &worn(35.0, false))), (0, 70_000, 42_000, 0, 0));
    assert!(e.circlet.is_empty() && CROWNED_1356.circlet.is_empty() && (0..1000).all(|s| !CROWNED_1356.fillet_of(true, 25.0, s)));

    // On forty ladies of 17 to 45: who wears it by her seed has a band of gilt metal with twelve stones round the
    // head, over the eyes and under the hair's crown, about as broad as the hair, with no hair through it, and no
    // band of linen; a woman of the common people with the same seed has the linen band or none.
    let Some(h) = head() else { return };
    let (mut with, mut without, mut worst) = (0, 0, (f32::MAX, f32::MIN, 0usize));
    for k in (0..80).step_by(2) {
        let p = person_of(k, true, 17.0 + (k % 8) as f32 * 4.0, 3);
        let out = build(&h, &p, 1);
        assert!(!out.surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains(&format!("/{}.", e.fillet)))), "person {k}: a linen fillet at court");
        let (metal, stones, _) = pieces(&out.surfaces);
        let eye = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("eyeball"))).expect("the eyes");
        let eyes = eye.pos.iter().map(|q| q[1]).sum::<f32>() / eye.pos.len() as f32;
        // the band is the metal over the eyes (a gown's buttons are the other)
        let band = metal.iter().find(|s| s.pos.iter().all(|q| q[1] > eyes));
        assert_eq!(band.is_some(), c.fillet_of(true, p.age, p.seed), "person {k} of {}", p.age);
        let common = build(&h, &person(k, true, p.age), 1);
        assert!(pieces(&common.surfaces).0.is_empty(), "person {k}: metal on a woman of the common people");
        let Some(b) = band else {
            without += 1;
            continue;
        };
        with += 1;
        let stone = stones.iter().find(|s| s.pos.iter().all(|q| q[1] > eyes)).unwrap_or_else(|| panic!("person {k}: no stones"));
        assert_eq!(stone.pos.len() / 3, 12 * 64, "person {k}");
        for ball in stone.pos.chunks_exact(192) {
            let mid: V3 = std::array::from_fn(|a| ball.iter().map(|q| q[a]).sum::<f32>() / 192.0);
            let near = b.pos.iter().map(|q| dist(q, &mid)).fold(f32::MAX, f32::min);
            assert!(near < 0.06, "person {k}: a stone {near} off the band");
        }
        let hair = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("_body."))).expect("the hair");
        let range = |s: &Surface, a: usize| s.pos.iter().fold((f32::MAX, f32::MIN), |(lo, hi), q| (lo.min(q[a]), hi.max(q[a])));
        let front = front_of(b, out.cz);
        let (crown, (hx0, hx1), (bx0, bx1), (by0, by1)) = (range(hair, 1).1, range(hair, 0), range(b, 0), range(b, 1));
        let through = hair_through(&out.surfaces, b);
        worst = (worst.0.min(front.0 - eyes), worst.1.max(front.0 - eyes), worst.2.max(through));
        if show() {
            println!("person {k} of {}: the band's front {:.1} cm over the eyes, {:.1} cm high, {:.1} cm broad on hair {:.1} cm broad; {through} corners of hair through it", p.age, 10.0 * (front.0 - eyes), 10.0 * (front.1 - front.0), 10.0 * (bx1 - bx0), 10.0 * (hx1 - hx0));
            continue;
        }
        assert!(front.0 - eyes > 0.25 && front.0 - eyes < 0.7, "person {k}: the band's foot {} cm over the eyes", 10.0 * (front.0 - eyes));
        assert!(front.1 - front.0 > 0.1 && front.1 - front.0 < 0.25, "person {k}: the band {} cm high", 10.0 * (front.1 - front.0));
        assert!(by1 < crown && by0 > eyes, "person {k}: the band from {by0} to {by1}, eyes {eyes}, crown {crown}");
        assert!(bx1 - bx0 > hx1 - hx0 - 0.5 && bx1 - bx0 < hx1 - hx0 + 0.1, "person {k}: the band {} cm broad, the hair {}", 10.0 * (bx1 - bx0), 10.0 * (hx1 - hx0));
        assert_eq!(through, 0, "person {k}: hair through the band");
    }
    if show() {
        println!("{with} with a circlet, {without} without; its foot {:.1} to {:.1} cm over the eyes; hair through it at most {} corners", 10.0 * worst.0, 10.0 * worst.1, worst.2);
    }
    assert!(show() || (with >= 10 && without >= 10), "{with} with a circlet, {without} without");
}

#[test]
fn a_lord_with_nothing_else_on_the_head_wears_a_circlet_five_in_ten_on_hair_that_lies_flat() {
    // (round 147) Effigies and weepers of 1337, 1369 and 1371 wear a circlet on the hair (the page read names
    // them). A lord from 15 whose head is bare (no hood on it, no coif, no hat) wears one by a digit of his seed.
    let (c, e) = (&COURT_1356, &ENGLAND_1356);
    let count = |d: &sc_portrait::dress::DressSet, age: f32| (0..100_000u32).filter(|&s| d.circlet_of(false, age, s).is_some()).count();
    // (of ten digits: the hood on the head four, a hat two, a coif one from 30)
    assert_eq!((count(c, 14.0), count(c, 25.0), count(c, 45.0), count(e, 25.0), count(&CROWNED_1356, 25.0)), (0, 20_000, 15_000, 0, 0));
    assert!((0..100_000u32).all(|s| c.circlet_of(false, 45.0, s).is_none() || (!c.head_covered(false, 45.0, s) && c.hair_flat(false, 45.0, s))));
    assert!((0..100_000u32).all(|s| c.circlet_of(true, 25.0, s).is_some() == c.fillet_of(true, 25.0, s)));

    let Some(h) = head() else { return };
    let (mut with, mut without, mut worst) = (0, 0, (f32::MAX, f32::MIN, 0usize));
    for k in (1..160).step_by(2) {
        let p = person_of(k, false, 17.0 + (k % 12) as f32 * 4.0, 3);
        let out = build(&h, &p, 1);
        let (metal, stones, _) = pieces(&out.surfaces);
        let eye = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("eyeball"))).expect("the eyes");
        let eyes = eye.pos.iter().map(|q| q[1]).sum::<f32>() / eye.pos.len() as f32;
        let band = metal.iter().find(|s| s.pos.iter().all(|q| q[1] > eyes));
        assert_eq!(band.is_some(), c.circlet_of(false, p.age, p.seed).is_some(), "person {k} of {}", p.age);
        let Some(b) = band else {
            without += 1;
            continue;
        };
        with += 1;
        // nothing else on the head, and the hair under it the hair that lies flat (or a bare top's horseshoe)
        for name in [c.hood_up, c.coif, c.hat, c.hat_cocked] {
            assert!(!out.surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains(&format!("/{name}.")))), "person {k}: {name} under a circlet");
        }
        let flat = [c.hair_hooded, c.hair_bald].iter().any(|n| out.surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains(&format!("/{n}_")))));
        assert!(flat, "person {k}: the hair under a circlet does not lie flat");
        let stone = stones.iter().find(|s| s.pos.iter().all(|q| q[1] > eyes)).unwrap_or_else(|| panic!("person {k}: no stones"));
        assert_eq!(stone.pos.len() / 3, 12 * 64, "person {k}");
        let (front, through) = (front_of(b, out.cz), hair_through(&out.surfaces, b));
        worst = (worst.0.min(front.0 - eyes), worst.1.max(front.0 - eyes), worst.2.max(through));
        if show() {
            println!("person {k} of {}: the band's front {:.1} cm over the eyes; {through} corners of hair through it", p.age, 10.0 * (front.0 - eyes));
            continue;
        }
        assert!(front.0 - eyes > 0.25 && front.0 - eyes < 0.7, "person {k}: the band's foot {} cm over the eyes", 10.0 * (front.0 - eyes));
        assert_eq!(through, 0, "person {k}: hair through the band");
    }
    if show() {
        println!("{with} lords with a circlet, {without} without; its foot {:.1} to {:.1} cm over the eyes; hair through it at most {} corners", 10.0 * worst.0, 10.0 * worst.1, worst.2);
    }
    assert!(show() || (with >= 8 && without >= 40), "{with} with a circlet, {without} without");
}
