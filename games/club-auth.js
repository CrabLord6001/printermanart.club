/* ============================================================
   club-auth.js — Discord sign-in and score posting
   ============================================================
   Shared by everything on the site that needs to know who someone
   is. Written for the arcade first, but deliberately not arcade
   specific: the member artwork submissions will sign in through
   this same file.

   Backend is the PrinterMan Projects Supabase project, which is the art The key below is the
   club's own and shares nothing with Whosoeverbelieves. The key below
   is the publishable key, which is meant to sit in client code — every
   table it touches has row level security, so this key on its own
   cannot read or change anything the policies do not allow.

   One thing has to be set in the Supabase dashboard for sign-in to
   work from this domain: Authentication -> URL Configuration ->
   Redirect URLs must include the live site and, for the VS Code
   preview, the local one. Written with the dashboard's wildcard, which
   is a path followed by two asterisks:
     https://printermanart.club plus slash and two asterisks
     http://localhost with its port, then slash and two asterisks
     http://127.0.0.1 with its port, then slash and two asterisks
   Without those, Discord has nowhere valid to send people back to. (Spelled out in words on purpose: an asterisk
   followed by a slash would end this comment early and take the file
   with it.)
   ============================================================ */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

import { SUPABASE_URL, SUPABASE_KEY } from '/club-config.js';

export const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Picks the session out of the URL after Discord sends them back,
    // then clears it so the address bar does not keep the token.
    detectSessionInUrl: true
  }
});

/* ---- who is here ------------------------------------------- */

let member = null;   // { id, displayName, avatarUrl } or null

/* Discord hands back a few different name fields depending on whether
   someone has set a display name. This is only the starting point: a member
   can set their own artist name in the portal, and from then on sign-in
   leaves it alone. Prefer the one they would recognize
   as themselves, and never end up with an empty string. */
function nameFrom(user) {
  const m = user.user_metadata || {};
  const claims = m.custom_claims || {};
  const picked = claims.global_name || m.full_name || m.name || m.user_name
              || m.preferred_username || 'Member';
  return String(picked).trim().slice(0, 40) || 'Member';
}

function usernameFrom(user) {
  const m = user.user_metadata || {};
  const picked = m.user_name || m.preferred_username || m.name || null;
  return picked ? String(picked).trim().slice(0, 40) : null;
}

/* The member row is written on every sign-in rather than once at signup,
   so a Discord rename shows up on the board the next time they play.

   Nothing in here is allowed to throw. A page decides what to show from the
   callback below, and several of them start with everything hidden, so a
   rejected promise here used to mean no callback and a blank page. */
async function syncMember(user) {
  const avatar = (user.user_metadata || {}).avatar_url || null;

  // What Discord thinks they are called. Only used if they have not said
  // otherwise -- the database decides that, not this.
  let name = nameFrom(user);

  try {
    const { data, error } = await db.rpc('club_sync_member', {
      p_display: name,
      p_username: usernameFrom(user),
      p_avatar: avatar
    });
    if (error) console.warn('[club-auth] member sync failed:', error.message);
    else if (data) name = data;        // the name now in force
  } catch (err) {
    // Couldn't write the row. Who they are is still known from the session,
    // so sign-in holds and only the name refresh is lost.
    console.warn('[club-auth] member sync threw:', err && err.message);
  }

  member = { id: user.id, displayName: name, avatarUrl: avatar };
  return member;
}

export function currentMember() {
  return member;
}

/* Calls back with the member (or null) now and on every later change,
   so a page can render its signed-out state immediately instead of
   waiting on the network. */
export function onMember(callback) {
  /* The callback has to run, whatever happens. Pages hide their panels until
     it says who is here, so swallowing a failure would leave them blank with
     nothing to click. Signed out is the safe thing to report. */
  const safely = async (work) => {
    try { callback(await work()); }
    catch (err) {
      console.warn('[club-auth] could not settle the session:', err && err.message);
      callback(null);
    }
  };

  safely(async () => {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    const user = data && data.session && data.session.user;
    return user ? await syncMember(user) : null;
  });

  db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      member = null;
      callback(null);
      return;
    }
    // TOKEN_REFRESHED fires on a timer; no need to rewrite the row for it.
    if (event === 'TOKEN_REFRESHED' && member) {
      callback(member);
      return;
    }
    safely(() => syncMember(session.user));
  });
}

/* ---- signing in and out ------------------------------------ */

export async function signIn() {
  // Back to the page they were on, minus any query or hash, so finishing
  // a game and signing in does not bounce them to the home page.
  const back = window.location.origin + window.location.pathname;

  const { error } = await db.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: back }
  });

  if (error) throw error;
}

export async function signOut() {
  await db.auth.signOut();
}

/* ---- scores ------------------------------------------------ */

/* A run is only ever inserted, never updated: the table has no update
   policy, so a posted score cannot be edited afterwards. The board shows
   each player's best, so posting every finished run is harmless. */
export async function postScore(game, score, detail, variant) {
  if (!member) return { ok: false, reason: 'signed-out' };

  const clean = Math.max(0, Math.min(10000, Math.floor(Number(score) || 0)));

  const { error } = await db.from('club_scores').insert({
    user_id: member.id,
    game,
    variant: variant || 'classic',
    score: clean,
    detail: detail || {}
  });

  if (error) {
    console.warn('[club-auth] score post failed:', error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

/* The same board for a game where the lowest number wins -- a time. It is
   a second function rather than a flag on the first because the one above
   is what the arcade already depends on. */
export async function leaderboardLow(game, variant, limit) {
  const { data, error } = await db.rpc('club_leaderboard_low', {
    p_game: game,
    p_variant: variant || 'classic',
    p_limit: limit || 10
  });

  if (error) {
    console.warn('[club-auth] leaderboard failed:', error.message);
    return null;
  }
  return data || [];
}

/* The campaign board: levels cleared is the rank, and total time only
   breaks a tie. Each level counts once, at the player's best time on it, so
   going back to beat a level can only move them up. */
export async function campaignBoard(game, limit) {
  const { data, error } = await db.rpc('club_campaign_board', {
    p_game: game,
    p_limit: limit || 10
  });

  if (error) {
    console.warn('[club-auth] campaign board failed:', error.message);
    return null;
  }
  return data || [];
}

/* Where the signed-in player stands in the whole field, which is how a
   board can show somebody their own place when it sits below the last row
   on display. Null when they are signed out or have cleared nothing. */
export async function campaignMe(game) {
  const { data, error } = await db.rpc('club_campaign_me', { p_game: game });

  if (error) {
    console.warn('[club-auth] campaign standing failed:', error.message);
    return null;
  }
  return (data && data[0]) || null;
}

/* Profile pictures for the names already on a board. The board function
   returns names and scores only, and club_members is readable, so one
   extra query fills in the faces rather than changing the board function.
   Keyed by display name, which is what the board rows carry. */
export async function avatarsFor(names) {
  const want = (names || []).filter(Boolean);
  if (!want.length) return {};

  const { data, error } = await db
    .from('club_members')
    .select('display_name, avatar_url')
    .in('display_name', want);

  if (error) {
    console.warn('[club-auth] avatars failed:', error.message);
    return {};
  }

  const faces = {};
  (data || []).forEach((row) => {
    if (row.avatar_url) faces[row.display_name] = row.avatar_url;
  });
  return faces;
}

export async function leaderboard(game, variant, limit) {
  const { data, error } = await db.rpc('club_leaderboard', {
    p_game: game,
    p_variant: variant || 'classic',
    p_limit: limit || 10
  });

  if (error) {
    console.warn('[club-auth] leaderboard failed:', error.message);
    return null;
  }
  return data || [];
}

/* Your own best for this game, so the page can show it whether or not
   you are on the top ten. */
/* Your own best where lowest wins, for the same reason. */
export async function myBestLow(game, variant) {
  if (!member) return null;

  const { data, error } = await db
    .from('club_scores')
    .select('score')
    .eq('user_id', member.id)
    .eq('game', game)
    .eq('variant', variant || 'classic')
    .order('score', { ascending: true })
    .limit(1);

  if (error || !data || !data.length) return null;
  return data[0].score;
}

export async function myBest(game, variant) {
  if (!member) return null;

  const { data, error } = await db
    .from('club_scores')
    .select('score')
    .eq('user_id', member.id)
    .eq('game', game)
    .eq('variant', variant || 'classic')
    .order('score', { ascending: false })
    .limit(1);

  if (error || !data || !data.length) return null;
  return data[0].score;
}

/* ---- a board for a game where the highest number wins ----
   The campaign is ranked on levels then on time, and club_leaderboard
   returns a name and a number and nothing else. Endless needs the same
   furniture the campaign board has -- a place, a face, and the detail
   the run was saved with -- so it has its own pair, shaped to match
   club_campaign_board and club_campaign_me. One row per player: their
   best run, not every run they have had. */
export async function highBoard(game, variant, limit) {
  const { data, error } = await db.rpc('club_high_board', {
    p_game: game,
    p_variant: variant || 'classic',
    p_limit: limit || 10
  });

  if (error) {
    console.warn('[club-auth] high board failed:', error.message);
    return null;
  }
  return data || [];
}

export async function highMe(game, variant) {
  const { data, error } = await db.rpc('club_high_me', {
    p_game: game,
    p_variant: variant || 'classic'
  });

  if (error) {
    console.warn('[club-auth] high standing failed:', error.message);
    return null;
  }
  return (data && data[0]) || null;
}
