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
    /// Other lengths of the same cut, each with its share in ten (by the person's seed); the rest wear `hair`.
    /// With one length every man of a town has the same head.
    pub hair_lengths: &'static [(&'static str, u32)],
    /// The same on a head that loses its hair: gone back at the temples, and a horseshoe round a bare top.
    /// The same on a head with curls (wavy, standing off the head).
    pub hair_curly: &'static str,
    pub hair_receding: &'static str,
    pub hair_bald: &'static str,
    pub hair_hooded: &'static str,
    pub hair_veiled: &'static str,
    pub hair_girl: &'static str,
    /// The hair of children under seven. Apoleia's `crop01`, cropped short, begins far back on a child's large
    /// skull: half the head a bare forehead, which reads as a shaven head.
    pub hair_small: &'static str,
    /// The beard worn in place of each of Apoleia's (in the order of look::Beard: shaven, stubble, short, full,
    /// philosopher, chin): a dress leaves out what its time did not wear.
    pub beards: [Beard; 6],
    /// The file of the full beard (Apoleia's hangs in long single strands). England's `beard_crop` has no cards:
    /// the painted layer of short hairs alone, standing off the skin (tools/portrait/pipeline/beards.py `crop`).
    pub beard_full: &'static str,
    /// The file of the short beard. In Apoleia's, hairs are rooted in the gap between the lips and run on over the
    /// line of the mouth; on a mouth that is closed by raising the lower lip they lie on that lip as dark bars, a
    /// row of teeth. England's `beard_short1356` is the same beard with the mouth left free and the moustache
    /// ending over it (beards.py `LIPS=1`).
    pub beard_short: &'static str,
    /// The brows, women's and men's (a boy wears the men's): which of MakeHuman's. Of those tried, Apoleia's
    /// `eyebrow001` alone sits level on these heads. `eyebrow011` (women's until round 53), `eyebrow005` and
    /// `eyebrow002` are finer but sit slanted, the inner end low over the eye: on every woman that read as a
    /// frown. How heavy a brow reads is `brows` in the stage's profile (src/portrait/profile.ts).
    pub brows: [&'static str; 2],
    /// How far a small child's brows are mixed towards the colour of its skin, fading as it grows up
    /// (`Look::grown`). MakeHuman's brows are an adult's, dense and dark: on a child of two they make an old
    /// man's face.
    pub brows_child: f32,
    /// How much of the brow's colour is painted on the skin under the brow's hairs, women and men (1 = Apoleia's:
    /// a band of two fifths to half the hair's colour, drawn for the faceted look that has no hairs). Under hairs
    /// it reads as a broad dark bar low over the eye.
    pub brow_paint: [f32; 2],
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
    /// For women and for men (a boy's grow from the women's to the men's, `by_sex`): on MakeHuman's woman, seen a
    /// little from above, the men's lids left a slit.
    pub lids: [[f32; 4]; 2],
    /// From which age a head has its adult form, women and men. MakeHuman's head goes on growing evenly from its
    /// child of ten to its adult of 25, so that a girl of 17 has more than half a child's head: a high round
    /// forehead over a small face. Faces are grown far earlier: face width, upper face height and the lower jaw's
    /// height reach their adult size at 12 in girls and at 15 in boys (Farkas, Posnick & Hreczko 1992, Cleft
    /// Palate-Craniofacial Journal 29: 308-315; 1594 North Americans of 1 to 18; read from the abstract). The ages
    /// here are Apoleia's own for "grown" (`Look::grown`), later than those: soft tissue rounds a young face longer
    /// than the bone grows. PLACEHOLDER.
    pub adult: [f32; 2],
    /// The mouth at rest. MakeHuman's young heads stand a little open, and genes, age and moods each move the
    /// lips; so the head is closed by exactly as much as its mouth stands open in the middle, with these targets
    /// in these shares (`mouth_shut`), and opened by as much as its lips lie in each other (`mouth_part`;
    /// morph.rs `lip_gap`). Until round 53 fixed weights on mouth-upperlip-ext-down and mouth-lowerlip-ext-up,
    /// which do not move the middle of the lips at all: they left mouths open and gave a pout. Empty lists leave
    /// the mouth as it comes.
    pub mouth_shut: &'static [(&'static str, f32)],
    pub mouth_part: &'static [(&'static str, f32)],
    /// Face and bearing at rest, under every mood: MakeHuman's targets and their weights for women and for men.
    /// Its base has a mouth that turns down at the corners with a heavy lower lip, and brows low over the eyes,
    /// which on a calm face reads as lifeless; its man has a short neck with the head pushed forward, so that a
    /// gown's shoulders stand as high as his chin; its woman has a round head with a short nose and chin under
    /// small eyes, which under a veil reads as a child (the women's weights for brows, eyes, chin, nose, head and
    /// forehead). A boy's weight grows from the women's to the men's as he grows up (MakeHuman's child stands as
    /// its woman does; `by_sex`), and a child's face takes a third of them, growing to all (as the genes of the
    /// face do, `Look::face`: on a child's small mouth they gave a pout).
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
    /// straight ahead of the head, past the viewer. Less than the stage's turn: turned all the way back to the
    /// viewer the irises stand in the corners of the eyes, a glance out of the corner of the eye (until round 60).
    pub gaze: [f32; 2],
    /// How far each eye is turned towards the nose on top of that (radians). Eyes that look at somebody near meet
    /// on them; eyes that stand parallel look through them into the distance. 0.03 lets them meet about a metre
    /// in front of the face.
    pub converge: f32,
    /// Women's jaw and jaw angle narrower and softer on average: shift of the genes headF and jaw.
    pub jaw_women: f32,
    /// How much of Apoleia's child's face lies over MakeHuman's own child (1 = all of it): Apoleia adds a round
    /// head with a high forehead, a small chin and nose and large, wide open eyes (look.rs `KID`, morph.rs) to a
    /// head that is a child's already. In the faceted look that reads as a child; in the real look as a doll.
    pub kid: f32,
    /// Paint on the skin that Apoleia's faceted look needs and the real look has from its light and its images
    /// (build.rs): how much red is mixed into the cheeks (Apoleia's 0.2 on women, 0.1 on men: on the real look a
    /// red patch down to the jaw), and how much darker the skin between eye and brow is (Apoleia's 0.2 on women,
    /// 0.1 on men: the real look has the shade under the brow from its light already, and the two add up).
    /// Women, men.
    pub cheeks: [f32; 2],
    pub sockets: [f32; 2],
    /// Targets of a child's face, a weight for girls and one for boys: in full for as long as the head is
    /// MakeHuman's child (up to eleven), fading to none where it has its adult form (`child_share`). The
    /// counterpart of `rest`, which a child takes a third of. MakeHuman's child has wide open eyes and a narrow
    /// mouth with full lips, on which the genes for full lips and a narrow mouth give a pout: lids lower, the
    /// mouth wider, the lips thinner. (Until round 55 they faded with `Look::grown`, which is at four fifths
    /// when a girl is eleven and her head still all child: the pout was strongest then.)
    pub child: &'static [(&'static str, f32, f32)],
    /// How strongly single genes of the face show (names of `look::GENES`; 1 = as Apoleia, which is every gene not
    /// named). Apoleia draws its genes large, so that a face is told apart at the size of a coin
    /// (`settings::FACE_GAIN`); in the real look the fullest lips are a pout.
    pub genes: &'static [(&'static str, f32)],
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
    hair_lengths: &[("bob06", 3), ("bob07", 2)],
    hair_curly: "bob05",
    hair_receding: "bob03",
    hair_bald: "bob04",
    hair_hooded: "bob02",
    hair_veiled: "bun01",
    hair_girl: "plait01",
    hair_small: "bob01",
    beards: [Beard::Shaven, Beard::Stubble, Beard::Short, Beard::Full, Beard::Full, Beard::Short],
    beard_full: "beard_crop",
    beard_short: "beard_short1356",
    brows: ["eyebrow001", "eyebrow001"],
    brows_child: 0.6,
    brow_paint: [0.0, 0.0],
    lips: [0.55, 0.45],
    hair_red: [0.45, 0.74],
    flush: 0.7,
    lids: [[0.0, 0.0, 0.0, 0.3], [0.1, 0.3, 0.1, 0.3]],
    adult: [15.0, 17.0],
    mouth_shut: &[("mouth/mouth-upperlip-height-incr", 0.6), ("mouth/mouth-lowerlip-middle-down", 0.4)],
    mouth_part: &[("mouth/mouth-lowerlip-middle-up", 1.0)],
    rest: &[
        ("mouth/mouth-angles-up", 0.3, 0.3),
        ("cheek/l-cheek-trans-up", 0.15, 0.15),
        ("cheek/r-cheek-trans-up", 0.15, 0.15),
        ("eyebrows/eyebrows-trans-up", 0.6, 0.25),
        ("eyebrows/eyebrows-angle-up", 0.45, 0.0),
        ("eyes/l-eye-scale-incr", 0.4, 0.0),
        ("eyes/r-eye-scale-incr", 0.4, 0.0),
        ("chin/chin-jaw-drop-decr", 0.6, 0.6),
        ("chin/chin-height-incr", 0.35, 0.0),
        ("nose/nose-scale-vert-incr", 0.4, 0.0),
        ("head/head-oval", 0.3, 0.0),
        ("forehead/forehead-scale-vert-decr", 0.3, 0.0),
        ("neck/neck-scale-vert-incr", 0.0, 0.4),
    ],
    mood: 0.6,
    eye_forward: 0.0,
    lean: [-0.1, 0.14],
    gaze: [-0.1, 0.0],
    converge: 0.03,
    jaw_women: -0.35,
    kid: 0.0,
    cheeks: [0.0, 0.0],
    sockets: [0.0, 0.0],
    child: &[
        ("eyes/l-eye-height2-decr", 0.7, 0.4),
        ("eyes/r-eye-height2-decr", 0.7, 0.4),
        ("mouth/mouth-scale-horiz-incr", 0.45, 0.45),
        ("mouth/mouth-upperlip-volume-decr", 0.5, 0.5),
        ("mouth/mouth-lowerlip-volume-decr", 0.3, 0.3),
    ],
    genes: &[("lips", 0.4)],
    sources: &[
        Source { what: "gown (cote) of wool, pulled over the head, close at the shoulders, round neck", source: "Crowfoot, Pritchard & Staniland 1992 (London finds); Østergård 2004 (Herjolfsnes). Summaries only. Cut PLACEHOLDER." },
        Source { what: "hood with a short cape for men, worn on the head or thrown back", source: "Østergård 2004 (Herjolfsnes hoods); Newton 1980. Summaries only. Shares 4:3:3 PLACEHOLDER (unsourced)." },
        Source { what: "wool colours: undyed greys and browns, cheap dyes (russet, a dull blue)", source: "Statute concerning diet and apparel 1363 (russet and blanket for the poorest), read from a summary. Hex values PLACEHOLDER." },
        Source { what: "married women's hair covered by a linen veil, a wimple round the throat on older women and widows; girls in braids", source: "Newton 1980. Summary only. Ages 20 and 50 PLACEHOLDER (the simulation has no marriages yet)." },
        Source { what: "children under seven: the men's hair to the jaw with a fringe, girls and boys alike", source: "PLACEHOLDER, nothing read on small children's hair. Chosen because Apoleia's cropped hair begins far back on a child's large skull (a shaven head)." },
        Source { what: "men's hair in three lengths (to above the ear, to the ear's lobe, to the jaw), 3 : 5 : 2", source: "PLACEHOLDER: lengths and shares by eye, so that the men of a town do not all have one head." },
        Source { what: "men's hair to the jaw with a fringe", source: "PLACEHOLDER, to be checked against picture sources (Luttrell Psalter c. 1330, Holkham Bible)." },
        Source { what: "beards short or full; no long philosopher's beard, no beard on the chin alone", source: "PLACEHOLDER, to be checked against picture sources (Luttrell Psalter c. 1330). Apoleia's chin beard hangs as a tuft of long strands, which also reads badly." },
        Source { what: "no trimmings, belts' fittings or jewels on common people", source: "Not built: nothing read that shows them; rather none than invented ones." },
        Source { what: "share of red hair", source: "PLACEHOLDER. The two values are set so that of founders of the pool England draws from (alleles 20 to 170) about 5 in 100 have clearly red hair (a third of the red mixed in or more) and about 18 in 100 a tint of it. The 5 in 100 is an estimate, not a count: a press report (IrishCentral on a survey by BritainsDNA of 2,343 people, 2013, read as a summary) gives 34 to 40 in 100 carriers of a red-hair variant in Yorkshire and south-east Scotland; if the trait needs two such alleles, that is 4 to 6 in 100 with red hair. No source for 1356." },
        Source { what: "lids, closed mouth, the face at rest, a child's face, strength of moods, eyeballs' depth, lean, gaze and how far the eyes turn towards each other, women's jaw, lips, flush, brows, how much of Apoleia's paint (brow, cheeks, sockets) and child's face is left, a small child's brows, and how strongly the gene of the lips shows", source: "PLACEHOLDER, by eye against the reference pictures; not a matter of dress but kept with it so that Apoleia's faces stay as they were." },
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

/// The age MakeHuman's head is given for a person of `yrs` years, where a head has its adult form from `adult`
/// years on (`DressSet::adult`): as it is up to MakeHuman's child (11), from there to `adult` through the years
/// MakeHuman takes to 25, an adult's from then on.
pub fn head_years(adult: f32, yrs: f32) -> f32 {
    if yrs > 11.0 && yrs < 25.0 && adult > 11.0 && adult < 25.0 {
        (11.0 + (yrs - 11.0) / (adult - 11.0) * 14.0).min(25.0)
    } else {
        yrs
    }
}

/// How much of MakeHuman's child a head still is: all of it up to eleven, none from `adult` on (`head_years`).
pub fn child_share(adult: f32, yrs: f32) -> f32 {
    ((25.0 - head_years(adult, yrs)) / 14.0).clamp(0.0, 1.0)
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
    /// The hair of the head of a person with this seed: one of `hair_lengths` by its share, else `hair`.
    pub fn hair_of(&self, seed: u32) -> &'static str {
        let mut r = (seed / 10) % 10;
        for &(name, share) in self.hair_lengths {
            if r < share {
                return name;
            }
            r -= share;
        }
        self.hair
    }

    /// How strongly the gene `i` of the face shows in this dress (`genes`).
    pub fn gene_gain(&self, i: usize) -> f32 {
        self.genes.iter().find(|g| g.0 == crate::look::GENES[i]).map_or(1.0, |g| g.1)
    }

    /// Where one eye looks, seen from the head (yaw and pitch as `gaze`): `side` is 1 for the eye on the head's
    /// +x side and -1 for the other, `lean` how far the bust leans back.
    pub fn gaze_of(&self, side: f32, lean: f32) -> [f32; 2] {
        [self.gaze[0] - self.converge * side, self.gaze[1] - lean]
    }

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

    #[test]
    fn the_eyes_of_england_meet_in_front_of_the_face() {
        let e = Dress::England1356.set().unwrap();
        let (left, right) = (e.gaze_of(1.0, 0.1), e.gaze_of(-1.0, 0.1));
        // each eye is turned towards the nose by the same amount, about the direction both look in
        assert!(left[0] < right[0], "{left:?} {right:?}");
        assert!(((left[0] + right[0]) / 2.0 - e.gaze[0]).abs() < 1e-6);
        // so their lines of sight cross in front of the face, where somebody stands who is spoken to (the head's
        // eyes are 0.616 apart in its units, decimetres: between half a metre and two metres away)
        let at = 0.616 / (right[0].tan() - left[0].tan());
        assert!(at > 5.0 && at < 20.0, "they meet {at} in front");
        // the lean is taken out of the pitch, the same for both
        assert_eq!(left[1], right[1]);
        assert!((left[1] - (e.gaze[1] - 0.1)).abs() < 1e-6);
    }
}
