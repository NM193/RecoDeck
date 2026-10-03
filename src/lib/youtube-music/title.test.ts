// src/lib/youtube-music/title.test.ts
import { describe, expect, it } from 'vitest'
import {
  channelArtist,
  copyText,
  musicUrl,
  parseYouTubeTitle,
  selectedRecsUrl,
  toParsed,
} from './title'
import type { YtmTrack } from '../../types/youtubeMusic'

function video(title: string, channel = 'Some Label'): YtmTrack {
  return { videoId: 'vid', title, channel, durationMs: 400_000 }
}

describe('reading a YouTube title — items from the account’s Liked music', () => {
  it('splits artist, title and an edit', () => {
    expect(
      parseYouTubeTitle('Nina Kraviz - Tarde (Monthy Nolan Edit)', 'Monthy Nolan'),
    ).toEqual({
      artist: 'Nina Kraviz',
      title: 'Tarde',
      mix: 'Monthy Nolan Edit',
      bare: 'Tarde',
    })
  })

  it('takes the Original Mix as the mix', () => {
    expect(parseYouTubeTitle('Soulva - Odyssey (Original Mix)', 'Soulva')).toEqual({
      artist: 'Soulva',
      title: 'Odyssey',
      mix: 'Original Mix',
      bare: 'Odyssey',
    })
  })

  it('keeps feat. in the artist, as the tracklist parser does', () => {
    const raw =
      'Hot Natured feat. Anabel Englund - Reverse Skydiving (Original Mix)'
    expect(parseYouTubeTitle(raw, 'Hot Creations')).toEqual({
      artist: 'Hot Natured feat. Anabel Englund',
      title: 'Reverse Skydiving',
      mix: 'Original Mix',
      bare: 'Reverse Skydiving',
    })
    // normalise drops the word, so "Hot Natured, Anabel Englund" on a file still agrees.
    expect(toParsed(video(raw)).artistNorm).toBe('hot natured anabel englund')
  })

  it('reads a bare title on an auto-generated " - Topic" channel as that artist’s', () => {
    expect(parseYouTubeTitle('Honey Hunter', 'Extrawelt - Topic')).toEqual({
      artist: 'Extrawelt',
      title: 'Honey Hunter',
      mix: null,
      bare: 'Honey Hunter',
    })
  })

  it('cuts a DJ set’s billing at the first bar', () => {
    expect(
      parseYouTubeTitle(
        'Dan Ghenacia | Live Vinyl DJ Set | Micas Garten | UNDRSTND',
        'UNDRSTND',
      ),
    ).toEqual({ artist: null, title: 'Dan Ghenacia', mix: null, bare: 'Dan Ghenacia' })
  })

  it('keeps a lone name before the bar as the title', () => {
    expect(parseYouTubeTitle('frisson | KULT Talents', 'KULT')).toEqual({
      artist: null,
      title: 'frisson',
      mix: null,
      bare: 'frisson',
    })
  })
})

describe('the patterns', () => {
  it.each([
    'Butch - Come Get Up (Official Video)',
    'Butch - Come Get Up (Official Audio)',
    'Butch - Come Get Up [Free Download]',
    'Butch - Come Get Up (Visualizer)',
    'Butch - Come Get Up [HD]',
    'Butch - Come Get Up (Lyrics)',
    'Butch - Come Get Up (Premiere)',
    'Butch - Come Get Up (Official Music Video) [HD]',
  ])('drops the noise in brackets: %s', (raw) => {
    expect(parseYouTubeTitle(raw, 'Label')).toEqual({
      artist: 'Butch',
      title: 'Come Get Up',
      mix: null,
      bare: 'Come Get Up',
    })
  })

  it('keeps the mix next to the noise', () => {
    expect(
      parseYouTubeTitle('Butch - Come Get Up (Extended Mix) [Free Download]', 'Label').mix,
    ).toBe('Extended Mix')
  })

  it('cuts a trailing " | Label"', () => {
    expect(
      parseYouTubeTitle('Joseph Capriati - Control (Original Mix) | Drumcode', 'Drumcode'),
    ).toEqual({
      artist: 'Joseph Capriati',
      title: 'Control',
      mix: 'Original Mix',
      bare: 'Control',
    })
  })

  it('reads a mix in square brackets, and a remix', () => {
    expect(parseYouTubeTitle('Prunk - Tell You [Dub Mix]', 'Label').mix).toBe('Dub Mix')
    expect(
      parseYouTubeTitle('Witchy - Witch Doctor (Hot Since 82 Remix)', 'Label'),
    ).toMatchObject({ title: 'Witch Doctor', mix: 'Hot Since 82 Remix' })
  })

  it('splits on an en dash', () => {
    expect(parseYouTubeTitle('Prunk – Tell You', 'Label')).toMatchObject({
      artist: 'Prunk',
      title: 'Tell You',
    })
  })

  it('keeps a hyphenated name whole', () => {
    expect(parseYouTubeTitle('Jean-Michel Jarre - Oxygene, Pt. 4', 'Label')).toMatchObject({
      artist: 'Jean-Michel Jarre',
      title: 'Oxygene, Pt. 4',
    })
  })

  it('keeps (feat. X) in the title, and leaves it out of the bare title', () => {
    expect(
      parseYouTubeTitle(
        'Discoplex - I Need A Rush (feat. Sheree Hicks) (Extended Mix)',
        'Label',
      ),
    ).toEqual({
      artist: 'Discoplex',
      title: 'I Need A Rush (feat. Sheree Hicks)',
      mix: 'Extended Mix',
      bare: 'I Need A Rush',
    })
  })

  it('has no artist when there is no dash and the channel is not an artist channel', () => {
    expect(parseYouTubeTitle('Honey Hunter', 'Extrawelt').artist).toBeNull()
  })

  it('keeps a title that is all noise rather than nothing', () => {
    expect(parseYouTubeTitle('(Official Video)', 'Label').title).toBe('(Official Video)')
  })
})

describe('Topic channels, labels and version spellings', () => {
  it('reads a dash version on a Topic channel, not as artist - title', () => {
    expect(parseYouTubeTitle('Come Get Up - Extended Mix', 'Butch - Topic')).toEqual({
      artist: 'Butch',
      title: 'Come Get Up',
      mix: 'Extended Mix',
      bare: 'Come Get Up',
    })
    expect(
      parseYouTubeTitle('Tell You - Hot Since 82 Remix', 'Prunk - Topic'),
    ).toMatchObject({ artist: 'Prunk', title: 'Tell You', mix: 'Hot Since 82 Remix' })
  })

  it('does not let a trailing [Label] hide the mix', () => {
    const t = video('Joseph Capriati - Control (Original Mix) [Drumcode]')
    expect(parseYouTubeTitle(t.title, 'Label').mix).toBe('Original Mix')
    expect(copyText(t)).toBe('Joseph Capriati - Control (Original Mix)')
    expect(selectedRecsUrl(t)).toBe(
      'https://srv.selectedrecs.com/#/search?text=Joseph%20Capriati%20-%20Control',
    )
  })

  it('drops (Official Video HD) and its kin', () => {
    expect(parseYouTubeTitle('Bicep - Glue (Official Video HD)', 'Label').title).toBe('Glue')
    expect(parseYouTubeTitle('Bicep - Glue (Official Video 4K)', 'Label').title).toBe('Glue')
  })

  it('reads a dash remix after the first dash', () => {
    expect(
      parseYouTubeTitle('Artist - Title - Remix Artist Remix', 'Label'),
    ).toMatchObject({ artist: 'Artist', title: 'Title', mix: 'Remix Artist Remix' })
  })
})

describe('what the matcher, Copy and SelectedRecs get', () => {
  it('gives the matcher folded, normalised names', () => {
    expect(toParsed(video('Soulva - Odyssey (Original Mix)'))).toEqual({
      artist: 'Soulva',
      title: 'Odyssey',
      mix: 'Original Mix',
      artistNorm: 'soulva',
      titleNorm: 'odyssey original mix',
    })
  })

  it('gives no artist for a bare title', () => {
    expect(
      toParsed(video('Dan Ghenacia | Live Vinyl DJ Set | Micas Garten | UNDRSTND', 'UNDRSTND')),
    ).toEqual({
      artist: null,
      title: 'Dan Ghenacia',
      mix: null,
      artistNorm: null,
      titleNorm: 'dan ghenacia',
    })
  })

  it('copies artist, title and mix, as Spotify’s Copy does', () => {
    expect(copyText(video('Nina Kraviz - Tarde (Monthy Nolan Edit) [Free Download]'))).toBe(
      'Nina Kraviz - Tarde (Monthy Nolan Edit)',
    )
    expect(copyText(video('Honey Hunter', 'Extrawelt - Topic'))).toBe(
      'Extrawelt - Honey Hunter',
    )
    expect(copyText(video('frisson | KULT Talents', 'KULT'))).toBe('frisson')
  })

  it('searches SelectedRecs without the mix', () => {
    expect(selectedRecsUrl(video('Nina Kraviz - Tarde (Monthy Nolan Edit)'))).toBe(
      'https://srv.selectedrecs.com/#/search?text=Nina%20Kraviz%20-%20Tarde',
    )
  })

  it('plays the exact video on YouTube Music', () => {
    expect(musicUrl('fjR4idz1-MA')).toBe('https://music.youtube.com/watch?v=fjR4idz1-MA')
  })

  it('names a Topic channel without its suffix', () => {
    expect(channelArtist('Extrawelt - Topic')).toBe('Extrawelt')
    expect(channelArtist('UNDRSTND')).toBe('UNDRSTND')
  })
})
