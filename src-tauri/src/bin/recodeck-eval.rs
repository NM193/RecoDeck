//! recodeck-eval: measures BPM, key and beat-grid detection against the
//! values Traktor (and Rekordbox) stored for the same files. Development
//! only (spec docs/superpowers/specs/2026-10-17-analysis-accuracy-design.md,
//! §1): it never opens the library database, and its output names files, so
//! it stays on the machine that ran it.
//!
//! cargo run --release --features eval --bin recodeck-eval -- \
//!   --traktor <collection.nml> [--rekordbox <collection.xml>] \
//!   [--sample N] [--seed S] [--min-seconds N] [--csv <out.csv>]

use rand::{rngs::StdRng, seq::SliceRandom, SeedableRng};
use rayon::prelude::*;
use recodeck_lib::audio::bpm::{detect_bpm_from_samples, BpmResult};
use recodeck_lib::audio::decoder::decode_to_mono;
use recodeck_lib::audio::key::{detect_key_from_samples, KeyResult};
use recodeck_lib::audio::scoring::{self, BpmMatch, KeyMatch};
use recodeck_lib::formats::{keys, rekordbox, traktor, volumes};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Instant;
use unicode_normalization::UnicodeNormalization;

const USAGE: &str = "usage: recodeck-eval --traktor <collection.nml> [--rekordbox <collection.xml>] \
[--sample N] [--seed S] [--min-seconds N] [--csv <out.csv>]";

struct Args {
    traktor: PathBuf,
    rekordbox: Option<PathBuf>,
    sample: Option<usize>,
    seed: u64,
    /// Files shorter than this (loops, one-shots) are decoded but not measured.
    min_seconds: f64,
    csv: Option<PathBuf>,
}

/// What the DJ programs stored for one file.
#[derive(Debug, Clone, Default)]
struct Reference {
    traktor_bpm: f64,
    traktor_key: Option<String>,
    /// Traktor's AutoGrid marker (CUE_V2 TYPE 4), ms: a downbeat.
    traktor_marker_ms: Option<f64>,
    rb_bpm: Option<f64>,
    rb_key: Option<String>,
    /// Rekordbox's first grid marker (TEMPO Inizio), ms, with its tempo.
    rb_marker_ms: Option<f64>,
    rb_marker_bpm: Option<f64>,
    /// Rekordbox's downbeat, from that marker and its Battito, ms.
    rb_downbeat_ms: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Format {
    Mp3,
    Lossless,
    Other,
}

impl Format {
    fn of(path: &str) -> Format {
        let extension = Path::new(path).extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase());
        match extension.as_deref() {
            Some("mp3") => Format::Mp3,
            Some("wav" | "aif" | "aiff" | "flac") => Format::Lossless,
            _ => Format::Other,
        }
    }
}

struct Outcome {
    path: String,
    format: Format,
    reference: Reference,
    duration_s: f64,
    /// Wall time of the whole analyze call (decode plus detection) on its worker.
    seconds: f64,
    short: bool,
    bpm: Option<BpmResult>,
    key: Option<KeyResult>,
    error: Option<String>,
}

fn main() {
    if let Err(e) = run() {
        eprintln!("{e}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args = parse_args()?;
    let (mut references, duplicates) = read_traktor(&args.traktor, &volumes::boot_volume_name())?;
    let in_traktor = references.len();
    let in_rekordbox = match &args.rekordbox {
        Some(path) => add_rekordbox(path, &mut references)?,
        None => 0,
    };
    let mut items: Vec<(String, Reference)> = references.into_iter().collect();
    items.sort_by(|a, b| a.0.cmp(&b.0));
    let listed = items.len();
    items.retain(|(path, _)| Path::new(path).exists());
    let not_found = listed - items.len();
    if let Some(n) = args.sample {
        items.shuffle(&mut StdRng::seed_from_u64(args.seed));
        items.truncate(n);
    }

    let started = Instant::now();
    let min_seconds = args.min_seconds;
    let outcomes: Vec<Outcome> =
        items.into_par_iter().map(|(path, reference)| analyze(path, reference, min_seconds)).collect();
    let wall_s = started.elapsed().as_secs_f64();

    println!("recodeck-eval");
    println!("  Traktor tracks with a BPM: {in_traktor}");
    if duplicates > 0 {
        println!("  duplicate paths in Traktor: {duplicates}");
    }
    if args.rekordbox.is_some() {
        println!("  of them in Rekordbox: {in_rekordbox}");
    }
    println!("  files not found on disk: {not_found}");
    let errors = outcomes.iter().filter(|o| o.error.is_some()).count();
    let short = outcomes.iter().filter(|o| o.short).count();
    println!("  decode errors: {errors}; shorter than {min_seconds} s, not measured: {short}");
    let measured: Vec<&Outcome> = outcomes.iter().filter(|o| o.error.is_none() && !o.short).collect();
    println!("  measured: {}", measured.len());

    report_bpm(&measured);
    report_key(&measured);
    report_grid(&measured);
    report_references(&measured);
    report_confidence(&measured);

    let threads = rayon::current_num_threads();
    println!("\nTime");
    println!("  wall: {wall_s:.1} s on {threads} threads");
    if !measured.is_empty() {
        println!("  mean seconds per measured track (decode plus detection): {:.2}", mean(measured.iter().map(|o| o.seconds)).unwrap_or(0.0));
    }
    if let Some(path) = &args.csv {
        write_csv(path, &outcomes)?;
        println!("\nCSV: {}", path.display());
    }
    Ok(())
}

fn parse_args() -> Result<Args, String> {
    let mut args = Args { traktor: PathBuf::new(), rekordbox: None, sample: None, seed: 1, min_seconds: 60.0, csv: None };
    let mut it = std::env::args().skip(1);
    while let Some(flag) = it.next() {
        if flag == "--help" || flag == "-h" {
            println!("{USAGE}");
            std::process::exit(0);
        }
        let value = it.next().ok_or_else(|| format!("{flag} needs a value\n{USAGE}"))?;
        let float = |v: &str| v.parse::<f64>().map_err(|_| format!("{flag} needs a number\n{USAGE}"));
        match flag.as_str() {
            "--traktor" => args.traktor = PathBuf::from(value),
            "--rekordbox" => args.rekordbox = Some(PathBuf::from(value)),
            "--sample" => args.sample = Some(value.parse::<usize>().map_err(|_| format!("{flag} needs a whole number\n{USAGE}"))?),
            "--seed" => args.seed = value.parse::<u64>().map_err(|_| format!("{flag} needs a whole number\n{USAGE}"))?,
            "--min-seconds" => args.min_seconds = float(&value)?,
            "--csv" => args.csv = Some(PathBuf::from(value)),
            _ => return Err(format!("unknown argument {flag}\n{USAGE}")),
        }
    }
    if args.traktor.as_os_str().is_empty() {
        return Err(USAGE.to_string());
    }
    Ok(args)
}

fn nfc(path: &str) -> String {
    path.nfc().collect()
}

fn read_text(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))
}

fn child<'a, 'i>(node: roxmltree::Node<'a, 'i>, name: &str) -> Option<roxmltree::Node<'a, 'i>> {
    node.children().find(|c| c.has_tag_name(name))
}

fn number(node: Option<roxmltree::Node>, attribute: &str) -> Option<f64> {
    node?.attribute(attribute)?.trim().parse().ok()
}

/// Traktor's collection: each analysed track's file, BPM, key and AutoGrid marker.
fn read_traktor(path: &Path, boot_volume: &str) -> Result<(HashMap<String, Reference>, usize), String> {
    let text = read_text(path)?;
    let doc = roxmltree::Document::parse(&text).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut references = HashMap::new();
    let mut duplicates = 0;
    let Some(collection) = doc.descendants().find(|n| n.has_tag_name("COLLECTION")) else {
        return Ok((references, duplicates));
    };
    for entry in collection.children().filter(|n| n.has_tag_name("ENTRY")) {
        let Some(location) = child(entry, "LOCATION") else { continue };
        let Some(bpm) = number(child(entry, "TEMPO"), "BPM").filter(|&b| b > 0.0 && b.is_finite()) else { continue };
        let file = traktor::path_from_location(
            location.attribute("VOLUME").unwrap_or(""),
            location.attribute("DIR").unwrap_or(""),
            location.attribute("FILE").unwrap_or(""),
            boot_volume,
        );
        let key = child(entry, "MUSICAL_KEY")
            .and_then(|k| k.attribute("VALUE"))
            .and_then(|v| v.trim().parse::<u8>().ok())
            .and_then(keys::camelot_from_traktor);
        let marker = entry
            .children()
            .find(|c| c.has_tag_name("CUE_V2") && c.attribute("TYPE") == Some("4"))
            .and_then(|c| c.attribute("START"))
            .and_then(|s| s.trim().parse::<f64>().ok())
            .filter(|m| m.is_finite());
        match references.entry(nfc(&file)) {
            std::collections::hash_map::Entry::Occupied(_) => duplicates += 1,
            std::collections::hash_map::Entry::Vacant(slot) => {
                slot.insert(Reference { traktor_bpm: bpm, traktor_key: key, traktor_marker_ms: marker, ..Default::default() });
            }
        }
    }
    Ok((references, duplicates))
}

/// Rekordbox's values for the tracks Traktor also has; returns how many matched.
fn add_rekordbox(path: &Path, references: &mut HashMap<String, Reference>) -> Result<usize, String> {
    let text = read_text(path)?;
    let doc = roxmltree::Document::parse(&text).map_err(|e| format!("{}: {e}", path.display()))?;
    let Some(collection) = doc.descendants().find(|n| n.has_tag_name("COLLECTION")) else { return Ok(0) };
    let mut seen: HashSet<String> = HashSet::new();
    let mut matched = 0;
    for track in collection.children().filter(|n| n.has_tag_name("TRACK")) {
        let Some(file) = track.attribute("Location").and_then(rekordbox::path_from_location) else { continue };
        let key = nfc(&file);
        let Some(reference) = references.get_mut(&key) else { continue };
        if !seen.insert(key) {
            continue;
        }
        matched += 1;
        reference.rb_bpm = number(Some(track), "AverageBpm").filter(|&b| b > 0.0 && b.is_finite());
        reference.rb_key = track.attribute("Tonality").and_then(keys::camelot_from_tag);
        let tempo = child(track, "TEMPO");
        if let (Some(start_s), Some(tempo_bpm), Some(beat)) =
            (number(tempo, "Inizio").filter(|s| s.is_finite()), number(tempo, "Bpm").filter(|&b| b > 0.0 && b.is_finite()), number(tempo, "Battito").filter(|b| b.is_finite()))
        {
            reference.rb_marker_ms = Some(start_s * 1000.0);
            reference.rb_marker_bpm = Some(tempo_bpm);
            reference.rb_downbeat_ms = Some(scoring::downbeat_ms(start_s * 1000.0, beat as u32, tempo_bpm));
        }
    }
    Ok(matched)
}

/// Decodes the file and runs the app's own detection on it. A panic in a
/// decoder or detector becomes this track's error, so the run goes on.
fn analyze(path: String, reference: Reference, min_seconds: f64) -> Outcome {
    let started = Instant::now();
    let mut outcome = Outcome {
        format: Format::of(&path),
        path,
        reference,
        duration_s: 0.0,
        seconds: 0.0,
        short: false,
        bpm: None,
        key: None,
        error: None,
    };
    let file = outcome.path.clone();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut duration_s = 0.0;
        let mut short = false;
        let mut bpm = None;
        let mut key = None;
        let mut error = None;
        // The app's rule: one file longer than 20 minutes at a time.
        let _long = recodeck_lib::audio::decoder::long_file_guard(Path::new(&file));
        match decode_to_mono(Path::new(&file)) {
            Err(e) => error = Some(e),
            Ok(audio) => {
                duration_s = audio.samples.len() as f64 / audio.sample_rate.max(1) as f64;
                if duration_s < min_seconds {
                    short = true;
                } else {
                    bpm = detect_bpm_from_samples(&audio).ok().flatten();
                    key = detect_key_from_samples(&audio).ok();
                }
            }
        }
        (duration_s, short, bpm, key, error)
    }));
    match result {
        Ok((duration_s, short, bpm, key, error)) => {
            outcome.duration_s = duration_s;
            outcome.short = short;
            outcome.bpm = bpm;
            outcome.key = key;
            outcome.error = error;
        }
        Err(payload) => {
            let msg = payload
                .downcast_ref::<&str>()
                .map(|m| m.to_string())
                .or_else(|| payload.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "unknown".to_string());
            outcome.error = Some(format!("panic: {msg}"));
        }
    }
    outcome.seconds = started.elapsed().as_secs_f64();
    outcome
}

fn pct(n: usize, of: usize) -> String {
    if of == 0 {
        "    -".to_string()
    } else {
        format!("{:5.1}%", 100.0 * n as f64 / of as f64)
    }
}

fn mean(values: impl Iterator<Item = f64>) -> Option<f64> {
    let (sum, n) = values.fold((0.0, 0usize), |(s, n), v| (s + v, n + 1));
    (n > 0).then(|| sum / n as f64)
}

fn show(value: Option<f64>) -> String {
    value.map_or("-".to_string(), |v| format!("{v:.3}"))
}

/// Leaves out tracks where Traktor and Rekordbox differ by more than 0.5 BPM.
fn references_agree_on_bpm(o: &Outcome) -> bool {
    o.reference.rb_bpm.map_or(true, |rb| (rb - o.reference.traktor_bpm).abs() <= 0.5)
}

fn report_bpm(measured: &[&Outcome]) {
    println!("\nBPM against Traktor");
    let target: Vec<&Outcome> = measured.iter().copied().filter(|o| references_agree_on_bpm(o)).collect();
    for (label, set) in [
        ("all", measured.to_vec()),
        ("target set (Traktor and Rekordbox within 0.5, or not in Rekordbox)", target),
    ] {
        let mut counts: HashMap<Option<BpmMatch>, usize> = HashMap::new();
        for o in &set {
            *counts.entry(o.bpm.as_ref().map(|b| scoring::bpm_match(b.bpm, o.reference.traktor_bpm))).or_default() += 1;
        }
        let n = set.len();
        let c = |m: Option<BpmMatch>| counts.get(&m).copied().unwrap_or(0);
        println!("  {label}: {n}");
        println!("    within ±0.05     {}", pct(c(Some(BpmMatch::Exact)), n));
        println!("    within ±0.5      {}", pct(c(Some(BpmMatch::Exact)) + c(Some(BpmMatch::Close)), n));
        println!("    off by 0.5–1.5   {}", pct(c(Some(BpmMatch::OffByOne)), n));
        println!("    half or double   {}", pct(c(Some(BpmMatch::HalfOrDouble)), n));
        println!("    other            {}", pct(c(Some(BpmMatch::Other)), n));
        println!("    no BPM           {}", pct(c(None), n));
    }
    let with_bpm: Vec<&Outcome> = measured.iter().copied().filter(|o| o.bpm.is_some()).collect();
    let mut buckets = [0usize; scoring::SIGNED_BUCKETS.len()];
    for o in &with_bpm {
        buckets[scoring::signed_bucket(o.bpm.as_ref().map_or(0.0, |b| b.bpm) - o.reference.traktor_bpm)] += 1;
    }
    println!("  signed error (ours − Traktor), {} tracks with a BPM:", with_bpm.len());
    for (label, n) in scoring::SIGNED_BUCKETS.iter().zip(buckets) {
        println!("    {label:>14}  {}", pct(n, with_bpm.len()));
    }
}

fn report_key(measured: &[&Outcome]) {
    println!("\nKey (MIREX: exact 1, a fifth up 0.5, relative 0.3, parallel 0.2)");
    let pairs = |pick: &dyn Fn(&Reference) -> Option<String>| -> Vec<(Option<String>, String)> {
        measured.iter().filter_map(|o| Some((o.key.as_ref().map(|k| k.camelot.clone()), pick(&o.reference)?))).collect()
    };
    let traktor = pairs(&|r| r.traktor_key.clone());
    let rekordbox = pairs(&|r| r.rb_key.clone());
    let consensus = pairs(&|r| match (&r.traktor_key, &r.rb_key) {
        (Some(t), Some(b)) if t == b => Some(t.clone()),
        _ => None,
    });
    key_lines("against Traktor", &traktor);
    key_lines("against Rekordbox", &rekordbox);
    key_lines("consensus (Traktor = Rekordbox)", &consensus);

    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for o in measured {
        if let Some(k) = &o.key {
            *counts.entry(k.camelot.clone()).or_default() += 1;
        }
    }
    let total: usize = counts.values().sum();
    let mut sorted: Vec<(String, usize)> = counts.into_iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1));
    let shown: Vec<String> = sorted.iter().map(|(k, n)| format!("{k} {}", pct(*n, total).trim())).collect();
    println!("  predicted keys: {}", shown.join(", "));
}

fn key_lines(label: &str, pairs: &[(Option<String>, String)]) {
    let n = pairs.len();
    let mut counts: HashMap<Option<KeyMatch>, usize> = HashMap::new();
    let (mut mirex, mut no_key) = (0.0, 0usize);
    for (ours, reference) in pairs {
        if ours.is_none() {
            no_key += 1;
        }
        *counts.entry(ours.as_deref().and_then(|o| scoring::key_match(o, reference))).or_default() += 1;
        mirex += ours.as_deref().and_then(|o| scoring::mirex_score(o, reference)).unwrap_or(0.0);
    }
    let c = |m: Option<KeyMatch>| counts.get(&m).copied().unwrap_or(0);
    println!("  {label}: {n}");
    println!("    exact            {}", pct(c(Some(KeyMatch::Exact)), n));
    println!("    ±1 on the wheel  {}", pct(c(Some(KeyMatch::Fifth)), n));
    println!("    relative         {}", pct(c(Some(KeyMatch::Relative)), n));
    println!("    parallel         {}", pct(c(Some(KeyMatch::Parallel)), n));
    println!("    other            {}", pct(c(Some(KeyMatch::Other)), n));
    println!("    no key           {}", pct(no_key, n));
    if c(None) > no_key {
        println!("    unreadable       {}", pct(c(None) - no_key, n));
    }
    println!("    MIREX score      {}", if n == 0 { "-".to_string() } else { format!("{:.3}", mirex / n as f64) });
}

/// `denominator` is every track that could have been measured; `offsets` the ones that were.
fn offset_lines(label: &str, offsets: &[f64], denominator: usize) {
    let n = offsets.len();
    if n == 0 {
        println!("  {label}: {denominator} with a marker, no grid");
        return;
    }
    let mut absolute: Vec<f64> = offsets.iter().map(|o| o.abs()).collect();
    let mut signed = offsets.to_vec();
    let within = |ms: f64| offsets.iter().filter(|o| o.abs() <= ms).count();
    println!(
        "  {label}: {denominator} with a marker, {n} with the right tempo and a grid  median |error| {:.1} ms  signed median {:+.1} ms  ≤10 {}  ≤20 {}  ≤40 {}",
        scoring::median(&mut absolute).unwrap_or(0.0),
        scoring::median(&mut signed).unwrap_or(0.0),
        pct(within(10.0), denominator),
        pct(within(20.0), denominator),
        pct(within(40.0), denominator),
    );
}

/// Our BPM is within ±0.5 of Traktor's.
fn tempo_right(o: &Outcome) -> bool {
    o.bpm.as_ref().map_or(false, |b| {
        matches!(scoring::bpm_match(b.bpm, o.reference.traktor_bpm), BpmMatch::Exact | BpmMatch::Close)
    })
}

fn report_grid(measured: &[&Outcome]) {
    println!("\nBeat grid against Traktor's marker (+ means our beat is later; wrong tempo counts as a miss)");
    for (label, format) in [("MP3", Format::Mp3), ("WAV/AIFF/FLAC", Format::Lossless)] {
        let with_marker: Vec<&Outcome> =
            measured.iter().copied().filter(|o| o.format == format && o.reference.traktor_marker_ms.is_some()).collect();
        let offsets: Vec<f64> = with_marker
            .iter()
            .filter(|o| tempo_right(o))
            .filter_map(|o| {
                let bpm = o.bpm.as_ref()?;
                Some(scoring::grid_offset_ms(bpm.bpm, bpm.first_beat_ms?, o.reference.traktor_marker_ms?))
            })
            .collect();
        offset_lines(label, &offsets, with_marker.len());
    }
    let bars = |pick: &dyn Fn(&Reference) -> Option<f64>| -> (usize, usize) {
        let (mut agree, mut n) = (0, 0);
        for o in measured {
            if !tempo_right(o) {
                continue;
            }
            let (Some(bpm), Some(downbeat)) = (o.bpm.as_ref(), pick(&o.reference)) else { continue };
            let Some(first) = bpm.first_beat_ms else { continue };
            n += 1;
            if scoring::bar_offset(bpm.bpm, first, downbeat) == 0 {
                agree += 1;
            }
        }
        (agree, n)
    };
    let (agree, n) = bars(&|r| r.traktor_marker_ms);
    println!("  bar start agrees with Traktor's marker (right tempo only): {} of {n}", pct(agree, n));
    let (agree, n) = bars(&|r| r.rb_downbeat_ms);
    println!("  bar start agrees with Rekordbox's downbeat (right tempo only): {} of {n}", pct(agree, n));
}

fn report_references(measured: &[&Outcome]) {
    println!("\nThe references against each other (the ceiling)");
    let both: Vec<(f64, f64)> =
        measured.iter().filter_map(|o| Some((o.reference.traktor_bpm, o.reference.rb_bpm?))).collect();
    let within = |limit: f64| both.iter().filter(|(t, r)| (t - r).abs() <= limit).count();
    println!(
        "  BPM: within ±0.05 {}, within ±0.5 {} of {}",
        pct(within(0.05), both.len()),
        pct(within(0.5), both.len()),
        both.len()
    );
    let keys: Vec<(&String, &String)> = measured
        .iter()
        .filter_map(|o| Some((o.reference.traktor_key.as_ref()?, o.reference.rb_key.as_ref()?)))
        .collect();
    let same = keys.iter().filter(|(t, r)| t == r).count();
    println!("  key: the same {} of {}", pct(same, keys.len()), keys.len());
    for (label, format) in [("MP3", Format::Mp3), ("WAV/AIFF/FLAC", Format::Lossless)] {
        let offsets: Vec<f64> = measured
            .iter()
            .filter(|o| o.format == format)
            .filter_map(|o| {
                let r = &o.reference;
                Some(scoring::grid_offset_ms(r.rb_marker_bpm?, r.rb_marker_ms?, r.traktor_marker_ms?))
            })
            .collect();
        offset_lines(&format!("grid, Rekordbox against Traktor, {label}"), &offsets, offsets.len());
    }
}

fn report_confidence(measured: &[&Outcome]) {
    println!("\nConfidence (mean; a useful one is higher when right)");
    let (mut bpm_right, mut bpm_wrong) = (Vec::new(), Vec::new());
    for o in measured {
        let Some(b) = o.bpm.as_ref() else { continue };
        if (b.bpm - o.reference.traktor_bpm).abs() <= 0.5 { bpm_right.push(b.confidence) } else { bpm_wrong.push(b.confidence) }
    }
    println!("  BPM: right {}  wrong {}", show(mean(bpm_right.into_iter())), show(mean(bpm_wrong.into_iter())));
    let (mut key_right, mut key_wrong) = (Vec::new(), Vec::new());
    for o in measured {
        let (Some(k), Some(t)) = (o.key.as_ref(), o.reference.traktor_key.as_deref()) else { continue };
        if k.camelot == t { key_right.push(k.confidence) } else { key_wrong.push(k.confidence) }
    }
    println!("  key: right {}  wrong {}", show(mean(key_right.into_iter())), show(mean(key_wrong.into_iter())));
}

fn csv_field(value: &str) -> String {
    if value.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn opt(value: Option<f64>) -> String {
    value.map_or(String::new(), |v| format!("{v:.3}"))
}

fn write_csv(path: &Path, outcomes: &[Outcome]) -> Result<(), String> {
    let mut text = String::from(
        "path,seconds,traktor_bpm,rekordbox_bpm,bpm,bpm_confidence,traktor_key,rekordbox_key,key,key_confidence,traktor_marker_ms,first_beat_ms,grid_offset_ms,cpu_seconds,note\n",
    );
    for o in outcomes {
        let r = &o.reference;
        let grid = o.bpm.as_ref().and_then(|b| Some(scoring::grid_offset_ms(b.bpm, b.first_beat_ms?, r.traktor_marker_ms?)));
        let note = o.error.clone().unwrap_or_else(|| if o.short { "short".to_string() } else { String::new() });
        let row = [
            csv_field(&o.path),
            format!("{:.1}", o.duration_s),
            opt(Some(r.traktor_bpm)),
            opt(r.rb_bpm),
            opt(o.bpm.as_ref().map(|b| b.bpm)),
            opt(o.bpm.as_ref().map(|b| b.confidence)),
            r.traktor_key.clone().unwrap_or_default(),
            r.rb_key.clone().unwrap_or_default(),
            o.key.as_ref().map(|k| k.camelot.clone()).unwrap_or_default(),
            opt(o.key.as_ref().map(|k| k.confidence)),
            opt(r.traktor_marker_ms),
            opt(o.bpm.as_ref().and_then(|b| b.first_beat_ms)),
            opt(grid),
        format!("{:.2}", o.seconds),
            csv_field(&note),
        ];
        text.push_str(&row.join(","));
        text.push('\n');
    }
    std::fs::write(path, text).map_err(|e| format!("{}: {e}", path.display()))
}
