//! The files of the real look: hair, beards and clothes draped in Blender, textured skin and eyes, the face space
//! with its origin shifts (public/portrait/real, built by the realism pipeline of Apoleia).
//!
//! In Apoleia this module read the files from a folder on disk. A browser has no disk, so here the caller hands
//! the files in (`put` the data files with their bytes, `name` the images, which the renderer loads itself) and
//! switches the look on by naming their folder (`set_real`). The functions the builder calls (`dir`, `on`, `rows`,
//! `column`, `exists`, `image`, `normal_map`) answer as they did in Apoleia, from the files handed in.
//!
//! Images are WebP (or PNG), the bigger data files zstd-packed (.txt.zst).

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

static REAL: RwLock<Option<String>> = RwLock::new(None);

/// The files handed in, by path: a data file with its bytes, an image without (the renderer loads it).
static FILES: RwLock<Option<HashMap<String, Option<Arc<Vec<u8>>>>>> = RwLock::new(None);

/// Hands a data file in.
pub fn put(path: &str, bytes: Vec<u8>) {
    if let Ok(mut f) = FILES.write() {
        f.get_or_insert_with(HashMap::new).insert(path.to_string(), Some(Arc::new(bytes)));
    }
    if let Ok(mut t) = ROWS.write() {
        *t = None;
    }
}

/// Tells that the image `path` is there.
pub fn name(path: &str) {
    if let Ok(mut f) = FILES.write() {
        f.get_or_insert_with(HashMap::new).entry(path.to_string()).or_insert(None);
    }
}

/// Whether the file `path` was handed in (as it is named, packed or not).
pub fn has(path: &str) -> bool {
    FILES.read().ok().is_some_and(|f| f.as_ref().is_some_and(|f| f.contains_key(path)))
}

fn bytes(path: &str) -> Option<Arc<Vec<u8>>> {
    FILES.read().ok()?.as_ref()?.get(path)?.clone()
}

/// The bytes of a zstd frame, unpacked.
pub fn unpack(packed: &[u8]) -> Option<Vec<u8>> {
    use std::io::Read;
    let mut out = Vec::new();
    ruzstd::decoding::StreamingDecoder::new(packed).ok()?.read_to_end(&mut out).ok()?;
    Some(out)
}

/// Switches the real look on (the folder of its files) or off (None).
pub fn set_real(dir: Option<String>) {
    if let Ok(mut r) = REAL.write() {
        *r = dir.filter(|d| !d.is_empty());
    }
    if let Ok(mut t) = ROWS.write() {
        *t = None;
    }
}

/// The folder of the real look's files, when it is on.
pub fn folder() -> Option<String> {
    REAL.read().ok().and_then(|r| r.clone())
}

/// A data file as text, packed (path.zst) or not.
pub fn read_text(path: &str) -> Option<String> {
    bytes(path).and_then(|b| String::from_utf8(b.to_vec()).ok()).or_else(|| {
        let packed = bytes(&format!("{path}.zst"))?;
        String::from_utf8(unpack(&packed)?).ok()
    })
}

/// The data files parsed so far: each line its numbers (a token that is no
/// number reads 0), kept so that a face does not unpack and parse them
/// again; dropped when the look is switched or a file is handed in.
static ROWS: RwLock<Option<HashMap<String, Option<Arc<Vec<Vec<f32>>>>>>> = RwLock::new(None);

/// Each line of a data file as numbers, parsed once and kept.
pub fn rows(path: &str) -> Option<Arc<Vec<Vec<f32>>>> {
    if let Some(r) = ROWS.read().ok().and_then(|m| m.as_ref().and_then(|m| m.get(path).cloned())) {
        return r;
    }
    let r = read_text(path).map(|t| Arc::new(t.lines().map(|l| l.split_whitespace().map(|x| x.parse().unwrap_or(0.0)).collect()).collect::<Vec<Vec<f32>>>()));
    if let Ok(mut m) = ROWS.write() {
        m.get_or_insert_with(HashMap::new).insert(path.to_string(), r.clone());
    }
    r
}

/// A data file of one number a line (`default` where a line has none).
pub fn column(path: &str, default: f32) -> Vec<f32> {
    rows(path).map(|r| r.iter().map(|l| l.first().copied().unwrap_or(default)).collect()).unwrap_or_default()
}

/// Whether a data file is there, packed or not.
pub fn exists(path: &str) -> bool {
    has(path) || has(&format!("{path}.zst"))
}

/// The image `name` in `dir`: WebP if there is one, else PNG.
pub fn image(dir: &str, name: &str) -> String {
    let webp = format!("{dir}/{name}.webp");
    if has(&webp) {
        webp
    } else {
        format!("{dir}/{name}.png")
    }
}

/// The normal map beside an image (name_n), if there is one.
pub fn normal_map(image: &str) -> Option<String> {
    let (stem, ext) = image.rsplit_once('.')?;
    let n = format!("{stem}_n.{ext}");
    has(&n).then_some(n)
}
