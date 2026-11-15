//! Who is drawn: the genes as they show, sex, age, the look of the stand,
//! the life lived (food, sun, scars, illness) and the choices of beard,
//! hair, headwear and jewellery that follow from them (the Werkstatt's
//! rules; PLACEHOLDER where they are unsourced).

use crate::geo::{c01, chain, cmix, hex, sm, Rgb, Rng};

pub const NG: usize = 34;
/// The genes in byte order, as apoleia_sim::dna::GENES.
pub const GENES: [&str; NG] = [
    "headW", "headH", "headF", "fore", "jaw", "chin", "chinH", "cheek", "noseL", "noseW", "hump", "tip", "eyeS", "eyeD", "brow",
    "browA", "ear", "earF", "mouthW", "lips", "neck", "weight", "muscle", "typA", "typB", "typC", "skin", "hairL", "hairR", "eye",
    "curl", "bald", "grey", "beardG",
];
pub const FACE_GENES: usize = 21;
pub const WEIGHT: usize = 21;
pub const MUSCLE: usize = 22;
pub const TYP_A: usize = 23;
pub const TYP_B: usize = 24;
pub const TYP_C: usize = 25;
pub const SKIN: usize = 26;
pub const HAIR_L: usize = 27;
pub const HAIR_R: usize = 28;
pub const EYE: usize = 29;
pub const CURL: usize = 30;
pub const BALD: usize = 31;
pub const GREY: usize = 32;
pub const BEARD_G: usize = 33;

/// The face genes' morph targets: none for the head shape (oval or
/// square), one name with "#" for both sides, or several names; then the
/// suffixes for low and high values.
pub const FACE: [(&[&str], &str, &str); FACE_GENES] = [
    (&["head/head-scale-horiz"], "decr", "incr"),
    (&["head/head-scale-vert"], "decr", "incr"),
    (&[], "", ""),
    (&["forehead/forehead-scale-vert"], "decr", "incr"),
    (&["chin/chin-width"], "decr", "incr"),
    (&["chin/chin-prominent"], "decr", "incr"),
    (&["chin/chin-height"], "decr", "incr"),
    (&["cheek/#-cheek-bones"], "decr", "incr"),
    (&["nose/nose-scale-vert"], "decr", "incr"),
    (&["nose/nose-scale-horiz"], "decr", "incr"),
    (&["nose/nose-hump"], "decr", "incr"),
    (&["nose/nose-point"], "down", "up"),
    (&["eyes/#-eye-scale"], "decr", "incr"),
    (&["eyes/#-eye-trans"], "in", "out"),
    (&["eyebrows/eyebrows-trans"], "down", "up"),
    (&["eyebrows/eyebrows-angle"], "down", "up"),
    (&["ears/#-ear-scale"], "decr", "incr"),
    (&["ears/#-ear-flap"], "decr", "incr"),
    (&["mouth/mouth-scale-horiz"], "decr", "incr"),
    (&["mouth/mouth-upperlip-volume", "mouth/mouth-lowerlip-volume"], "decr", "incr"),
    (&["neck/neck-scale-horiz"], "decr", "incr"),
];

/// The real look (crate::real, or APOLEIA_FACE_MODULES alone): each face gene as a factor of a
/// small face space that moves a whole region together, its own target
/// first, then the shapes that go with it (a morphable model, Blanz & Vetter,
/// 1999; facial traits in linked modules, Claes et al., 2018; neither
/// verified online). Per load: target ("#" both sides, "" = oval/square),
/// low and high suffix, weight per unit of the gene. Weights fitted so that
/// the widths and heights spread as in Farkas's norms (PLACEHOLDER).
pub const FACE_MOD: [&[(&str, &str, &str, f32)]; FACE_GENES] = [
    // headW: the whole face wider or narrower, cheekbones and jaw with it
    &[("head/head-scale-horiz", "decr", "incr", 1.0), ("cheek/#-cheek-bones", "decr", "incr", 0.3), ("chin/chin-width", "decr", "incr", 0.25)],
    // headH: a long or short face, the chin follows
    &[("head/head-scale-vert", "decr", "incr", 1.0), ("chin/chin-height", "decr", "incr", 0.3)],
    // headF: oval (soft jaw angle) .. square (marked angle, wide jaw)
    &[("", "", "", 1.0), ("chin/chin-bones", "decr", "incr", 0.7), ("head/head-diamond", "", "", -0.25)],
    // fore: high forehead .. low; a strong brow ridge with deep-set eyes, sloping
    &[("forehead/forehead-scale-vert", "decr", "incr", 1.0), ("forehead/forehead-nubian", "decr", "incr", -0.9), ("eyebrows/eyebrows-trans", "backward", "forward", -0.6), ("eyes/#-eye-push1", "in", "out", 0.5), ("forehead/forehead-trans", "backward", "forward", 0.4)],
    // jaw: narrow (diamond) .. wide lower face, the jaw angle with it
    &[("head/head-triangular", "", "", 1.3), ("head/head-diamond", "", "", -2.9), ("chin/chin-width", "decr", "incr", 1.2), ("chin/chin-bones", "decr", "incr", 1.0), ("neck/neck-scale-horiz", "decr", "incr", 0.3)],
    // chin: receding .. jutting chin, the lower jaw with it, a cleft on a strong chin
    &[("chin/chin-prominent", "decr", "incr", 1.2), ("chin/chin-prognathism", "decr", "incr", 0.6), ("chin/chin-cleft", "decr", "incr", 0.5)],
    // chinH: short .. long chin, the jaw lower
    &[("chin/chin-height", "decr", "incr", 0.9), ("chin/chin-jaw-drop", "decr", "incr", 0.5)],
    // cheek: flat .. high cheekbones, hollow beneath them
    &[("cheek/#-cheek-bones", "decr", "incr", 1.3), ("cheek/#-cheek-inner", "decr", "incr", 0.6), ("cheek/#-cheek-volume", "decr", "incr", -0.5), ("forehead/forehead-temple", "decr", "incr", -0.3)],
    // noseL: short .. long nose, a longer one deeper and with a lower base
    &[("nose/nose-scale-vert", "decr", "incr", 2.0), ("nose/nose-scale-depth", "decr", "incr", 0.8), ("nose/nose-base", "up", "down", 1.0)],
    // noseW: narrow .. broad nose: wings, nostrils and tip
    &[("nose/nose-scale-horiz", "decr", "incr", 1.6), ("nose/nose-flaring", "decr", "incr", 0.7), ("nose/nose-nostrils-width", "decr", "incr", 0.6), ("nose/nose-point-width", "decr", "incr", 0.5), ("nose/nose-width2", "decr", "incr", 0.5)],
    // hump: concave .. straight Greek .. humped, the bridge with it
    &[("nose/nose-hump", "decr", "incr", 1.4), ("nose/nose-curve", "concave", "convex", 0.8), ("nose/nose-greek", "decr", "incr", 0.6), ("nose/nose-width1", "decr", "incr", 0.4)],
    // tip: drooping .. upturned tip, nostrils and septum follow
    &[("nose/nose-point", "down", "up", 1.3), ("nose/nose-septumangle", "decr", "incr", 0.6), ("nose/nose-nostrils-angle", "down", "up", 0.5), ("nose/nose-volume", "decr", "incr", -0.4)],
    // eyeS: small .. large eyes, more open
    &[("eyes/#-eye-scale", "decr", "incr", 1.0), ("eyes/#-eye-height2", "decr", "incr", 0.5)],
    // eyeD: close .. wide set eyes, an inner fold on wide set ones
    &[("eyes/#-eye-trans", "in", "out", 1.4), ("eyes/#-eye-epicanthus", "in", "out", 0.4)],
    // brow: low brows with hooded lids .. high brows, open lids
    &[("eyebrows/eyebrows-trans", "down", "up", 1.2), ("eyes/#-eye-eyefold", "down", "up", 0.8), ("eyes/#-eye-bag-height", "decr", "incr", -0.3)],
    // browA: brows and eye corners slanting down .. up
    &[("eyebrows/eyebrows-angle", "down", "up", 1.2), ("eyes/#-eye-corner1", "down", "up", 0.6), ("eyes/#-eye-corner2", "down", "up", 0.4)],
    // ear: small .. large ears
    &[("ears/#-ear-scale", "decr", "incr", 1.2)],
    // earF: flat .. sticking out
    &[("ears/#-ear-flap", "decr", "incr", 1.3)],
    // mouthW: narrow .. wide mouth, the bow of the upper lip with it
    &[("mouth/mouth-scale-horiz", "decr", "incr", 1.1), ("mouth/mouth-cupidsbow-width", "decr", "incr", 0.4)],
    // lips: thin .. full lips, a marked bow and philtrum on full ones
    &[("mouth/mouth-upperlip-volume", "decr", "incr", 1.2), ("mouth/mouth-lowerlip-volume", "decr", "incr", 1.2), ("mouth/mouth-cupidsbow", "decr", "incr", 0.6), ("mouth/mouth-philtrum-volume", "decr", "incr", 0.4)],
    // neck: thin .. thick neck, the back of the head deeper
    &[("neck/neck-scale-horiz", "decr", "incr", 1.0), ("head/head-back-scale-depth", "decr", "incr", 0.5)],
];

/// The child's face in the face genes' terms (-1 low .. 1 high): a round
/// head with a high forehead, a small chin, jaw, nose and mouth, full
/// cheeks, large eyes and a short neck (the "Kindchenschema", Lorenz 1943;
/// Glocker et al., 2009), on top of MakeHuman's baby and child shapes. A
/// child shows it fully and its own genes damped; both fade as it grows up
/// (`Look::grown`). PLACEHOLDER (eyeballed).
pub const KID: [f32; FACE_GENES] = [
    0.07, -0.09, -0.2, 0.25, -0.16, -0.18, -0.23, -0.23, -0.29, -0.14, -0.36, 0.23, 0.41, 0.0, 0.05, 0.0, 0.0, 0.0, -0.14, 0.0, -0.16,
];

/// How a stand dresses and lives (the Werkstatt's seven).
pub struct Stand {
    pub key: &'static str,
    pub bg: [&'static str; 2],
    pub tunic: &'static [&'static str],
    pub toga: bool,
    /// Width of the purple stripe (clavus), 0 for none.
    pub stripe: f32,
    pub work: f32,
    pub food: f32,
    pub palla: Option<&'static str>,
    pub chlamys: Option<&'static str>,
    /// Share of the day outdoors.
    pub sun: f32,
}

pub const SKLAVE: usize = 0;
pub const BAUER: usize = 1;
pub const HANDWERKER: usize = 2;
pub const HAENDLER: usize = 3;
pub const DECURIO: usize = 4;
pub const SENATOR: usize = 5;
pub const KAISER: usize = 6;

pub const STANDS: [Stand; 7] = [
    Stand { key: "sklave", bg: ["#5a524a", "#2c2826"], tunic: &["#b8ab92", "#a99c84"], toga: false, stripe: 0.0, work: 0.25, food: -0.12, palla: None, chlamys: None, sun: 0.8 },
    Stand { key: "bauer", bg: ["#5d6440", "#2b2e1f"], tunic: &["#7a5a3c", "#6d6a44", "#8a7a5a"], toga: false, stripe: 0.0, work: 0.25, food: -0.05, palla: None, chlamys: None, sun: 0.85 },
    Stand { key: "handwerker", bg: ["#7a5f2c", "#3a2d16"], tunic: &["#9c7a3e", "#7d5f40", "#6b6f78"], toga: false, stripe: 0.0, work: 0.15, food: 0.0, palla: None, chlamys: None, sun: 0.45 },
    Stand { key: "haendler", bg: ["#2c6469", "#14302f"], tunic: &["#3e6b8a", "#8a3e3e", "#3e7a5a"], toga: false, stripe: 0.0, work: 0.0, food: 0.08, palla: None, chlamys: None, sun: 0.4 },
    Stand { key: "decurio", bg: ["#37507a", "#1a263c"], tunic: &["#e8e2d4"], toga: true, stripe: 0.05, work: -0.05, food: 0.12, palla: Some("#3c5a8a"), chlamys: None, sun: 0.2 },
    Stand { key: "senator", bg: ["#7a3030", "#3a1616"], tunic: &["#ece6d8"], toga: true, stripe: 0.11, work: -0.1, food: 0.15, palla: Some("#7a2f3a"), chlamys: None, sun: 0.1 },
    Stand { key: "kaiser", bg: ["#5c3270", "#2a1633"], tunic: &["#e6dccb"], toga: false, stripe: 0.0, work: -0.05, food: 0.15, palla: Some("#5b1f6e"), chlamys: Some("#4a1a5a"), sun: 0.1 },
];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mood {
    Neutral,
    Content,
    Grim,
    Sad,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Beard {
    Shaven,
    Stubble,
    Short,
    Full,
    Philosopher,
    Chin,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Hair {
    /// Braid from the nape up over the crown (Scheitelzopf).
    Braid,
    /// Coiled bun in the nape (Nackenknoten).
    Bun,
    /// The palla drawn over the head.
    Veil,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Hat {
    None,
    /// Pannonian felt cap.
    Cap,
    Pileus,
    Petasos,
    Wreath,
    Diadem,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Jewel {
    None,
    Earrings,
    Chain,
    Pearls,
}

/// The life lived, as it shows in the face: food 0..1 (0.55 as needed),
/// share of work outdoors 0..1, scars, illness 0..1; mourning 0..1 (a death
/// in the household, fading), wealth 0..1 (the share of people around who
/// have less), clothes worn out 0..1 (the share of the clothing needed that
/// the household lacks).
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Life {
    pub food: f32,
    pub sun: f32,
    pub scars: u32,
    pub ill: f32,
    pub mourn: f32,
    pub wealth: f32,
    pub worn: f32,
}

impl Default for Life {
    fn default() -> Life {
        Life { food: 0.55, sun: 0.4, scars: 0, ill: 0.0, mourn: 0.0, wealth: 0.5, worn: 0.0 }
    }
}

#[derive(Clone, Debug)]
pub struct Look {
    /// Per gene the mean of the two alleles, 0..255.
    pub genes: [f32; NG],
    pub female: bool,
    pub age: f32,
    /// One of STANDS.
    pub stand: usize,
    /// From Graecia, Syria or Aegyptus, where full beards are usual.
    pub east: bool,
    /// Random but fixed per person (tunic colour, beard style, …).
    pub seed: u32,
    pub mood: Mood,
    pub life: Life,
    /// Choices, otherwise from stand, age and seed.
    pub beard: Option<Beard>,
    pub hair: Option<Hair>,
    pub hat: Option<Hat>,
    pub jewel: Option<Jewel>,
}

impl Look {
    /// 0..255.
    pub fn g(&self, i: usize) -> f32 {
        self.genes[i]
    }
    /// 0..1.
    pub fn u(&self, i: usize) -> f32 {
        self.genes[i] / 255.0
    }
    pub fn st(&self) -> &'static Stand {
        &STANDS[self.stand.min(STANDS.len() - 1)]
    }

    /// How far grown up: 0 for a baby, 1 from 15 (girls) or 17 (boys).
    pub fn grown(&self) -> f32 {
        sm(1.0, if self.female { 15.0 } else { 17.0 }, self.age)
    }

    /// A face gene as it shows (-1 .. 1), the child's face mixed in.
    pub fn face(&self, i: usize) -> f32 {
        let g = self.grown();
        (self.g(i) - 128.0) / 127.0 * (0.35 + 0.65 * g) + KID[i] * (1.0 - g)
    }

    /// The gene as it shows: muscles grow with work, weight with food.
    pub fn phen(&self, i: usize) -> f32 {
        let mut v = self.u(i);
        if i == MUSCLE {
            v += self.st().work * if self.female { 0.6 } else { 1.0 } * c01((self.age - 12.0) / 10.0);
        }
        if i == WEIGHT {
            v += (self.life.food - 0.55) * 0.62 * c01((self.age - 4.0) / 20.0);
        }
        c01(v)
    }

    pub fn beard_style(&self) -> Beard {
        use Beard::*;
        if self.female || self.age < 16.0 {
            return Shaven;
        }
        if let Some(b) = self.beard {
            return b;
        }
        let r = Rng::new(self.seed ^ 0x9e37_79b9).next();
        // a man in mourning does not shave
        let b = self.usual_beard(r);
        if self.life.mourn > 0.25 && b == Shaven {
            return Stubble;
        }
        b
    }

    fn usual_beard(&self, r: f32) -> Beard {
        use Beard::*;
        if self.age < 20.0 {
            return [Shaven, Stubble, Stubble, Short][(r * 4.0) as usize];
        }
        let mut l: Vec<Beard> = match self.stand {
            SKLAVE => vec![Stubble, Short, Full, Shaven],
            BAUER => vec![Stubble, Short, Full, Full],
            HANDWERKER => vec![Short, Full, Stubble, Chin],
            HAENDLER => vec![Short, Chin, Full, Shaven],
            DECURIO => vec![Short, Stubble, Short, Full],
            SENATOR => vec![Short, Stubble, Philosopher, Short],
            _ => vec![Short, Stubble, Short, Short],
        };
        if self.age > 50.0 || self.east {
            l.extend([Full, Philosopher]);
        }
        l[((r * l.len() as f32) as usize).min(l.len() - 1)]
    }

    pub fn hat_style(&self) -> Hat {
        if let Some(h) = self.hat {
            return h;
        }
        if self.age < 16.0 {
            return Hat::None;
        }
        if self.stand == KAISER {
            return if self.female { Hat::Diadem } else { Hat::Wreath };
        }
        if self.female {
            return Hat::None;
        }
        let r = Rng::new(self.seed ^ 0x6a09_e667).next();
        let t: &[(f32, Hat)] = match self.stand {
            SKLAVE => &[(0.3, Hat::Pileus)],
            BAUER => &[(0.25, Hat::Petasos), (0.4, Hat::Pileus)],
            HANDWERKER => &[(0.25, Hat::Pileus)],
            HAENDLER => &[(0.15, Hat::Petasos)],
            DECURIO => &[(0.2, Hat::Cap)],
            SENATOR => &[(0.15, Hat::Cap)],
            _ => &[],
        };
        t.iter().find(|(q, _)| r < *q).map_or(Hat::None, |x| x.1)
    }

    pub fn jewel_style(&self) -> Jewel {
        if let Some(j) = self.jewel {
            return j;
        }
        // girls wear the lunula until 13 (build.rs), no other jewellery;
        // a woman in mourning lays hers aside
        if !self.female || self.age < 13.0 || self.life.mourn > 0.25 {
            return Jewel::None;
        }
        let r = Rng::new(self.seed ^ 0x3c6e_f372).next();
        match self.stand {
            BAUER if r < 0.35 => Jewel::Earrings,
            HANDWERKER => {
                if r < 0.5 {
                    Jewel::Earrings
                } else {
                    Jewel::Chain
                }
            }
            HAENDLER => {
                if r < 0.4 {
                    Jewel::Earrings
                } else {
                    Jewel::Chain
                }
            }
            DECURIO => Jewel::Chain,
            SENATOR | KAISER => Jewel::Pearls,
            _ => Jewel::None,
        }
    }

    pub fn hair_style(&self) -> Hair {
        if let Some(h) = self.hair {
            return h;
        }
        if self.age < 13.0 {
            return Hair::Bun;
        }
        // in mourning under the veil, which the clothes' colour darkens
        if self.life.mourn > 0.25 {
            return Hair::Veil;
        }
        let r = Rng::new(self.seed ^ 0x85eb_ca6b).next();
        use Hair::*;
        let t: &[Hair] = match self.stand {
            SKLAVE | BAUER => &[Bun, Bun, Veil],
            HANDWERKER => &[Bun, Braid, Veil],
            HAENDLER => &[Braid, Bun, Veil],
            DECURIO => &[Braid, Braid, Veil, Bun],
            SENATOR => &[Braid, Braid, Veil],
            _ => &[Braid, Veil],
        };
        t[((r * t.len() as f32) as usize).min(t.len() - 1)]
    }

    pub fn skin(&self) -> Rgb {
        chain(&["#f0d2bb", "#e2b896", "#cf9a72", "#ad754c", "#8a5838", "#633f29", "#47301f"], self.u(SKIN))
    }

    pub fn hair_colour(&self) -> Rgb {
        let mut c = chain(&["#1a1411", "#3e281a", "#6e4a2a", "#a07a45", "#d9bb78"], self.u(HAIR_L));
        c = cmix(c, hex("#a4461d"), self.u(HAIR_R) * 0.75);
        let start = 28.0 + (1.0 - self.u(GREY)) * 32.0;
        cmix(c, hex("#cfcac2"), c01((self.age - start) / 25.0))
    }

    pub fn eye_colour(&self) -> Rgb {
        chain(&["#2e1c10", "#4f3219", "#6b5a2e", "#5b6b4a", "#55788a", "#6f92b8"], self.u(EYE))
    }

    /// The scars' lines in the base mesh's front view.
    pub fn scars(&self) -> Vec<Scar> {
        let mut r = Rng::new(self.seed ^ 0x1656_67b1);
        let mut out = Vec::new();
        let types = [ScarAt::Cheek, ScarAt::Brow, ScarAt::Chin, ScarAt::Forehead, ScarAt::Cheek];
        for _ in 0..self.life.scars {
            let ty = types[((r.next() * types.len() as f32) as usize).min(types.len() - 1)];
            let sg = if r.next() < 0.5 { -1.0 } else { 1.0 };
            out.push(match ty {
                ScarAt::Cheek => {
                    let x = 0.36 + 0.12 * r.next();
                    let y = 6.95 + 0.15 * r.next();
                    Scar { at: ty, x0: sg * x, y0: y + 0.12, x1: sg * (x + 0.1 + 0.06 * r.next()), y1: y - 0.1, bx: None }
                }
                ScarAt::Brow => {
                    let x = 0.22 + 0.22 * r.next();
                    Scar { at: ty, x0: sg * (x - 0.02), y0: 7.7, x1: sg * (x + 0.02), y1: 7.45, bx: Some(sg * x) }
                }
                ScarAt::Chin => {
                    let x = 0.04 + 0.12 * r.next();
                    Scar { at: ty, x0: sg * x, y0: 6.36, x1: sg * (x + 0.08), y1: 6.27, bx: None }
                }
                ScarAt::Forehead => {
                    let x = 0.25 * r.next();
                    Scar { at: ty, x0: sg * x, y0: 7.95, x1: sg * (x + 0.12), y1: 7.8, bx: None }
                }
            });
        }
        out
    }
}

/// The Werkstatt's life of a person without a simulation: from the stand,
/// plus chance. PLACEHOLDER (unsourced shares).
pub fn default_life(stand: usize, age: f32, seed: u32) -> Life {
    let mut r = Rng::new(seed ^ 0x27d4_eb2f);
    let st = &STANDS[stand.min(STANDS.len() - 1)];
    let food = c01(0.55 + st.food * 1.6 + (r.next() - 0.5) * 0.3);
    let sun = c01(st.sun + (r.next() - 0.5) * 0.3) * if age < 8.0 { 0.4 } else { 1.0 };
    let scar_p = match stand {
        SKLAVE => 0.45,
        BAUER => 0.3,
        HANDWERKER => 0.35,
        _ => 0.12,
    };
    let scars = if age > 16.0 && r.next() < scar_p { 1 + (r.next() * 2.0) as u32 } else { 0 };
    let ill = if r.next() < 0.08 { 0.4 + 0.4 * r.next() } else { 0.0 };
    Life { food, sun, scars, ill, ..Life::default() }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ScarAt {
    Cheek,
    Brow,
    Chin,
    Forehead,
}

#[derive(Clone, Copy, Debug)]
pub struct Scar {
    pub at: ScarAt,
    pub x0: f32,
    pub y0: f32,
    pub x1: f32,
    pub y1: f32,
    /// A scar through the brow leaves a gap there at this x.
    pub bx: Option<f32>,
}
