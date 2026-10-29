#!/usr/bin/env python3
"""devbuild.py -- move Gallery Printshop between the live and dev addresses.

The two files are identical but for one line: the dev copy carries a noindex
meta tag. Everything that makes a preview build behave differently -- its own
storage prefix, and recording nothing to the leaderboard -- the page works out
from its own path at runtime, so there is no flag in the file to get wrong.

    python3 tools/devbuild.py make      live  -> dev   (adds noindex)
    python3 tools/devbuild.py promote   dev   -> live  (drops noindex)
    python3 tools/devbuild.py diff      what differs between the two

Promote overwrites the live game. It prints what it is about to do and asks.
"""

import io
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE = os.path.join(HERE, 'games', 'color-processor.html')
DEV = os.path.join(HERE, 'games', 'dev', 'color-processor.html')

ANCHOR = '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
NOINDEX = (
    '<!-- A preview build. Not indexed, not in sitemap.xml, not linked from\n'
    '     anywhere public. Reached from /admin/previews.html, which is gated. -->\n'
    '<meta name="robots" content="noindex, nofollow">\n'
)


def read(path):
    return io.open(path, encoding='utf-8').read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    io.open(path, 'w', encoding='utf-8', newline='').write(text)


def make():
    s = read(LIVE)
    if NOINDEX in s:
        sys.exit('the live file already carries a noindex tag -- look at it before going on')
    if ANCHOR not in s:
        sys.exit('the viewport meta tag is not where this script expects it')
    write(DEV, s.replace(ANCHOR, ANCHOR + NOINDEX, 1))
    print('wrote %s (%d bytes)' % (os.path.relpath(DEV, HERE), len(read(DEV))))


def promote():
    s = read(DEV)
    if NOINDEX not in s:
        sys.exit('the dev file has no noindex tag -- it was not made by this script')
    out = s.replace(NOINDEX, '', 1)
    print('about to overwrite %s with %s' % (
        os.path.relpath(LIVE, HERE), os.path.relpath(DEV, HERE)))
    print('  live is %d bytes now, would become %d' % (len(read(LIVE)), len(out)))
    if input('type "yes" to go ahead: ').strip() != 'yes':
        sys.exit('left alone')
    write(LIVE, out)
    print('live is now %d bytes' % len(read(LIVE)))


def diff():
    import difflib
    a = read(LIVE).splitlines(keepends=True)
    b = read(DEV).splitlines(keepends=True)
    out = list(difflib.unified_diff(a, b, 'live', 'dev', n=0))
    if not out:
        print('identical')
        return
    sys.stdout.writelines(out)


if __name__ == '__main__':
    job = sys.argv[1] if len(sys.argv) > 1 else ''
    if job == 'make':
        make()
    elif job == 'promote':
        promote()
    elif job == 'diff':
        diff()
    else:
        sys.exit(__doc__)
