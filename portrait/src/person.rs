//! From a person of the simulation to their Look: which of the seven looks they wear, what their life has left
//! on their face (food, sun, scars, mourning, wealth, worn clothes), their mood. Carried over from Apoleia's bridge
//! to its game (sim/godot/src/portrait.rs, commit c30a107) without its hooks for test renders, which read
//! environment variables.

use crate::look::{Look, Mood, BAUER, DECURIO, HAENDLER, HANDWERKER, SENATOR, SKLAVE};
use crate::{Life, NG};
use xxhash_rust::xxh3::xxh3_64;

/// Days the simulation of Apoleia keeps its events (sim/src/events.rs); mourning fades out by then.
pub const KEEP_DAYS: i64 = 60;

/// Which of the Werkstatt's seven looks a person of the simulation wears:
/// the upper stands by stand, everyone else by occupation. PLACEHOLDER
/// (open): soldiers and officers dress as craftsmen until there is armour,
/// clerks, scholars, priests and nobles below the upper stands as traders.
pub fn look_stand(stand: u8, job: &str) -> usize {
    match (stand, job) {
        (3, _) => SENATOR,
        (2, _) => DECURIO,
        (_, "Unfreie") => SKLAVE,
        (_, "Bauern" | "Pächter") => BAUER,
        (0, "Tagelöhner") => BAUER,
        (_, "Tagelöhner" | "Handwerker" | "Soldaten" | "Offiziere") => HANDWERKER,
        (_, "Händler" | "Unternehmer" | "Beamte" | "Gelehrte" | "Geistliche" | "Adel") => HAENDLER,
        (0, _) => BAUER,
        _ => HANDWERKER,
    }
}

/// Share of the working day spent outdoors by occupation (tan and
/// wrinkles). PLACEHOLDER (unsourced).
fn outdoors(job: &str) -> f32 {
    match job {
        "Bauern" | "Pächter" => 0.85,
        "Tagelöhner" | "Unfreie" => 0.8,
        "Soldaten" => 0.75,
        "Offiziere" => 0.5,
        "Handwerker" => 0.45,
        "Händler" => 0.4,
        "Unternehmer" | "Adel" => 0.3,
        "Beamte" | "Geistliche" => 0.2,
        "Gelehrte" => 0.15,
        _ => 0.4,
    }
}

/// Chance of one or two scars after 16. PLACEHOLDER (unsourced; the
/// simulation has no injuries).
fn scar_chance(job: &str) -> f32 {
    match job {
        "Soldaten" => 0.5,
        "Unfreie" => 0.45,
        "Offiziere" => 0.4,
        "Handwerker" => 0.35,
        "Bauern" | "Pächter" | "Tagelöhner" => 0.3,
        _ => 0.12,
    }
}

/// Days of full mourning after a death in the household; it fades out by
/// KEEP_DAYS, the days the simulation keeps its events. PLACEHOLDER: Roman
/// custom kept mourning for up to ten months for a husband or a parent
/// (Plutarch, Numa 12), longer than the events reach back.
const MOURN_FULL_DAYS: f32 = 20.0;

/// What the simulation knows of a person's days beyond body and job: days
/// since the last death in the household (None without one in KEEP_DAYS),
/// the share of the people around with less money per head (0..1, None
/// without a household), clothing held of the need in per cent.
#[derive(Clone, Copy, Default)]
pub struct Lived {
    pub loss_days: Option<f32>,
    pub rank: Option<f32>,
    pub clothes_pct: Option<f32>,
}

/// The face's life from the simulation: food from body weight (S84: 1000 ‰
/// is normal, hunger starts to show below about 935 ‰), the share outdoors
/// from the occupation, scars by chance per occupation, no illness (the
/// simulation has none yet); mourning after a death in the household,
/// wealth as the rank by money, clothes worn out as far as the household
/// lacks clothing.
fn life_of(job: &str, age: f32, weight_permille: f32, seed: u32, lived: Lived) -> Life {
    let mut r = crate::geo::Rng::new(seed ^ 0x27d4_eb2f);
    let food = (0.55 + (weight_permille - 1000.0) / 500.0).clamp(0.0, 1.0);
    let sun = (outdoors(job) + (r.next() - 0.5) * 0.3).clamp(0.0, 1.0) * if age < 8.0 { 0.4 } else { 1.0 };
    let scars = if age > 16.0 && r.next() < scar_chance(job) { 1 + (r.next() * 2.0) as u32 } else { 0 };
    let mourn = lived.loss_days.map_or(0.0, |d| ((KEEP_DAYS as f32 - d) / (KEEP_DAYS as f32 - MOURN_FULL_DAYS)).clamp(0.0, 1.0));
    let wealth = lived.rank.unwrap_or(0.5).clamp(0.0, 1.0);
    let worn = lived.clothes_pct.map_or(0.0, |c| (1.0 - c / 100.0).clamp(0.0, 1.0));
    Life { food, sun, scars, ill: 0.0, mourn, wealth, worn }
}

/// The Look of a person of the simulation.
#[allow(clippy::too_many_arguments)]
pub fn look_of(genes: &[u8], female: bool, age: f32, stand: u8, job: &str, weight: f32, fed: f32, pid: u32, origin: &str, lived: Lived) -> Look {
    let seed = (xxh3_64(&pid.to_le_bytes()) & 0x3fff_ffff) as u32;
    let g: [f32; NG] = std::array::from_fn(|i| (genes[i] as f32 + genes[NG + i] as f32) / 2.0);
    let st = look_stand(stand, job);
    let life = life_of(job, age, weight, seed, lived);
    // mourners look sad, hungry households grim; otherwise most look calm,
    // some content
    let mood = if life.mourn > 0.3 {
        Mood::Sad
    } else if fed < 900.0 {
        Mood::Grim
    } else if seed % 3 == 0 {
        Mood::Content
    } else {
        Mood::Neutral
    };
    Look {
        genes: g,
        female,
        age,
        stand: st,
        east: matches!(origin, "Graecia" | "Syria" | "Aegyptus"),
        seed,
        mood,
        life,
        beard: None,
        hair: None,
        hat: None,
        jewel: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::look::STANDS;

    #[test]
    fn every_job_has_a_look() {
        for job in ["Unfreie", "Bauern", "Pächter", "Tagelöhner", "Handwerker", "Soldaten", "Offiziere", "Händler", "Unternehmer", "Beamte", "Gelehrte", "Geistliche", "Adel", ""] {
            for stand in 0..4 {
                assert!(look_stand(stand, job) < STANDS.len());
            }
        }
        assert_eq!(look_stand(0, "Unfreie"), SKLAVE);
        assert_eq!(look_stand(3, "Adel"), SENATOR);
    }
}
