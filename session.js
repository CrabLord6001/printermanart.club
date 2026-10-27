/* ============================================================
   session.js — the signed-in strip, site wide
   ============================================================
   Shows a quiet "sign out" in the top right once somebody is
   signed in, and an "approvals" link beside it if they are a
   moderator. Signed out, it shows nothing at all — the way in is
   the sign-in link in the footer.

   The important part is what it does NOT do. Loading the Supabase
   client on every page so most visitors can be told they are
   signed out would be a waste of their bandwidth on a home page
   whose job is a Discord link. So this checks local storage for a
   session key first, which is synchronous and free, and only
   downloads anything if one is actually there.

   The pages that already manage their own sign-in — the submit
   form and the review queue — do not load this.
   ============================================================ */

function looksSignedIn() {
  // Supabase keeps its session under sb-<project ref>-auth-token.
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) return true;
    }
  } catch (e) {
    // Private mode, or storage blocked. Treat as signed out.
  }
  return false;
}

function paint() {
  const style = document.createElement('style');
  style.textContent =
    '.club-session{display:flex;justify-content:center;align-items:center;gap:18px;' +
    'margin:18px 0 10px;font-size:.62rem;font-weight:600;letter-spacing:.14em;' +
    'text-transform:uppercase;font-family:inherit;}' +
    '.club-session a,.club-session button{color:#7A8094;background:none;border:0;padding:0;' +
    'font:inherit;letter-spacing:inherit;text-transform:inherit;text-decoration:none;cursor:pointer;}' +
    '.club-session a:hover,.club-session button:hover{color:#D4A24C;}' +
    '.club-session a:focus-visible,.club-session button:focus-visible{' +
    'outline:2px solid #99A2F7;outline-offset:3px;border-radius:2px;}' +
    '.club-session .approvals{color:#99A2F7;}' +

    /* The footer sign-in belongs to the same job as this strip, so its one
       rule lives here too rather than in four separate stylesheets. Matched
       on where it points, which saves putting a class on twelve pages. */
    'footer a[href="/member-art/submit.html"],' +
    '.site-foot a[href="/member-art/submit.html"]{color:#D4A24C;font-weight:600;}' +
    'footer a[href="/member-art/submit.html"]:hover,' +
    '.site-foot a[href="/member-art/submit.html"]:hover{text-decoration:underline;}';
  document.head.appendChild(style);
}

async function start() {
  if (!looksSignedIn()) return;

  // Only now is anything downloaded.
  const auth = await import('/games/club-auth.js');

  /* The sign-in check reports more than once -- the stored session first,
     then the auth state event behind it. Each run used to build its bar,
     then await the admin check, then insert, which meant three runs inserted
     three bars and only the last one was remembered to be removed.

     So: nothing is built until after the waiting is done, the page is swept
     clear immediately before inserting, and a run that has been overtaken
     drops out rather than adding a second bar. */
  let run = 0;
  let admin = null;          // worked out once, then remembered

  const sweep = () => {
    document.querySelectorAll('.club-session').forEach((n) => n.remove());
  };

  auth.onMember(async (member) => {
    const mine = ++run;
    sweep();

    if (!member) { admin = null; return; }

    const nav = document.querySelector('nav.menu, nav.site-strip');
    if (!nav) return;

    if (admin === null) {
      try {
        const { data } = await auth.db.rpc('club_is_admin');
        admin = data === true;
      } catch (e) {
        admin = false;
      }
    }

    // Something newer started while that was in flight; it owns the page.
    if (mine !== run) return;

    const bar = document.createElement('div');
    bar.className = 'club-session';

    // Everyone signed in has somewhere of their own to go. Only a moderator
    // also has everyone else's queue.
    const ownLink = document.createElement('a');
    ownLink.href = '/member-art/submit.html';
    ownLink.textContent = 'Submissions';
    bar.appendChild(ownLink);

    if (admin) {
      const link = document.createElement('a');
      link.className = 'approvals';
      link.href = '/member-art/review.html';
      link.textContent = 'Approvals';
      bar.appendChild(link);
    }

    const out = document.createElement('button');
    out.type = 'button';
    out.textContent = 'Sign out';
    out.addEventListener('click', () => auth.signOut());
    bar.appendChild(out);

    sweep();                 // belt and braces: never two
    nav.insertAdjacentElement('afterend', bar);

    // The footer still says "Sign in", which is nonsense to somebody who
    // already is. It is static markup on twelve pages, so it is relabeled
    // here rather than duplicated as two versions in each one.
    document.querySelectorAll('a[href="/member-art/submit.html"]').forEach((el) => {
      if (el !== ownLink && el.textContent.trim() === 'Sign in') el.textContent = 'Submit art';
    });
  });
}

paint();
start();
