# RecoDeck Optimization Plan

Ideje za optimizaciju performansi. Implementirati kada bude vremena.

---

## 1. Analiza traka (BPM & Key) — dekodovanje jednom

**Problem:** Kada korisnik izabere "BPM & Key" iz kontekstnog menija, pozivaju se dve odvojene Tauri komande:
- `analyzeBpm(track_id)` — dekoduje ceo fajl, radi BPM
- `analyzeKey(track_id)` — ponovo dekoduje ceo fajl, radi key

Fajl se dekoduje **dva puta**, što značajno produžava vreme (npr. 5-min pesma → ~10–30s umesto ~5–15s).

**Rešenje:** Dodati novu komandu `analyze_track` koja:
1. Dekoduje fajl **jednom** (`decode_to_mono`)
2. Na istom `MonoAudio` objektu poziva `detect_bpm_from_samples` i `detect_key_from_samples`
3. Čuva oba rezultata u bazu
4. Vraća kombinovani rezultat

**Fajlovi za izmenu:**
- `src-tauri/src/commands/analysis.rs` — nova `analyze_track` komanda
- `src-tauri/src/lib.rs` — registracija komande
- `src/lib/tauri-api.ts` — nova `analyzeTrack()` funkcija
- `src/App.tsx` — `handleAnalyzeTrack` poziva `analyzeTrack` umesto `analyzeBpm` + `analyzeKey`

**Očekivani efekat:** ~30–50% brže za opciju "BPM & Key".

---

## 2. Ograničenje dužine za analizu (opciono)

**Ideja:** Za key detection, prvih 60–90 sekundi audioa često je dovoljno za pouzdanu detekciju tona (chromagram se i dalje prosekuje). Za BPM, aubio takođe može raditi na kraćem uzorku (30–60s).

**Rizik:** Može smanjiti tačnost za pesme sa promenom tempa/tona tokom trajanja.

**Implementacija:** Dodati opcioni parametar `max_duration_sec` u `decode_to_mono` ili kreirati `decode_to_mono_limited` koja prestaje nakon N sekundi.

---

## 3. Batch analiza — paralelizacija (opciono)

**Problem:** `analyze_all_bpm` i `analyze_all_keys` obrađuju trake sekvencijalno.

**Ideja:** Koristiti `rayon` ili `tokio::spawn` za paralelnu obradu N traka (npr. 2–4) — zavisi od CPU jezgara i I/O.

**Napomena:** Paralelno dekodovanje više fajlova može opteretiti disk; pažljivo testirati.

---

## 4. Cache dekodovanog audioa (napredno)

**Ideja:** Ako korisnik ubrzo analizira istu traku ponovo (npr. BPM pa Key odvojeno), mogao bi se keširati `MonoAudio` u memoriji kratko vreme.

**Komplikacija:** Upravljanje memorijom, invalidacija keša, životni ciklus.

**Prioritet:** Nizak — optimizacija #1 rešava glavni slučaj.

---

## Prioritet implementacije

| # | Optimizacija              | Effort | Impact | Prioritet |
|---|---------------------------|--------|--------|-----------|
| 1 | Dekodovanje jednom (BPM+Key) | Srednji | Visok  | **1**     |
| 2 | Ograničenje dužine       | Nizak  | Srednji| 2         |
| 3 | Paralelna batch analiza  | Visok  | Srednji| 3         |
| 4 | Cache dekodovanog audioa  | Visok  | Nizak  | 4         |
