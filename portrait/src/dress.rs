//! Dress as data: what the people of a place and time wear on head and shoulders, one table per dress, chosen by
//! where a person's family comes from. Apoleia's Roman dress stays in the code it came with (look.rs, build.rs) and
//! is what every origin without a table here wears; nothing of it changes when a table is added.
//!
//! Every row names its source. None of the sources below was read in full: the summaries they were taken from are
//! named in docs/PORTRAITS.md. Until someone checks them, cut, colours and hair length are PLACEHOLDER.

/// Which dress a person wears.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Dress {
    /// Apoleia's Roman town, as carried over.
    #[default]
    Roman,
    /// Common people of England about 1356.
    England1356,
}

/// How men from `HoodRule::from` years wear the hood, by the last digit of the person's seed.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Hood {
    None,
    /// On the head.
    Up,
    /// Thrown back, lying round the neck.
    Back,
}

/// One statement of a dress table and where it comes from.
use crate::look::Beard;

pub struct Source {
    pub what: &'static str,
    pub source: &'static str,
}

/// A dress: the garments (images and bound shapes under public/portrait/real), their colours, who wears what on
/// the head, the hair, and how the faces are read.
pub struct DressSet {
    /// The start of the look's name on the wire; the stage lights by it.
    pub key: &'static str,
    /// The origins that wear it.
    pub origins: &'static [&'static str],
    /// The body garment of everyone.
    pub gown: &'static str,
    /// Wool colours of gown and hood.
    pub wool: &'static [&'static str],
    /// Linen of veil and wimple.
    pub linen: &'static str,
    /// Men's hood by the seed's last digit, from this age; the garments on the head and thrown back.
    pub hood: [Hood; 10],
    pub hood_from: f32,
    pub hood_up: &'static str,
    pub hood_back: &'static str,
    /// Women from this age wear the veil (younger: braids), from the second age the wimple under it.
    pub veil_from: f32,
    pub wimple_from: f32,
    pub veil: &'static str,
    pub wimple: &'static str,
    /// Men's hair, loose and under the hood on the head; the hair under a veil; the hair of girls and of women
    /// too young for the veil.
    pub hair: &'static str,
    /// The same on a head that loses its hair: gone back at the temples, and a horseshoe round a bare top.
    /// The same on a head with curls (wavy, standing off the head).
    pub hair_curly: &'static str,
    pub hair_receding: &'static str,
    pub hair_bald: &'static str,
    pub hair_hooded: &'static str,
    pub hair_veiled: &'static str,
    pub hair_girl: &'static str,
    /// The beard worn in place of each of Apoleia's (in the order of look::Beard: shaven, stubble, short, full,
    /// philosopher, chin): a dress leaves out what its time did not wear.
    pub beards: [Beard; 6],
    /// The file of the full beard (Apoleia's hangs in long single strands).
    pub beard_full: &'static str,
    /// Lips: how far towards red, women and men.
    pub lips: [f32; 2],
    /// Red hair: the strength of the red gene (0..1, the mean of a person's two alleles) from which hair shows any
    /// red, and at which it shows all of it. Apoleia mixes red in from 0 on, in step with the gene: of people whose
    /// alleles come from 20 to 170 (the pool England draws from) the usual one then has orange hair.
    pub hair_red: [f32; 2],
    /// How much redder than Apoleia's the skin is over nose, cheeks, ears and chin (factor on settings::SKIN_RED):
    /// people who work out of doors.
    pub flush: f32,
    /// Lids at rest: MakeHuman's eyes are wide open and stare. Weights of the targets eye-height1, -height2,
    /// -height3 (decr) and eye-eyefold (down). Half as much as up to round 49: lids that far down over eyes that
    /// look past the viewer read as lifeless.
    pub lids: [f32; 4],
    /// The mouth at rest: MakeHuman's lips stand a little apart and show the teeth, more so with thin lips.
    /// Weights of the targets mouth-upperlip-ext-down and mouth-lowerlip-ext-up. The lower lip pushed up stands
    /// out as a pout from the side; the jaw closes the mouth instead (`rest`).
    pub mouth_shut: [f32; 2],
    /// Face and bearing at rest, under every mood: MakeHuman's targets and their weights for women and for men.
    /// Its base has a mouth that turns down at the corners with a heavy lower lip, and brows low over the eyes,
    /// which on a calm face reads as lifeless; its man has a short neck with the head pushed forward, so that a
    /// gown's shoulders stand as high as his chin. A boy's weight grows from the women's to the men's as he grows up
    /// (MakeHuman's child stands as its woman does; `by_sex`), and a child's face takes a third of them, growing
    /// to all (as the genes of the face do, `Look::face`: on a child's small mouth they gave a pout).
    pub rest: &'static [(&'static str, f32, f32)],
    /// How strongly a mood shows in the face (Apoleia: 1.7, drawn for a small picture; in a large one a sad
    /// mouth on an old face read as a mask).
    pub mood: f32,
    /// How far the eyeballs are moved forward in their sockets (Apoleia: 0.012). With the lids at rest the ball
    /// came through the lower lid in places.
    pub eye_forward: f32,
    /// How far the bust leans back, women and men (radians, about the axis from ear to ear through the head's
    /// centre). MakeHuman's man stands with the head pushed forward and bowed, its woman nearly upright: seen from
    /// eye level the man's brow hangs over his eyes and his head sits between the shoulders. A boy's grows from the
    /// women's to the men's (`by_sex`).
    pub lean: [f32; 2],
    /// Where the eyes look, seen from the head: turned about the vertical (radians, in the sense of the stage's
    /// `turn`, src/portrait/profile.ts: with the turn's sign the eyes come back towards whoever looks at the
    /// picture) and upwards. The lean is taken out of it, so that the eyes keep looking level. Apoleia's eyes look
    /// straight ahead of the head, past the viewer.
    pub gaze: [f32; 2],
    /// Women's jaw and jaw angle narrower and softer on average: shift of the genes headF and jaw.
    pub jaw_women: f32,
    pub sources: &'static [Source],
}

use Hood::{Back, None as Bare, Up};

pub static ENGLAND_1356: DressSet = DressSet {
    key: "england1356",
    origins: &["England"],
    gown: "cloth_cote",
    wool: &["#8f8371", "#6e675c", "#7a6352", "#5f6b73", "#7d554a", "#73705a"],
    linen: "#e6dfcd",
    hood: [Up, Up, Up, Up, Back, Back, Back, Bare, Bare, Bare],
    hood_from: 14.0,
    hood_up: "cloth_hood_up",
    hood_back: "cloth_hood_down",
    veil_from: 20.0,
    wimple_from: 50.0,
    veil: "cloth_veil_linen",
    wimple: "cloth_wimple",
    hair: "bob01",
    hair_curly: "bob05",
    hair_receding: "bob03",
    hair_bald: "bob04",
    hair_hooded: "bob02",
    hair_veiled: "bun01",
    hair_girl: "plait01",
    beards: [Beard::Shaven, Beard::Stubble, Beard::Short, Beard::Full, Beard::Full, Beard::Short],
    beard_full: "beard_trim",
    lips: [0.55, 0.45],
    hair_red: [0.45, 0.74],
    flush: 0.7,
    lids: [0.1, 0.3, 0.1, 0.3],
    mouth_shut: [0.75, 0.6],
    rest: &[
        ("mouth/mouth-angles-up", 0.3, 0.3),
        ("cheek/l-cheek-trans-up", 0.15, 0.15),
        ("cheek/r-cheek-trans-up", 0.15, 0.15),
        ("eyebrows/eyebrows-trans-up", 0.25, 0.25),
        ("chin/chin-jaw-drop-decr", 0.6, 0.6),
        ("mouth/mouth-lowerlip-volume-decr", 0.3, 0.3),
        ("mouth/mouth-scale-depth-decr", 0.3, 0.3),
        ("mouth/mouth-upperlip-height-incr", 0.45, 0.45),
        ("mouth/mouth-upperlip-volume-incr", 0.45, 0.45),
        ("mouth/mouth-lowerlip-height-decr", 0.5, 0.5),
        ("neck/neck-scale-vert-incr", 0.0, 0.4),
    ],
    mood: 0.6,
    eye_forward: 0.0,
    lean: [-0.1, 0.14],
    gaze: [-0.2, 0.0],
    jaw_women: -0.35,
    sources: &[
        Source { what: "gown (cote) of wool, pulled over the head, close at the shoulders, round neck", source: "Crowfoot, Pritchard & Staniland 1992 (London finds); Østergård 2004 (Herjolfsnes). Summaries only. Cut PLACEHOLDER." },
        Source { what: "hood with a short cape for men, worn on the head or thrown back", source: "Østergård 2004 (Herjolfsnes hoods); Newton 1980. Summaries only. Shares 4:3:3 PLACEHOLDER (unsourced)." },
        Source { what: "wool colours: undyed greys and browns, cheap dyes (russet, a dull blue)", source: "Statute concerning diet and apparel 1363 (russet and blanket for the poorest), read from a summary. Hex values PLACEHOLDER." },
        Source { what: "married women's hair covered by a linen veil, a wimple round the throat on older women and widows; girls in braids", source: "Newton 1980. Summary only. Ages 20 and 50 PLACEHOLDER (the simulation has no marriages yet)." },
        Source { what: "men's hair to the jaw with a fringe", source: "PLACEHOLDER, to be checked against picture sources (Luttrell Psalter c. 1330, Holkham Bible)." },
        Source { what: "beards short or full; no long philosopher's beard, no beard on the chin alone", source: "PLACEHOLDER, to be checked against picture sources (Luttrell Psalter c. 1330). Apoleia's chin beard hangs as a tuft of long strands, which also reads badly." },
        Source { what: "no trimmings, belts' fittings or jewels on common people", source: "Not built: nothing read that shows them; rather none than invented ones." },
        Source { what: "share of red hair", source: "PLACEHOLDER. The two values are set so that of founders of the pool England draws from (alleles 20 to 170) about 5 in 100 have clearly red hair (a third of the red mixed in or more) and about 18 in 100 a tint of it. The 5 in 100 is an estimate, not a count: a press report (IrishCentral on a survey by BritainsDNA of 2,343 people, 2013, read as a summary) gives 34 to 40 in 100 carriers of a red-hair variant in Yorkshire and south-east Scotland; if the trait needs two such alleles, that is 4 to 6 in 100 with red hair. No source for 1356." },
        Source { what: "lids, closed mouth, the face at rest, strength of moods, eyeballs' depth, lean, gaze, women's jaw, lips, flush", source: "PLACEHOLDER, by eye against the reference pictures; not a matter of dress but kept with it so that Apoleia's faces stay as they were." },
    ],
};

/// Every dress with a table.
pub static SETS: [(Dress, &DressSet); 1] = [(Dress::England1356, &ENGLAND_1356)];

impl Dress {
    /// The dress of a person whose family comes from `origin`.
    pub fn of(origin: &str) -> Dress {
        SETS.iter().find(|(_, s)| s.origins.contains(&origin)).map_or(Dress::Roman, |(d, _)| *d)
    }

    /// Its table; none for the Roman dress, which lives in the code.
    pub fn set(self) -> Option<&'static DressSet> {
        SETS.iter().find(|(d, _)| *d == self).map(|(_, s)| *s)
    }
}

/// A value given for women and for men, for a person: the women's for a woman, and for a man what lies between the
/// two by how far he is grown up (`Look::grown`).
pub fn by_sex(women: f32, men: f32, female: bool, grown: f32) -> f32 {
    if female {
        women
    } else {
        women * (1.0 - grown) + men * grown
    }
}

impl DressSet {
    /// What a man wears on the head.
    pub fn hood_of(&self, female: bool, age: f32, seed: u32) -> Hood {
        if female || age < self.hood_from {
            Hood::None
        } else {
            self.hood[(seed % 10) as usize]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origins_find_their_dress() {
        assert_eq!(Dress::of("England"), Dress::England1356);
        for o in ["", "Italia", "Graecia", "Syria", "Aegyptus"] {
            assert_eq!(Dress::of(o), Dress::Roman);
        }
        assert!(Dress::Roman.set().is_none());
        let e = Dress::England1356.set().unwrap();
        assert_eq!(e.hood_of(true, 30.0, 0), Hood::None);
        assert_eq!(e.hood_of(false, 10.0, 0), Hood::None);
        assert_eq!(e.hood_of(false, 30.0, 0), Hood::Up);
        assert_eq!(e.hood_of(false, 30.0, 5), Hood::Back);
        assert!(e.sources.iter().all(|s| !s.what.is_empty() && !s.source.is_empty()));
    }
}
