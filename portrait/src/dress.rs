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

/// A scar of a dress with a table (build.rs): a healed scar is a fine line in the skin itself, paler than the skin
/// round it and a little pink, that fades into it at both edges. Built as a ribbon that takes the skin's image,
/// normals and colours from where it lies, lighter along its middle. Apoleia's is a raised ribbon without the skin's
/// image, in a colour mixed for skin without one: on a face of the real look a dark brown strip with facets, bark
/// on the face (until round 72; two of the 36 people of England's sample wore one). PLACEHOLDER, by eye.
pub struct ScarLine {
    /// Half its breadth at its middle (0.1 = 1 cm); it narrows to three tenths of that at its ends.
    pub half: f32,
    /// The skin's colour times this along its middle (red, green, blue, in linear light).
    pub tone: [f32; 3],
}

/// The lips of a dress with a table (real_look.rs `real_skin`). Apoleia's are the builder's own: every facet that
/// the targets for full lips move, mixed towards one red, softened over its neighbours: a broad band without the
/// lips' outline, the same red on every skin. Measured against three mouths of the reference (round 66, CIELAB
/// against the lit cheek: lower lip 21 darker, 6 to 9 redder; upper lip 30 to 36 darker; the line between them 41
/// to 47 darker) that band was twice as red as a lip (17 to 18 redder), its upper lip 44 darker and the line
/// black (60 to 65 darker). In round 71 read anew at landmarks on the whole sample (tools/portrait/face_colour.mjs)
/// against the one face of the reference that is large enough (the woman of the ruler designer): the lower lip of
/// our grown women was as dark against the cheek as hers (24 against 23) but more orange (hue 43 degrees where
/// she and the emperor have 36): less skin and a blood with less green in it bring it to 37 degrees. All values
/// PLACEHOLDER, set by those measurements.
pub struct Lips {
    /// Where the red of the lips is (the file skin_lip.txt, per vertex along the lips' outline): the share of the
    /// skin's own colour that is kept,
    pub skin: f32,
    /// and the colour of the blood added to it (red, green, blue, in linear light). Lips are skin without its
    /// horn layer: they go with the skin's colour a little and are not one red for everyone.
    pub blood: [f32; 3],
    /// The upper lip's colour is the lips' times this. It faces down, away from the stage's lights, and the stage
    /// has no light thrown back up by the lower lip and the chest: without, it is a dark bar over the mouth.
    pub upper: f32,
    /// The seam of the lips. MakeHuman's closed mouth is a slit of a millimetre between the edges where the lips
    /// turn inward, through which one looks into the mouth; a strip from edge to edge closes it (morph.rs
    /// `LIP_SEAM`). It has the lips' colour times this, and so has the upper lip's edge: above 1, because the
    /// seam lies in the lips' own shade and the stage has no light that comes through flesh, which is what makes
    /// the line of a real mouth dark red instead of black. 0 = no strip, the slit stays open.
    pub seam: f32,
    /// How much of the lips' colour a child's lips have (1 = as a grown person's), growing to all of it as the
    /// head grows up (`child_share`): at a woman's strength a girl of eight wears paint.
    pub child: f32,
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
    /// Men's hair, loose and under the hood on the head; the hair under a veil (empty: none, the veil lies on
    /// forehead and cheeks and hides all of it); the hair of girls and of women too young for the veil.
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
    /// The file of the stubble. Apoleia's has the same hairs in the gap between the lips as its short beard; they
    /// are short, and seen large they lie on the lower lip as a row of dark dashes along the line of the mouth.
    /// England's `beard_stubble1356` is the same stubble with the mouth left free (beards.py `LIPS=1`).
    pub beard_stubble: &'static str,
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
    /// How much higher than MakeHuman's the brow's hairs lie, women and men, in millimetres along the skin: near
    /// the brow's inner end, over the pupil, over the eye's outer corner (evenly between them, the brow's tail as
    /// over the corner; `brow_lift_at`). MakeHuman's brow lies on the rim of the eye's socket: its upper edge
    /// 18.0, 16.9 and 16.9 mm above the line through the eyes' inner corners on the women of England (60 grown
    /// ones, with the face at rest), a band of 5 mm over the pupil. A young woman's lies at 15.7, 19.8 and 21.3 mm
    /// (36 women of 20 to 30; Matros, Garcia & Yaremchuk 2009, Plastic and Reconstructive Surgery 124: 1296-1301,
    /// read from the summary at dryaremchuk.com, the journal's volume and pages from memory); a man's lies lower
    /// and more level (Sclafani & Jung 2010, Archives of Facial Plastic Surgery 12(2), from the abstract, without
    /// numbers): the men's stay. A brow low and broad over the eye is what made the women read as men, and as
    /// glowering. With these values and `brow_band` the women's lie at 19.7, 19.6 and 19.5 mm: over the pupil as
    /// measured, the inner end higher and the outer lower than measured, because lifted by the measured numbers
    /// (the inner end down by 2, the outer up by 4) the brow slants and reads as a frown (tried in round 69).
    /// On a child's head none of it, growing in as the head gets its adult form (`brow_lift_of`).
    pub brow_lift: [[f32; 3]; 2],
    /// How broad the band of the brow's hairs is, women and men (1 = MakeHuman's, one brow for both sexes: its
    /// hairs span 5 mm over the pupil and more at the inner end). A woman's brow is the narrower. PLACEHOLDER, by
    /// eye against the reference. A child's as MakeHuman's (`brow_band_of`). Until round 71 the women's was 0.7:
    /// read in the picture at the reference's size (the lightness along a line from the upper lid up to the
    /// forehead), their brow was then 0.036 of the face's length broad at half its darkness, the reference's
    /// woman's 0.045, and darker than hers. With 0.9, and drawn less densely (profile.ts `brow.brows`), 0.036 to
    /// 0.039 still: the reference's brow has soft edges, ours a hard one. (The band is drawn together about its
    /// middle: its upper edge lies half a millimetre higher with 0.9 than the heights given at `brow_lift`, by
    /// reckoning, not measured anew.)
    pub brow_band: [f32; 2],
    /// Lips, women and men (real_look.rs `real_skin`).
    pub lips: [Lips; 2],
    /// The lash line, women and men: how far the lid's edge is drawn towards the lashes' colour where they grow
    /// (0 = not at all, Apoleia's; real_look.rs `real_skin`, the file skin_lash.txt). MakeHuman's lashes are long
    /// single hairs: drawn dense enough to frame the eye they stand off the lid as spikes, drawn thin (the stage's
    /// `brow.lashes`) the eye has no dark edge at all and lies in the face without an outline. Since round 68
    /// the line is broader on the upper lid (skin_lash.py `LINE`): at the size of the reference's eye ours was
    /// one and a half pixels of 27 where theirs is three.
    pub lash_line: [f32; 2],
    /// Red hair: the strength of the red gene (0..1, the mean of a person's two alleles) from which hair shows any
    /// red, and at which it shows all of it. Apoleia mixes red in from 0 on, in step with the gene: of people whose
    /// alleles come from 20 to 170 (the pool England draws from) the usual one then has orange hair.
    pub hair_red: [f32; 2],
    /// How much redder than Apoleia's the skin is over nose, cheeks, ears and chin (factor on settings::SKIN_RED),
    /// for women and for men; and the file of the real look that says where (per vertex of the head 0..1,
    /// tools/portrait/pipeline/skin_red.py; Apoleia's is skin_red.txt).
    pub flush: [f32; 2],
    pub flush_map: &'static str,
    /// How a scar is drawn (`ScarLine`); None = Apoleia's raised ribbon.
    pub scar: Option<ScarLine>,
    /// Lids at rest: MakeHuman's eyes are wide open and stare. Weights of the targets eye-height1, -height2,
    /// -height3 (decr) and eye-eyefold (down). Half as much as up to round 49: lids that far down over eyes that
    /// look past the viewer read as lifeless. Since round 68, with the iris at its real size, the three heights
    /// are set so that the opening is 0.30 as high as it is long seen from the front (a real one 0.34, Rana et
    /// al. 2023; the reference's about 0.26; before 0.35 round an iris half as large again), the upper lid
    /// over the top of the iris and the lower at its lower edge.
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
    /// the mouth as it comes. A negative share takes a target back. The lips are parted by the targets that shut
    /// them, taken back: until round 71 by mouth-lowerlip-middle-up, which for each millimetre it parts the lips
    /// draws the lower lip's foot down by four, so that a lower lip under an upper lip with a bow ended in a point
    /// (MakeHuman's names say where the lip's red grows to, not where its edge goes: -middle-down lifts the edge).
    pub mouth_shut: &'static [(&'static str, f32)],
    pub mouth_part: &'static [(&'static str, f32)],
    /// Face and bearing at rest, under every mood: MakeHuman's targets and their weights for women and for men.
    /// Its base has a mouth that turns down at the corners with a heavy lower lip, and brows low over the eyes,
    /// which on a calm face reads as lifeless; its man has a short neck with the head pushed forward, so that a
    /// gown's shoulders stand as high as his chin; its woman has a round head with a short nose and chin under
    /// small eyes, which under a veil reads as a child (the women's weights for brows, eyes, chin, nose, head and
    /// forehead). Since round 65 the brows stand higher on both (they lay on the upper lid: from the pupil to
    /// the brow 0.41 of the eye's width, in CK3's face 0.6 to 0.75), the men's eyes are larger (slits in a wide
    /// face), and both have cheekbones and a leaner head (the well-fed sample's faces were round and flat).
    /// Since round 69 the two sexes' faces are held against a survey of 3997 heads (src/measure.rs, Zhuang &
    /// Bradtmiller 2005): the weights above had made the women's faces as long as the men's and broader (200 grown
    /// of each sex: face length 0.99 of the men's, in the survey 0.92; cheekbones 152 mm across, the survey's
    /// women 135; from the mouth's line to the chin 7 % more than a man's), which read as men, and left the men's
    /// short (115 mm, the survey's 123) with narrow jaws and eyes close together. Now the women have no oval head (MakeHuman's is 11 mm broader at each
    /// cheekbone), a shorter chin, a narrower head and nose, softer cheeks; the men a longer face, a squarer jaw,
    /// a wider mouth, a nose that stands out further; both their eyes further apart. On 150 grown women and 150
    /// grown men every measure the survey has lies within half a standard deviation of its mean, and a woman's
    /// is the smaller by the survey's share (tests/faces.rs; `cargo run --example face_measure`).
    /// Since round 71 the mouth has a form: MakeHuman's upper lip is a flat band without a bow that stands out
    /// over a flat lower lip as a beak (seen from the side, a woman's upper lip 5.0 mm in front of her lower lip
    /// in the mean of 24; its young woman's lower lip lies 3 mm further back than the base's), which from the
    /// front is a dark bar over a pale crescent. A cupid's bow, a lower lip with some volume, and the women's
    /// lower jaw 1.4 mm forward: 3.0 mm. The red of the lips stays within the measure of real ones
    /// (src/measure.rs `LIPS`, tests/faces.rs).
    /// A boy's weight grows from the women's to the men's as he grows up (MakeHuman's child stands as
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
    /// How large the iris is, across, in millimetres (0 = as the ball's image has it, Apoleia's: 27.5 degrees of
    /// the ball, tools/portrait/pipeline/eye_tex.py). MakeHuman's eyeball is 30 mm across (a real one 24), and
    /// `rest` scales the eyes up on top of that: the iris was 14 to 17 mm across and, seen from the front, took
    /// 0.59 of the opening between the lids. Large irises in a small opening are a doll's eyes. A real iris is
    /// 11.71 mm across (SD 0.42; Rüfer, Schröder & Erb 2005, Cornea 24: 259-261, from the abstract) whatever the
    /// size of the head, in an opening of 25.6 mm (Rana et al. 2023, Int Ophthalmol 43: 2695-2701): 0.46 of it;
    /// in the reference 0.44.
    pub iris_mm: f32,
    /// A child's eyes: factors on the lids' three height weights and on `lash_line`, in full on a head that is
    /// MakeHuman's child and none where it has its adult form (`child_share`). A child's eyes are more open and
    /// its lashes fine: with the adults' values children looked out of narrowed, lined eyes. PLACEHOLDER.
    pub eyes_child: [f32; 2],
    /// Where the eyes look, seen from the head: turned about the vertical (radians, in the sense of the stage's
    /// `turn`, src/portrait/profile.ts: with the turn's sign the eyes come back towards whoever looks at the
    /// picture) and upwards. The lean is taken out of it, so that the eyes keep looking level. Apoleia's eyes look
    /// straight ahead of the head, past the viewer. Less than the stage's turn: turned all the way back to the
    /// viewer the irises stand in the corners of the eyes, a glance out of the corner of the eye (until round 60).
    /// A little downwards since round 68: MakeHuman's opening lies lower than the ball's middle, and an iris of
    /// real size that looks level shows white under it (a stare).
    pub gaze: [f32; 2],
    /// How far each eye is turned towards the nose on top of that (radians). Eyes that look at somebody near meet
    /// on them; eyes that stand parallel look through them into the distance. 0.03 lets them meet about a metre
    /// in front of the face.
    pub converge: f32,
    /// Women's jaws narrower on average: shift of the gene jaw. (Until round 69 of the gene headF as well, towards
    /// MakeHuman's oval head: that one is broader at the cheekbones, 11 mm a side, rather than softer at the jaw.)
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
    /// mouth with full lips, on which the genes for full lips and a narrow mouth give a pout: the mouth wider,
    /// the lips thinner. (Until round 55 they faded with `Look::grown`, which is at four fifths when a girl is
    /// eleven and her head still all child: the pout was strongest then. Until round 67 the lids were lowered
    /// here; since `lids` lowers everyone's, a child's share of that is `eyes_child`.)
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
    hair_veiled: "",
    hair_girl: "plait01",
    hair_small: "bob01",
    beards: [Beard::Shaven, Beard::Stubble, Beard::Short, Beard::Full, Beard::Full, Beard::Short],
    beard_full: "beard_crop",
    beard_short: "beard_short1356",
    beard_stubble: "beard_stubble1356",
    brows: ["eyebrow001", "eyebrow001"],
    brows_child: 0.6,
    brow_paint: [0.0, 0.0],
    brow_lift: [[3.0, 3.0, 3.5], [0.0, 0.0, 0.0]],
    brow_band: [0.9, 1.0],
    lips: [Lips { skin: 0.2, blood: [0.2, 0.068, 0.06], upper: 1.5, seam: 1.6, child: 0.6 }, Lips { skin: 0.2, blood: [0.2, 0.072, 0.066], upper: 1.5, seam: 1.6, child: 0.6 }],
    lash_line: [0.85, 0.75],
    hair_red: [0.45, 0.74],
    flush: [0.7, 0.5],
    flush_map: "skin_flush.txt",
    scar: Some(ScarLine { half: 0.016, tone: [1.4, 1.14, 1.22] }),
    lids: [[0.15, 0.4, 0.15, 0.3], [0.1, 0.35, 0.1, 0.3]],
    adult: [15.0, 17.0],
    mouth_shut: &[("mouth/mouth-upperlip-height-incr", 0.6), ("mouth/mouth-lowerlip-middle-down", 0.4)],
    mouth_part: &[("mouth/mouth-upperlip-height-incr", -0.5), ("mouth/mouth-lowerlip-middle-down", -0.5)],
    rest: &[
        ("mouth/mouth-angles-up", 0.3, 0.3),
        ("cheek/l-cheek-trans-up", 0.15, 0.15),
        ("cheek/r-cheek-trans-up", 0.15, 0.15),
        ("eyebrows/eyebrows-trans-up", 1.0, 1.0),
        ("eyebrows/eyebrows-angle-up", 0.45, 0.0),
        ("eyes/l-eye-scale-incr", 0.4, 0.5),
        ("eyes/r-eye-scale-incr", 0.4, 0.5),
        ("head/head-fat-decr", 0.0, 0.5),
        ("cheek/l-cheek-bones-incr", 0.15, 0.5),
        ("cheek/r-cheek-bones-incr", 0.15, 0.5),
        ("chin/chin-jaw-drop-decr", 0.6, 0.6),
        ("chin/chin-height-incr", 0.3, 0.15),
        ("nose/nose-scale-vert-incr", 0.4, 0.0),
        ("head/head-scale-vert-incr", 0.0, 0.2),
        ("head/head-scale-horiz-decr", 0.1, 0.0),
        ("head/head-square", 0.0, 0.3),
        ("mouth/mouth-scale-horiz-incr", 0.4, 0.3),
        ("eyes/l-eye-trans-out", 0.2, 0.3),
        ("eyes/r-eye-trans-out", 0.2, 0.3),
        ("nose/nose-scale-horiz-decr", 0.4, 0.0),
        ("nose/nose-scale-depth-incr", 0.0, 0.55),
        ("forehead/forehead-scale-vert-decr", 0.3, 0.0),
        ("neck/neck-scale-vert-incr", 0.0, 0.4),
        ("mouth/mouth-cupidsbow-incr", 0.6, 0.3),
        ("mouth/mouth-lowerlip-volume-incr", 0.3, 0.2),
        ("mouth/mouth-upperlip-volume-incr", 0.15, 0.0),
        ("chin/chin-prognathism-incr", 0.2, 0.0),
    ],
    mood: 0.6,
    eye_forward: 0.0,
    lean: [-0.1, 0.14],
    iris_mm: 11.7,
    eyes_child: [0.6, 0.5],
    gaze: [-0.1, -0.04],
    converge: 0.03,
    jaw_women: -0.2,
    kid: 0.0,
    cheeks: [0.0, 0.0],
    sockets: [0.0, 0.0],
    child: &[
        ("mouth/mouth-scale-horiz-incr", 0.45, 0.45),
        ("mouth/mouth-upperlip-volume-decr", 0.5, 0.5),
        ("mouth/mouth-lowerlip-volume-decr", 0.3, 0.3),
    ],
    genes: &[("lips", 0.4)],
    sources: &[
        Source { what: "gown (cote) of wool, pulled over the head, close at the shoulders, round neck", source: "Crowfoot, Pritchard & Staniland 1992 (London finds); Østergård 2004 (Herjolfsnes). Summaries only. Cut PLACEHOLDER." },
        Source { what: "hood with a short cape for men, worn on the head or thrown back", source: "Østergård 2004 (Herjolfsnes hoods); Newton 1980. Summaries only. Shares 4:3:3 PLACEHOLDER (unsourced)." },
        Source { what: "wool colours: undyed greys and browns, cheap dyes (russet, a dull blue)", source: "Statute concerning diet and apparel 1363 (russet and blanket for the poorest), read from a summary. Hex values PLACEHOLDER." },
        Source { what: "married women's hair covered by a linen veil, a wimple round the throat on older women and widows; girls in braids", source: "Newton 1980. Summary only. Ages 20 and 50 PLACEHOLDER (the simulation has no marriages yet). How the veil is worn (its rim on the forehead and on the cheeks in front of the ears, falling to the shoulders, no hair to be seen; the wimple under it, showing under the chin and round the throat): PLACEHOLDER, by eye against one veiled figure of the reference pictures (round 70)." },
        Source { what: "children under seven: the men's hair to the jaw with a fringe, girls and boys alike", source: "PLACEHOLDER, nothing read on small children's hair. Chosen because Apoleia's cropped hair begins far back on a child's large skull (a shaven head)." },
        Source { what: "men's hair in three lengths (to above the ear, to the ear's lobe, to the jaw), 3 : 5 : 2", source: "PLACEHOLDER: lengths and shares by eye, so that the men of a town do not all have one head." },
        Source { what: "men's hair to the jaw with a fringe", source: "PLACEHOLDER, to be checked against picture sources (Luttrell Psalter c. 1330, Holkham Bible)." },
        Source { what: "beards short or full; no long philosopher's beard, no beard on the chin alone", source: "PLACEHOLDER, to be checked against picture sources (Luttrell Psalter c. 1330). Apoleia's chin beard hangs as a tuft of long strands, which also reads badly." },
        Source { what: "no trimmings, belts' fittings or jewels on common people", source: "Not built: nothing read that shows them; rather none than invented ones." },
        Source { what: "share of red hair", source: "PLACEHOLDER. The two values are set so that of founders of the pool England draws from (alleles 20 to 170) about 5 in 100 have clearly red hair (a third of the red mixed in or more) and about 18 in 100 a tint of it. The 5 in 100 is an estimate, not a count: a press report (IrishCentral on a survey by BritainsDNA of 2,343 people, 2013, read as a summary) gives 34 to 40 in 100 carriers of a red-hair variant in Yorkshire and south-east Scotland; if the trait needs two such alleles, that is 4 to 6 in 100 with red hair. No source for 1356." },
        Source { what: "the iris 11.7 mm across, whatever the size of the head", source: "Rüfer, Schröder & Erb 2005, Cornea 24: 259-261 (white-to-white corneal diameter 11.71 mm, SD 0.42, 390 people of 10 to 80; from the abstract). Opening between the lids 25.6 mm long and 8.7 mm high: Rana et al. 2023, Int Ophthalmol 43: 2695-2701 (380 adults in Adelaide); the lids of England are by eye, not by that." },
        Source { what: "the measures of a woman's and a man's face (length, breadth at the cheekbones and at the jaw's corners, distance between the pupils, breadth and protrusion of the nose, length of the lips): the means of the face at rest", source: "Zhuang & Bradtmiller 2005, Head-and-face anthropometric survey of U.S. respirator users, Journal of Occupational and Environmental Hygiene 2(11): 567-576 (2543 men, 1454 women of 18 to 66; read from the copy at stacks.cdc.gov/view/cdc/190020). People of today: used for how the sexes differ and how a face's parts stand to each other. No measured heads of 1356 read." },
        Source { what: "a woman's brows above the rim of the eye's socket: the upper edge over the pupil 19.6 mm above the line through the eyes' inner corners", source: "Matros, Garcia & Yaremchuk 2009, Plastic and Reconstructive Surgery 124: 1296-1301 (36 women of 20 to 30: 15.7 mm over the inner corner, 19.8 over the pupil, 21.3 over the outer corner; numbers read from the summary at dryaremchuk.com, volume and pages from memory). The inner end is left higher than theirs and the outer lower: by those numbers the brow slants, and MakeHuman's with its heavy inner end then reads as a frown. Men: Sclafani & Jung 2010, Archives of Facial Plastic Surgery 12(2) (lower and more level; abstract, no numbers). The band's breadth PLACEHOLDER, by eye." },
        Source { what: "lids, closed mouth, the face at rest, a child's face, strength of moods, eyeballs' depth, lean, gaze and how far the eyes turn towards each other, a child's lids and lash line, women's jaw, cheeks and lifted inner brow, the lips' colour, the upper lip's share of it, the seam and a child's share of the colour, the form of the mouth (cupid's bow, the lips' volume, the lower jaw forward), the lash line, flush, where it lies and its strength for women and men, the line of a scar, brows, how much of Apoleia's paint (brow, cheeks, sockets) and child's face is left, a small child's brows, how strongly the gene of the lips shows, and that ears under a veil keep MakeHuman's form", source: "PLACEHOLDER, by eye against the reference pictures; not a matter of dress but kept with it so that Apoleia's faces stay as they were." },
        Source { what: "the height of the lips' red (upper, lower, both), which the form of the mouth is held against", source: "Ferrario, Sforza, Tartaglia, Sozzi & Carù 2003, Plastic and Reconstructive Surgery 111(7): 2149-2156 (89 men and 73 women, healthy young northern Italians, measured in three dimensions). Means from the paper's table; the standard deviations read from a summary of it. The lips' form itself and how far the upper lip stands in front of the lower: PLACEHOLDER, nothing read on real profiles." },
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

/// A brow's lift (`DressSet::brow_lift`) at the distance `ax` from the middle of the face, where the brow's inner
/// end, the pupil and the eye's outer corner lie at `xs` (morph.rs `eye_spans`): evenly between the three, and
/// beyond them as at the nearest.
pub fn brow_lift_at(ax: f32, xs: [f32; 3], lift: [f32; 3]) -> f32 {
    let k = if ax < xs[1] { 0 } else { 1 };
    let t = ((ax - xs[k]) / (xs[k + 1] - xs[k]).max(1e-6)).clamp(0.0, 1.0);
    lift[k] + (lift[k + 1] - lift[k]) * t
}

impl DressSet {
    /// Whether a person wears the veil (`veil_from`).
    pub fn veiled(&self, female: bool, yrs: f32) -> bool {
        female && yrs >= self.veil_from
    }

    /// The brow's lift for a person (`brow_lift`): the sex's own, by how much of the head has its adult form.
    pub fn brow_lift_of(&self, female: bool, yrs: f32) -> [f32; 3] {
        let k = if female { 0 } else { 1 };
        self.brow_lift[k].map(|mm| mm * (1.0 - child_share(self.adult[k], yrs)))
    }

    /// The breadth of the brow's band for a person (`brow_band`), by how much of the head has its adult form.
    pub fn brow_band_of(&self, female: bool, yrs: f32) -> f32 {
        let k = if female { 0 } else { 1 };
        1.0 + (self.brow_band[k] - 1.0) * (1.0 - child_share(self.adult[k], yrs))
    }

    /// The lips of a person, and how much of their colour that person has (`Lips::child`).
    pub fn lips_of(&self, female: bool, yrs: f32) -> (&Lips, f32) {
        let k = if female { 0 } else { 1 };
        (&self.lips[k], 1.0 + (self.lips[k].child - 1.0) * child_share(self.adult[k], yrs))
    }

    /// The factors of `eyes_child` for a person: on the lids' heights and on the lash line.
    pub fn eyes_of(&self, female: bool, yrs: f32) -> [f32; 2] {
        let young = child_share(self.adult[if female { 0 } else { 1 }], yrs);
        self.eyes_child.map(|k| 1.0 + (k - 1.0) * young)
    }
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

    #[test]
    fn a_child_of_england_has_a_childs_eyes_until_its_head_is_grown() {
        let e = Dress::England1356.set().unwrap();
        // in full while the head is MakeHuman's child, none on a grown head, in between as the head grows
        for female in [true, false] {
            assert_eq!(e.eyes_of(female, 2.0), e.eyes_child);
            assert_eq!(e.eyes_of(female, 10.0), e.eyes_child);
            assert_eq!(e.eyes_of(female, 30.0), [1.0, 1.0]);
            let between = e.eyes_of(female, 13.0);
            for k in 0..2 {
                assert!(between[k] > e.eyes_child[k] && between[k] < 1.0, "{between:?}");
            }
        }
        // a girl's head is grown earlier than a boy's
        assert!(e.eyes_of(true, 14.0)[0] > e.eyes_of(false, 14.0)[0]);
    }
}
