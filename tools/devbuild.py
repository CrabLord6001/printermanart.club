#!/usr/bin/env python3
"""devbuild.py -- move a game between its live and dev addresses.

A dev copy differs from the live one in as few ways as possible. For every
game that is a noindex meta tag; for Paper Trail it is also the one import
line, so the dev page runs the dev engine rather than the live one. Everything
else that makes a preview build behave differently -- its own storage prefix,
and recording nothing to the leaderboard -- each page works out from its own
path at runtime, so there is no flag in a file to get wrong.

    python3 tools/devbuild.py make     [game]   live  -> dev   (adds noindex)
    python3 tools/devbuild.py promote  [game]   dev   -> live  (drops noindex)
    python3 tools/devbuild.py diff     [game]   what differs between the two

game is printshop or papertrail, and defaults to printshop.

Promote overwrites the live game. It prints what it is about to do and asks.
"""

import io
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

GAMES = {
    'printshop': {
        'name': 'Gallery Printshop',
        # (live, dev). The .html of the pair is the first one.
        'files': [('games/color-processor.html', 'games/dev/color-processor.html')],
        'swaps': [],
    },
    'papertrail': {
        'name': 'Ms. Printer: Paper Trail',
        'files': [('games/paper-trail.html', 'games/dev/paper-trail.html'),
                  ('games/paper-trail.js',   'games/dev/paper-trail.js')],
        # The page and the engine are separate files, so the dev page has to be
        # told to load the dev engine. This is the only line that says which.
        'swaps': [("import('/games/paper-trail.js')", "import('/games/dev/paper-trail.js')")],
    },
}

ANCHOR = '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
NOINDEX = (
    '<!-- A preview build. Not indexed, not in sitemap.xml, not linked from\n'
    '     anywhere public. Reached from /admin/previews.html, which is gated. -->\n'
    '<meta name="robots" content="noindex, nofollow">\n'
)


def read(path):
    """The text with plain \\n line ends, and which line ends it actually had.

    Every file in the repo is Unix except games/paper-trail.js, which is
    Windows. Converting one to the other is a change to every line of the
    file in git for no reason, so whatever a file arrives with, it leaves
    with."""
    raw = io.open(path, encoding='utf-8', newline='').read()
    ending = '\r\n' if '\r\n' in raw else '\n'
    return raw.replace('\r\n', '\n'), ending


def write(path, text, ending):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    io.open(path, 'w', encoding='utf-8', newline='').write(text.replace('\n', ending))


def pick(argv):
    key = argv[2] if len(argv) > 2 else 'printshop'
    if key not in GAMES:
        sys.exit('no game called %r -- pick one of: %s' % (key, ', '.join(sorted(GAMES))))
    return key, GAMES[key]


def make(key, game):
    print('%s: live -> dev' % game['name'])
    for n, (rel_live, rel_dev) in enumerate(game['files']):
        s, ending = read(os.path.join(HERE, rel_live))
        if n == 0:                                  # the page itself
            if NOINDEX in s:
                sys.exit('%s already carries a noindex tag -- look at it before going on' % rel_live)
            if ANCHOR not in s:
                sys.exit('the viewport meta tag is not where this script expects it in %s' % rel_live)
            s = s.replace(ANCHOR, ANCHOR + NOINDEX, 1)
            for live_bit, dev_bit in game['swaps']:
                if live_bit not in s:
                    sys.exit('could not find %r in %s' % (live_bit, rel_live))
                s = s.replace(live_bit, dev_bit)
        write(os.path.join(HERE, rel_dev), s, ending)
        print('  wrote %s (%d bytes)' % (rel_dev, os.path.getsize(os.path.join(HERE, rel_dev))))


def promote(key, game):
    print('%s: dev -> live' % game['name'])
    out = []
    for n, (rel_live, rel_dev) in enumerate(game['files']):
        s, ending = read(os.path.join(HERE, rel_dev))
        if n == 0:
            if NOINDEX not in s:
                sys.exit('%s has no noindex tag -- it was not made by this script' % rel_dev)
            s = s.replace(NOINDEX, '', 1)
            for live_bit, dev_bit in game['swaps']:
                if dev_bit not in s:
                    sys.exit('could not find %r in %s' % (dev_bit, rel_dev))
                s = s.replace(dev_bit, live_bit)
        out.append((rel_live, s, ending))

    print('about to overwrite:')
    for rel_live, s, ending in out:
        print('  %s -- %d bytes now, would become about %d'
              % (rel_live, os.path.getsize(os.path.join(HERE, rel_live)), len(s)))
    if input('type "yes" to go ahead: ').strip() != 'yes':
        sys.exit('left alone')
    for rel_live, s, ending in out:
        write(os.path.join(HERE, rel_live), s, ending)
        print('  %s is now %d bytes' % (rel_live, os.path.getsize(os.path.join(HERE, rel_live))))


def diff(key, game):
    import difflib
    clean = True
    for rel_live, rel_dev in game['files']:
        a = read(os.path.join(HERE, rel_live))[0].splitlines(keepends=True)
        b = read(os.path.join(HERE, rel_dev))[0].splitlines(keepends=True)
        out = list(difflib.unified_diff(a, b, rel_live, rel_dev, n=0))
        if out:
            clean = False
            sys.stdout.writelines(out)
    if clean:
        print('identical')


if __name__ == '__main__':
    # `devbuild.py diff papertrail | head` closes the pipe under us, and the
    # traceback that follows looks like the script broke when it did not.
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (ImportError, AttributeError, ValueError):
        pass

    job = sys.argv[1] if len(sys.argv) > 1 else ''
    if job not in ('make', 'promote', 'diff'):
        sys.exit(__doc__)
    key, game = pick(sys.argv)
    {'make': make, 'promote': promote, 'diff': diff}[job](key, game)
