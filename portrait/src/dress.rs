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
    /// Common people of 1356 whose own dress is not drawn yet (`PLAIN_1356`).
    Plain1356,
    /// (round 144) People of rank in England's dress: a lord, a lady and their families (`COURT_1356`).
    Court1356,
    /// (round 144) Who wears a crown in it: a king, an emperor, a queen who reigns (`CROWNED_1356`).
    Crowned1356,
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

/// (round 121) How a woman wears her hair, by a digit of her seed (`DressSet::veils`, `veil_of`).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Veil {
    /// No veil: a girl's hair (`DressSet::hair_girl`).
    None,
    /// The veil set back on the head and falling loose beside the cheeks (`DressSet::veil_back`): the hair under
    /// it (`hair_veiled`) shows over the forehead and at the temples.
    Back,
    /// The veil on forehead and cheeks (`DressSet::veil`): no hair to be seen, and none under it.
    Closed,
}

/// (round 111) Tightly curled hair of a dress with a table: no bundles that run from a whorl to a cut, one springy
/// mass that stands off the skull (tools/portrait/pipeline/hair_body.py, the cuts `coil01` ...). Whoever's curl
/// (the gene's share, 0 to 1) lies over `from` wears it in place of the table's other hair: Apoleia's rule gives
/// every man over 0.62 the one curly cut, which on the hair of Africa south of the Sahara (the pools draw 0.89
/// and more there) is a European's wavy bowl cut.
pub struct Coily {
    pub from: f32,
    /// A man's and a boy's; a woman's and a girl's; a child's under seven.
    pub men: &'static str,
    pub women: &'static str,
    pub small: &'static str,
    /// A man's who is losing his hair (cropped close), and one's who has lost it on top.
    pub thin: &'static str,
    pub bald: &'static str,
    /// The image all of them are drawn with (`fleece_tex.py`): small coils lying every way.
    pub image: &'static str,
    /// The cuts whose painted layer and scalp lie under them (`<name>_cap`, `<name>_scalp`): a full head's, and a
    /// head's that is bare on top.
    pub under: [&'static str; 2],
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
/// she and the emperor have 36): less skin and a blood with less green in it bring it to 37 degrees. That was
/// under a light that lit the face level and from the front. Under the light of rounds 73 to 81 (from the side
/// and above) the same lips read 28 L darker than a woman's lit cheek (hers 23) and 34 on a man (the emperor's
/// 26), while the skin over the upper lip stood as hers: in round 82 more of the skin's own colour and less
/// blood, and a blood with less red for men: 22.4 and 25.2, a* 6.1 and 8.6 over the cheek's (hers 6.2, the
/// emperor's 7.1). Those values were read through three.js' ACES curve, which bends red, green and blue each on
/// its own and so shows a dark red darker and redder than it is painted. Since round 103 England's picture is
/// finished through a curve that keeps a colour's hue (src/portrait/finish.ts): the lips of round 82 read 15 L
/// under a woman's lit cheek and less red than it (a* -1.9), a grey mauve. The red now stands in the paint: less
/// of the skin's own colour (0.12 and 0.3, before 0.30 and 0.42) and a blood with half the green and blue for
/// women, twice the red for men. Tried: as red as the reference's numbers ask of a woman (a* 8.8 over the
/// cheek; skin 0.08, blood 0.30, 0.03, 0.03) read as lipstick on a farmer's wife, since the lips' red ends at
/// a sharp line where a real lip fades into the skin; a man's at a* 6.5 over his cheek the same. What the
/// picture reads now stands in docs/PORTRAITS.md (round 103). The upper lip, which the steeper curve and a key
/// light further round left 13.8 L (the reference's 21.0), is painted half as light again as before round 78
/// (`upper` 1.5). The seam's factor follows so that the strip is about as light as it was. Round 106 read a
/// man's lips on the men who wear no beard over them (until then the mean of all men, with a beard's hair in
/// it): 18.0 L under the lit cheek where the emperor's are 25.8, pink. A man's keep 0.24 of the skin's colour
/// (0.3) with a blood of 0.30, 0.05, 0.05 (0.33, 0.075, 0.074): 22.4 L under the cheek, a* 6.5 over it (7.1);
/// darker with the blood's colour as it was lost the red (a* 3.9). Round 107 set the mouths beside those of
/// five women of the reference at the same size: by one reading (the reddest fifth of the box round the mouth
/// against the lit cheek) theirs are 21.2 L under the cheek and a* 5.7 over it, ours were 21.8 and 2.1, as dark
/// and a third as red, and the seam's line 12 L darker than theirs. A woman's lips keep 0.17 of the skin's
/// colour (0.12): by the gauntlet's reading 22.1 L under the cheek and a* 5.0 over it (24.5 and 4.3; by the
/// sheet's reading 20.5 and 2.2 after it, hardly moved: there the cheek it is held against is the redder one,
/// a* 24.6 where theirs is 18.5, and the seam's line is still 13 L darker than theirs). On the
/// broader faces of that round a man's lips with the blood of round 106 read lighter again; his blood is 0.265,
/// 0.030, 0.032: 22.4 and 6.2 on the shaven (tried: 0.28, 0.046, 0.046 gave 21.3 and 5.7; 0.25, 0.036, 0.037
/// gave 22.8 and 4.7). His seam's factor is 1.1 so that the strip keeps nine tenths of the skin's red under the
/// darker lips (0.88 at 1.0). Round 113: the stage lights the shaded half of a face in the skin's colour, with
/// a red fill, and on the warmer skin the lips of round 107 stood out pink; their blood has less blue (a
/// woman's 0.27, 0.026, 0.020, a man's 0.275, 0.025, 0.019). By the gauntlet's reading a woman's are 21.5 L
/// under her lit cheek, a* 4.7 over it and b* 4.7 under it, a shaven man's 23.0, 6.1 and 4.5 (four faces of the
/// reference read in that round: 19.5 to 26.8 L under, a* 7.1 to 10.7 over, b* 3.2 to 5.3 under). All values
/// PLACEHOLDER, set by those measurements.
pub struct Lips {
    /// Where the red of the lips is (the file skin_lip.txt, per vertex along the lips' outline): the share of the
    /// skin's own colour that is kept,
    pub skin: f32,
    /// and the colour of the blood added to it (red, green, blue, in linear light). Lips are skin without its
    /// horn layer: they go with the skin's colour a little and are not one red for everyone.
    pub blood: [f32; 3],
    /// The upper lip's colour is the lips' times this. It faces down, away from the stage's key light. Until
    /// round 77 the stage had no light thrown back up by the chest, and the upper lip was a dark bar over the
    /// mouth unless painted half as light again (1.5). Since round 78 the stage has that light (`bounce` in
    /// src/portrait/profile.ts, until round 82 its `fill`): 1.15 kept a grown woman's upper lip where the
    /// reference's is (L 20.7 against 21.0; at 1.0 it read 18.3, at 1.5 27.2). With the lips of round 82 it is
    /// 36.7 L darker than the lit cheek (the reference's 35.1; 37.1 under the lights of round 83). 1.5 again
    /// since round 103 (see `Lips`): L 18.6 on a grown woman.
    pub upper: f32,
    /// The seam of the lips. MakeHuman's closed mouth is a slit of a millimetre between the edges where the lips
    /// turn inward, through which one looks into the mouth; a strip from edge to edge closes it (morph.rs
    /// `LIP_SEAM`; since round 99 the lips lie on each other, `DressSet::seam_shut`, and the strip closes what
    /// is left: a ledge, the lower lip's edge lying behind the upper's, seen from above alone). It has the
    /// lips' colour times this, and so has the upper lip's edge: above 1, because the
    /// seam lies in the lips' own shade and the stage has no light that comes through flesh, which is what makes
    /// the line of a real mouth dark red instead of black. 0 = no strip, the slit stays open. 1.3 since the lips
    /// are lighter (round 82; 1.6 before): the strip keeps the colour it had, about the skin's own red. 1.43 and
    /// 1.0 (women, men) since round 103, when the lips' red went into their paint: about as light as it was.
    pub seam: f32,
    /// How much of the lips' colour a child's lips have (1 = as a grown person's), growing to all of it as the
    /// head grows up (`child_share`): at a woman's strength a girl of eight wears paint.
    pub child: f32,
    /// (round 111) Lips of dark skin: the luminance of the person's skin colour (in linear light) from which
    /// downward less of the blood's colour shows, and the power it falls by (real_look.rs `real_skin`): melanin
    /// lies in the lips' skin too. 0.38 is under the darkest skin England's pool draws (0.39), so its lips stay
    /// as they were; at the darkest skin of all (0.03) a fifth of the blood's colour is left and the lips are
    /// the skin's own colour, a little redder. By eye, PLACEHOLDER: no measured colour of lips on dark skin read.
    pub dark: [f32; 2],
}

/// The face as it is drawn, over the face as it is measured (round 107). Until then England's grown had heads of
/// human measure (`rest`, held against a survey of real heads), and beside real pictures of the reference they
/// read narrow, long and gaunt, with small eyes: scaled to the same length from the eyes' line to the chin, a face
/// of the reference is broader by a quarter and its pupils stand further apart by as much, its eyes lie half way
/// up the head under a high forehead, and the chin is short. The reference draws its people, as a painter does:
/// a broad face, a large braincase, large eyes set wide, a small mouth. This is that drawing as a layer of its
/// own, so that what is measured stays measured: the tests against the surveys read the head without it
/// (morph.rs `morph_test_measured`), the picture shows the head with it. A head that is MakeHuman's child has
/// none of it and grows into it as it gets its adult form (`style_of`): a child's large braincase and eyes are in
/// the tables of `skull` and `eyes_child` already, by a survey of children. All values PLACEHOLDER, by eye on
/// sheets that set the sample beside the reference's faces at the same size (docs/PORTRAITS.md, round 107).
pub struct Style {
    /// MakeHuman's targets and the weights added to those of `rest`, women's and men's; a weight under 0 takes
    /// that much of a row of `rest` back.
    pub face: &'static [(&'static str, f32, f32)],
    /// The braincase larger by these factors, on top of `skull` (breadth, length, height; morph.rs `skull_grow`).
    pub skull: [f32; 3],
    /// The lids' three heights at rest (`lids`, not the fold) times this: eyes more open.
    pub lids: f32,
    /// The iris across, in millimetres, in place of `iris_mm`: larger with the larger opening it lies in.
    pub iris_mm: f32,
    /// (round 115) How much narrower the lower face is drawn at the chin, women's and men's: every vertex of the
    /// face's front between the cheekbones and the chin drawn towards the middle by this share times its place in
    /// the band (none at the cheekbones, all of it at the chin, morph.rs `jaw_narrow`). The broader head of
    /// `face` widens the jaw as much as the cheekbones, and beside the reference the faces were pears.
    /// Round 117: 0.2 for women where round 115 had 0.3, and at the jaw's sides only (`JAW_NARROW`). Round 115
    /// held the outline to 1.4, 1.0 and 0.7 lengths (eyes, mouth, under the mouth), read once by hand; read again
    /// on two faces of the reference with a ruler over the picture it is 1.41, 1.14, 0.9 and 1.16, 1.08, 0.83.
    pub jaw: [f32; 2],
    /// (round 117) How much narrower the chin's end is drawn, women's and men's: every vertex of the face's front
    /// under the line of the mouth drawn towards the middle by this share times its place on the way down to the
    /// chin's lowest point (morph.rs `chin_round`).
    pub chin: [f32; 2],
    /// (round 117) How soft the jaw's lower edge is drawn, women's and men's: how far the skin along it goes
    /// towards the middle of its neighbours at each pass (morph.rs `jaw_soften`).
    pub edge: [f32; 2],
}

/// (round 112) How a face follows the person's weight. MakeHuman's targets of weight move the body and the neck
/// and leave the face as it is (measured: the arcs from ear to ear over chin and nose do not change by a tenth of
/// a millimetre from the lightest to the heaviest body): every face was the same lean face. The fullness of a
/// face is tanh(`spread` x how far the weight lies from its middle, 0.5): -1 the thinnest, 1 the fullest, and a
/// child has of it what it has of its own genes (`Look::grown`).
pub struct Fullness {
    pub spread: f32,
    /// MakeHuman's targets ("#": both sides), and the weight of each on the thinnest and on the fullest face.
    pub targets: &'static [(&'static str, f32, f32)],
    /// How much further the cheeks are filled out on the fullest face, in mm, women's and men's, on top of
    /// `DressSet::cheek_fill` (morph.rs `cheek_fill`). MakeHuman's own target for a fuller cheek
    /// (`cheek-volume-incr`) lays a pouch beside the mouth, as cheeks blown up.
    pub fill: [f32; 2],
}

/// A dress: the garments (images and bound shapes under public/portrait/real), their colours, who wears what on
/// the head, the hair, and how the faces are read.
pub struct DressSet {
    /// The start of the look's name on the wire; the stage lights by it.
    pub key: &'static str,
    /// The origins that wear it.
    pub origins: &'static [&'static str],
    /// The body garment. England's is a gown with a round neck, close at the throat: what is worn on the head
    /// (hoods, veil, wimple) was draped over it, and under a wimple, which ends at that neckline, it is worn
    /// as it is.
    pub gown: &'static str,
    /// The gown as it is cut at the neck where the neck shows: for women and girls before the wimple, for men
    /// and boys (empty: `gown`), each drawn with `gown`'s image where it has none of its own. England's (round
    /// 110): a woman's neckline cut wide, out onto the shoulders, and a man's opened in front in a V a hand
    /// deep.
    pub gown_cut: [&'static str; 2],
    /// (round 150) The image the gown and its cuts are drawn with in place of `gown`'s (empty: `gown`'s): another
    /// cloth for the same gown. Its name begins with `gown`'s: the builder and the tests find a gown by that.
    pub gown_image: &'static str,
    /// (round 156) A figured silk: the image some gowns are drawn with in place of `gown_image` (empty: none), the
    /// same cloth with a figure woven in in gold thread (`tools/portrait/pipeline/silk_figure.py`; the figure is
    /// the image's covering, and the stage draws it as gold). Its name begins with `gown_image`'s. Who wears it:
    /// those whose seed's ninth digit from the right is set in `figured`.
    pub gown_figured: &'static str,
    pub figured: [bool; 10],
    /// (round 151) The file the gown with the round neck is read from in place of `gown`'s (empty: `gown`'s): the
    /// same gown in another fit. `gown` stays the name the builder knows the gown by, and its image's.
    pub gown_file: &'static str,
    /// What is worn under those cuts and shows at the neck, women's and men's (empty: nothing): a layer of
    /// linen that lies on the skin, the second drawn with the first's image where it has none of its own.
    /// England's (round 110): a woman's smock, its edge a finger's breadth inside her gown's neckline, and a
    /// man's shirt, close round the neck, in the opening of his gown. Under the wimple none is drawn: the
    /// wimple covers the neckline. `under_image`: the linen's image, for an under-garment that has none of its
    /// own and for the linen that shows in a laced front (round 149: a table may have no smock to show and
    /// still lace over linen).
    pub under: [&'static str; 2],
    pub under_image: &'static str,
    /// Wool colours of gown and hood: a cloth's own colour (the stage draws wool lighter than that,
    /// src/portrait/profile.ts `cloth`). England's until round 108 were greys with a breath of colour (four of
    /// the six with the strongest of red, green and blue under 1.3 times the weakest): set beside the
    /// reference's clothes they were one dark grey, chroma 7 in the picture where its clothes have 17. Since then
    /// the same six (two undyed, a brown, a dull blue, a russet, an olive) with more colour, the dyed ones 1.5
    /// to 2.1 times: chroma 17. PLACEHOLDER, by eye.
    pub wool: &'static [&'static str],
    /// Linen of veil and wimple.
    pub linen: &'static str,
    /// Men's hood by the seed's last digit, from this age; the garments on the head and thrown back.
    pub hood: [Hood; 10],
    pub hood_from: f32,
    pub hood_up: &'static str,
    pub hood_back: &'static str,
    /// (round 136) The same hoods with the cape's hem dagged, cut into tongues with a round end (the files'
    /// names, on the head and thrown back; empty: the table has none; `tools/portrait/pipeline/dag.py` cuts
    /// them out of the plain hoods' files), drawn with the plain hoods' images, and the share of the hoods
    /// that are such, by the seed (`hood_file`). That common men wore dagged hoods then is from the pages in
    /// `sources`; the share, the tongues' number, depth and form are by eye: PLACEHOLDER.
    pub hood_dagged: [&'static str; 2],
    pub hood_dags: f32,
    /// (round 148) A hood's facing of fur: the image of the roll of fur that lies along the edge of a hood's
    /// opening (round the face of a hood on the head, round the neck of one thrown back; facing.rs lays it on
    /// the hood; empty: the table's hoods are of their wool to the edge), and the fur's colour.
    pub hood_fur: &'static str,
    pub hood_fur_dye: &'static str,
    /// Women from this age wear the veil (younger: braids), from the second age the wimple under it.
    pub veil_from: f32,
    pub wimple_from: f32,
    /// (round 121) How a woman of the veil's age wears it, by the third digit of her seed from the right
    /// (`veil_of`), and the age up to which one whose digit says `Veil::None` goes without it, in a girl's
    /// plaits (from then on: `Veil::Back`).
    /// England: until round 120 every woman from 20 wore `veil` on forehead and cheeks: eight grown women of
    /// the sample, eight grey ovals of linen with a face in each, and no hair on any grown woman's head; of ten
    /// women of the reference eight show their hair (docs/PORTRAITS.md, round 121). Now five in ten wear the
    /// veil set back over parted hair and two as before; three wear plaits until 30 and the veil set back after.
    /// The shares and the age are PLACEHOLDER: the simulation has no marriages, and nothing was read on how many
    /// women of twenty to thirty were unmarried in 1356 or on how many wore the veil which way.
    pub veils: [Veil; 10],
    pub unveiled_until: f32,
    pub veil: &'static str,
    /// The veil worn set back (`Veil::Back`), drawn with `veil`'s image. Empty: the table has none, and such a
    /// woman wears `veil`.
    pub veil_back: &'static str,
    pub wimple: &'static str,
    /// (round 153) The images the veil (worn either way) and the wimple are drawn with in place of their own
    /// (empty: their own): another linen for the same cloths. Each name begins with its cloth's: the builder and
    /// the tests find a veil and a wimple by that, and the stage knows linen by it.
    pub veil_image: &'static str,
    pub wimple_image: &'static str,
    /// Men's hair, loose and under the hood on the head; the hair under a veil set back (`Veil::Back`; empty:
    /// the table has none, and every veil is `Veil::Closed`, which lies on forehead and cheeks and hides all
    /// hair): its painted layer and scalp are `hair_girl`'s (`under_of`); the hair of girls and of women who go
    /// without the veil.
    pub hair: &'static str,
    /// Other lengths of the same cut and other cuts, each with its share in ten (by the person's seed); the rest
    /// wear `hair`. With one length every man of a town has the same head.
    pub hair_lengths: &'static [(&'static str, u32)],
    /// (round 125) Those of `hair` and `hair_lengths` that are parted hair, not a cut round the whorl
    /// (tools/portrait/pipeline/hair_body.py `page01`: parted in the middle, falling over the ears, cut at the
    /// jaw; round 130 `page02`: the same in waves): they have no painted layer and no scalp of their own, and the builder takes `hair_girl`'s
    /// (`under_of`), whose hairline theirs is.
    pub hair_parted: &'static [&'static str],
    /// The age from which a man wears it; a boy whose seed draws it wears `hair` until then (on a boy of 8 parted
    /// hair to the jaw is a girl's head). PLACEHOLDER, by eye.
    pub hair_parted_from: f32,
    /// (round 133) Cuts of `hair_lengths` that are another cut with its ends dressed (tools/portrait/pipeline/
    /// hair_body.py `bob09`: `bob07` with its ends turned out and up in rolls), each with that other cut: they
    /// have no painted layer and no scalp of their own, and the builder takes the other's (`under_of`); a boy
    /// under `hair_parted_from` whose seed draws one wears the other.
    pub hair_dressed: &'static [(&'static str, &'static str)],
    /// The same on a head that loses its hair: gone back at the temples, and a horseshoe round a bare top.
    /// The same on a head with curls (wavy, standing off the head).
    pub hair_curly: &'static str,
    pub hair_receding: &'static str,
    pub hair_bald: &'static str,
    pub hair_hooded: &'static str,
    pub hair_veiled: &'static str,
    pub hair_girl: &'static str,
    /// (round 126) A woman's plaits pinned up: each laid from below the ear forward under the lobe and up in front
    /// of the ear to the temple, a loop beside the cheek (tools/portrait/pipeline/styles.py `PLAIT_LOOP`; empty:
    /// the table has none). The hair of the head, its painted layer and its scalp are `hair_girl`'s, and so is the
    /// strands' image (`under_of`). Who wears them: of those who wear plaits, the ones of `hair_looped_from` years
    /// and more whose seed's digit is set in `looped`; girls wear their plaits hanging.
    pub hair_looped: &'static str,
    pub hair_looped_from: f32,
    pub looped: [bool; 10],
    /// (round 128) A fillet: a stiffened band of linen round the head, standing on the hair like a low crown
    /// (the file's name, `tools/portrait/pipeline/fillet.py`; empty: the table has none), in the table's linen
    /// colour. Who wears it: of the women who show their plaits (`Veil::None`), the ones of `fillet_from` years
    /// and more whose seed's fifth digit from the right is set in `fillets`. The band's form is from one
    /// secondary page (`sources`); the share and the age are by eye: PLACEHOLDER.
    pub fillet: &'static str,
    pub fillet_from: f32,
    pub fillets: [bool; 10],
    /// (round 146) A circlet: a band of gilt metal round the head, on the hair, with stones set in it (the file's
    /// name, `tools/portrait/pipeline/crown.py` with `CROWN_PLAIN`; empty: the table has none), in `crown_gold`
    /// and the first two of `crown_stones`. Who wears a fillet (`fillet_of`) wears it in the fillet's place.
    pub circlet: &'static str,
    /// (round 147) A man's circlet: the same band fitted round the hair that lies flat (`hair_hooded`, and a bare
    /// top's horseshoe). Who wears it: a man from the age his gown is buttoned (`fasten_from`) with nothing else
    /// on the head (no hood on it, no coif, no hat) whose seed's fifth digit from the right is set in
    /// `circlets_men`; his hair lies flat under it (`hair_flat`).
    pub circlet_men: &'static str,
    pub circlets_men: [bool; 10],
    /// (round 129) How a gown is closed in front (fasten.rs), a woman's and a man's, by the sixth digit of the
    /// seed from the right, from `fasten_from` years (hers, his); a child's is pulled over the head. Lace and
    /// buttons are of the gown's cloth and colour. England's women: five in ten laced, two in ten buttoned, three
    /// in ten not opened. That common women laced the gown in front and had buttons of the gown's own cloth is
    /// from one secondary page (`sources`); the shares and the age are by eye: PLACEHOLDER.
    /// (round 131) England's men: two in ten buttoned, the others' pulled over the head as before: the pages read
    /// (`sources`) have the cotehardie buttoned in front down to the girdle and the cheaper, looser ones without
    /// a fastening. The share and the age are by eye: PLACEHOLDER.
    pub fastens: [[crate::fasten::Fasten; 10]; 2],
    pub fasten_from: [f32; 2],
    /// (round 144) What a gown's buttons are of: empty, the gown's own cloth (the common people's: `fastens`);
    /// else a metal's colour, and the buttons are of that metal, drawn as metal (fasten.rs `fasten`).
    pub buttons: &'static str,
    /// (round 144) A crown: a circlet of gold round the head, on the hair, with fleurons standing on it and
    /// stones set in it (the file's name, `tools/portrait/pipeline/crown.py`: the gold, and beside it
    /// `<name>_stones`; empty: the table has none), and the colours of its gold and of its stones (the stones of
    /// the circlet in turn, the stone of a large fleuron, the pearls). Everybody of the table wears it.
    pub crown: &'static str,
    pub crown_gold: &'static str,
    pub crown_stones: [&'static str; 4],
    /// (round 144) Mi-parti: a man's gown of two cloths, one on each side of the body. Who wears it: the men of
    /// `fasten_from` years and more whose seed's eighth digit from the right is set here; the second cloth is the
    /// table's next wool but one.
    pub parted: [bool; 10],
    /// (round 145) A mantle: the file of a cloth that lies round the shoulders and the back over the gown, open
    /// in front (`tools/portrait/pipeline/mantle.py`; empty: the table has none), and the colour of its cloth.
    /// Its facing of fur along both front edges and round the neck is drawn with the image `mantle_fur`; it is
    /// held by two brooches and a cord between them (mantle.rs). `mantle_dyes`: the colours of the fur, of the
    /// brooches' gold, of their stones and of the cord. Everybody of the table wears it.
    pub mantle: &'static str,
    pub mantle_cloth: &'static str,
    pub mantle_fur: &'static str,
    pub mantle_dyes: [&'static str; 4],
    /// (round 132) A man's coif: a close cap of linen over the hair and the ears, tied under the chin (the file's
    /// name, `tools/portrait/pipeline/coif.py`; empty: the table has none), in the table's linen colour and
    /// drawn with the fillet's image. Who wears it: the men of `coif_from` years and more whose seed's last
    /// digit is set in `coifs` (the digit that says how the hood is worn: only where `hood` says `Hood::None`).
    /// Under it the head's hair is drawn as its painted layer alone, without the body of bundles: the cap lies
    /// close on the skull. England: one man in ten from 30. That men wore it, of linen and tied under the chin,
    /// and that it was going out of use among them in the 14th century is from the pages in `sources`; the
    /// share, the age and its cut are by eye: PLACEHOLDER.
    pub coif: &'static str,
    pub coif_from: f32,
    pub coifs: [bool; 10],
    /// (round 134) A man's felt hat: a round crown and a broad brim (the file's name, `tools/portrait/pipeline/
    /// hat.py`, with an image of its own; empty: the table has none), in one of `hat_tones` by the seed (undyed
    /// wool). Who wears it: the men of `hat_from` years and more whose seed's last digit is set in `hats` (the
    /// digit that says how the hood is worn) and who have no hood on the head and no coif: bare-headed
    /// otherwise, or over a hood thrown back. Under it the hair lies flat, as under a hood, and shows below
    /// the brim; a bare top keeps its horseshoe. England: two men in ten from 15. That peasant men wore a
    /// large round felt hat is from the pages in `sources`; the shares, the age, the brim's breadth and the
    /// colours are by eye: PLACEHOLDER.
    pub hat: &'static str,
    /// (round 135) The same hat with its brim turned up behind and drawn out to a point in front, drawn with
    /// `hat`'s image (the file's name; empty: the table has none): of those who wear a hat, the half whose
    /// seed's eighth digit is under 5 (`hat_file`). That men of all classes wore such a hat in the 14th century
    /// is from one page in `sources`; the share and its form are by eye: PLACEHOLDER.
    pub hat_cocked: &'static str,
    pub hat_from: f32,
    pub hats: [bool; 10],
    pub hat_tones: &'static [&'static str],
    /// The hair of children under seven. Apoleia's `crop01`, cropped short, begins far back on a child's large
    /// skull: half the head a bare forehead, which reads as a shaven head.
    /// England: until round 104 the grown's `bob01`, whose fringe ends 2 cm over the eyes. A small child's face is
    /// small under a large braincase (`skull`), and its forehead is the larger part of what a picture shows of
    /// it: with the fringe at the brows a child of two was a small adult under a bowl. Round 105: `bob08`, a cut
    /// of its own (tools/portrait/pipeline/README.md): the fringe 46 to 52 mm over the eyes, in the forehead's
    /// upper half, ragged; the sides to the ear's lobe; lying closer to the head. By eye, PLACEHOLDER.
    pub hair_small: &'static str,
    /// Tightly curled hair (`Coily`); none: the table's other hair on every head.
    pub coily: Option<Coily>,
    /// A boy younger than this wears the girls' image of the skin (0: the men's at any age). MakeHuman's image of
    /// a young man has the shade of a shaven beard round mouth and jaw and coarser pores: on a boy of eight it was
    /// a man's stubble, and with the forms of a grown man's face coming in from one year on (`grown`) a boy of
    /// thirteen read as a man of thirty. 14 (round 106): where the beard's first down comes. By eye, PLACEHOLDER.
    pub boy_skin: f32,
    /// The image of a hair's body (the file `<hair>_body`, tools/portrait/pipeline/hair_body.py: a cut modelled
    /// in Blender as layers of thick bundles, round 109) where the file has none of its own beside it: one image
    /// for the bundles of every cut. Until round 108 a head's hair was locks (`<hair>_locks`, some 950 narrow
    /// arched bands, drawn with an image `hair1356_locks`): a thatch on the skull beside the reference's hair.
    pub body_image: &'static str,
    /// The image of a beard's locks (the file `<beard>_locks`, tools/portrait/pipeline/beards.py; arched bands
    /// of `hairlib.py` `locks_from_wisps`, frayed at both ends by this image).
    pub beard_lock_image: &'static str,
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
    /// Since round 79 it has a real beard's number of hairs, 49 to the square centimetre (Apoleia's 153; real
    /// beards 19 to 55), over a lighter shade of its own: see `stubble_paint` and docs/PORTRAITS.md.
    pub beard_stubble: &'static str,
    /// How much of Apoleia's paint the skin under stubble keeps (1 = all of it). Apoleia mixes the skin of the
    /// beard's zone towards a dark brown, facet by facet (build.rs `stub_c`, `in_beard`; 0.2 to 0.6 of it on a
    /// grown man): the grains of its faceted look, which stayed under the real look's layer of hairs. Measured on
    /// England's stage (round 79), that paint alone made a man's jaw 17 L darker than the same skin without, the
    /// layer of hairs alone 23, both 33; a dark full beard is 44 to 54 darker. The paint ends at the zone's edge
    /// as a line across the cheek, and the zone leaves the skin over the upper lip free, where the hairs then lay
    /// pale on light skin. 0: the layer of hairs has a shade of its own, in its image, that fades out with them.
    pub stubble_paint: f32,
    /// The brows, women's and men's (a boy wears the men's): which of MakeHuman's. Of those tried, Apoleia's
    /// `eyebrow001` alone sits level on these heads. `eyebrow011` (women's until round 53), `eyebrow005` and
    /// `eyebrow002` are finer but sit slanted, the inner end low over the eye: on every woman that read as a
    /// frown. How heavy a brow reads is `brows` in the stage's profile (src/portrait/profile.ts).
    pub brows: [&'static str; 2],
    /// The image drawn on the brow's cards, if not the one that comes with `brows` ("" = that one). The cards and
    /// their place on the head stay those of `brows`. Apoleia's `eyebrow001.webp` was written with the hairs'
    /// coverage times 2.5 (tools/portrait/pipeline `tex.py`, `ALPHA_GAIN`): where MakeHuman's image has single
    /// hairs with soft edges that thin out towards the brow's rim and its tail, that one is a closed band with a
    /// hard rim. Seen at a game's size the band is a dark bar; the reference's brow is darkest in its core and
    /// fades into the skin. `eyebrow1356.webp` is MakeHuman's image written as it is (gain 1), drawn more densely
    /// in turn (the stage's `brow.brows`, src/portrait/profile.ts: 0.8, before 0.5), and with the thin streak at
    /// the brow's outer end faded out (`brow_tail.py`: on the head it was a drawn line from the brow's tail down
    /// towards the temple). Read in the picture at the reference's size, a grown woman's brow is 38.2 L darker
    /// than the skin over it and 0.045 of the face's length broad at half its darkness (the reference's woman's
    /// 37.9 and 0.045; with Apoleia's image 38.9 and 0.050), a man's 36.6 and 0.036 (37.2 and 0.039).
    pub brow_image: &'static str,
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
    /// 0.039 still: the reference's brow has soft edges, ours a hard one. Since round 76 the hairs are soft
    /// (`brow_image`) and the women's brow is as broad as the reference's. (The band is drawn together about its
    /// middle: its upper edge lies half a millimetre higher with 0.9 than the heights given at `brow_lift`, by
    /// reckoning, not measured anew.) Round 114: 1.15 for women. Set beside five faces of the reference, eye by
    /// eye at one size, the women's brows were thin lines over the eye where theirs are a band; by round 71's
    /// own reading ours at 0.9 was a sixth to a fifth narrower than the reference's woman's. By eye and by that
    /// reading, PLACEHOLDER; the men's, which lie under the fringe on most, stay.
    pub brow_band: [f32; 2],
    /// (round 112) How the gene "browT" makes a person's brows lighter or heavier, per unit of the gene as the
    /// face shows it (`Look::shown` times `settings::FACE_GAIN`: about -0.55 on the lightest brows, 0.55 on the
    /// heaviest): how much broader the band of the brow's hairs is (a factor on `brow_band` of 1 + this x the
    /// gene), and how far the hairs' colour is mixed towards the skin's on a light brow (this x the gene, on the
    /// low side alone: a thin brow is a sparse one). Up to round 111 every woman wore one brow and every man
    /// another. PLACEHOLDER, by eye.
    pub brow_gene: [f32; 2],
    /// (round 114) How far the colour of everyone's brow hairs goes towards the skin's, women and men (0 = the
    /// hair's colour at three quarters, as until then; `brow_gene` lightens a light brow further). Set beside five
    /// faces of the reference eye by eye at one size, ours were strokes of near black over the eye, theirs a soft
    /// band of a brown between the hair's and the skin's. By eye, PLACEHOLDER.
    pub brow_soft: [f32; 2],
    /// Lips, women and men (real_look.rs `real_skin`).
    pub lips: [Lips; 2],
    /// The lash line, women and men: how far the lid's edge is drawn towards the lashes' colour where they grow
    /// (0 = not at all, Apoleia's; real_look.rs `real_skin`, the file skin_lash.txt). MakeHuman's lashes are long
    /// single hairs: drawn dense enough to frame the eye they stand off the lid as spikes, drawn thin (the stage's
    /// `brow.lashes`) the eye has no dark edge at all and lies in the face without an outline. Since round 68
    /// the line is broader on the upper lid (skin_lash.py `LINE`): at the size of the reference's eye ours was
    /// one and a half pixels of 27 where theirs is three. Until round 76 the values were 0.85 and 0.75; since
    /// then the lashes themselves are a soft dark fringe (`lash_image`) and the line is drawn weaker by as much
    /// as keeps the lid's rim as dark as it was (read at the reference's size, against the skin over the brow:
    /// women -59.5 L, men -53.8; before -59.4 and -54.0; with the fringe on the old line -62.2 and -55.9; the
    /// reference's woman about -46). Weaker still (0.55, 0.45) an old woman's lid has no dark edge of its own
    /// left (tests/portrait.test.ts holds it).
    pub lash_line: [f32; 2],
    /// The lower lid's rim: the share of the lash line that is painted on it, and the share of the socket's shade
    /// (skin_ao.txt) that stays on it; [1, 1] = as the tables say. The socket's shade is darkest where a lid lies
    /// against the ball, on both lids alike, and the lash line lay on the lower lid at half the upper's weight
    /// (skin_lash.py `LOWER`): together a dark line all round the eye, as drawn with a pen, which is a large
    /// part of a stare. An eye's lashes are thick on the upper lid and few on the lower, and the lower lid's rim
    /// faces up, to the light. Which vertices are the lower lid's is read from the lash table (real_look.rs).
    /// PLACEHOLDER, by eye on faces drawn at 896 by 1120 beside the reference's eyes. Round 118.
    pub lid_under: [f32; 2],
    /// The image drawn on the lashes' cards, if not MakeHuman's `Eyelashes01` ("" = that one). MakeHuman's is a row
    /// of long single hairs: drawn thin they do not show, drawn dense they stand off the lid as a doll's
    /// (rounds 65 and 76). `Eyelashes1356.webp` is the same hairs blurred into a soft fringe, and the lower lid's
    /// much thinner than the upper's (tools/portrait/pipeline `lash_soft.py`): seen from the front a row of
    /// lashes is a dark soft edge on the upper lid that runs out past the eye's outer corner, not single hairs.
    /// The stage draws it twice as densely as MakeHuman's (`brow.lashes` 0.6, before 0.3). Its name has to begin
    /// with `Eyelashes`, a brow's with `eyebrow`: by the name the stage tells them from hair cards
    /// (src/portrait/materials.ts `surfaceKind`).
    pub lash_image: &'static str,
    /// (round 114) The colour of the lashes and of the lash line: this share of the hair's colour, mixed half
    /// and half with this dark. Apoleia's is half the hair's colour with `#140d08`, nearly black: beside the
    /// reference the lid's rim was a black line where theirs is a dark brown (the darkest third of the eye's
    /// opening read 53 L under the lit cheek and without colour on ours, 39 under and brown on five faces of
    /// theirs). By eye, PLACEHOLDER.
    pub lash_tone: (f32, &'static str),
    /// Red hair: the strength of the red gene (0..1, the mean of a person's two alleles) from which hair shows any
    /// red, and at which it shows all of it. Apoleia mixes red in from 0 on, in step with the gene: of people whose
    /// alleles come from 20 to 170 (the pool England draws from) the usual one then has orange hair.
    pub hair_red: [f32; 2],
    /// Hair's lightness: the strengths of the lightness gene (0..1, the mean of a person's two alleles) at which
    /// black hair passes into dark brown, dark brown into light brown and light brown into blonde
    /// (`look::SHADES` says where those are in the row of hair's colours). Apoleia takes the gene as the place in
    /// the row: of people whose alleles come from 50 to 220 (the pool England draws from) 68 in 100 then have the
    /// same middle brown (the gene between 0.4 and 0.7), none has black hair and none blonde (round 157).
    pub hair_shades: [f32; 3],
    /// How much redder than Apoleia's the skin is over nose, cheeks, ears and chin (factor on settings::SKIN_RED),
    /// for women and for men; and the file of the real look that says where (per vertex of the head 0..1,
    /// tools/portrait/pipeline/skin_red.py; Apoleia's is skin_red.txt). The women's 0.65 since round 107 (0.7):
    /// on the broader cheek of that round the red patch is larger, and five women of the reference are hardly
    /// redder on the cheek than on the forehead (a* 1.1; its woman in the game 5, ours 4.7 with this value and
    /// 5.4 before). Less was tried (0.45, 0.55): at 0.55 the lit cheek's a* (20.4) and hue (52 degrees) fall out of
    /// the gauntlet's limits.
    pub flush: [f32; 2],
    pub flush_map: &'static str,
    /// (round 112) How much stronger `flush` is per unit of the gene "ruddy" as the face shows it (as `brow_gene`):
    /// a factor of 1 + this x the gene, from a pale face to a ruddy one. PLACEHOLDER, by eye.
    pub flush_gene: f32,
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
    /// Since round 77 the women have none of `cheek-bones-incr` (0.4 in round 65, 0.15 from round 69): it is a
    /// pad on the front of the cheek and no cheekbone (see `genes`).
    /// Until round 93 the table held `chin-jaw-drop-decr` at 0.6 for both sexes, from round 50 as "the jaw closing
    /// the mouth". The target moves no jaw and no lip: it lifts 25 vertices of skin on each side of the chin, on
    /// the jaw's lower edge, by up to 4.2 mm (at 0.6 2.5 mm up, 1.8 mm into the surface there): a dent beside the
    /// chin on every face, which light from the side drew as a dark patch with a bump behind it, and the chin as
    /// a block set under the face. The row is gone, and the gene's share of the target with it (`without`);
    /// tests/faces.rs holds what the target moves.
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
    /// How far a grown head's eyes are brought forward out of the head, with their lids and the skin on them,
    /// women and men (mm; `eye_out_of`, morph.rs `eyes_out`). MakeHuman's female form sets the eye deeper than its
    /// male one: the ball's front stood 10.4 mm before the skin beside the outer corner on a woman and 13.5 mm on
    /// a man, 1.1 and 3.5 mm before the skin under the lower lid, 10.3 and 8.6 mm behind the brow's ridge. Real
    /// heads differ by about a millimetre between the sexes (measure.rs `EYE_SEX`). The skin over a woman's lid
    /// leaned 38 to 40 degrees from upright (a man's 20 to 28) and lay in the brow's shade under a light from
    /// above: a dark band from lid to brow, 46 L darker than the skin over the brow (the reference 18). 2 mm is
    /// the least-squares fit of the three differences (round 74; tests/faces.rs holds ours to the real ones). The
    /// surveys read bone where ours reads skin, so the value is fitted, not measured. Children are left as they
    /// are (a girl of 8 stands as a boy).
    pub eye_out: [f32; 2],
    /// Where the pupil stands between the lids: its share of the way from the lower lid's edge to the upper lid's
    /// (0: the ball stays where MakeHuman has it; morph.rs `pupils_set`). The eye looks at the viewer however the
    /// head leans (`gaze`), the lids do not follow: on a head leaning back the pupil stood low in the opening with
    /// white over the iris (a startled look), on a bowed one right under the upper lid (a sullen one). A real upper
    /// lid's edge lies 4 to 5 mm over the pupil's middle and covers the upper 1 to 2 mm of the iris, the lower
    /// lid's just reaches the iris's foot (Stanford's Neuro-ophthalmology Illustrated, ch. 1: Examination of the
    /// eyelids; the lower lid 5.5 mm under the pupil: eyewiki.org, Margin to reflex distance). 0.57 is the share
    /// with an iris of 11.7 mm whose upper 1.5 mm are covered and whose foot the lower lid touches:
    /// 5.85 / (5.85 + 4.35). Round 74.
    pub pupil: f32,
    /// Where the mouth lies between nose and chin: the share of the height from the nose's foot (subnasale) to the
    /// chin's lowest point (menton) that the upper lip takes, down to the line where the lips meet (0: the mouth
    /// stays where the morph targets leave it; morph.rs `mouth_set`, which moves a mouth that lies higher down to
    /// this and leaves one that lies lower). MakeHuman's base has 0.295. `rest` made a woman's face as long as
    /// the survey's with a longer nose and a longer chin (`nose-scale-vert-incr`, `chin-height-incr`): nose's foot
    /// and chin moved away from a mouth that stayed. 120 grown women had 0.216 (an upper lip of 13.9 mm over
    /// 50.3 mm of lower lip and chin: the mouth right under the nose over a long, heavy chin), men 0.266, women of
    /// 68 0.194; children of 2 and 5, who take a third of `rest`, 0.31 to 0.34. Real faces: 0.295 (women) and 0.301
    /// (men) with the lips at rest and 3.3 and 2.4 mm apart (Arnett and others 1999), 0.313 and 0.307 with the
    /// lips closed (Farkas and others 1984; src/measure.rs `LOWER_FACE`). 0.31 for both: closed lips. Everyone
    /// grown then had this one share (round 92); real faces differ in it, and since round 112 ours do: `mouth_gene`.
    pub mouth_at: f32,
    /// (round 112) How much higher or lower a person's mouth lies by the gene "mouthH", in the share `mouth_at`
    /// per unit of the gene as the face shows it (as `brow_gene`): a short upper lip over a long chin, or a long
    /// one over a short chin. Up to round 111 every grown mouth lay at the one share. Arnett's faces (`measure::
    /// LOWER_FACE`) have upper lips of 24.4 (SD 2.5) and 21.0 (1.9) mm in lower thirds of 81.1 (4.7) and 71.1
    /// (3.5): were the two independent, the share would spread by 0.035 and 0.031. They are not (a long face has
    /// the longer lip), so less: with this value ours spread by about 0.02. PLACEHOLDER: the spread of the share
    /// itself was not read anywhere.
    pub mouth_gene: f32,
    /// How far the bust leans back, women and men (radians, about the axis from ear to ear through the head's
    /// centre). As MakeHuman forms them both sexes stand with the head bowed, alike (the line from chin to
    /// glabella 8.7 and 8.6 degrees off upright, the top forward): seen from eye level the brow hangs over the eyes
    /// and the head sits between the shoulders. The values hold the profile as people hold their heads (natural
    /// head position): glabella, lips and chin against the upright line through the subnasale, fitted to the
    /// survey of measure.rs `PROFILE` (tests/faces.rs). Until round 73 the women leaned forward by 0.1 (round 50
    /// took MakeHuman's woman for upright, wrongly): bowed 14 degrees more than the men, 4.4 of the survey's
    /// standard deviations off, their eyes in the brow's shade. A boy's grows from the women's to the men's
    /// (`by_sex`).
    pub lean: [f32; 2],
    /// (round 124) How much of a woman's bust the gown holds in (`pose::hold_bust`): the share taken off how far
    /// skin and cloth stand in front of the body's middle line, from the breasts down. 0: none (Apoleia's). The gown
    /// is bound to the body as MakeHuman shapes it and lay on a young woman's breasts like a wet shirt, each a
    /// point; a kirtle of the time is cut close and holds the bust. PLACEHOLDER, by eye; no garment was measured.
    pub bust: f32,
    /// (round 123) How the body stands under the head (pose.rs): the least and the most the shoulders are turned
    /// further than the head (radians; a person's lies between them by a draw of the seed), and the most the
    /// shoulders' line is tipped, either way (radians). All 0: no pose, the portrait is one stiff piece (Apoleia's).
    /// By eye beside the reference's half figures, whose shoulders stand 15 to 40 degrees round from the face:
    /// PLACEHOLDER.
    pub pose: [f32; 3],
    /// (round 127) How a person carries the head: the most it is turned further than the stage turns every head
    /// (src/portrait/profile.ts `turn`), either way, and the most it is tilted towards a shoulder, either way
    /// (radians; a person's lie between by two draws of the seed, `head_of`). Both 0: every head of a sample
    /// stands at the one angle, upright (Apoleia's, and England's until round 127: twenty people who all hold the
    /// head as a passport asks for). The builder leaves the head where it is and says the two angles with the
    /// portrait (`Portrait::head`); the stage turns and tilts the whole figure by them, and the builder tips the
    /// shoulders back by the tilt (pose.rs), so that the tilt is the neck's and the shoulders stay as the pose
    /// has them. The eyes stay on whoever looks (`gaze_at`). By eye beside the reference, whose heads are tilted
    /// a few degrees and turned each its own way: PLACEHOLDER.
    pub head: [f32; 2],
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
    /// Where the eyes look, seen from the head: turned about the vertical towards the head's left (radians) and
    /// upwards. The stage turns the person about the same axis by its `turn` (src/portrait/profile.ts), and the
    /// eyes look at whoever looks at the picture when the first value is that turn with the other sign (the
    /// head turned to its right by 0.24, the eyes to their left by 0.24) and the second is 0: the camera stands
    /// at the eyes' height, and the lean is taken out of the second, so that the eyes keep looking level
    /// (tests/portrait.test.ts holds the two against each other). Apoleia's eyes look straight ahead of the head,
    /// past the viewer. From round 50 to round 74 the first value had the turn's own sign (-0.2, then -0.1): meant
    /// to bring the eyes back to the viewer, it turned them further away, 19 degrees past the camera at the end.
    /// What round 60 saw at -0.2 and took for eyes turned too far back ("a glance out of the corner of the eye")
    /// were eyes turned away twice. The second value was -0.04 from round 68 (an iris that looked level showed
    /// white under it); since round 74 the ball is set between the lids for any gaze (`pupil`).
    pub gaze: [f32; 2],
    /// How far each eye is turned towards the nose on top of that (radians). Eyes that look at somebody near meet
    /// on them; eyes that stand parallel look through them into the distance. 0.03 lets them meet about a metre
    /// in front of the face.
    pub converge: f32,
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
    /// mouth with full lips, on which the genes for full lips and a narrow mouth give a pout: the lips thinner
    /// (by eye), the mouth wider (from round 55 a row here, by eye; since round 101 `child_mouth`, by measure).
    /// (Until round 55 they faded with `Look::grown`, which is at four fifths when a girl is eleven and her head
    /// still all child: the pout was strongest then. Until round 67 the lids were lowered here; since `lids`
    /// lowers everyone's, a child's share of that is `eyes_child`.)
    pub child: &'static [(&'static str, f32, f32)],
    /// How strongly single genes of the face show (names of `look::GENES`; 1 = as Apoleia, which is every gene not
    /// named). Apoleia draws its genes large, so that a face is told apart at the size of a coin
    /// (`settings::FACE_GAIN`); in the real look the fullest lips are a pout.
    /// The gene of the cheeks (round 77): its first target, MakeHuman's `cheek-bones-incr`, lifts no cheekbone
    /// (the breadth at the cheekbones does not change with it) but lays a pad on the front of the cheek, 17 mm
    /// under the cheekbone, and the gene hollows the cheek under it as well. On a woman's full cheek that was a
    /// pouch in the outline of the cheek turned away from the viewer (`measure::far_cheek`: on 150 women a pad of
    /// 1.4 mm over a dent of 1.7 mm in the mean, the pad 3.4 mm at most; at 0.4 and without the women's share of
    /// it in `rest` 0.7 over 1.0 mm, 1.5 at most; men 0.9 to 0.6 mm). 0.4 is by eye, PLACEHOLDER: no measured
    /// outline of real faces read.
    /// Round 112: the faces of England differed from each other less than real faces do (120 men and 120 women
    /// measured as the survey measures, `measure::MEASURES` and `LIPS`: the nose stood out with a spread of 1.4 mm
    /// where real noses have 2.7, the red of both lips 0.9 against 2.8 to 3.0, the lips' length 3.2 and 3.5
    /// against 4.2 and 4.0). The eyes' size, the brows' height and arch, the nose's hump and tip and the mouth's
    /// breadth show more strongly than Apoleia draws them (by the spreads, and by eye where the survey has no
    /// measure: eyes and brows). The lips stay at 0.4, the red of them is given by `loads`.
    pub genes: &'static [(&'static str, f32)],
    /// (round 112) The gain of a gene's lower half, where it is another than `genes` gives to both. The nose's
    /// hump at 1.7 on both halves scooped the back of a nose whose gene lies a fifth under the middle until its
    /// upper third lay level with the root (England's sample, a woman of 17: the back, a third of the way down,
    /// 0.055 of the distance between the eyes' inner corners in front of the root, 0.12 in round 111; six of 36
    /// under 0.06, before three), and the light the skin's image has on root and back, with the stage's highlight
    /// down the back, lay on that plane as a pale band from eye to eye (as on a low root). A hooked nose
    /// has no such plane: the upper half keeps 1.7.
    pub genes_low: &'static [(&'static str, f32)],
    /// (round 112) More targets for single genes of the face, on top of look.rs `FACE_MOD` (Apoleia's, which stays
    /// as it is): the gene, the target ("#": both sides), the suffixes for low and high values, and the weight per
    /// unit of the gene as `genes` lets it show. For Apoleia's genes: the lips' red by the heights of both lips
    /// (its own targets make a full mouth a pout); a long nose stands further out and a short one less (the
    /// nose's size; on the hump's gene the same target laid the scooped noses flat, `genes_low`); a long face has
    /// a longer chin. And the targets of the genes that came with round 112 (dna.rs), each of which shows in a
    /// dress with a table alone. Weights by the survey's spreads where it has the measure (nose, lips, head
    /// length), else by eye, PLACEHOLDER. Tried and not kept: the face's outline by `head-round`,
    /// `-rectangular` and `-invertedtriangular` (they move the breadths the survey's means are held to), the
    /// lid by the lids' heights (the upper lid cleared the iris), the mouth's height by `mouth-trans` (the
    /// builder sets the mouth's height after the genes, `mouth_gene`), the cheeks by `cheek-trans` (not seen).
    pub loads: &'static [(&'static str, &'static str, &'static str, &'static str, f32)],
    /// Targets of MakeHuman this dress's heads take nothing of, whoever asks for them (genes, age, a mood).
    /// England (round 93): `chin-jaw-drop-decr`, which lifts the skin on the jaw's edge beside the chin into the
    /// surface (see `rest`). The gene of the chin's height asks for it on a short chin, with up to 0.27 (1.1 mm):
    /// on a child's jaw still a faint shade where the dent was. Its counterpart `-incr`, a jowl that hangs,
    /// stays. By eye, PLACEHOLDER: no measured outline of a jaw read.
    pub without: &'static [&'static str],
    /// Targets of MakeHuman of which this dress's heads take the part below the cheekbones only (morph.rs
    /// `lower_band`). England (round 95): the two head forms the gene of the jaw asks for, a narrow jaw as
    /// MakeHuman's diamond and a wide one as its triangular head (look.rs `FACE_MOD`). Each of the two is a jaw
    /// and a skull: the diamond narrows the jaw by 4 mm a side and the skull over the ears by up to 15 mm a side,
    /// to a point; the triangular widens the jaw by 12 mm and narrows the skull by up to 12. Apoleia draws a head
    /// so, to be told apart at the size of a coin. In the real look every woman had a skull like an egg's point
    /// (until round 96 the table shifted her gene towards the narrow jaw: the diamond at 0.9 on nearly all of them),
    /// and so had every man with a narrow jaw: under plaits and a veil a head too high and too narrow over
    /// cheekbones that stood out, on a bald man a dome. Measured (tests/faces.rs): the head's breadth over the
    /// ears was 140.6 mm on women, 1.1 standard deviations under the survey's (measure.rs), and 150.1 on men
    /// (-0.5); with the jaw's part alone 144.5 (-0.4) and 152.4 (-0.1), nothing fitted. The jaw's own breadth is
    /// what it was.
    /// Round 96: MakeHuman's head that is broad above and narrow below as well, which `rest` gives the women:
    /// whole, it widens the cheekbones and the skull by 7 mm; its lower part is a jaw that runs in to the chin.
    pub lower_only: &'static [&'static str],
    /// How far the cheek between the cheekbone and the jaw is filled out, women and men, in mm where the field is
    /// whole (morph.rs `cheek_fill`, `CHEEK_FIELD`); 0 leaves a cheek as MakeHuman's targets form it. A small
    /// child has a third of the women's, a boy grows out of it into the men's (`cheek_fill_of`).
    /// England (round 97): a woman's cheek ran straight from the cheekbone to the chin, which reads as lean. As
    /// a picture shows the cheek turned away (measure.rs `far_at_mouth`), its outline lay 13.3 mm inside its top
    /// at the mouth's height on 200 grown women; on the reference's woman, traced on one screenshot, about 6
    /// (a pixel there is 1.4 mm). None of MakeHuman's targets fills a cheek without widening the cheekbones or
    /// the jaw's corners, both at the survey's, or laying a pad on the cheek at the nose's height (twelve
    /// variants in round 96; what each head form does to the outline, docs/PORTRAITS.md). With 6 mm of a shape
    /// of our own: 8.2 mm, the mean outline within 0.7 mm of the traced one down to the mouth and within 2.2 mm
    /// below; cheekbones, jaw's corners, lips and chin as they were. Held by the survey as far as it goes: a
    /// woman's arc from ear to ear over the chin is 0.913 of a man's (the survey 0.918; before 0.902), under
    /// the nose 0.928 (0.941; 0.917), and both stay under the survey's own lengths. The amount is by eye on one
    /// traced face: PLACEHOLDER. Men: none (not looked at; a man's cheek has a dent of 3.6 mm under its pad).
    pub cheek_fill: [f32; 2],
    /// (round 112) How a face follows the person's weight (look.rs `phen`: the gene and what the person has had
    /// to eat), where a dress asks for it: see `Fullness`.
    pub fullness: Option<Fullness>,
    /// How much of what the lips' edges stand apart along the seam is closed (morph.rs `lips_meet`): 0 leaves
    /// the mouth as it is closed in its middle, 1 lays the lips on each other from corner to corner.
    /// England (round 99): 1. The mouth read as a long hard stroke, and wide for it, though it is not wide: the
    /// corners of a grown woman's mouth lie 46.5 mm apart (the survey's women 48.0), 0.754 of the distance
    /// between her pupils (the survey 0.775; the reference's woman about 0.78, read by eye off one enlarged
    /// screenshot), and those of the sample's four children of five 35.5 to 41.3 mm (girls of four and five
    /// 36.9, boys 39.8: Sforza and others 2007). What made the stroke: MakeHuman's closed mouth is a slit from
    /// corner to corner (1.0 mm at its widest on the base head), the targets of a face open it beside the
    /// middle, and `mouth_shut` closes the middle alone. At its widest the slit was 1.9 mm on 200 grown women
    /// and 2.1 on 200 grown men (measure.rs `seam`; 1.2 to 1.5 on the sample's children of two to eight), and
    /// towards the corners the lower lip's edge lies some 3 mm behind the upper's (two women looked at): the
    /// strip that closes the slit (`Lips::seam`) lay there as a ledge in the light, a pale line under the dark
    /// one from corner to corner, ending in a hook at each corner. With the lips on each other 0.1 to 0.2 mm
    /// are left (0.3 to 0.4 on children to eight); only heights within 6 mm of the edges change, by 1.1 mm at
    /// the most, and each of the 27 measures of the face is what it was. The line between the lips is 45.8 to
    /// 48.0 L darker than the lit cheek on eight grown women (before 48.3 to 48.9; the reference's woman 41 to
    /// 47, round 82), on eight men 50.3 to 52.5 (before 51.2 to 53.1).
    pub seam_shut: f32,
    /// By how much a child's braincase is larger than MakeHuman's child's: per age in years the factors of its
    /// breadth, its length and its height over the ears, girls' and boys' (`skull_of`, morph.rs `skull_grow`).
    /// MakeHuman's child and baby are a grown head made small, the braincase with the face; a real child's
    /// braincase is nearly grown when its face is not. Until round 100 the faces of England's children were as
    /// broad as real ones (at the cheekbones 111 and 108 mm at two, the survey of measure.rs `CHILDREN` 109 and
    /// 108) and their braincases far too small: at two the head's circumference 434 and 416 mm against 502 and
    /// 487 (4.3 and 4.8 standard deviations under), its length 152 and 146 against 178 and 172, at eight the
    /// circumference still 2.0 and 3.6 under. A grown face on a small head: in a picture framed from the crown to
    /// the chin a large face, a small adult. The factors are fitted (60 girls and 60 boys per age, to 0.1 in 100)
    /// so that breadth, length and height over the ears stand to England's grown as the survey's children stand
    /// to its oldest group; the circumference, which was not fitted, then lies within 1.2 in 100 of that too, and
    /// children of 2 to 17 within one standard deviation of the survey in all four. Factors under 1 (boys'
    /// breadth from 11, all of a boy's from 13: up to 4 in 100) are left at 1, a braincase is not made smaller.
    /// Under two the two-year-olds' (the survey's infants are not read).
    pub skull: &'static [(f32, [f32; 3], [f32; 3])],
    /// How broad a child's mouth is: per age in years the weight of MakeHuman's `mouth-scale-horiz-incr`, girls'
    /// and boys' (`CHILD_MOUTH`; under 0 its `-decr`; `child_mouth_of`; linear between the ages, the first row
    /// before it, none from the row of zeros on, where the head has its adult form). MakeHuman's child has a
    /// narrow mouth (at two 32.7 and 31.4 mm, boys and girls, at eight 37.2 and 35.0: against England's grown
    /// 0.02 to 0.13 under the share the survey of measure.rs `CHILDREN` gives a child's mouth of a grown one's),
    /// and round 55 widened it by eye with one weight for all ages (0.45 of the target, in `child`): at two 37.0
    /// and 35.7 mm, 0.05 over the share and a grown mouth on a small face, at eleven girls' still 0.035 under.
    /// The weights are fitted (60 girls and 60 boys per age) so that the mouth stands to England's grown as the
    /// survey's children's stands to its oldest group: at two 34.2 and 33.4 mm (the survey 33 and 33), at eight
    /// 40.4 and 40.0 (39 and 39.5), at every age 0.1 to 0.4 standard deviations over the survey, as the grown
    /// are over its oldest (0.5 and 0.1). Fitted with it in round 101 and dropped: a shorter nose
    /// (`nose-scale-vert-decr`, boys of two at 1.2) and a longer chin (`chin-height-incr`, at two 0.36 and 0.49),
    /// which brought the nose's length and the lower face's height to the survey's shares too and drew a worse
    /// face: from 0.6 the nose folds across its bridge and the skin under it smears, and the chin, at half its
    /// weight too, is long and heavy, not a child's. A small child's nose stayed long (at two 34.9 and 32.9 mm,
    /// the survey 29) until round 102 (`child_nose`); its lower face is short still (77.1 and 73.5, the survey
    /// 82 and 80).
    pub child_mouth: &'static [(f32, [f32; 1], [f32; 1])],
    /// How long a child's nose is: per age in years the factor on the nose's length from sellion to its foot,
    /// girls' and boys' (`child_nose_of`, morph.rs `nose_set`; linear between the ages, the first row before it,
    /// 1 from the row of ones on). MakeHuman's child has a grown face's proportions: at two a boy's nose was
    /// 34.9 mm long and a girl's 32.9 where the survey of measure.rs `CHILDREN` has 29 (2.0 and 1.3 standard
    /// deviations over), a boy's 1.1 over at five and eight. The factors bring the nose to the share of
    /// England's grown that the survey's children have of its oldest group (60 an age and sex): a boy's 29.1
    /// mm at two, 34.6 at five, 38.6 at eight, a girl's 30.2 at two; a boy's within 0.4 standard deviations of
    /// the survey at every year of age. Girls from five on are left (1): their noses are at the share or short
    /// of it (0.4 to 0.6 standard deviations under the survey at 8 to 12), and a longer nose over a chin that
    /// stays would take its length from the lower face, which is short. `nose_set` moves heights only, of the
    /// face's front: the skin between the lower lids and the nose's foot shortened evenly (MakeHuman's target
    /// for a shorter nose folds it: round 101), and what the nose loses the skin between its foot and the chin
    /// gains, the lips' red as high as it was, the chin where it was. So the lower face from sellion to the chin
    /// is as high as before (1.0 and 1.6 under the survey at two). Tried in round 102 and dropped: the lower
    /// face longer as well, to the survey's share (the chin 7 to 10 mm lower at two, the skin under the nose
    /// drawn out evenly): as in round 101 a long, heavy lower face, an older child's.
    pub child_nose: &'static [(f32, [f32; 1], [f32; 1])],
    /// Targets of MakeHuman's that make a neck thicker, with their weights for a grown woman and a grown man;
    /// a head takes of them the part under the jaw only (morph.rs `neck_share`), over and above what its gene
    /// of the neck asks for. A child has none of it and grows into it (`neck_of`).
    /// England (round 98): the smallest loop round a woman's neck was 290.5 mm (measure.rs `neck`, 200 grown
    /// women), a man's 366.1: a woman's 0.79 of a man's. The survey has 339.5 and 406.7 (0.835), on people
    /// heavier than ours; lean young women have 315 and 316 mm, lean young men 356 (0.886; measure.rs
    /// `NECK_LEAN`). The men's lies between the lean and the survey's and stays; the women's was thin by either.
    /// `neck-scale-horiz-incr` makes the neck broader (29.0 mm of loop per unit) and
    /// `neck-back-scale-depth-incr` deeper at the nape (16.8): together, so that the loop stays as round as it
    /// was (92 by 92 mm, now 100 by 100), 314.3 mm, 0.86 of a man's. Whole, the first widens the jaw's
    /// corners, which are at the survey's, by 5.7 mm per unit; under the jaw it moves no landmark.
    /// `neck-scale-depth-incr` would do for the depth too but pushes the chin forward (3.8 mm per unit).
    pub neck: &'static [(&'static str, f32, f32)],
    /// The face as it is drawn (`Style`).
    pub style: Style,
    pub sources: &'static [Source],
}

use Hood::{Back, None as Bare, Up};

const ENGLAND: DressSet = DressSet {
    key: "england1356",
    origins: &["England"],
    gown: "cloth_cote",
    gown_cut: ["cloth_kirtle", "cloth_cote_v"],
    gown_image: "",
    gown_figured: "",
    figured: [false; 10],
    gown_file: "",
    under: ["cloth_smock", "cloth_shirt"],
    under_image: "cloth_smock",
    wool: &["#958565", "#6e665a", "#7d5c40", "#51647c", "#84503f", "#6c6c45"],
    linen: "#e6dfcd",
    hood: [Up, Up, Up, Up, Back, Back, Back, Bare, Bare, Bare],
    hood_from: 14.0,
    hood_up: "cloth_hood_up",
    hood_back: "cloth_hood_down",
    hood_dagged: ["cloth_hood_up_dag", "cloth_hood_down_dag"],
    hood_dags: 0.3,
    hood_fur: "",
    hood_fur_dye: "",
    veil_from: 20.0,
    wimple_from: 50.0,
    veils: [Veil::Back, Veil::Closed, Veil::None, Veil::Back, Veil::Back, Veil::None, Veil::Back, Veil::Closed, Veil::None, Veil::Back],
    unveiled_until: 30.0,
    veil: "cloth_veil_linen",
    veil_back: "cloth_veil_back",
    wimple: "cloth_wimple",
    veil_image: "",
    wimple_image: "",
    hair: "bob01",
    hair_lengths: &[("bob06", 3), ("bob07", 1), ("bob09", 1), ("page01", 1), ("page02", 1)],
    hair_parted: &["page01", "page02"],
    hair_parted_from: 15.0,
    hair_dressed: &[("bob09", "bob07")],
    hair_curly: "bob05",
    hair_receding: "bob03",
    hair_bald: "bob04",
    hair_hooded: "bob02",
    hair_veiled: "part01",
    hair_girl: "plait01",
    hair_looped: "loop01",
    hair_looped_from: 15.0,
    looped: [true, false, true, true, false, true, false, true, true, false],
    fillet: "cloth_fillet",
    fillet_from: 15.0,
    fillets: [true, false, false, true, false, false, false, true, false, false],
    circlet: "",
    circlet_men: "",
    circlets_men: [false; 10],
    fastens: {
        use crate::fasten::Fasten::{Buttons, Laced, None as Closed};
        [[Laced, Closed, Buttons, Laced, Laced, Closed, Laced, Buttons, Closed, Laced], [Closed, Closed, Buttons, Closed, Closed, Closed, Closed, Buttons, Closed, Closed]]
    },
    fasten_from: [14.0, 15.0],
    buttons: "",
    crown: "",
    crown_gold: "",
    mantle: "",
    mantle_cloth: "",
    mantle_fur: "",
    mantle_dyes: [""; 4],
    crown_stones: [""; 4],
    parted: [false; 10],
    coif: "cloth_coif",
    coif_from: 30.0,
    coifs: [false, false, false, false, false, false, false, false, false, true],
    hat: "cloth_hat",
    hat_cocked: "cloth_hat_cocked",
    hat_from: 15.0,
    hats: [false, false, false, false, false, false, true, false, true, false],
    hat_tones: &["#6b5a48", "#7d7870", "#3f3a36", "#9a8468"],
    hair_small: "bob08",
    coily: Some(Coily { from: 0.86, men: "coil01", women: "coil02", small: "coil03", thin: "coil03", bald: "coil04", image: "hair1356_fleece", under: ["bob01", "bob04"] }),
    boy_skin: 14.0,
    body_image: "hair1356_body",
    beard_lock_image: "beard1356_locks",
    beards: [Beard::Shaven, Beard::Stubble, Beard::Short, Beard::Full, Beard::Full, Beard::Short],
    beard_full: "beard_crop",
    beard_short: "beard_short1356",
    beard_stubble: "beard_stubble1356",
    stubble_paint: 0.0,
    brows: ["eyebrow001", "eyebrow001"],
    brow_image: "eyebrow1356",
    brows_child: 0.6,
    brow_paint: [0.0, 0.0],
    brow_lift: [[3.0, 3.0, 3.5], [0.0, 0.0, 0.0]],
    brow_band: [1.15, 1.0],
    brow_gene: [1.1, 0.7],
    brow_soft: [0.3, 0.3],
    lips: [Lips { skin: 0.17, blood: [0.27, 0.026, 0.020], upper: 1.5, seam: 1.43, child: 0.6, dark: [0.38, 0.85] }, Lips { skin: 0.24, blood: [0.275, 0.025, 0.019], upper: 1.5, seam: 1.1, child: 0.6, dark: [0.38, 0.85] }],
    lash_line: [0.65, 0.55],
    lid_under: [0.3, 0.25],
    lash_image: "Eyelashes1356",
    lash_tone: (0.6, "#3a2416"),
    hair_red: [0.45, 0.74],
    // Morgan et al. 2018, "Genome-wide study of hair colour in UK Biobank explains most of the SNP heritability",
    // Nature Communications 9:5271, Table 1: of 343 884 white British people 4.2 % call their natural hair
    // black, 37.2 % dark brown, 41.1 % light brown, 11.5 % blonde (and 4.6 % red, 1.4 % other); "black, dark
    // brown, light brown and blond hair lie on an approximately linear spectrum". Of the four together that is
    // 4.5, 39.6, 43.7 and 12.2 in 100: the gene's strengths under which that many of all pairs of alleles from 50
    // to 220 lie. People born 1934 to 1971, NOT of 1356: no count of hair colours is known from then.
    hair_shades: [0.296, 0.509, 0.699],
    flush: [0.65, 0.5],
    flush_map: "skin_flush.txt",
    flush_gene: 0.9,
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
        ("cheek/l-cheek-bones-incr", 0.0, 0.5),
        ("cheek/r-cheek-bones-incr", 0.0, 0.5),
        ("chin/chin-height-incr", 0.3, 0.15),
        ("nose/nose-scale-vert-incr", 0.4, 0.0),
        ("head/head-scale-vert-incr", 0.0, 0.2),
        ("head/head-scale-horiz-decr", 0.1, 0.0),
        ("head/head-square", 0.0, 0.3),
        ("mouth/mouth-scale-horiz-incr", 0.85, 0.3),
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
        // (round 95) MakeHuman's man has a head 204 mm long from the brows to the back, the survey's men 197.3
        // (measure.rs; women 187.4 to its 187.5): the back of the head less deep. Where on a head the 7 mm are
        // too many the survey does not say; they are taken from the back, which no portrait shows.
        ("head/head-back-scale-depth-decr", 0.0, 0.28),
        // (round 96) the women's jaw runs in towards the chin: the part below the cheekbones of MakeHuman's
        // head that is broad above and narrow below (`lower_only`). Until then the gene of the jaw was shifted
        // towards the narrow jaw for them (the diamond at 0.9 on nearly every woman), which narrows the cheeks at
        // the mouth's height by 7 mm and the jaw's front at the chin by 2: a lean lower face over a chin as
        // broad as a man's. Measured on 200 grown women and 200 grown men (measure.rs `jaw_front`): 5 mm over
        // the chin's lowest point the front of the jaw was 56.9 mm across on the women and 54.8 on the men,
        // and from there up to the mouth 0.97 to 1.04 of a man's, while every breadth the survey has is 4 to
        // 9 % smaller on a woman. Now 52.7 mm, and 0.89 to 0.96 of a man's. The jaw's corners stand where they
        // stood (110.5 mm, the survey's 110.1), and their spread is nearer the survey's (8.0, before 6.5, the
        // survey's 8.9), since half the women now have the wide side of the gene. The target draws the
        // mouth's corners in by 4.2 mm; the row of the mouth's breadth above holds the lips' length at
        // 46.5 mm (0.4 before, 0.85 now). Weight 1: by the survey's breadth at the jaw's corners; that the
        // chin is the place to take the breadth from is by eye beside the reference, PLACEHOLDER: no measured
        // outline of a chin read.
        ("head/head-invertedtriangular", 1.0, 0.0),
    ],
    mood: 0.6,
    eye_forward: 0.0,
    eye_out: [2.0, 0.0],
    pupil: 0.57,
    mouth_at: 0.31,
    mouth_gene: 0.075,
    lean: [0.12, 0.10],
    bust: 0.5,
    pose: [0.1, 0.4, 0.035],
    head: [0.1, 0.07],
    iris_mm: 11.7,
    eyes_child: [0.6, 0.5],
    gaze: [0.24, 0.0],
    converge: 0.03,
    kid: 0.0,
    cheeks: [0.0, 0.0],
    sockets: [0.0, 0.0],
    child: &[
        ("mouth/mouth-upperlip-volume-decr", 0.5, 0.5),
        ("mouth/mouth-lowerlip-volume-decr", 0.3, 0.3),
        // (round 105) MakeHuman's child has a cheek that hangs beside the mouth and under it, a jowl: with the
        // skin's folds an old face on a small head. Leaner cheeks, by eye, PLACEHOLDER (the mouth's corners
        // 0.1 mm closer; nothing else of the survey's measures moves). Tried with it and dropped: `head-oval`
        // 0.5, which narrows the jaw further and widens the braincase (a boy of two's breadth 0.914 of the
        // grown's, the survey 0.883: `skull` is fitted to that); `head-fat-decr` and `chin-width-decr` at 0.6 (a
        // gaunt small adult); Apoleia's child's face (`kid` 0.4 and 0.7: rounder still, with a smirk).
        ("cheek/l-cheek-volume-decr", 0.6, 0.6),
        ("cheek/r-cheek-volume-decr", 0.6, 0.6),
    ],
    genes: &[("lips", 0.4), ("cheek", 0.4), ("jaw", 0.9), ("eyeS", 1.4), ("brow", 1.8), ("browA", 1.8), ("hump", 1.7), ("tip", 1.7), ("mouthW", 1.25)],
    genes_low: &[("hump", 1.0)],
    loads: &[
        ("lips", "mouth/mouth-upperlip-height", "decr", "incr", 5.0),
        ("lips", "mouth/mouth-lowerlip-height", "decr", "incr", 3.75),
        ("noseL", "nose/nose-scale-depth", "decr", "incr", 0.9),
        ("headF", "chin/chin-bones", "decr", "incr", 0.5),
        // the genes of round 112 (dna.rs)
        ("headD", "head/head-scale-depth", "decr", "incr", 1.0),
        ("chinW", "chin/chin-width", "decr", "incr", 1.2),
        ("eyeT", "eyes/#-eye-corner1", "down", "up", 2.2),
        ("eyeT", "eyes/#-eye-eyefold-angle", "down", "up", 1.6),
        ("lid", "eyes/#-eye-eyefold", "concave", "convex", 2.0),
        ("eyeH", "eyes/#-eye-trans", "down", "up", 1.4),
        ("eyeP", "eyes/#-eye-push2", "in", "out", 2.2),
        // (round 113: 0.35, before 0.9. The mood and `rest` turn the corners as well, and on top of them the gene
        // at 0.9 gave grins and frowns that no mood asked for: a boy's corners up by 0.8 of the target)
        ("mouthC", "mouth/mouth-angles", "down", "up", 0.35),
        ("lipB", "mouth/mouth-upperlip-height", "incr", "decr", 3.0),
        ("lipB", "mouth/mouth-lowerlip-height", "decr", "incr", 1.3),
        ("mouthF", "mouth/mouth-trans", "backward", "forward", 0.8),
        ("mouthF", "mouth/mouth-scale-depth", "decr", "incr", 0.4),
        ("noseB", "nose/nose-width1", "decr", "incr", 2.0),
        ("noseB", "nose/nose-compression", "compress", "uncompress", 0.8),
        ("neckL", "neck/neck-scale-vert", "decr", "incr", 0.6),
        ("bags", "eyes/#-eye-bag", "decr", "incr", 1.5),
        ("folds", "mouth/mouth-laugh-lines", "out", "in", 0.6),
        ("folds", "mouth/mouth-dimples", "out", "in", 0.4),
    ],
    without: &["chin/chin-jaw-drop-decr"],
    lower_only: &["head/head-diamond", "head/head-triangular", "head/head-invertedtriangular"],
    cheek_fill: [6.0, 0.0],
    fullness: Some(Fullness {
        spread: 6.0,
        targets: &[
            ("head/head-fat-decr", 0.8, 0.0),
            ("head/head-fat-incr", 0.0, 0.45),
            ("cheek/#-cheek-volume-decr", 0.7, 0.0),
            ("neck/neck-scale-horiz-decr", 0.7, 0.0),
            ("neck/neck-scale-horiz-incr", 0.0, 0.7),
            ("neck/neck-double-incr", 0.0, 0.7),
            ("chin/chin-width-incr", 0.0, 0.4),
        ],
        fill: [3.0, 5.0],
    }),
    seam_shut: 1.0,
    skull: &[
        (2.0, [1.141, 1.229, 1.191], [1.150, 1.182, 1.198]),
        (5.0, [1.126, 1.199, 1.149], [1.106, 1.128, 1.129]),
        (8.0, [1.093, 1.165, 1.101], [1.050, 1.079, 1.065]),
        (11.0, [1.053, 1.106, 1.053], [1.0, 1.018, 1.027]),
        (13.0, [1.037, 1.066, 1.033], [1.0, 1.0, 1.0]),
        (15.0, [1.0, 1.0, 1.0], [1.0, 1.0, 1.0]),
    ],
    child_mouth: &[
        (2.0, [0.216], [0.164]),
        (5.0, [0.362], [0.265]),
        (8.0, [0.521], [0.333]),
        (11.0, [0.626], [0.234]),
        (13.0, [0.169], [0.084]),
        (15.0, [0.0], [0.0]),
    ],
    child_nose: &[
        (2.0, [0.918], [0.834]),
        (5.0, [1.0], [0.903]),
        (8.0, [1.0], [0.921]),
        (11.0, [1.0], [0.952]),
        (13.0, [1.0], [0.969]),
        (15.0, [1.0], [1.0]),
    ],
    neck: &[("neck/neck-scale-horiz-incr", 0.45, 0.0), ("neck/neck-back-scale-depth-incr", 0.7, 0.0)],
    style: Style {
        face: &[
            // the whole head broader (at weight 1 each cheekbone 13.2 mm further out, each eye 5.8), and what
            // `rest` narrows a woman's by taken back
            ("head/head-scale-horiz-incr", 0.5, 0.5),
            ("head/head-scale-horiz-decr", -0.1, 0.0),
            // a short chin under a face that is no longer (the rows of `rest` that lengthen chin and face taken
            // back; the men's lean head by less)
            ("chin/chin-height-decr", 0.25, 0.25),
            ("chin/chin-height-incr", -0.3, -0.15),
            ("head/head-scale-vert-incr", 0.0, -0.2),
            ("head/head-fat-decr", 0.0, -0.2),
            // large eyes, set wider still than the broader head sets them
            ("eyes/l-eye-scale-incr", 0.6, 0.5),
            ("eyes/r-eye-scale-incr", 0.6, 0.5),
            ("eyes/l-eye-trans-out", 0.15, 0.05),
            ("eyes/r-eye-trans-out", 0.15, 0.05),
            // a small mouth: the broader head widens it, and `rest` holds it at a real one's length
            ("mouth/mouth-scale-horiz-incr", -0.55, -0.3),
        ],
        skull: [1.0, 1.0, 1.1],
        lids: 0.35,
        iris_mm: 14.5,
        jaw: [0.2, 0.15],
        chin: [0.3, 0.0],
        edge: [0.5, 0.4],
    },
    sources: &[
        Source { what: "gown (cote) of wool, pulled over the head, close at the shoulders, round neck; linen worn under it (a shirt, a smock)", source: "Crowfoot, Pritchard & Staniland 1992 (London finds); Østergård 2004 (Herjolfsnes). Summaries only. Cut PLACEHOLDER. The cuts of round 110 (a man's neck opened in a V a hand deep, a woman's cut wide, how much linen shows) are by eye beside the reference: a wide neckline is the fashion of the 1340s to 1360s at court (Newton 1980, summary only), not sourced for a villager's wife." },
        Source { what: "hood with a short cape for men, worn on the head or thrown back", source: "Østergård 2004 (Herjolfsnes hoods); Newton 1980. Summaries only. Shares 4:3:3 PLACEHOLDER (unsourced)." },
        Source { what: "wool colours: undyed greys and browns, cheap dyes (russet, a dull blue)", source: "Statute concerning diet and apparel 1363 (russet and blanket for the poorest), read from a summary. Hex values PLACEHOLDER." },
        Source { what: "married women's hair covered by a linen veil, a wimple round the throat on older women and widows; girls in braids", source: "Newton 1980. Summary only. Ages 20 and 50 PLACEHOLDER (the simulation has no marriages yet). How the veil is worn (its rim on the forehead and on the cheeks in front of the ears, falling to the shoulders, no hair to be seen; the wimple under it, showing under the chin and round the throat): PLACEHOLDER, by eye against one veiled figure of the reference pictures (round 70). Since round 121 that is one of three ways (`veils`): the veil set back on the head over parted hair that covers the ears, the veil on forehead and cheeks, and a girl's plaits on three women in ten until 30, as unmarried. The shares, the age and the cut of the hair under the veil: PLACEHOLDER, by eye; nothing was read for them." },
        Source { what: "plaits pinned up beside the cheeks, each from below the ear up in front of it to the temple, on six in ten of the women of 15 and more who wear plaits (round 126)", source: "PLACEHOLDER. Nothing was read for the form, the share or the age: by eye; to be checked against picture sources." },
        Source { what: "a fillet, a stiffened band of linen 5 cm high round the head, on three in ten of the women of 15 and more who show their plaits (round 128)", source: "Rosalie Gilbert, Rosalie's Medieval Woman, Headwear (rosaliegilbert.com/headwear.html, read 20.11.2026; a re-enactor's page, not a primary source): the fillet often a stiffened linen band of about 2 to 2.5 inches, worn to hold the veil, shown high on the head on a Madonna of 1340 to 1360; fillet and barbette going out of use in the middle of the 14th century in favour of plaits beside the face. The share, the age and that it is worn with plaits and without a veil are PLACEHOLDER." },
        Source { what: "a woman's gown closed in front from 14 years: laced on five in ten (one lace through eyelets 2 cm apart, the linen showing between the edges), buttoned on two in ten (ball buttons of the gown's own cloth, 11 mm across, 2 cm apart), not opened on three in ten (round 129)", source: "Rosalie Gilbert, Rosalie's Medieval Woman: Buttons and Lacings, Kirtles, and the buttons of her collection (rosaliegilbert.com/buttonsandlacings.html, kirtles.html, thegilbertcollection_buttons.html; read 20.11.2026 as quotations fetched from the pages, not the pages in full; a re-enactor's pages, not a primary source): kirtles and gowns closed with buttons or with lacing, in front or at the side seams; a working woman likely in a front-lacing kirtle; eyelets closely set, around 2 cm; laces of the gown's colour until the 15th century; the lower classes with cloth buttons matching the gown, almost always ball-shaped, set very closely together at the very edge of the opening; a gown buttoned down the front in the Romance of Alexander, c. 1340; English buttons of 9 to 16 mm. The shares, the age, how far the laced edges stand apart, from button to button, and that none is laced at the side are PLACEHOLDER." },
        Source { what: "a man's gown buttoned in front on two in ten from 15 years, with the women's buttons, from under its opening down; the others' pulled over the head (round 131)", source: "The Medieval Combat Society, Male reenactment costume (themcs.org/costume/Male reenactment costume.htm; a re-enactors' page whose paragraphs on these garments have no notes) and Wikipedia, 1300-1400 in European fashion (both read 20.11.2026 as quotations fetched from the pages): the cotehardie, which began to replace the surcote from 1350, fastened at the front by buttons down to the height of the girdle; cheaper, looser cotehardies with no fastening at the front, put on over the head; working men in short or knee-length tunics. Nothing on the buttons' cloth, size or spacing for men (the women's are used). The share and the age are PLACEHOLDER." },
        Source { what: "a man's coif, a close cap of linen over the hair and the ears with two strings tied under the chin, on one man in ten from 30 years, worn alone (round 132)", source: "Wikipedia, Coif; The Medieval Combat Society, Male reenactment costume; Cadw, Hats (a leaflet without dates or notes); Buckingham's Retinue, Coifs (a re-enactment group's guide); Ruth Johnston, All Things Medieval, 13th and 14th centuries: men's hats (a blog without notes); all read 20.11.2026 as quotations fetched from the pages: coifs of unadorned white linen tied under the chin, worn by all classes, out of popularity with men in the fourteenth century; a linen coif covering the hair and ears and tied under the chin under Edward II, coif and hood on effigies of 1354 and 1372; considered underwear and worn under hats by everybody over 12 except those doing physical labour; before 1500 of one or two pieces with ties at the corners. The share, the age, that it is worn alone and its cut are PLACEHOLDER." },
        Source { what: "a man's felt hat, a round crown with a broad brim, on two men in ten from 15 years, bare-headed otherwise or over a hood thrown back (round 134)", source: "Encyclopedia.com, Peasant Costume (from Gale's Arts and Humanities Through the Eras, with a list of sources, not footnoted): 'Peasant men usually wore a large round felt hat', the costume fixed 'from about 800 to about 1375', and from the French shepherd's treatise Le Bon Berger (the page: written in 1373): 'It is proper that the shepherd wear a felt hat, round and very large', its felt doubled at the brim; History Hit, What Did People Wear in Medieval England (a popular article, undated statement): 'Men wore wide-brimmed straw hats, close fitting bonnet-like hoods made from linen or hemp, or a felt cap'; Medievalists.net, quoting Margaret Scott, Fashion in the Middle Ages: 'straw hats were worn outdoors by all ranks in the summer'; Rosalie Gilbert, Hats and Hennins (a re-enactor's page on women's hats). All read 20.11.2026 as quotations fetched from the pages; no picture of the time was looked at, and none of the pages has an English man's hat of the 14th century with a date. The straw hat is not built. The shares, the age, the crown's and the brim's measures and the colours are PLACEHOLDER." },
        Source { what: "of the men who wear a hat, half with its brim turned up behind and drawn out to a point in front (round 135)", source: "Rosalie Gilbert, Rosalie's Medieval Woman, Hats and Hennins (a re-enactor's page, not a primary source; read 20.11.2026 as quotations fetched from the page): the cocked cap 'a hat, probably felted or made of stiff material, and worn with the brim turned up either before or behind', 'worn by both men and women in medieval times', 'Many contemporary images show men of all classes during the fourteenth and fifteenth centuries wearing this style of hat', 'The brim usually is a different colour to the body of the hat'; the page's first written mention of it is of 1464. No picture of the time was looked at. Ours has brim and crown of one colour, and none with the brim turned up in front. The share, how far the brim is turned up and from where, and the point's length are PLACEHOLDER." },
        Source { what: "three in ten of the men's hoods with the cape's hem dagged: cut into eighteen tongues with a round end, 4.5 cm deep (round 136)", source: "Fashion Institute of Technology, Fashion History Timeline, dagging (K. Odom; a glossary page that quotes costume histories): dagging 'created by cutting or slashing the fabric into different shapes'; 'sleeves, tippets, collars, hemlines, cloaks, and hoods were flamboyantly edged with dagging (also dagges), a scalloped or crenelated cut' and 'this decorative treatment was not solely confined to the garments of the wealthy. Illuminated manuscripts show grooms, servants, even field workers and shepherds wearing clothing accented with dagging' (both quoting Hill); 'Simple cuts in V and U shapes' or strips. The Medieval Combat Society, 14th century men's clothing (a re-enactors' page without notes), under Edward III: 'In the 1330's edges of garments were cut away to form dagging and became a very popular fashion'; and, as D. C. Calthrop, English Costume (a painter's popular book of 1907 without notes), on that reign's common men's hoods: 'some are very full in the cape, which is jagged at the hem; some are close about the neck and are plain'. Against it: Florilegium, Dag on It! (an SCA member's article): 'these styles were worn primarily by the upper classes'. All read 20.11.2026 as quotations fetched from the pages; no picture of the time was looked at, and no page has a measure. The share, the tongues' number, depth and form are PLACEHOLDER." },
        Source { what: "the hair of one man in ten to the jaw with its ends turned out and up in rolls at the sides and behind (round 133)", source: "D. C. Calthrop, English Costume (the page gives the book's edition of 1907), the chapter on Edward III as reprinted at fashion-era.com: nearly every man 'with long hair to his neck, curled at the ears and on the forehead', and of a knight in the height of fashion 'His hair is shorter than is usual, and it is not curled' (a popular book by a painter, without notes); The Medieval Combat Society, Male reenactment costume, under Edward II (1307 to 1327, the reign before): 'Men tended to wear their hair long, almost to the shoulders', 'The hair was bushy, cut round and curled'; Encyclopedia.com, Bowl Haircut (Gale's Fashion, Costume, and Culture): the cut popular from the twelfth through the fifteenth centuries 'with long curls being popular during some decades and shorter lengths coming into style during others'. All read 20.11.2026 as quotations fetched from the pages; no picture of 1356 was looked at. That the curl is a roll turned out and up, its size, the share and the age are PLACEHOLDER; the curls on the forehead were tried and not kept." },
        Source { what: "children under seven: the men's hair to the jaw with a fringe, girls and boys alike", source: "PLACEHOLDER, nothing read on small children's hair. Chosen because Apoleia's cropped hair begins far back on a child's large skull (a shaven head)." },
        Source { what: "men's hair in three lengths (to above the ear, to the ear's lobe, to the jaw), 3 : 3 : 2, and two men in ten from 15 with their hair parted in the middle, over the ears and cut at the jaw, without a fringe (round 125), one of the two in waves (round 130)", source: "PLACEHOLDER: lengths, shares and the age by eye, so that the men of a town do not all have one head. Nothing was read for the parted cut or its waves: to be checked against picture sources as the fringe is (Luttrell Psalter c. 1330, Holkham Bible)." },
        Source { what: "men's hair to the jaw with a fringe", source: "PLACEHOLDER, to be checked against picture sources (Luttrell Psalter c. 1330, Holkham Bible)." },
        Source { what: "beards short or full; no long philosopher's beard, no beard on the chin alone", source: "PLACEHOLDER, to be checked against picture sources (Luttrell Psalter c. 1330). Apoleia's chin beard hangs as a tuft of long strands, which also reads badly." },
        Source { what: "no trimmings, belts' fittings or jewels on common people", source: "Not built: nothing read that shows them; rather none than invented ones." },
        Source { what: "share of red hair", source: "PLACEHOLDER. The two values are set so that of founders of the pool England draws from (alleles 20 to 170) about 5 in 100 have clearly red hair (a third of the red mixed in or more) and about 18 in 100 a tint of it. The 5 in 100 is an estimate, not a count: a press report (IrishCentral on a survey by BritainsDNA of 2,343 people, 2013, read as a summary) gives 34 to 40 in 100 carriers of a red-hair variant in Yorkshire and south-east Scotland; if the trait needs two such alleles, that is 4 to 6 in 100 with red hair. No source for 1356." },
        Source { what: "the iris 11.7 mm across, whatever the size of the head", source: "Rüfer, Schröder & Erb 2005, Cornea 24: 259-261 (white-to-white corneal diameter 11.71 mm, SD 0.42, 390 people of 10 to 80; from the abstract). Opening between the lids 25.6 mm long and 8.7 mm high: Rana et al. 2023, Int Ophthalmol 43: 2695-2701 (380 adults in Adelaide); the lids of England are by eye, not by that." },
        Source { what: "the measures of a woman's and a man's face (length, breadth at the cheekbones and at the jaw's corners, distance between the pupils, breadth and protrusion of the nose, length of the lips) and of the head (breadth over the ears, length from the brows to the back, four arcs from ear to ear): the means of the face at rest, the gene of the jaw kept off the skull, a man's head less deep at the back, a woman's jaw that runs in to the chin", source: "Zhuang & Bradtmiller 2005, Head-and-face anthropometric survey of U.S. respirator users, Journal of Occupational and Environmental Hygiene 2(11): 567-576 (2543 men, 1454 women of 18 to 66; read from the copy at stacks.cdc.gov/view/cdc/190020). People of today: used for how the sexes differ and how a face's parts stand to each other. No measured heads of 1356 read." },
        Source { what: "a woman's brows above the rim of the eye's socket: the upper edge over the pupil 19.6 mm above the line through the eyes' inner corners", source: "Matros, Garcia & Yaremchuk 2009, Plastic and Reconstructive Surgery 124: 1296-1301 (36 women of 20 to 30: 15.7 mm over the inner corner, 19.8 over the pupil, 21.3 over the outer corner; numbers read from the summary at dryaremchuk.com, volume and pages from memory). The inner end is left higher than theirs and the outer lower: by those numbers the brow slants, and MakeHuman's with its heavy inner end then reads as a frown. Men: Sclafani & Jung 2010, Archives of Facial Plastic Surgery 12(2) (lower and more level; abstract, no numbers). The band's breadth PLACEHOLDER, by eye." },
        Source { what: "lids, closed mouth, the face at rest, a child's face, strength of moods, the eyeballs' place in their sockets, how far the eyes turn towards each other, a child's lids and lash line, women's jaw, cheeks and lifted inner brow, the lips' colour, the upper lip's share of it, the seam and a child's share of the colour, the form of the mouth (cupid's bow, the lips' volume, the lower jaw forward), the lash line, flush, where it lies and its strength for women and men, the line of a scar, brows, how much of Apoleia's paint (brow, cheeks, sockets) and child's face is left, a small child's brows, how strongly the gene of the lips shows, that ears under a veil keep MakeHuman's form, and that no head has the skin beside the chin lifted (`without`)", source: "PLACEHOLDER, by eye against the reference pictures; not a matter of dress but kept with it so that Apoleia's faces stay as they were." },
        Source { what: "a grown woman's eyes brought forward by 2 mm with their lids: how deep a woman's eye lies in her head against a man's", source: "Exophthalmometry at eyewiki.org (Hertel's reading from the bone's rim beside the eye to the cornea: 16.5 mm in white men, 15.4 mm in white women, after Erb et al. 2003 and Migliori & Gladstone 1984). Shin, Lee, Koh & Song 2017, Anatomy & Cell Biology 50: 41-47 (computed tomography of 70 men and 71 women of Korea, 20 to 30: the cornea 5.3 and 6.3 mm behind the rim over the eye, 11.6 and 12.4 mm in front of the rim under it; read from a summary of the paper's table, which column is which sex inferred). Bone, where ours reads skin, and people of today: only the difference between the sexes is used, and the 2 mm is fitted to it." },
        Source { what: "how the grown hold their heads (the bust's lean, women 0.12 and men 0.10)", source: "Arnett, Jelic, Kim, Cummings, Beress, Worley, Chung & Bergman 1999, American Journal of Orthodontics and Dentofacial Orthopedics 116(3): 239-253 (20 white men and 26 white women with balanced faces, in natural head position: glabella, lips and chin against the true vertical line through the subnasale; read from a copy of the paper). The lean is the best fit to it: women then lie within 1.2 of its standard deviations at every point, men's glabella 1.85 behind and their lips about 1 (MakeHuman's form; no lean brings them nearer)." },
        Source { what: "the mouth at 0.31 of the way from the nose's foot to the chin's lowest point (the upper lip's share of the lower face)", source: "Arnett, Jelic, Kim, Cummings, Beress, Worley, Chung & Bergman 1999, American Journal of Orthodontics and Dentofacial Orthopedics 116(3): 239-253 (table of facial lengths, lips at rest: upper lip 21.0 of 71.1 mm in 26 women, 24.4 of 81.1 in 20 men; read from a copy of the paper). Farkas, Katic, Hreczko, Deutsch & Munro 1984, American Journal of Orthodontics 86(1): 52-60 (lips closed: 20.1 of 64.3 mm in women, 22.3 of 72.6 in men; not read itself, the means as cited by Woelfel, Igarashi & Dong 2014, Journal of Advanced Prosthodontics 6(6): 483-490). 0.31 lies between the two readings for closed lips; that every grown face has the same share is a simplification." },
        Source { what: "the pupil at 0.57 of the way from the lower lid's edge to the upper lid's", source: "Neuro-ophthalmology Illustrated, ch. 1, at neuro-ophthalmology.stanford.edu (the upper lid's edge 4 to 5 mm over the pupil's middle, covering the upper 1 to 2 mm of the iris; the lower lid just reaching the iris's foot; opening 9 to 12 mm high) and Margin to reflex distance at eyewiki.org (lower lid 5.5 mm under the pupil). Ours are set by moving the ball, not the lids. The opening is 8.9 mm high in grown women and 9.1 in men, the upper lid 3.8 to 3.9 mm over the pupil and the lower 5.0 to 5.2 under it: at the low end of theirs." },
        Source { what: "the height of the lips' red (upper, lower, both), which the form of the mouth is held against", source: "Ferrario, Sforza, Tartaglia, Sozzi & Carù 2003, Plastic and Reconstructive Surgery 111(7): 2149-2156 (89 men and 73 women, healthy young northern Italians, measured in three dimensions). Means from the paper's table; the standard deviations read from a summary of it. The lips' form itself and how far the upper lip stands in front of the lower: PLACEHOLDER, nothing read on real profiles." },
        Source { what: "how large a child's braincase is against its face, how broad its mouth and how long its nose, by age and sex (head breadth, head length, tragion to the top of the head, mouth breadth, nose length where it was too long: fitted; head circumference, head height, breadth at the cheekbones and between the ears, lower face height, neck circumference: held against)", source: "Snyder, Schneider, Owings, Reynolds, Golomb & Schork 1977, Anthropometry of infants, children, and youths to age 18 for product safety design, University of Michigan Highway Safety Research Institute, report UM-HSRI-77-17 (also SAE SP-450), for the U.S. Consumer Product Safety Commission: means and standard deviations by sex in sixteen groups of age from 2 to 19, read from the tables as served by NIST's AnthroKids (math.nist.gov/~SRessler/anthrokids, data of 1977) through an account of each page, not line by line. Children of the United States of the 1970s: used for how a child's head stands to a grown one's, not for its size (the shares are taken of England's own grown). Kesterke, Raffensperger, Heike, Cunningham, Hecht, Kau, Nidey, Moreno, Wehby, Marazita & Weinberg 2016, Biology of Sex Differences 7:23, table 4 (the cranium at 88 to 91 in 100 of its adult size at 3 to 6 years, the face at 80 to 84, the nose at 74 to 78), says the same; its measures by year of age were not reached. The braincase's lower edge, the breadth of the band it fades over and the middle it grows from: PLACEHOLDER, by anatomy and by eye." },
        Source { what: "how far apart the corners of a child's mouth lie, which the children's mouths are held against (not fitted to it)", source: "Sforza, Laino, D'Alessio, Dellavia, Grandi & Ferrario 2007, Angle Orthodontist 77(6): 1026-1033 (Italian children measured in three dimensions; its reference groups: girls of 4 to 5 36.9 mm (SD 3.6), boys 39.8 (5.0); of 6 to 7 40.9 and 41.7; of 8 to 9 42.4 (3.7) and 43.3 (3.8); the red of both lips 12.4 and 12.8, 13.7 and 13.4, 15.1 and 14.1 mm). Read through a summary of the paper's tables, not line by line. The sample's four of eight are 2.4 to 5.0 mm narrower and its four of five have lips 2.2 to 2.8 mm higher: not fitted, open." },
    ],
};

pub static ENGLAND_1356: DressSet = ENGLAND;

/// (round 111) What everybody of 1356 wears whose own dress is not drawn yet: until then the people of the rest
/// of the world stood in Apoleia's Roman dress, under its lights and with its faces. This is England's table with
/// what is England's own taken off: no hood, no veil and no wimple, so a man's head is bare and a woman wears
/// her hair as England's girls do. The gown and the linen under it stay, as the plainest clothes there are.
/// PLACEHOLDER throughout: nothing read on what the common people of any of these lands wore; it is here so that
/// their faces, skins and hair can be judged under the same light as England's, not as a statement about their
/// dress. A dress of their own takes its place land by land.
pub static PLAIN_1356: DressSet = DressSet { key: "plain1356", origins: &[], hood: [Bare; 10], veil_from: 999.0, wimple_from: 999.0, hair_looped: "", fillet: "", coif: "", hat: "", hood_dagged: ["", ""], fastens: [[crate::fasten::Fasten::None; 10]; 2], ..ENGLAND };

/// (round 144) What people of rank wear in England's dress: until then a king stood in a villager's russet gown,
/// since the table knew one estate. It is England's table with the cloth, the buttons and the gown's closing of
/// those whom the statute of 1363 leaves free to dress as they will (`sources`); head wear, hair, linen, a man's
/// cut of the gown and everything of the face are the common people's (a lady's cut is the court's own since
/// round 149). PLACEHOLDER beyond what the sources name: the colours' values, green among them, and every share.
pub static COURT_1356: DressSet = COURT;
const COURT: DressSet = DressSet {
    origins: &[],
    // (a red, a blue, a green, a deep red, a lighter blue, a murrey: the stage draws wool lighter than its own
    // colour, as the common people's)
    wool: &["#6e171b", "#1c2f62", "#27502f", "#5a1428", "#34496e", "#522650"],
    fastens: {
        use crate::fasten::Fasten::{Buttons, Laced, None as Closed};
        [[Buttons, Laced, Buttons, Buttons, Laced, Buttons, Closed, Buttons, Laced, Buttons], [Buttons, Buttons, Buttons, Closed, Buttons, Buttons, Buttons, Buttons, Closed, Buttons]]
    },
    buttons: "#d9b45a",
    parted: [false, true, false, false, true, false, false, true, false, false],
    // (round 146) a lady shows her hair in plaits until the wimple's age, six in ten of them, and seven in ten of
    // those with a circlet on it: PLACEHOLDER, the shares and the age by eye
    veils: [Veil::None, Veil::Back, Veil::None, Veil::None, Veil::Closed, Veil::None, Veil::Back, Veil::None, Veil::Back, Veil::None],
    unveiled_until: 50.0,
    fillets: [true, true, false, true, true, false, true, true, false, true],
    circlet: "metal_circlet",
    // (round 147) of the lords with nothing else on the head, five in ten: PLACEHOLDER, the share by eye
    circlet_men: "metal_circlet_m",
    circlets_men: [true, false, true, false, false, true, false, true, false, true],
    // (round 149) a lady's gown is cut wide and low at the neck, and no linen shows in it (under a wimple the
    // round gown, as in the village). PLACEHOLDER: how wide and how low, and that the court's is cut lower than
    // the village's (`sources`)
    // (round 151) all three cuts from drapes of the court's own, laid closer on the body before they fall: a
    // smoother gown, no narrower (`sources`)
    gown_cut: ["cloth_kirtle_court", "cloth_cote_v_court"],
    gown_file: "cloth_cote_court",
    under: ["", "cloth_shirt"],
    // (round 150) the gown is of silk: a smooth cloth that shines (`sources`). PLACEHOLDER: that every gown at
    // court is
    gown_image: "cloth_cote_silk",
    // (round 156) half of the gowns are of a figured silk: palmettes and sprigs of leaves in gold thread
    // (`sources`). PLACEHOLDER: the share, and one figure for everybody
    gown_figured: "cloth_cote_silk_figured",
    figured: [true, false, true, false, true, false, true, false, true, false],
    // (round 153) veil and wimple are of a fine linen, bleached: whiter than the village's and without a weave to
    // be seen (`sources`). The shirt, the coif and the linen in a laced front take the white with them.
    // PLACEHOLDER: the white, and that every lady's is of linen and none of silk
    linen: "#faf8f2",
    veil_image: "cloth_veil_linen_fine",
    wimple_image: "cloth_wimple_fine",
    // (round 148) a lord's hood is faced with a white fur, in the white of the mantle's ermine
    hood_fur: "cloth_fur_white",
    hood_fur_dye: "#f4f0e6",
    crown_gold: "#e0b24e",
    crown_stones: ["#1c3fa8", "#b02a4a", "#c22f52", "#efe9dc"],
    sources: COURT_SOURCES,
    ..ENGLAND
};

/// (round 144) The court's table for a crowned head: nothing on the head but the crown, on the hair (a woman's in
/// plaits), and no mi-parti.
pub static CROWNED_1356: DressSet = DressSet {
    hood: [Bare; 10],
    veil_from: 999.0,
    wimple_from: 999.0,
    fillet: "",
    circlet: "",
    circlet_men: "",
    coif: "",
    hat: "",
    // (the hair under a crown lies flat, as under a hat: a cut's own body stands 2 cm off the skull where the
    // circlet sits, and a circlet round all of them was a hand broader than the head)
    hair: "bob02",
    hair_lengths: &[],
    hair_curly: "bob02",
    hair_receding: "bob02",
    hair_small: "bob02",
    crown: "metal_crown",
    crown_gold: "#e0b24e",
    mantle: "cloth_mantle",
    mantle_cloth: "#7a1a1f",
    mantle_fur: "cloth_mantle_fur",
    mantle_dyes: ["#f4f0e6", "#e0b24e", "#1c3fa8", "#c9a13f"],
    crown_stones: ["#1c3fa8", "#b02a4a", "#c22f52", "#efe9dc"],
    parted: [false; 10],
    // (round 156) a crowned head's gown is always of the figured silk (PLACEHOLDER)
    figured: [true; 10],
    ..COURT
};

const COURT_SOURCES: &[Source] = &[
    Source { what: "who dresses so: lords and their families, whom the statute of 1363 leaves without restriction (round 144)", source: "Statute concerning diet and apparel 1363 (37 Edw. III), as Rosalie Gilbert's page lists it rank by rank (rosaliegilbert.com/sumptuarylaws.html; read 20.11.2026 as an account of the page, not the page itself; a re-enactor's summary that names no edition of the statute): lords with lands worth 1000 pounds a year and their families 'no restrictions'; cloth of gold, ermine and stones barred from knights of 200 marks down; silk, silver and embroidery from the yeoman down; 'blanket and russet at 12d' for those who work the land. The game knows no ranks between a ruler's house and everybody else: all its persons of history are dressed so." },
    Source { what: "cloth in strong dyes: reds, blues, a green, a murrey", source: "Wikipedia, 1300-1400 in European fashion (read 20.11.2026 as an account of the page): Edward III's robes of 1351 of 'red velvet' (after Donald King), a bridegroom of the 1350s in a 'red cotehardie', a royal lady in 'a blue mantle'; 'silk was the finest fabric of all', brocades 'for the well-off'. No dye is named there. Green and murrey and every value are PLACEHOLDER: no velvet, no pattern and no fur is drawn on a gown (its cloth: the next row)." },
    Source { what: "the gown of silk on every person of rank: a smooth cloth without a pattern that shines along its folds; the hood stays of wool (round 150)", source: "The same page: 'silk was the finest fabric of all', brocades 'for the well-off', Edward III's robes of 1351 of 'red velvet'. The statute of 1363 as Rosalie Gilbert's page lists it (the first row) takes silk from the yeoman down and leaves it to those above. Which silk a gown was of is not said, nor how many gowns at court were of silk and how many of fine wool: that every gown at court is silk, plain and without a pattern, and how much it shines (the stage's values) are PLACEHOLDER." },
    Source { what: "a figured silk on half of the gowns at court and on every crowned head's: palmettes in rows, each row set off by half a step, with a sprig of two leaves between them, in gold thread on the dyed ground (round 156)", source: "Three museums' records of Italian silks, read 21.11.2026 as accounts of the pages (no picture was looked at): the Cleveland Museum of Art, 1926.507, 'Parrots and Animals' (Italy, 1300s; 'silk, gold thread; a combination of two weaves (lampas)'): 'the paired eagles and gazelles flanking concentric bulb-shaped palmettes', with like pieces dated 'between 1334 and 1361'; the same museum's 1977.14 (Italy, 1350 to 1400; silk, gold thread, lampas): 'large palmette leaves', deer, birds and dogs amid vines; the Victoria and Albert Museum, O261087 (Lucca, 1300 to 1350, lampas): 'scrolling vines, squirrels and deer', 'a type called camacas in the statutes for the city of Lucca in 1376'. Wikipedia, 1300-1400 in European fashion (read the same day as an account of the page): 'The well-off could afford woven brocades from Italy', 'Fashionable Italian silks of this period featured repeating patterns of roundels and animals'. The National Archives' blog, Opus Anglicanum (the same): the royal wardrobe of 1337-8 has surcoats of buckram 'decorated with gold leaves' for the king's games at Christmas (E 101/388/8). Round 144's statute bars cloth of gold from knights of 200 marks down, not from lords. NOT drawn: the beasts and birds every one of these records has (a palmette and a leaf are written as a formula, a gazelle is not), roundels. PLACEHOLDER: the palmette's form, the sprig, every size (5.5 cm from palmette to palmette; no record gives a repeat), the half step, one figure for everybody, the shares, that a crowned head's gown is always figured, and the gold's colour and shine on the stage." },
    Source { what: "veil and wimple of a fine linen, bleached white, with no weave to be seen; the shirt, the coif and the linen in a laced front in the same white (round 153)", source: "Rosalie Gilbert, Veils and Wimples (rosaliegilbert.com/veilsandwimples.html; read 20.11.2026 as an account of the page; a re-enactor's essay that names pictures and tombs but no list of sources): veils 'ranging from fine opaque linens to gauzy barely-there silks', wimples 'from fine opaque linens to very fine silks'; 'white was the most overwhelmingly popular colour'; what is left of such cloths 'appear to be bleached and pressed'; fine Flemish linens 'could cost thirty times as much as finely woven wools'; poorer women had 'thick wool' and 'natural, unbleached colours'. The page does not say in so many words that a lady's veil was finer than a villager's: that the costly bleached linen is the court's and the unbleached the village's is this table's reading. Wikipedia, Wimple (the same day, its first section only): 'usually made from white linen or silk'. PLACEHOLDER: the white's value, that the cloth is opaque and none of silk or gauze, that no veil is frilled (the page has the goffered veil, 'popular c.1350-1380', which is not built). No picture of the time was looked at." },
    Source { what: "the gown buttoned in front on eight men in ten and six women in ten from 15 and 14 years, laced on three women in ten, with buttons of gilt metal", source: "The same page: 'the cotehardie fits snugly and is buttoned up the front' (a caption of the late 14th century), and noblemen and squires about 1350 in tunics 'so short and tight' (the continuation of Guillaume de Nangis, after Braudel). Rosalie Gilbert, Buttons and Lacings (rosaliegilbert.com/buttonsandlacings.html, read 20.11.2026 as an account of the page): 'the upper classes would have preferred ... metal buttons', the lower classes 'matching cloth buttons'; a tin button with a glass stone of the late 14th century (Museum of London). Which metal is not said: gilt is PLACEHOLDER, and so are the shares." },
    Source { what: "the gown draped close: smooth on the body, with fewer folds than the village's (round 151)", source: "The same page: noblemen and squires about 1350 in tunics 'so short and tight' (the continuation of Guillaume de Nangis, after Braudel), 'the cotehardie fits snugly' (a caption of the late 14th century); for women the Fashion History Timeline (the row of the lady's cut below) has 'low-necked fitted dresses' at 1380. A fit is not built: the court's gown is the village's pattern, laid 1.2 cm off the body before it is let fall where the village's is laid 4.5 cm off, which leaves it smoother and as wide as it was. PLACEHOLDER." },
    Source { what: "mi-parti: a man's gown of two cloths, one on each side, on three men in ten from 15 years who wear no crown", source: "The same Wikipedia page: 'a fashion for mi-parti or parti-coloured garments made of two contrasting fabrics, one on each side, arose for men in mid-century ... and was especially popular at the English court' (after Black & Garland). The share is PLACEHOLDER." },
    Source { what: "a crown on a king, an emperor and a queen who reigns: a circlet of gold with twelve fleurons, six large and six small in turn, a sapphire or a balas ruby on the circlet under each, a balas ruby and three pearls on each large fleuron; nothing else on the head, a woman's hair in plaits under it", source: "Crowns in the treasure of Richard II (Institute of Historical Research and Royal Holloway, archives.history.ac.uk/richardII/crowns.html; read 20.11.2026 as an account of the page): eleven gold crowns in the inventory of 1399, crowns 'with alternating large and small fleurons', of eight, ten, twelve and fourteen; the one that survives (Munich, Schatzkammer, c. 1380) 'a circlet of twelve hinged plaques and six large and six small fleurons'; 'sapphires, balas rubies and clusters of pearls'. Forty years after 1356 and no measure given: the crown's height, the form of a fleuron (a lily of three leaves, by the page's gloss 'lily-shaped') and the stones' places are PLACEHOLDER; the plaques, their tracery and enamel are not drawn. The plaits under a crown: the Wikipedia page's royal lady of the 1350s, 'her hair is worn in two braids beneath her crown' (Italy)." },
    Source { what: "a lady's hair in plaits, hanging or pinned up beside the cheeks, shown by six in ten until 50 years, and on seven in ten of those a circlet: a band of gilt metal 1.6 cm high round the head on the hair, set with twelve stones, a sapphire and a balas ruby in turn; the veil on the others, the wimple from 50 (round 146)", source: "The Medieval Combat Society, Female reenactment costume, the part on Edward III's reign (themcs.org/costume/Female reenactment costume.htm; a re-enactment society's page without notes, its first half read 20.11.2026 as an account of the page): 'Hair was worn in plaits around the face, the rich having gold or silver or embroided tubes on either side of the face which was suspended from a narrow band worn around the head'; 'Ladies wore veils and wimples, those of the rich being made of fine transparent silk'; 'Over the 14th century the wimple became less common, being worn by older women and nuns'; 'A gilded or jewelled circlet was worn by the nobility, or ornate net was worn'; a brass of 1350 with a 'floral coronet over veil'. Rosalie Gilbert, Headwear and Crowns, coronets, diadems and circlets (rosaliegilbert.com/headwear.html, /crownsandcirclets.html; a re-enactor's pages, read the same day as accounts of the pages): 'Wealthy women preferred to have their external fillets made from metal and set with metal flowers or sometimes jewels', 'Royal and noble ladies favoured them on any important occasion'; plaits 'worn on each side of the face' in the middle part of the century; a circlet of 1327 to 1341 (the bust of Marie de France) 'a one-piece, being worn with a braided hairstyle', with holes 'where gemstones probably once were'; from about 1360 coronets of hinged plaques in place of 'the solid band previously worn'; a fillet of 1340 to 1360 that 'sits up high on her head, almost like a crown'. No page gives a measure, a number of stones or says where on the head it sat in England; none has it without a veil for certain. PLACEHOLDER: the band's height, its stones and their number, that it lies on the hair at the top of the forehead (where the linen fillet of round 128 lies), the shares, the age to which a lady shows her hair, and that she wears it in every picture (the pages have it for occasions). Not drawn: the tubes of gold beside the face, a net, a veil of transparent silk (the court's veil is the villagers' linen), the frilled veil the same page has from about 1349." },
    Source { what: "a circlet on a lord's hair: the lady's band of gilt metal with its stones, on five in ten of the men from 15 years who wear nothing else on the head, the hair lying flat under it (round 147)", source: "The Medieval Combat Society, Male reenactment costume, the part on Edward III's reign (themcs.org/costume/Male reenactment costume.htm; a re-enactment society's page without notes, read 20.11.2026 as an account of the page): captions of tombs 'Circlet, William of Hatfield, York Cathedral, 1337', 'Circlet, Thomas Beauchamp and wife Katherine mortimer weeper 27, Warwick. 1369', 'Circlet, weeper of Thomas de Vere, Bures, 1371'; 'Chaplets were made of metal with repousse decoration or embellished with gemstones and pearls'; 'Headwear was often worn, either a hat or a crown, where headwear is not shown, then a hood is generally present'. The pictures themselves were not looked at: the circlet's form on a man, that it is the lady's, on which hair it sat and how many lords wore one are PLACEHOLDER. Not built from the same page: the beaver hat ('a rounded hat with an oval brim', in royal accounts from 1350), painted hoods, the chaperon 'popular among older men from about 1350'." },
    Source { what: "a lady's gown cut wide and low at the neck, with no linen in the opening, until the wimple's age (round 149)", source: "Encyclopedia.com, A New Look for Women, the part 'Necklines and Upper Body Coverings' (encyclopedia.com/humanities/culture-magazines/new-look-women, from Gale's Arts and Humanities Through the Eras; a list of sources, no notes; read 20.11.2026 as an account of the page): 'a low neckline revealing shoulders and the upper portions of the breasts', 'around the middle of the fourteenth century in France and England', 'perhaps at first a climate-related trend from Italy'; no estate is named. Rosalie Gilbert, Kirtles (rosaliegilbert.com/kirtles.html; a re-enactor's page without notes, read the same way): 'Most of these were cut with a wide, low neckline'; a decree of 1375, its issuer not named: 'The neckline should not be lower than the armpits'. Against the date: the Fashion History Timeline of the Fashion Institute of Technology, 1350-1399 (fashionhistory.fitnyc.edu/1350-1399, read the same way), has 'Women's shoulders are revealed for the first time in low-necked fitted dresses' at 1380. No page says that a lady's was cut lower than a village woman's, whether a smock showed in it or whether it was edged: that the court has the wider cut and the village keeps its own, the line (as it is drawn 37 cm broad from shoulder to shoulder and 8.5 to 10 cm under the chin in front: the collarbones bare, the breast covered, so less low than the first page has it) and the bare skin in it are PLACEHOLDER. The gown is no narrower than the village's: 'fitted' is not built (the row of the gown draped close)." },
    Source { what: "a lord's hood faced with white fur: a roll of fur along the edge of the hood's opening, round the face of a hood on the head and round the neck of one thrown back (round 148)", source: "Elspeth Veale, The English Fur Trade in the Later Middle Ages, ch. I (the mantle's row below; read 20.11.2026 as an account of the page): in 1363 lesser knights 'only facings of ermine and lettice on their hoods'; a lining 'might be turned back at neck or wrist, showing as a collar, revers, or cuffs of fur', edges 'turned back to form borders or facings of fur in front'. La Cotte Simple, fur primer (the same row): ermine's tails 'either left in place or removed and powdered on the skins'. So a facing of fur on a hood is named for knights below the lords this table dresses; that lords, whom the statute leaves without restriction (the first row), wore it too is this table's reading. PLACEHOLDER: that every lord's hood has it; which fur (drawn white without tails: ermine with its tails removed, or lettice); its breadth of 2.5 cm on the wool, its depth and its form, a smooth roll; that a hood thrown back shows it round the neck. No picture of the time was looked at." },
    Source { what: "a mantle on a crowned head (round 145): a red cloth round the shoulders over the gown, open in front, faced with ermine along both front edges and round the neck, held by two brooches of gold with a stone and a cord between them", source: "Elspeth Veale, The English Fur Trade in the Later Middle Ages, ch. I (London Record Society 38, 2003, british-history.ac.uk/london-record-soc/vol38/pp1-21; read 20.11.2026 as an account of the page): 'For outdoor wear a cloak was added, or a mantle for ceremonial occasions'; a lining 'might be turned back at neck or wrist, showing as a collar, revers, or cuffs of fur', edges 'turned back to form borders or facings of fur in front'; in 1337 'only the royal family, prelates, earls, barons, knights, and clerks with at least 100 pounds a year' could wear furs, in 1363 lesser knights 'only facings of ermine and lettice on their hoods'; Charles V in 1379 'liked his best robes furred with ermine'. La Cotte Simple, fur primer (cottesimple.com/articles/fur-primer/, read the same day, after Veale and Newton): ermine 'traditionally worn by royals and their family', white 'with the well-known exception of a black tip on its tail', the tails 'either left in place or removed and powdered on the skins'; 'ermine mantles worn by kings' (Richard II, BL Royal MS 20 B vi, c. 1395). The fastening: Rosalie Gilbert, Cloaks and Mantles (rosaliegilbert.com/cloaksandmantles.html, read the same day; a re-enactor's page that names no sources and no English example of the 14th century): women's mantles 'fastened across the front, with a cord and two brooches of some kind on each side at clavicle height', Philip IV's effigy of 1327 with 'the mantle fastening with a tasseled cord'. The red: Edward III's robes of 1351 of 'red velvet' (the row above). The tails in rows (round 152): Veale, ch. II (british-history.ac.uk/london-record-soc/vol38/pp22-35; read 20.11.2026 as an account of the page): 'the custom of adorning it here and there with black tails, a technique known as powdering'; 'The white skins were pynked or slit, and little pieces of fur from the legs of black lambs, usually used instead of ermine tails, were stitched into the fur'; note 44: 'Illuminated manuscripts which portray royal and ducal personages show the familiar rows of black tails early in the Middle Ages, but surviving accounts rarely make special provision for them before the fifteenth century'. Neither chapter gives a tail's size or how far apart they are set. PLACEHOLDER: that a man's is fastened as a woman's, that a crowned head wears it in every picture (a mantle is for ceremony), the facing's breadth, the tails' size (some 3.4 cm by 1 cm on a grown person), their two staggered rows 5 cm apart down the front edges and their single row round the neck, the brooches' form and stone, a cord without tassels, every colour value; the cloth has no pile and no lining is drawn: its inside is the same red. No picture of the time was looked at." },
];

/// Every dress with a table.
pub static SETS: [(Dress, &DressSet); 4] = [(Dress::England1356, &ENGLAND_1356), (Dress::Plain1356, &PLAIN_1356), (Dress::Court1356, &COURT_1356), (Dress::Crowned1356, &CROWNED_1356)];

impl Dress {
    /// The dress of a person whose family comes from `origin`: the table that names it; Apoleia's Roman dress
    /// for Apoleia's own regions (and for no origin at all); the plain dress of 1356 for everybody else.
    pub fn of(origin: &str) -> Dress {
        if let Some((d, _)) = SETS.iter().find(|(_, s)| s.origins.contains(&origin)) {
            return *d;
        }
        if origin.is_empty() || crate::dna::ORIGINS[..crate::dna::ROMAN].contains(&origin) {
            Dress::Roman
        } else {
            Dress::Plain1356
        }
    }

    /// (round 144) The dress of a person of that dress and of the look `stand` (look.rs `STANDS`): England's
    /// from the town's council up the court's, with the crown for the highest. Every other dress knows one estate.
    pub fn ranked(self, stand: usize) -> Dress {
        match (self, stand) {
            (Dress::England1356, crate::look::KAISER) => Dress::Crowned1356,
            (Dress::England1356, crate::look::DECURIO | crate::look::SENATOR) => Dress::Court1356,
            _ => self,
        }
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

/// A row of a table by age (age in years, girls' values, boys') for a person: between the table's ages in a
/// straight line, before its first age that age's, from its last on that one's; nothing of an empty table.
fn by_age<const N: usize>(table: &[(f32, [f32; N], [f32; N])], female: bool, yrs: f32) -> Option<[f32; N]> {
    let of = |row: &(f32, [f32; N], [f32; N])| if female { row.1 } else { row.2 };
    let Some(j) = table.iter().position(|row| row.0 > yrs) else { return table.last().map(of) };
    if j == 0 {
        return Some(of(&table[0]));
    }
    let (a, b) = (&table[j - 1], &table[j]);
    let f = (yrs - a.0) / (b.0 - a.0);
    Some(std::array::from_fn(|k| of(a)[k] + f * (of(b)[k] - of(a)[k])))
}

/// The targets of MakeHuman's that `DressSet::child_mouth` weighs: the first where the weight is over 0, the
/// second, at the weight without its sign, where it is under.
pub const CHILD_MOUTH: (&str, &str) = ("mouth/mouth-scale-horiz-incr", "mouth/mouth-scale-horiz-decr");

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
    /// How a person wears the veil (`veil_from`, `veils`, `unveiled_until`): none on men and girls.
    pub fn veil_of(&self, female: bool, yrs: f32, seed: u32) -> Veil {
        if !female || yrs < self.veil_from {
            return Veil::None;
        }
        match self.veils[((seed / 100) % 10) as usize] {
            Veil::None if yrs < self.unveiled_until => Veil::None,
            Veil::Closed => Veil::Closed,
            _ if self.veil_back.is_empty() || self.hair_veiled.is_empty() => Veil::Closed,
            _ => Veil::Back,
        }
    }

    /// Whether a person wears a fillet (`fillet`): a woman in plaits, old enough, by a digit of her seed.
    pub fn fillet_of(&self, female: bool, yrs: f32, seed: u32) -> bool {
        !self.fillet.is_empty() && female && yrs >= self.fillet_from && self.veil_of(female, yrs, seed) == Veil::None && self.fillets[((seed / 10_000) % 10) as usize]
    }

    /// How a person's gown is closed in front (`fastens`): from `fasten_from` years, by a digit of the seed.
    pub fn fasten_of(&self, female: bool, yrs: f32, seed: u32) -> crate::fasten::Fasten {
        let sex = if female { 0 } else { 1 };
        if yrs < self.fasten_from[sex] {
            return crate::fasten::Fasten::None;
        }
        self.fastens[sex][((seed / 100_000) % 10) as usize]
    }

    /// (round 145) The files of what lies over the gown: the gown is lifted off, left out under and sunk under
    /// these (an empty name is none).
    pub fn over_gown(&self) -> [&'static str; 6] {
        [self.veil, self.veil_back, self.wimple, self.hood_up, self.hood_back, self.mantle]
    }

    /// (round 156) The image a person's gown is drawn with in place of `gown`'s (empty: `gown`'s): the table's
    /// own cloth for it, plain or figured by a digit of the seed.
    pub fn gown_image_of(&self, seed: u32) -> &'static str {
        if !self.gown_figured.is_empty() && self.figured[((seed / 100_000_000) % 10) as usize] {
            self.gown_figured
        } else {
            self.gown_image
        }
    }

    /// (round 144) Whether a person's gown is of two cloths (`parted`): a man old enough, by a digit of his seed.
    pub fn parted_of(&self, female: bool, yrs: f32, seed: u32) -> bool {
        !female && yrs >= self.fasten_from[1] && self.parted[((seed / 10_000_000) % 10) as usize]
    }

    /// Whether a person wears a veil, either way.
    pub fn veiled(&self, female: bool, yrs: f32, seed: u32) -> bool {
        self.veil_of(female, yrs, seed) != Veil::None
    }

    /// The brow's lift for a person (`brow_lift`): the sex's own, by how much of the head has its adult form.
    pub fn brow_lift_of(&self, female: bool, yrs: f32) -> [f32; 3] {
        let k = if female { 0 } else { 1 };
        self.brow_lift[k].map(|mm| mm * (1.0 - child_share(self.adult[k], yrs)))
    }

    /// How far a person's eyes are brought forward (`eye_out`): the sex's own, by how much of the head has its
    /// adult form.
    pub fn eye_out_of(&self, female: bool, yrs: f32) -> f32 {
        let k = if female { 0 } else { 1 };
        self.eye_out[k] * (1.0 - child_share(self.adult[k], yrs))
    }

    /// The weight of a row of `neck` (its two weights `women` and `men`) for someone: the grown have their
    /// sex's, a child the share it has grown (`Look::grown`): MakeHuman's child keeps the neck of a child.
    pub fn neck_of(&self, women: f32, men: f32, female: bool, grown: f32) -> f32 {
        (if female { women } else { men }) * grown
    }

    /// How far a person's cheeks are filled out (`cheek_fill`), in mm: the women's in full on a grown woman, a
    /// third of it on a small child of either sex; a boy grows out of it into the men's (as the table's `rest`;
    /// `grown` is `Look::grown`).
    pub fn cheek_fill_of(&self, female: bool, grown: f32) -> f32 {
        by_sex(self.cheek_fill[0], self.cheek_fill[1], female, grown) * (0.35 + 0.65 * grown)
    }

    /// How much of the drawn face (`style`) a person's head has: none while it is MakeHuman's child, all of it
    /// once it has its adult form (`child_share`).
    pub fn style_of(&self, female: bool, yrs: f32) -> f32 {
        1.0 - child_share(self.adult[if female { 0 } else { 1 }], yrs)
    }

    /// What the drawn face adds to the weight of one of MakeHuman's targets on a person's head (`Style::face`).
    pub fn style_face_of(&self, name: &str, female: bool, grown: f32, yrs: f32) -> f32 {
        self.style.face.iter().filter(|row| row.0 == name).map(|row| by_sex(row.1, row.2, female, grown)).sum::<f32>() * self.style_of(female, yrs)
    }

    /// The factors of the drawn face on a person's braincase (`Style::skull`).
    pub fn style_skull_of(&self, female: bool, yrs: f32) -> [f32; 3] {
        self.style.skull.map(|k| 1.0 + (k - 1.0) * self.style_of(female, yrs))
    }

    /// The factor of the drawn face on a person's lids' heights (`Style::lids`).
    /// How much narrower the lower face is drawn at the chin (`Style::jaw`), as much of it as the head has.
    pub fn style_jaw_of(&self, female: bool, grown: f32, yrs: f32) -> f32 {
        by_sex(self.style.jaw[0], self.style.jaw[1], female, grown) * self.style_of(female, yrs)
    }

    /// How soft the jaw's lower edge is drawn (`Style::edge`): at every age, a boy's as a woman's until he is
    /// grown (the fold along the jaw is the mesh's own, on a child's head as on a grown one's).
    pub fn style_edge_of(&self, female: bool, grown: f32) -> f32 {
        by_sex(self.style.edge[0], self.style.edge[1], female, grown)
    }

    /// How much narrower the chin's end is drawn (`Style::chin`), as much of it as the head has.
    pub fn style_chin_of(&self, female: bool, grown: f32, yrs: f32) -> f32 {
        by_sex(self.style.chin[0], self.style.chin[1], female, grown) * self.style_of(female, yrs)
    }

    pub fn style_lids_of(&self, female: bool, yrs: f32) -> f32 {
        1.0 + (self.style.lids - 1.0) * self.style_of(female, yrs)
    }

    /// A person's iris across, in millimetres: `iris_mm`, growing to the drawn face's (`Style::iris_mm`); 0 where
    /// the dress gives none.
    pub fn iris_of(&self, female: bool, yrs: f32) -> f32 {
        if self.iris_mm > 0.0 { self.iris_mm + (self.style.iris_mm - self.iris_mm) * self.style_of(female, yrs) } else { 0.0 }
    }

    /// By how much a person's braincase is larger than MakeHuman's (`skull`: breadth, length, height): between
    /// the table's ages in a straight line, before its first age that age's, from its last on that one's.
    pub fn skull_of(&self, female: bool, yrs: f32) -> [f32; 3] {
        by_age(self.skull, female, yrs).unwrap_or([1.0; 3])
    }

    /// The factor on a person's nose's length (`child_nose`), read as `skull_of` reads its table; 1 where the
    /// table has no row.
    pub fn child_nose_of(&self, female: bool, yrs: f32) -> f32 {
        by_age(self.child_nose, female, yrs).map_or(1.0, |f| f[0])
    }

    /// The weight of a wider mouth for a person (`child_mouth`), read as `skull_of` reads its table.
    pub fn child_mouth_of(&self, female: bool, yrs: f32) -> f32 {
        by_age(self.child_mouth, female, yrs).map_or(0.0, |w| w[0])
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
    /// The tightly curled hair of a person whose curl is `curl` (0 to 1), if the table has it and the curl is
    /// tight enough.
    pub fn coily_of(&self, curl: f32) -> Option<&Coily> {
        self.coily.as_ref().filter(|c| curl > c.from)
    }

    /// Whether `name` is one of the table's cuts of tightly curled hair.
    pub fn is_coily(&self, name: &str) -> bool {
        self.coily.as_ref().is_some_and(|c| [c.men, c.women, c.small, c.thin, c.bald].contains(&name))
    }

    /// The cut whose painted layer and scalp lie under the hair `name`: its own, or for tightly curled hair the
    /// table's (`Coily::under`).
    pub fn under_of<'a>(&'a self, name: &'a str) -> &'a str {
        // (round 133) a cut with dressed ends has the hairline of the cut it is
        if let Some(h) = self.hair_dressed.iter().find(|h| h.0 == name) {
            return h.1;
        }
        match &self.coily {
            Some(c) if name == c.bald => c.under[1],
            Some(c) if self.is_coily(name) => c.under[0],
            // (round 121) the hair under a veil set back is a girl's above the ears: her painted layer, her scalp
            _ if !self.hair_veiled.is_empty() && name == self.hair_veiled => self.hair_girl,
            // (round 125) a man's parted hair has her hairline
            _ if self.hair_parted.contains(&name) => self.hair_girl,
            // (round 126) plaits pinned up are laid on her hair
            _ if !self.hair_looped.is_empty() && name == self.hair_looped => self.hair_girl,
            _ => name,
        }
    }

    /// What a man wears on the head.
    /// The plaits of one who wears plaits: hanging (`hair_girl`), or pinned up beside the cheeks (`hair_looped`).
    pub fn plaits_of(&self, seed: u32, age: f32) -> &'static str {
        if !self.hair_looped.is_empty() && age >= self.hair_looped_from && self.looped[((seed / 1000) % 10) as usize] {
            self.hair_looped
        } else {
            self.hair_girl
        }
    }

    /// The hair of the head of a person with this seed at this age: one of `hair_lengths` by its share, else
    /// `hair` (and `hair` in place of parted hair on a boy, `hair_parted_from`; in place of a cut with dressed
    /// ends the cut it is).
    pub fn hair_of(&self, seed: u32, age: f32) -> &'static str {
        let mut r = (seed / 10) % 10;
        for &(name, share) in self.hair_lengths {
            if r < share {
                if age < self.hair_parted_from {
                    if self.hair_parted.contains(&name) {
                        return self.hair;
                    }
                    if let Some(h) = self.hair_dressed.iter().find(|h| h.0 == name) {
                        return h.1;
                    }
                }
                return name;
            }
            r -= share;
        }
        self.hair
    }

    /// Where a person's mouth lies between nose and chin (`mouth_at`, `mouth_gene`).
    pub fn mouth_at_of(&self, p: &crate::look::Look) -> f32 {
        if self.mouth_at <= 0.0 {
            return self.mouth_at;
        }
        self.mouth_at + self.mouth_gene * p.shown(crate::look::MOUTH_H) * crate::settings::FACE_GAIN
    }

    /// The brows of a person by the gene of their weight (`brow_gene`): the factor on the band's breadth, and how
    /// far the hairs' colour is mixed towards the skin's.
    pub fn brow_weight_of(&self, p: &crate::look::Look) -> [f32; 2] {
        let x = p.shown(crate::look::BROW_T) * crate::settings::FACE_GAIN;
        let soft = self.brow_soft[usize::from(!p.female)];
        [(1.0 + self.brow_gene[0] * x).max(0.3), (soft + (1.0 - soft) * (-x * self.brow_gene[1]).clamp(0.0, 0.8)).min(0.8)]
    }

    /// The factor on a person's flush by the gene of it (`flush_gene`).
    pub fn flush_of(&self, p: &crate::look::Look) -> f32 {
        (1.0 + self.flush_gene * p.shown(crate::look::RUDDY) * crate::settings::FACE_GAIN).max(0.0)
    }

    /// How strongly the gene `i` of the face shows in this dress (`genes`; `genes_low` where the gene's value
    /// `x` lies under the middle).
    pub fn gene_gain(&self, i: usize, x: f32) -> f32 {
        let of = |t: &[(&str, f32)]| t.iter().find(|g| g.0 == crate::look::GENES[i]).map(|g| g.1);
        (if x < 0.0 { of(self.genes_low) } else { None }).or(of(self.genes)).unwrap_or(1.0)
    }

    /// Where one eye looks, seen from the head (yaw and pitch as `gaze`): `side` is 1 for the eye on the head's
    /// +x side and -1 for the other, `lean` how far the bust leans back.
    pub fn gaze_of(&self, side: f32, lean: f32) -> [f32; 2] {
        [self.gaze[0] - self.converge * side, self.gaze[1] - lean]
    }

    /// How the person with this seed carries the head (`head`): turned further than the stage turns it (radians
    /// about the upright axis, towards the head's left when positive) and tilted (radians about the axis from back
    /// to front, the crown towards the head's right when positive: as pose.rs tips the shoulders).
    pub fn head_of(&self, seed: u32) -> [f32; 2] {
        [self.head[0] * (2.0 * crate::geo::hash(seed, 1233, 13) - 1.0), self.head[1] * (2.0 * crate::geo::hash(seed, 1234, 17) - 1.0)]
    }

    /// As `gaze_of`, on a head carried as `head` says (`head_of`): the stage turns and tilts the head by the two
    /// angles, and the eyes are turned back by them, so that they stay on whoever looks at the picture. The line
    /// to the viewer as the stage sees it, turned back about the upright axis, then about the axis from back to
    /// front, then by the bust's lean (the stage tilts the figure as it stands, leaning). `gaze_of` takes the
    /// lean off the pitch alone, which is the same for eyes that look straight ahead and 0.2 degrees off at
    /// England's turn; with the lean taken off the pitch alone here, eyes on a head tilted by 0.06 looked half
    /// a degree further beside the viewer (tests/portrait.test.ts).
    pub fn gaze_at(&self, side: f32, lean: f32, head: [f32; 2]) -> [f32; 2] {
        if head == [0.0, 0.0] {
            return self.gaze_of(side, lean);
        }
        let (yaw, pitch) = (self.gaze[0] - self.converge * side - head[0], self.gaze[1]);
        let g = [yaw.sin() * pitch.cos(), pitch.sin(), yaw.cos() * pitch.cos()];
        let (c, s) = (head[1].cos(), head[1].sin());
        let (x, y) = (g[0] * c + g[1] * s, g[1] * c - g[0] * s);
        [x.atan2(g[2] * lean.cos() + y * lean.sin()), (y * lean.cos() - g[2] * lean.sin()).clamp(-1.0, 1.0).asin()]
    }

    /// Whether a man wears a coif (`coif`): old enough, bare-headed by the hood's digit, and that digit set.
    pub fn coif_of(&self, female: bool, yrs: f32, seed: u32) -> bool {
        !self.coif.is_empty() && !female && yrs >= self.coif_from && self.coifs[(seed % 10) as usize] && self.hood_of(female, yrs, seed) == Hood::None
    }

    /// (round 147) The file of the circlet a person wears, if any: a lady's in her fillet's place (`circlet`), a
    /// lord's on a head with nothing else on it (`circlet_men`).
    pub fn circlet_of(&self, female: bool, yrs: f32, seed: u32) -> Option<&'static str> {
        if female {
            return Some(self.circlet).filter(|c| !c.is_empty() && self.fillet_of(female, yrs, seed));
        }
        let worn = !self.circlet_men.is_empty() && yrs >= self.fasten_from[1] && !self.head_covered(female, yrs, seed) && self.circlets_men[((seed / 10_000) % 10) as usize];
        Some(self.circlet_men).filter(|_| worn)
    }

    /// (round 147) Whether a man's hair lies flat (`hair_hooded`): under cloth that is close on it, under a hat,
    /// and under a circlet, which is fitted round that hair.
    pub fn hair_flat(&self, female: bool, yrs: f32, seed: u32) -> bool {
        self.head_covered(female, yrs, seed) || (!female && self.circlet_of(female, yrs, seed).is_some())
    }

    /// Whether the hair of the head lies under cloth that is close on it: a hood on the head, a coif.
    pub fn head_covered(&self, female: bool, yrs: f32, seed: u32) -> bool {
        self.hood_of(female, yrs, seed) == Hood::Up || self.coif_of(female, yrs, seed) || self.hat_of(female, yrs, seed)
    }

    /// Whether a man wears a hat (`hat`): old enough, his digit set, no hood on the head and no coif.
    pub fn hat_of(&self, female: bool, yrs: f32, seed: u32) -> bool {
        !self.hat.is_empty() && !female && yrs >= self.hat_from && self.hats[(seed % 10) as usize] && self.hood_of(female, yrs, seed) != Hood::Up && !self.coif_of(female, yrs, seed)
    }

    /// The file of a man's hat: the brim falling all round, or turned up behind (`hat_cocked`).
    pub fn hat_file(&self, seed: u32) -> &'static str {
        if !self.hat_cocked.is_empty() && (seed / 10_000_000) % 10 < 5 { self.hat_cocked } else { self.hat }
    }

    /// The colour of a man's hat: one of `hat_tones` by a digit of the seed of its own.
    pub fn hat_tone(&self, seed: u32) -> &'static str {
        self.hat_tones[((seed / 1_000_000) % 10) as usize % self.hat_tones.len()]
    }

    /// The file of a man's hood and the image it is drawn with: the plain hood, or the one whose cape's hem
    /// is dagged (`hood_dagged`), which has no image of its own.
    pub fn hood_file(&self, hood: Hood, seed: u32) -> Option<(&'static str, &'static str)> {
        let (k, plain) = match hood {
            Hood::None => return None,
            Hood::Up => (0, self.hood_up),
            Hood::Back => (1, self.hood_back),
        };
        let dagged = !self.hood_dagged[k].is_empty() && crate::geo::hash(seed, 1236, 19) < self.hood_dags;
        Some((if dagged { self.hood_dagged[k] } else { plain }, plain))
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
    fn six_in_ten_of_those_in_plaits_pin_them_up_from_fifteen() {
        let d = &ENGLAND_1356;
        let count = |age: f32, set: &DressSet| (0..10_000).filter(|&s| set.plaits_of(s, age) == set.hair_looped).count();
        assert_eq!((count(14.9, d), count(15.0, d), count(25.0, d)), (0, 6000, 6000));
        // a girl's hair, her painted layer and her scalp are under them
        assert_eq!(d.under_of(d.hair_looped), d.hair_girl);
        // the plain dress of the world's people, and a table without them: every plait hangs
        assert_eq!(count(25.0, &PLAIN_1356), 0);
        assert!((0..100).all(|s| PLAIN_1356.plaits_of(s, 25.0) == PLAIN_1356.hair_girl));
    }

    #[test]
    fn women_of_england_wear_the_veil_three_ways() {
        let d = &ENGLAND_1356;
        // no man and no girl
        assert!((0..1000).all(|s| d.veil_of(false, 40.0, s) == Veil::None && d.veil_of(true, 19.0, s) == Veil::None));
        // of a thousand women of 25 three in ten in plaits, five in ten the veil set back, two as until round
        // 120; from 30 none without it
        let count = |age: f32, v: Veil| (0..1000).filter(|&s| d.veil_of(true, age, s) == v).count();
        assert_eq!([Veil::None, Veil::Back, Veil::Closed].map(|v| count(25.0, v)), [300, 500, 200]);
        assert_eq!([Veil::None, Veil::Back, Veil::Closed].map(|v| count(40.0, v)), [0, 800, 200]);
        // a table without a veil to set back, or without hair to show under it: every veil as until round 120
        for old in [DressSet { veil_back: "", ..ENGLAND }, DressSet { hair_veiled: "", ..ENGLAND }] {
            assert!((0..1000).all(|s| old.veil_of(true, 25.0, s) != Veil::Back && old.veil_of(true, 40.0, s) == Veil::Closed));
        }
        // the hair under a veil set back lies on a girl's painted layer and scalp
        assert_eq!((d.under_of(d.hair_veiled), d.under_of(d.hair_girl), d.under_of(d.hair)), (d.hair_girl, d.hair_girl, d.hair));
    }

    #[test]
    fn origins_find_their_dress() {
        assert_eq!(Dress::of("England"), Dress::England1356);
        for o in ["", "Italia", "Graecia", "Syria", "Aegyptus"] {
            assert_eq!(Dress::of(o), Dress::Roman);
        }
        // everybody else: the plain dress of 1356, England's table without hood, veil and wimple
        for o in ["french", "han", "yoruba", "Guinea", "China"] {
            assert_eq!(Dress::of(o), Dress::Plain1356);
        }
        let plain = Dress::Plain1356.set().unwrap();
        assert_eq!(plain.key, "plain1356");
        assert!((0..10).all(|seed| plain.hood_of(false, 30.0, seed) == Hood::None));
        assert!((0..1000).all(|seed| !plain.veiled(true, 60.0, seed)));
        assert_eq!((plain.gown, plain.hair_girl), (ENGLAND_1356.gown, ENGLAND_1356.hair_girl));
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
