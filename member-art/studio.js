/* ============================================================
   studio.js — the artist side of the member area
   ============================================================
   Submitting, reviewing and reading back artwork. Sign-in comes
   from the same club-auth.js the arcade uses, because it is one
   membership: the account you play a game with is the account you
   submit work with.

   Nothing here decides what is allowed. The database does that —
   every call below is written as if the caller were hostile, and
   the row level security policies are what actually stop them.
   ============================================================ */

import { db, currentMember } from '/games/club-auth.js';

export { db, currentMember };
export { onMember, signIn, signOut } from '/games/club-auth.js';

export const BUCKET = 'member-art';

/* The bucket is public, so an approved image is a plain URL with no signing
   and no expiry. That is what lets a static page on GitHub Pages show it. */
export function publicUrl(path) {
  if (!path) return '';
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/* Asks the database rather than trusting anything the page knows. Someone
   editing this in their console gets a nicer looking page and no new rights. */
export async function isAdmin() {
  const { data, error } = await db.rpc('club_is_admin');
  if (error) return false;
  return data === true;
}

/* Admins and testers both. Same bargain as isAdmin: the database answers,
   so editing this in a console gets you a page with a link on it and no
   build you were not already allowed to open. */
export async function canPreview() {
  const { data, error } = await db.rpc('club_can_preview');
  if (error) return false;
  return data === true;
}

const FIELDS =
  'id, title, year, medium, description, alt_text, image_path, ' +
  'image_width, image_height, status, review_note, created_at, member_id';

/* club_artworks points at club_members twice — once for who made it and once
   for who reviewed it — so the join has to say which one it means, and it is
   aliased to artist because that is what it is. */
const ARTIST = 'artist:club_members!club_artworks_member_id_fkey';

/* ---- submitting --------------------------------------------- */

export async function submitWork(file, fields, publish) {
  const me = currentMember();
  if (!me) return { ok: false, reason: 'You are not signed in.' };

  /* Skipping the queue is a moderator's choice, not something decided for
     them: reviewing your own work is a formality, but it is also the only
     way to see the queue working. Either way this is just a request -- the
     guard on the table forces pending for anyone who is not actually a
     moderator, so asking for it buys an ordinary member nothing. */
  const publishNow = publish === true;

  const ext = (file.name.split('.').pop() || 'jpg')
    .toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';

  // The folder has to be the member's own user id: the storage policy checks
  // the first path segment against who is asking.
  const path = me.id + '/' + crypto.randomUUID() + '.' + ext;

  const up = await db.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false
  });
  if (up.error) return { ok: false, reason: up.error.message };

  const { error } = await db.from('club_artworks').insert({
    member_id: me.id,
    image_path: path,
    status: publishNow ? 'approved' : 'pending',
    reviewed_at: publishNow ? new Date().toISOString() : null,
    reviewed_by: publishNow ? me.id : null,
    ...fields
  });

  if (error) {
    // Don't leave the image orphaned in the bucket if the row did not land.
    await db.storage.from(BUCKET).remove([path]);
    return { ok: false, reason: error.message };
  }

  return { ok: true, published: publishNow };
}

/* ---- reading ------------------------------------------------- */

/* Your own work, whatever state it is in. The read policy lets you see your
   own pending and rejected rows; nobody else can. */
export async function myWorks() {
  const me = currentMember();
  if (!me) return [];

  const { data, error } = await db
    .from('club_artworks')
    .select(FIELDS)
    .eq('member_id', me.id)
    .order('created_at', { ascending: false });

  if (error) { console.warn('[studio] myWorks:', error.message); return []; }
  return data || [];
}

/* The queue. Returns nothing at all for a non-admin, because the policy
   filters it out rather than erroring. */
export async function pendingWorks() {
  const { data, error } = await db
    .from('club_artworks')
    .select(FIELDS + ', ' + ARTIST + '(display_name, discord_username, artist_link)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) { console.warn('[studio] pendingWorks:', error.message); return null; }
  return data || [];
}

export async function approvedWorks(limit) {
  const { data, error } = await db
    .from('club_artworks')
    .select(FIELDS + ', ' + ARTIST + '(display_name, artist_note, artist_slug, artist_link)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(limit || 60);

  if (error) { console.warn('[studio] approvedWorks:', error.message); return null; }
  return data || [];
}

/* One artist's page: who they are, and everything of theirs that is public.
   Looked up by the address rather than the id, since that is what is in the
   URL and what survives them renaming themselves. */
export async function artistBySlug(slug) {
  const { data, error } = await db
    .from('club_members')
    .select('user_id, display_name, artist_note, artist_bio, artist_slug, artist_link, avatar_url')
    .eq('artist_slug', slug)
    .limit(1);

  if (error || !data || !data.length) return null;
  return data[0];
}

export async function worksByArtist(memberId) {
  const { data, error } = await db
    .from('club_artworks')
    .select(FIELDS)
    .eq('member_id', memberId)
    .eq('status', 'approved')
    /* By year, newest first. Upload order is the wrong thing to sort on:
       work made in 2017 would sit above work from 2021 purely because it
       happened to be uploaded first, which is exactly what a one-time
       merge of older pieces produces. sort_order stays ahead of it for
       arranging a page by hand later. */
    .order('sort_order', { ascending: true })
    .order('year', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) { console.warn('[studio] worksByArtist:', error.message); return null; }
  return data || [];
}

export async function recentlyReviewed(limit) {
  const { data, error } = await db
    .from('club_artworks')
    .select(FIELDS + ', ' + ARTIST + '(display_name)')
    .neq('status', 'pending')
    .order('reviewed_at', { ascending: false, nullsFirst: false })
    .limit(limit || 12);

  if (error) return [];
  return data || [];
}

/* ---- the artist's own details --------------------------------- */

/* What the gallery will credit them as. Setting it raises name_is_custom,
   which is what stops the next sign-in copying their Discord name back over
   the top.

   Names are claimed rather than shared, so this can come back refused. That
   strictness only applies here: a name handed out automatically from Discord
   is numbered instead, because sign-in must never fail over one. */
export async function profile() {
  const { data, error } = await db
    .from('club_members')
    .select('display_name, artist_note, artist_link, name_is_custom, is_admin')
    .eq('user_id', (currentMember() || {}).id || '')
    .limit(1);

  if (error || !data || !data.length) return null;
  return data[0];
}

export async function saveProfile(displayName, note, link) {
  const me = currentMember();
  if (!me) return { ok: false, reason: 'You are not signed in.' };

  const clean = String(displayName || '').trim().slice(0, 40);
  if (!clean) return { ok: false, reason: 'A name cannot be empty.' };

  // Checked here as well as in the database, so the member gets a sentence
  // rather than a constraint violation.
  let url = String(link || '').trim().slice(0, 300) || null;
  if (url && !/^https?:\/\/\S+$/i.test(url)) {
    return { ok: false, reason: 'That link needs to start with http:// or https://' };
  }

  const { error } = await db
    .from('club_members')
    .update({
      display_name: clean,
      artist_note: String(note || '').trim().slice(0, 120) || null,
      artist_link: url,
      name_is_custom: true,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', me.id);

  if (error) {
    // 23505 is a unique violation, which here can only be the name index.
    if (error.code === '23505' || /duplicate key/i.test(error.message || '')) {
      return { ok: false, reason: '\u201c' + clean + '\u201d is already taken. Try a variation.' };
    }
    return { ok: false, reason: error.message };
  }
  return { ok: true, displayName: clean };
}

/* ---- reviewing ----------------------------------------------- */

/* Only an admin can make this stick. The guard trigger on the table puts the
   old status back for anyone else, so a member calling this on their own row
   changes nothing. */
export async function review(id, status, note) {
  const me = currentMember();
  if (!me) return { ok: false, reason: 'You are not signed in.' };

  const { error } = await db
    .from('club_artworks')
    .update({
      status,
      review_note: note || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: me.id
    })
    .eq('id', id);

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/* A rejected image should not sit in the bucket. The row stays, so the
   member can see what happened and why. */
export async function dropImage(path) {
  if (!path) return;
  const { error } = await db.storage.from(BUCKET).remove([path]);
  if (error) console.warn('[studio] dropImage:', error.message);
}

/* ---- small shared helpers ------------------------------------ */

export const MAX_BYTES = 10 * 1024 * 1024;
export const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function checkFile(file) {
  if (!file) return 'Choose an image first.';
  if (!TYPES.includes(file.type)) return 'That has to be a JPG, PNG, WebP or GIF.';
  if (file.size > MAX_BYTES) return 'That image is over 10MB. Shrink it and try again.';
  return null;
}

/* Width and height are read here rather than on the server, so the gallery
   can reserve the right space before the image arrives. */
export function measure(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight, url });
    };
    img.onerror = () => resolve({ w: null, h: null, url });
    img.src = url;
  });
}

export function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export function when(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}
