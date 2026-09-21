# Chords Transposer

A Chrome extension that transposes the chords on **any** chord or tab site, in
the page itself. There is no site list: it finds the chords by looking at the
page. Everything runs locally — no account, no server, no network calls.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → pick this folder

Open a song page. If the page looks like a chord sheet, the panel appears in the
bottom-left corner.

## Use

- **−** / **+** — move down or up a semitone
- **key dropdown** — jump straight to a key
- **Auto / ♯ / ♭** — how to spell accidentals. *Auto* follows the target key, so
  transposing C major up one gives `Db`/`Gb`, and up two gives `D`/`G`
- **Easy** — move the song to whichever key is kindest to the fretting hand
- **▶ and the slider** — scroll the sheet while you play, at a speed you set
- **Simplify chords** — reduce every chord to a plain major or minor triad
- **♪** — click any chord to hear it strummed
- **Reset** — back to the original, character for character
- **▦** — chord diagrams on hover, on by default
- Drag the title bar to move the panel, **–** to shrink it to a pill

Hovering a chord shows how to play it. The diagram is drawn for the chord as it
reads *now*, so it stays correct after transposing — which is the whole point,
since the diagrams printed on the page cannot follow.

This works whether the page wraps each chord in its own element or the sheet is
plain text with no markup at all (the Ultimate Guitar shape). In a text sheet
there is nothing to attach a tooltip to, so the chord under the pointer is
worked out from the text itself — the token is read out of the text node, and
only trusted if it parses as a chord *and* sits on a line made of chords, so a
stray "A" in a lyric is left alone.

While diagrams are on, hover over a chord belongs to the extension: the page's
own pop-up is suppressed rather than left to fight with ours, whether it is
wired up with an inline `onmouseover` (removed, and put back when you turn
diagrams off) or with `addEventListener` (the event is swallowed before the
page sees it). Turning the **▦** toggle off hands hover straight back — except
while the page is transposed, where what the page would show is wrong anyway.
A chord we cannot draw keeps whatever the page does for it, so taking hover
over never leaves you with nothing.

Keyboard, anywhere on the page: `Alt+Shift+↑` / `↓` to transpose, `Alt+Shift+0`
to reset, `Alt+Shift+Space` to start and stop scrolling, and `Alt+Shift+←` / `→`
to change its speed.

The choice is remembered per song URL, so reopening the song brings back your
key. Transposing down shows the capo that restores the original pitch
(down 2 → capo 2).

The chord count in the panel is how many *different* chords the song uses, not
how many are printed on the page — a sheet with a chord above every repeated
line runs to hundreds of them. Click it to open the **chord strip**: a diagram
for every chord in the song, in the order they first appear, drawn for the key
you are actually in. It follows the transposition and *Easy*, so it is always
the shapes in front of you — which is the thing the page's own printed diagrams
cannot do once a song has been moved.

The toolbar popup mirrors the panel: it steps the key, shows where the song
lands (`Ebm → C#m`, with the capo that restores the original pitch), asks the
page to **look again** if the panel didn't appear, and **turns the extension off
for a site** you never want it on.

## How it finds chords

Chord sheets mark their chords up consistently, and that consistency is the
signal. The detector takes every leaf element whose entire text is a chord
symbol, groups those elements by tag and class, and keeps a group only if:

- it holds at least 3 chords, and
- at least 60% of the elements in the group are chords, and
- the group has more than one distinct chord, and
- at least one chord is longer than a single letter.

That last rule is what separates a chord sheet from an A–Z artist index, and the
60% rule is what stops a stray `<b>C</b>` in a sentence from being transposed.
Page furniture (`nav`, `header`, menus, pagination) is skipped outright.

Only chords that are actually on screen are counted. Sites often keep several
versions of a song in the page at once — the same sheet in another key, or laid
out for another instrument — with all but one hidden. Counting those distorts
the detected key, and makes *Easy* average a hard key against an easy one and
conclude there is nothing to do. Hidden chords are still transposed along with
the rest, so a version that appears later is already consistent and is put back
properly on reset; they just do not get a vote.

Separately, preformatted blocks are scanned for classic chords-above-lyrics
sheets, where the chords are plain text with no markup — the shape Ultimate
Guitar uses, where the whole sheet is one `<pre>` with a text node per line.
There a line is rewritten only if nearly every token on it parses as a chord,
so lyric lines are left alone, and so are tablature lines like `e|---0---2---|`
(the bar makes the token fail to parse as a chord). Chord lines keep their
trailing spaces and can be rewritten even when a page splits a line across
several text nodes.

On the two sites this was built against, the generic detector finds exactly what
hand-written selectors did: 99 of 99 chords on a Tab4U song page, 199 on a
Negina one.

## Easy mode

**Easy** asks a different question from the key dropdown: not *what key do you
want*, but *what key would this song be least work to play*. Every one of the
twelve transpositions is scored by what it costs a guitarist — the shapes come
from the same voicing search that draws the diagrams, so the cost of a chord is
its real fingering: a full barre is expensive, a stretch up the neck less so,
and open strings are free. Each chord counts as often as it appears, so a barre
chord in every chorus weighs more than one passing chord.

`C Am F G` moves down five and becomes `G Em C D` — the swap a guitarist makes
to dodge the F, and with a capo on the fifth fret it sounds exactly as it did.
A song already sitting on open chords is left where it is.

Where a capo can keep the original pitch, the move is expressed as one going
down (down 3, capo 3). Going up is only chosen when the capo would land past
the seventh fret and there is nothing to be gained by pretending otherwise —
the song then genuinely sounds higher than the recording.

## Hearing a chord

Click any chord — in the sheet, or in the chord strip — and it is strummed at
you, and its diagram opens and stays open until you click away or press Escape.
Hovering is a race that a scroll or a stray mouse-out can interrupt; clicking
cannot be interrupted. It plays the same voicing the diagram draws, so what you hear is what you
are being shown, and a diagram carries a small ♪ to say so.

Nothing is shipped to make this work: no samples, no audio files, no network.
Each string is synthesised with Karplus-Strong, a burst of noise fed through a
short delay line that loses a little on every pass, which is a few lines of
arithmetic and sounds far more like a plucked string than an oscillator does.
The strings are staggered 28 milliseconds apart, low to high, the way a
downstroke arrives. Measured back out of the browser, the pitches land within
seven cents of true.

The **♪** button in the panel's title bar turns it off. A chord that is also a
link is left alone, so clicking one still follows the page's own link.

## Simplifying chords

**Simplify chords** reduces every chord to the plain triad a beginner can
play: `Fm7b5` becomes `Fm`, `Bmaj7` becomes `B`, `Abm/Gb` becomes `Abm`,
`G7` becomes `G`. A diminished or half-diminished chord reads closest as a
minor triad, and a suspension resolves to the major.

This changes the harmony, and is meant to — it is the substitution printed in
beginner songbooks. Because it is a real change to what the page said, every
simplified chord is marked with a dotted underline and carries the original on
hover ("simplified from Fm7b5"), so nothing is quietly rewritten. Chords in a
plain-text sheet change too, but cannot be marked: there is no element there to
underline.

Everything else follows the simplified chords: the count, the chord strip, and
the scoring behind *Easy* and the capo list — so simplifying first and then
asking for the easiest key gives the gentlest version of a song the page can
offer. Turning it off puts the page back exactly as it was.

## Scrolling while you play

Hands on the guitar, not on the trackpad. **▶** scrolls the sheet at the speed
on the slider, measured in pixels a second so it stays honest across screens,
and both survive between sessions.

It scrolls the sheet's own container where the page uses one, and the window
otherwise. An open chord diagram follows its chord down the
page rather than being dropped, so hovering and scrolling work together. Nudging the page yourself does not fight it — scrolling carries on
from wherever you moved to, rather than snapping back. A long pause (a
backgrounded tab) cannot make it leap, and it stops on its own at the foot of
the page.

## The capo assistant

Next to the chord count is a **capo** handle, which opens a row per capo
position from none to the seventh fret. Each row says which shapes you would be
playing there — *capo 6 → Am shapes* — with a bar for what those shapes cost to
play, green for a song of open chords through to red for a wall of barres.
Clicking a row moves the song there.

The point is that **every row sounds like the original**: a capo on fret N with
the chords moved down N is the same pitch. So unlike *Easy*, which may land the
song in a key that genuinely sounds higher, this is the list of ways to make a
song easier while still playing along with the record. On a song in Eb minor it
lays out plainly that capo 6 gives you Am shapes and capo 2 is no help at all.

## How it keeps the page looking right

Transposed chords change width — `D#m` becomes `Fm`, `A#` becomes `C#` — which
on a monospace chord line would drag every chord after it out of position. Each
chord that shares a line with something else has its original width measured
once, and the difference is absorbed by a margin, so everything after it stays
put. A chord that gets *wider* still pushes the rest of the line right by
exactly one character; there is nowhere else for it to go. Chords laid out as
their own block (one box per lyric phrase) need none of this, and the extension
works that out per element rather than per site.

Two things on a page refer to a chord without being its text, and both would
quietly keep showing the original:

- **Fingering diagrams** printed on the page are pictures and cannot be
  transposed, so they are dimmed with a tooltip while the page is transposed —
  and the hover diagram, which *is* correct, stands in for them.
- **Hover pop-ups** the page raises for a chord are suppressed while we own
  hover, and restored when we don't — see the panel's **▦** toggle above.

## How the diagrams are worked out

No table of shapes: a chord symbol is turned into its intervals, and the
fretboard is searched for ways to sound them. Candidate voicings are rejected
unless they are actually playable — the bass note is the root (or the named
bass note of a slash chord), no inner string is muted, at most four fingers, no
stretch beyond four frets, and no open string ringing while the hand is up the
neck. What survives is ranked by how a guitarist would choose: open strings and
full voicings are rewarded, high positions and awkward stretches are not, barre
shapes are recognised as such, and a shape that asks one finger to hold two
distant strings at the same fret without being able to bar them is heavily
penalised.

Slash chords are part of that search: the named bass note is added to the notes
a string may sound even when it does not belong to the chord (the Gb under an
Ab minor), the bass string is required to play it, and the fifth becomes
droppable to make room. A barre is looked for at any fret, not just the lowest,
so a bass note under a barred shape is counted as the two fingers it really is.

That lands on the shapes people actually play — `C: x32010`, `F: 133211`,
`Bb: x13331`, `C#m: x46654`, `D/F#: 200232` — while still producing something
correct for `Am7b5`, `dim7`, `sus2`, `add9` or any other symbol the parser
accepts. The test suite checks the common shapes by name, and sweeps 156
chords asserting every returned voicing is playable and sounds only notes that
belong to the chord.

## Staying out of the page's way

Most chord sites are busy pages — adverts, lazy images, analytics — all
mutating the DOM several times a second. Re-reading the whole document on each
of those is what makes an extension feel like it is chewing the page, so the
cheap question is asked first: *is everything we transposed still exactly as we
left it?* The text we wrote is remembered per node, so an unrelated change is
dismissed in a few comparisons, and the full search runs at most once every
three seconds while our chords are untouched. When something does rewrite them
— a site re-rendering its sheet, or replacing the elements outright — the
chords are transposed again straight away.

Hit-testing the chord under the pointer forces layout, so it only runs while
the pointer is actually over a sheet, and an open diagram is redrawn rather
than dropped when the chords change underneath it.

## Where it won't work

- Chords inside an `<iframe>`, or in the site's own shadow DOM
- Chords rendered as images or canvas
- Plain-text sheets in a proportional font — without a monospace grid there is
  no reliable way to tell a chord line from a lyric line
- An element mixing a chord and lyrics in one text node, which is skipped rather
  than risk mangling words
- Non-Latin chord naming: Hebrew solfège (דו/רה/מי), German `H` for B, or
  Nashville numbers

## Permissions

Working on every chord site means the content script is declared for all sites,
which Chrome describes as "read and change all your data on all websites". What
it actually does: on each page it walks the DOM once looking for chords, and if
it doesn't find a chord sheet it stops watching that page. Nothing is sent
anywhere — the only storage is your own transposition per song URL, in
`chrome.storage.local`. Use **Turn off on this site** in the popup to exclude a
site entirely.

## Development

```bash
npm test          # chord engine and voicing search
npm run fixture   # http://localhost:8732/test/fixture.html
npm run icons     # regenerate icons/
```

`test/fixture.html` reproduces the markup of three real layout families
(monospace chord rows with per-chord spans, one-box-per-phrase chords with
diagram cards, and a plain `<pre>` sheet) plus a set of **traps** that must not
be touched: an A–Z index, prose containing `C`, `G`, `Cab`, `Dominant`, `Bad`,
and a menu item reading `Am`. Placeholder words stand in for lyrics. Loading it
runs the real content scripts, so detection and DOM behaviour can be checked
without reloading the extension.

```
src/core/chords.js       parsing, transposition, key detection (no DOM)
src/core/shapes.js       chord intervals and fretboard voicing search (no DOM)
src/content/detect.js    generic chord discovery
src/content/diagram.js   chord diagrams as SVG, for the tooltip and the strip
src/content/tooltip.js   the hover diagram
src/content/quirks.js    diagrams and inline handlers that can't be transposed
src/content/panel.js     floating panel (shadow DOM)
src/content/main.js      scan → transpose → realign → persist
src/popup/               toolbar popup
```

If a site is missed or over-detected, the thresholds are the constants at the
top of `src/content/detect.js` (`MIN_GROUP_CHORDS`, `MIN_GROUP_RATIO`,
`MIN_TOTAL`, `MIN_DISTINCT`) — no per-site code needed.

## Scope

This transposes what the page already shows you — it is a chord calculator
wired to the DOM, not a way to reach content a site hasn't served you.
