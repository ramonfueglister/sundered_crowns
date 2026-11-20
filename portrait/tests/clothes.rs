//! The gown of England 1356 as it is cut at the neck, and the linen under it (round 110), as the builder puts
//! them on a body (the real look: a file of its own, see tests/common).

mod common;

use common::{head, person, person_of};
use sc_portrait::{build, build_posed, Look, Portrait};

type V3 = [f32; 3];

/// A triangle, and whether it is of the hem's roll.
struct Tri {
    at: [V3; 3],
    hem: bool,
}

/// A garment's points, each once, and whether a point is of the hem's roll alone (the roll's texture
/// coordinates run a twentieth of the image round it); its triangles.
struct Cloth {
    pos: Vec<V3>,
    hem: Vec<bool>,
    tris: Vec<Tri>,
}

fn cloth(out: &Portrait, image: &str) -> Option<Cloth> {
    let s = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(image)))?;
    assert_eq!(s.uv.len(), s.pos.len(), "{image}: texture coordinates for every corner");
    let mut c = Cloth { pos: Vec::new(), hem: Vec::new(), tris: Vec::new() };
    let mut seen = std::collections::HashSet::new();
    // (the cloth's triangles first: a point the roll shares with the cloth is the cloth's)
    for of_hem in [false, true] {
        for t in 0..s.pos.len() / 3 {
            let hem = (0..3).all(|k| s.uv[t * 3 + k][1].abs() <= 0.05);
            if hem != of_hem {
                continue;
            }
            let at = [s.pos[t * 3], s.pos[t * 3 + 1], s.pos[t * 3 + 2]];
            c.tris.push(Tri { at, hem });
            for q in at {
                if seen.insert(q.map(f32::to_bits)) {
                    c.pos.push(q);
                    c.hem.push(hem);
                }
            }
        }
    }
    Some(c)
}

fn sub(a: &V3, b: &V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn dot(a: &V3, b: &V3) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn dist(a: &V3, b: &V3) -> f32 {
    let d = sub(a, b);
    dot(&d, &d).sqrt()
}

/// The point of a triangle closest to a point (Ericson, Real-Time Collision Detection, 5.1.5).
fn closest(p: &V3, [a, b, c]: &[V3; 3]) -> V3 {
    let (ab, ac, ap) = (sub(b, a), sub(c, a), sub(p, a));
    let (d1, d2) = (dot(&ab, &ap), dot(&ac, &ap));
    let at = |v: f32, w: f32| [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
    if d1 <= 0.0 && d2 <= 0.0 {
        return at(0.0, 0.0);
    }
    let bp = sub(p, b);
    let (d3, d4) = (dot(&ab, &bp), dot(&ac, &bp));
    if d3 >= 0.0 && d4 <= d3 {
        return at(1.0, 0.0);
    }
    let vc = d1 * d4 - d3 * d2;
    if vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0 {
        return at(d1 / (d1 - d3), 0.0);
    }
    let cp = sub(p, c);
    let (d5, d6) = (dot(&ab, &cp), dot(&ac, &cp));
    if d6 >= 0.0 && d5 <= d6 {
        return at(0.0, 1.0);
    }
    let vb = d5 * d2 - d1 * d6;
    if vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0 {
        return at(0.0, d2 / (d2 - d6));
    }
    let va = d3 * d6 - d5 * d4;
    if va <= 0.0 && d4 - d3 >= 0.0 && d5 - d6 >= 0.0 {
        let w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        return at(1.0 - w, w);
    }
    let k = 1.0 / (va + vb + vc);
    at(vb * k, vc * k)
}

/// The skin's triangles.
fn skin(out: &Portrait) -> Vec<[V3; 3]> {
    let s = out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains("skin"))).max_by_key(|s| s.pos.len()).expect("the skin");
    s.pos.chunks_exact(3).map(|t| [t[0], t[1], t[2]]).collect()
}

fn cross(a: &V3, b: &V3) -> V3 {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/// How far along a ray (from `o`, along the unit vector `d`) a triangle is met (Möller and Trumbore 1997).
fn met(o: &V3, d: &V3, [a, b, c]: &[V3; 3]) -> Option<f32> {
    let (e1, e2) = (sub(b, a), sub(c, a));
    let h = cross(d, &e2);
    let det = dot(&e1, &h);
    if det.abs() < 1e-12 {
        return None;
    }
    let s = sub(o, a);
    let u = dot(&s, &h) / det;
    let q = cross(&s, &e1);
    let v = dot(d, &q) / det;
    let t = dot(&e2, &q) / det;
    (u >= 0.0 && v >= 0.0 && u + v <= 1.0 && t > 0.0).then_some(t)
}

/// A point and a garment, seen from the skin under the point along the way to it: how far the point lies
/// beyond the garment's cloth (negative: the garment is met behind the point). None where the way from the
/// skin through the point does not meet the garment, and where the bust has no skin (it ends above a gown's
/// lower end).
fn beyond(p: &V3, skin: &[[V3; 3]], c: &Cloth) -> Option<f32> {
    let on = skin.iter().filter(|t| dist(p, &t[0]) < 0.5).map(|t| closest(p, t)).min_by(|a, b| dist(p, a).total_cmp(&dist(p, b)))?;
    let d = dist(p, &on);
    if d < 1e-4 {
        return None;
    }
    let way = sub(p, &on).map(|a| a / d);
    let first = c.tris.iter().filter(|t| !t.hem && dist(p, &t.at[0]) < 0.6).filter_map(|t| met(&on, &way, &t.at)).fold(f32::MAX, f32::min);
    (first < 0.6).then_some(d - first)
}

/// Where the front of a gown's neck begins: the middle of its hem, front to back.
fn middle(c: &Cloth) -> f32 {
    let z: Vec<f32> = (0..c.pos.len()).filter(|&i| c.hem[i]).map(|i| c.pos[i][2]).collect();
    z.iter().sum::<f32>() / z.len() as f32
}

/// The highest point of a garment's cloth in the middle of the front (the builder's units, 10 cm).
fn front(c: &Cloth, from: f32) -> f32 {
    (0..c.pos.len()).filter(|&i| !c.hem[i] && c.pos[i][0].abs() < 0.12 && c.pos[i][2] > from).map(|i| c.pos[i][1]).fold(f32::MIN, f32::max)
}

/// The lowest point of a gown's neck: of its hem, in front.
fn opening(c: &Cloth, from: f32) -> f32 {
    (0..c.pos.len()).filter(|&i| c.hem[i] && c.pos[i][2] > from).map(|i| c.pos[i][1]).fold(f32::MAX, f32::min)
}

/// How broad a gown's neck is: from its hem's outermost point on one side to that on the other (centimetres).
fn breadth(c: &Cloth) -> f32 {
    let side = |s: f32| (0..c.pos.len()).filter(|&i| c.hem[i]).map(|i| c.pos[i][0] * s).fold(f32::MIN, f32::max);
    10.0 * (side(1.0) + side(-1.0))
}

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

/// People who wear a gown that is cut for the neck to show: everyone but a woman from the age of the wimple.
fn people() -> Vec<(&'static str, Look)> {
    let mut all = Vec::new();
    for k in 0..4 {
        all.push(("boy", person(2 * k + 1, false, 10.0)));
        all.push(("man", person(2 * k + 1, false, 34.0)));
        all.push(("old man", person(2 * k + 1, false, 66.0)));
        all.push(("girl", person(2 * k, true, 12.0)));
        all.push(("woman", person(2 * k, true, 30.0)));
        all.push(("small child", person(k, k % 2 == 0, 3.0)));
    }
    all
}

#[test]
fn linen_shows_in_the_neck_of_englands_gown() {
    // Until round 110 a gown was one piece with a round neck close at the throat and nothing under it, where the
    // reference's people wear two or three layers. Now a man's gown is opened in front in a V and a woman's is
    // cut wide, and in the opening lies the linen worn under it: the shirt up to the throat, the smock's edge a
    // finger's breadth inside the gown's.
    let Some(h) = head() else { return };
    for (who, p) in people() {
        let out = build(&h, &p, 1);
        let gown = cloth(&out, "/cloth_cote.").unwrap_or_else(|| panic!("{who} {}: no gown", p.seed));
        let under = cloth(&out, "/cloth_smock.").unwrap_or_else(|| panic!("{who} {}: nothing under the gown", p.seed));
        // (the builder holds what is worn under a gown within half a centimetre of the skin, and a roll at its
        // edge was crushed by that: dark specks along the linen)
        assert!(under.hem.iter().all(|h| !h), "{who} {}: the linen has a rolled hem", p.seed);
        let shown = 10.0 * (front(&under, middle(&gown)) - opening(&gown, middle(&gown)));
        let broad = breadth(&gown);
        if show() {
            println!("{who} {}: the linen reaches {shown:.1} cm over the lowest point of the gown's neck, which is {broad:.1} cm broad", p.seed);
            continue;
        }
        // (measured: a smock 0.9 to 1.2 cm, a shirt 3.1 to 3.9 cm, on a small boy 2.4 cm)
        if p.female {
            assert!(shown > 0.5 && shown < 2.5, "{who} {}: the smock reaches {shown} cm over the gown's neck", p.seed);
        } else {
            assert!(shown > 1.8 && shown < 6.0, "{who} {}: the shirt reaches {shown} cm up the gown's opening", p.seed);
        }
    }
}

#[test]
fn the_linen_lies_under_the_gown() {
    // where the gown covers the linen, the linen is the nearer of the two to the skin
    let Some(h) = head() else { return };
    for (who, p) in people() {
        let out = build(&h, &p, 1);
        let (gown, under) = (cloth(&out, "/cloth_cote.").expect("the gown"), cloth(&out, "/cloth_smock.").expect("the linen"));
        let sk = skin(&out);
        let (mut n, mut inside) = (0, 0);
        for q in &under.pos {
            if let Some(over) = beyond(q, &sk, &gown) {
                n += 1;
                inside += (over < 0.0) as usize;
            }
        }
        if show() {
            println!("{who} {}: {n} points of the linen under the gown, {inside} of them nearer to the skin than it", p.seed);
            continue;
        }
        assert!(n > 300, "{who} {}: {n} points of the linen under the gown", p.seed);
        assert!(inside as f32 > 0.97 * n as f32, "{who} {}: {inside} of {n} points of the linen nearer to the skin than the gown", p.seed);
    }
}

#[test]
fn a_womans_gown_is_cut_wide_and_under_a_wimple_close() {
    // The wimple ends at the close neckline it was draped over: over the wide one it left a ring of skin (seen
    // in round 110). From the age of the wimple a woman wears the gown with the round neck, and nothing shows of
    // what she wears under it.
    let Some(h) = head() else { return };
    for k in 0..4 {
        let (young, old) = (build(&h, &person(2 * k, true, 30.0), 1), build(&h, &person(2 * k, true, 60.0), 1));
        let (wide, close) = (breadth(&cloth(&young, "/cloth_cote.").expect("her gown")), breadth(&cloth(&old, "/cloth_cote.").expect("her gown")));
        if show() {
            println!("woman {k}: the gown's neck {wide:.1} cm broad at 30, {close:.1} cm at 60");
        }
        assert!(wide > close + 2.5, "woman {k}: the gown's neck {wide} cm broad at 30, {close} cm at 60");
        assert!(cloth(&old, "/cloth_wimple.").is_some(), "woman {k}: no wimple at 60");
        // (since round 129 the linen shows between the edges of a laced gown: a narrow strip down the front, and
        // no smock at the neck)
        let laced = sc_portrait::dress::ENGLAND_1356.fasten_of(true, 60.0, person(2 * k, true, 60.0).seed) == sc_portrait::fasten::Fasten::Laced;
        let linen = old.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains("/cloth_smock."))).map(|s| s.pos.len() / 3).collect::<Vec<_>>();
        assert!(linen.len() == usize::from(laced) && linen.iter().all(|&n| n < 300), "woman {k}: linen under the gown under her wimple, {linen:?} triangles (laced: {laced})");
    }
}

#[test]
fn a_gown_that_is_cut_wide_lies_within_the_gown_with_the_round_neck() {
    // Veil, wimple and hoods were draped over the gown with the round neck. A gown draped anew, with another
    // neckline, has its folds in other places and came through the veil's ends in front of the shoulders (round
    // 110, red specks in the linen). The cuts are held under the round gown's surface (`drape_under.py`): what
    // lies over that one lies over them. A woman the day before the age of the wimple wears the wide cut, and
    // on that day the round gown, on the same body: seen from the skin under a point of the wide cut, along the
    // way to that point, the round gown is met behind the point or at it, not before it. (No man wears the
    // round gown, so the men's cut has no such pair; it is made by the same script.)
    let Some(h) = head() else { return };
    let wimple_from = sc_portrait::dress::ENGLAND_1356.wimple_from;
    for k in 0..6 {
        // (as draped, in no pose: the pose of round 123 turns both gowns alike about the neck, and with them the
        // sleeves into the region that is read here by its place across the chest)
        let stiff = |age: f32| build_posed(&h, &person(2 * k, true, age), 1, Some([0.0; 3]));
        let (before, after) = (stiff(wimple_from - 0.01), stiff(wimple_from));
        let (cut, round) = (cloth(&before, "/cloth_cote.").expect("her gown"), cloth(&after, "/cloth_cote.").expect("her gown"));
        assert!(cloth(&before, "/cloth_wimple.").is_none() && cloth(&after, "/cloth_wimple.").is_some(), "woman {k}: the wimple comes at {wimple_from}");
        let sk = skin(&before);
        let (mut n, mut over, mut most) = (0, 0, 0.0f32);
        for (i, g) in cut.pos.iter().enumerate() {
            // (the chest and the front of the shoulders, 10 cm to either side and down to 20 cm under the chin: what
            // a veil's ends and a hood's cape lie on. Further out are the sleeves, where the skin nearest to a
            // point is the arm's for one fold and the chest's for the next, and either gown is outside the other.
            // Until round 124 down to 25 cm, where the gowns ended; since then each passes there into the bust
            // set under it, `bust_bind.py`, the wide cut from further in than the round gown, and stands up to
            // 3.8 cm outside it over those 5 cm. No veil's end and no cape reaches that far down)
            if cut.hem[i] || g[0].abs() > 1.0 || g[1] < before.chin - 2.0 {
                continue;
            }
            if let Some(out) = beyond(g, &sk, &round) {
                n += 1;
                most = most.max(10.0 * out);
                over += (out > 0.02) as usize;
            }
        }
        if show() {
            println!("woman {k}: {n} points of the wide cut where the round gown lies, {over} of them more than 2 mm outside it, by up to {most:.2} cm");
            continue;
        }
        assert!(n > 2000, "woman {k}: {n} points of the wide cut where the round gown lies");
        // (held under it: 0.01 of them, by up to 0.7 cm; draped anew and not held: 0.2 of them, by up to 2.2 cm)
        assert!((over as f32) < 0.04 * n as f32 && most < 1.2, "woman {k}: {over} of {n} points of the wide cut outside the round gown, by up to {most} cm");
    }
}

#[test]
fn a_ladys_gown_at_court_is_cut_wider_and_lower_than_a_village_womans_and_shows_no_linen() {
    // (round 149) Until now a lady at court wore the village's cut: a neck 25 cm broad that ends a hand under the
    // chin, with the smock's edge in it. Her gown is cut wide and low now: on the same body as the village woman's,
    // its neck is broader and its lowest point in front lies lower; the collarbones are bare, and no smock's edge
    // shows (linen only between the edges of a laced front). A queen wears it under her mantle. From the age of
    // the wimple a lady wears the round gown, as in the village, and the wide cut lies within that one: the
    // veil's ends and a hood's cape were draped over the round gown.
    let Some(h) = head() else { return };
    let (e, c) = (&sc_portrait::dress::ENGLAND_1356, &sc_portrait::dress::COURT_1356);
    assert_ne!(c.gown_cut[0], e.gown_cut[0], "the court's ladies have a cut of their own");
    assert_eq!((c.gown, c.under[1], c.under_image, c.wimple_from), (e.gown, e.under[1], e.under_image, e.wimple_from));
    assert!(c.under[0].is_empty(), "no smock shows in a lady's neck");
    let linen = |out: &Portrait| out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains("/cloth_smock."))).map(|s| s.pos.len() / 3).collect::<Vec<_>>();
    let mut laces = 0;
    // (six ladies, and after them the first two whose gown is laced)
    for k in 0..40 {
        let laced = c.fasten_of(true, 30.0, person_of(2 * k, true, 30.0, 3).seed) == sc_portrait::fasten::Fasten::Laced;
        if k >= 6 && (!laced || laces >= 2) {
            continue;
        }
        let stiff = |age: f32, stand: u8| build_posed(&h, &person_of(2 * k, true, age, stand), 1, Some([0.0; 3]));
        let (village, court, queen, old) = (stiff(30.0, 1), stiff(30.0, 3), stiff(30.0, 4), stiff(c.wimple_from, 3));
        // (the court's gown is drawn with the silk's image since round 150, `cloth_cote_silk`)
        let gown = |out: &Portrait| cloth(out, "/cloth_cote").expect("her gown");
        let (v, l, q, round) = (gown(&village), gown(&court), gown(&queen), gown(&old));
        let low = |g: &Cloth, out: &Portrait| 10.0 * (out.chin - opening(g, middle(g)));
        let (broad, lower) = (breadth(&l) - breadth(&v), low(&l, &court) - low(&v, &village));
        let shown = linen(&court);
        laces += usize::from(laced);
        // held under the village's round gown, as the village's cut is (the test above: on the same body, the
        // day before the wimple's age), and so is the round gown she wears from that day (round 151: the
        // court's own, closer on the body)
        let before = stiff(c.wimple_from - 0.01, 3);
        let (last, sk) = (gown(&before), skin(&before));
        assert!((breadth(&last) - breadth(&l)).abs() < 1.0, "lady {k}: the wide cut until the wimple's age");
        let (own, round) = (round, gown(&stiff(c.wimple_from, 1)));
        let within = |g: &Cloth| g.pos.iter().enumerate().filter(|(i, q)| !g.hem[*i] && q[0].abs() < 1.0 && q[1] > before.chin - 2.0).filter_map(|(_, q)| beyond(q, &sk, &round)).fold((0, 0, 0.0f32), |(n, over, most), out| (n + 1, over + usize::from(out > 0.02), most.max(10.0 * out)));
        let (n_own, over_own, most_own) = within(&own);
        // (measured on eight ladies: none on five, 42, 466 and 1 879 of some 4 600 on three, all from 12 cm
        // under the chin down, by up to 0.64 cm: where the village's gown has its folds the court's lies smooth
        // over them. A drape that is not held under the round gown stood up to 2.2 cm outside it, round 110.
        // That nothing of the gown comes through the cloth over it: tests/bust.rs, at court as in the village)
        if show() {
            println!("lady {k}: {over_own} of {n_own} points of the court's round gown more than 2 mm outside the village's, by up to {most_own:.2} cm");
        } else {
            assert!(n_own > 2000 && most_own < 1.0, "lady {k}: {over_own} of {n_own} points of the court's round gown outside the village's, by up to {most_own} cm");
        }
        let (mut n, mut over, mut most) = (0, 0, 0.0f32);
        for (i, g) in last.pos.iter().enumerate() {
            if last.hem[i] || g[0].abs() > 1.0 || g[1] < before.chin - 2.0 {
                continue;
            }
            if let Some(out) = beyond(g, &sk, &round) {
                n += 1;
                most = most.max(10.0 * out);
                over += (out > 0.02) as usize;
            }
        }
        if show() {
            println!(
                "lady {k}: the neck {:.1} cm broad ({broad:.1} more than the village's {:.1}), its lowest point {:.1} cm under the chin ({lower:.1} lower than the village's {:.1}); a queen's {:.1} broad; with the wimple {:.1}; linen {shown:?} (laced: {laced}); {n} points where the round gown lies, {over} outside it by up to {most:.2} cm",
                breadth(&l),
                breadth(&v),
                low(&l, &court),
                low(&v, &village),
                breadth(&q),
                breadth(&own),
            );
            continue;
        }
        assert!(broad > 5.0 && lower > 2.0, "lady {k}: the neck {broad} cm broader and {lower} cm lower than the village's");
        assert!((breadth(&q) - breadth(&l)).abs() < 0.5, "lady {k}: a queen's gown {} cm broad at the neck, a lady's {}", breadth(&q), breadth(&l));
        // (the wimple in the court's own linen since round 153: its image has another name)
        assert!(breadth(&own) < breadth(&v) - 2.5 && cloth(&old, "/cloth_wimple_fine.").is_some(), "lady {k}: the round gown under the wimple, {} cm broad", breadth(&own));
        assert!(shown.len() == usize::from(laced) && shown.iter().all(|&t| t < 300), "lady {k}: linen in the gown's neck, {shown:?} triangles (laced: {laced})");
        // (round 149, the village's drape with the wide neck: 4 to 12 of some 2 800, by up to 0.3 cm. Round
        // 151, the court's own drape: as its round gown above, more of them over the village's folds, and no
        // further out. The share is not held any more, the distance is)
        assert!(n > 2000, "lady {k}: {n} points of the wide cut where the round gown lies");
        assert!(most < 1.0, "lady {k}: {over} of {n} points of the wide cut outside the round gown, by up to {most} cm");
    }
    assert!(laces == 2, "{laces} ladies of forty with a laced gown");
    // a lord's shirt shows in his gown as before
    let lord = build(&h, &person_of(1, false, 34.0, 3), 1);
    assert!(linen(&lord).iter().any(|&t| t > 300), "a lord's shirt: {:?}", linen(&lord));
}

/// How deep a gown is from front to back in the middle of the trunk, 1 cm to either side of `cx`, between `from`
/// and `to` under the chin (the builder's units; the result in centimetres).
fn depth(c: &Cloth, cx: f32, chin: f32, from: f32, to: f32) -> f32 {
    let z = (0..c.pos.len()).filter(|&i| !c.hem[i] && (c.pos[i][0] - cx).abs() < 0.1 && c.pos[i][1] < chin - from && c.pos[i][1] > chin - to).map(|i| c.pos[i][2]).fold((f32::MAX, f32::MIN), |r, z| (r.0.min(z), r.1.max(z)));
    10.0 * (z.1 - z.0)
}

/// How uneven a gown's cloth is: the angle between a triangle's face and the mean face of the triangles within
/// 3 cm of it, on average over every seventh triangle (degrees). A sheet without a fold has little, a crumpled
/// one much.
fn folds(c: &Cloth) -> f32 {
    let of: Vec<(V3, V3)> = c
        .tris
        .iter()
        .filter(|t| !t.hem)
        .map(|t| {
            let n = cross(&sub(&t.at[1], &t.at[0]), &sub(&t.at[2], &t.at[0]));
            let l = dot(&n, &n).sqrt().max(1e-12);
            (t.at[0], n.map(|v| v / l))
        })
        .collect();
    let (mut sum, mut m) = (0.0f32, 0);
    for (at, n) in of.iter().step_by(7) {
        let mean = of.iter().filter(|(q, _)| dist(at, q) < 0.3).fold([0f32; 3], |a, (_, f)| [a[0] + f[0], a[1] + f[1], a[2] + f[2]]);
        sum += (dot(n, &mean) / dot(&mean, &mean).sqrt().max(1e-12)).clamp(-1.0, 1.0).acos().to_degrees();
        m += 1;
    }
    sum / m as f32
}

#[test]
fn the_courts_gown_lies_smoother_than_the_villages_and_no_deeper() {
    // (round 151) The court's gown was the village's drape, laid 4.5 cm off the body from the chest down before
    // it was let fall: a sack whose folds and dents a smooth silk shows. The court's files are draped from 1.2
    // cm. On the same body, as draped and in no pose, a person of rank's gown is less uneven than the
    // villager's, with every cut (a lady's, a lord's, the round one under a wimple). It is not narrower: a
    // cloth that is let fall lies on the body where the body carries it, and from front to back in the middle
    // of the trunk the two gowns are as deep as each other, at the chest and at the waist. A lord's shirt still
    // lies under his gown.
    let Some(h) = head() else { return };
    let none = (f32::MAX, f32::MIN);
    let wide = |r: &mut (f32, f32), v: f32| *r = (r.0.min(v), r.1.max(v));
    let (mut even, mut chest, mut waist) = ([(none, none); 3], [none; 3], [none; 3]);
    for k in 0..6 {
        for (who, female, age) in [(0, true, 30.0), (1, false, 34.0), (2, true, 60.0)] {
            let stiff = |stand: u8| build_posed(&h, &person_of(2 * k + u32::from(!female), female, age, stand), 1, Some([0.0; 3]));
            let (village, court) = (stiff(1), stiff(3));
            let (v, c) = (cloth(&village, "/cloth_cote").expect("the gown"), cloth(&court, "/cloth_cote").expect("the gown"));
            // (13 to 17 cm under the chin: the chest under the neck's opening; 27 to 31 cm: the waist)
            let at = |from: f32, to: f32| depth(&c, court.cx, court.chin, from, to) - depth(&v, village.cx, village.chin, from, to);
            let (high, low, uneven) = (at(1.3, 1.7), at(2.7, 3.1), (folds(&v), folds(&c)));
            wide(&mut chest[who], high);
            wide(&mut waist[who], low);
            wide(&mut even[who].0, uneven.0);
            wide(&mut even[who].1, uneven.1);
            if show() {
                continue;
            }
            let name = ["lady", "lord", "lady with a wimple"][who];
            assert!(uneven.1 < 0.85 * uneven.0, "{name} {k}: the gown's folds {:.1} degrees at court, {:.1} in the village", uneven.1, uneven.0);
            assert!(high.abs() < 2.0 && low.abs() < 3.0, "{name} {k}: the gown at court {high:.1} cm deeper at the chest and {low:.1} at the waist than in the village");
            if !female {
                let (under, sk) = (cloth(&court, "/cloth_smock.").expect("his shirt"), skin(&court));
                let (mut n, mut inside) = (0, 0);
                for q in &under.pos {
                    if let Some(over) = beyond(q, &sk, &c) {
                        n += 1;
                        inside += usize::from(over < 0.0);
                    }
                }
                assert!(n > 300 && inside as f32 > 0.97 * n as f32, "lord {k}: {inside} of {n} points of the shirt nearer to the skin than the gown");
            }
        }
    }
    if show() {
        for (who, name) in ["a lady", "a lord", "a lady with a wimple"].iter().enumerate() {
            println!("{name}: folds {:.1} to {:.1} degrees in the village, {:.1} to {:.1} at court; the court's gown {:.1} to {:.1} cm deeper at the chest, {:.1} to {:.1} cm at the waist", even[who].0 .0, even[who].0 .1, even[who].1 .0, even[who].1 .1, chest[who].0, chest[who].1, waist[who].0, waist[who].1);
        }
    }
}
