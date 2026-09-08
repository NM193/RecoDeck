# Parser fixtures

The regression suite for the tracklist parser runs against **real captured YouTube
API responses** — a saved video plus its comments, exactly as the fetch layer hands
them over. That is the point of it: the parser is only correct if it reproduces the
right answer on real sets, and every threshold in it was measured against these
rather than chosen.

**They are not kept in this repository.** They are somebody's saved sets, and a
public repository is not where they belong.

Everything that needs them is skipped when they are absent, so `npm test` passes on
a fresh clone. The rules that can be stated without a real set — name splitting,
timestamp parsing, prose rejection, DJ names, library matching, the cost and
novelty rules — all still run, and they are the bulk of the suite.

## Running the full suite

Drop saved fetches into this directory as `<videoId>.json`, in the shape the fetch
layer produces:

```json
{
  "video": {
    "id": "...", "url": "...", "title": "...", "channel": "...",
    "publishedAt": "...", "description": "...", "durationMs": 0
  },
  "comments": [{ "author": "...", "text": "...", "likeCount": 0 }],
  "fetchedAt": "..."
}
```

`expected.json` holds the reference output the parity block compares against — an
array of results keyed by `video.id`. Without it the parity block stays skipped and
the rest still runs.
