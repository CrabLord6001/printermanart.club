/* ==========================================================================
   PrinterMan's Art Club — Taskboard
   --------------------------------------------------------------------------
   Site and game work. Ported from the Whosoever Believes board, with one
   deliberate difference: that board is private to each admin, this one is
   shared. The policy on club_tasks is club_is_admin() with no "own rows"
   clause, so every admin works the same board.

   Security note: the gate below only decides what is DRAWN. What protects
   the rows is that policy. Somebody who finds this URL gets an empty board
   because Postgres returns nothing, not because this file hid it.
   ========================================================================== */

import { db, onMember, signIn } from '/games/club-auth.js';

(function () {
  'use strict';

  var STATUSES = [
    { key: 'draft',       name: 'Draft / Brainstorm', color: '#a18072' },
    { key: 'todo',        name: 'To Do',              color: '#ff0008' },
    { key: 'paused',      name: 'Paused',             color: '#0091ff' },
    { key: 'in_progress', name: 'In Progress',        color: '#5f55ee' },
    { key: 'reviewing',   name: 'Reviewing',          color: '#f76808' },
    { key: 'complete',    name: 'Complete',           color: '#008844' }
  ];
  var byKey = {};
  STATUSES.forEach(function (s) { byKey[s.key] = s; });

  var client = null;
  var tasks = [];
  var showArchived = false;
  var filter = '';
  var typeFilter = '';
  var editing = null;        // task object, or {} for a new one
  var dragId = null;
  var quickOpen = null;      // status key whose inline add box is open
  var subOpen = null;        // parent task id whose subtask box is open
  var hidden = {};           // status key -> true, stored on the profile
  var pendingLive = false;   // a live change that arrived at an awkward moment
  var meId = null;           // the signed-in admin, for their own column preferences

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;   // textContent, never innerHTML
    return n;
  }

  // ── GATE ────────────────────────────────────────────────────────────────

  function gate(msg, isError) {
    var g = $('tb-gate');
    g.hidden = false;
    g.className = 'tb-msg' + (isError ? ' tb-err' : '');
    g.textContent = '';
    g.appendChild(document.createTextNode(msg));
    $('tb-app').hidden = true;
  }

  function start() {
    onMember(function (m) {
      if (!m) {
        // Signed out with the board open: close it rather than leave stale
        // rows on screen.
        if (meId) { location.reload(); return; }
        gate('');
        var g = $('tb-gate');
        g.appendChild(document.createTextNode('You need to be signed in to view this page.'));
        g.appendChild(document.createElement('br'));
        var b = el('button', 'tb-btn', 'Sign in with Discord');
        b.type = 'button';
        b.addEventListener('click', function () { signIn(); });
        g.appendChild(b);
        return;
      }

      if (meId) return;          // onMember fires again on a token refresh
      meId = m.id;
      client = db;

      client.from('club_members')
        .select('is_admin, board_prefs')
        .eq('user_id', m.id)
        .maybeSingle()
        .then(function (res) {
          if (!res || !res.data || !res.data.is_admin) {
            meId = null;
            gate('This page is for admins. Nothing to see here.');
            return;
          }
          var prefs = res.data.board_prefs || {};
          (prefs.hidden || []).forEach(function (k) { hidden[k] = true; });

          $('tb-gate').hidden = true;
          $('tb-app').hidden = false;
          if (window.matchMedia && window.matchMedia('(hover: none)').matches) {
            document.body.classList.add('tb-touch');
          }
          wire();
          return load().then(subscribe);
        })
        .catch(function (err) {
          console.error('[taskboard]', err);
          gate('Could not load the board: ' + (err && err.message ? err.message : 'unknown error'), true);
        });
    });
  }

  // ── DATA ────────────────────────────────────────────────────────────────

  function load() {
    return client.from('club_tasks').select('*')
      .eq('archived', showArchived)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        tasks = res.data || [];
        render();
      });
  }

  // ── LIVE UPDATES ────────────────────────────────────────────────────────
  // Supabase pushes row changes over a websocket, so a task added from a Claude
  // chat - or from another device - appears without reloading. RLS applies to
  // the stream too, so only your own rows ever arrive.

  function busy() {
    return !!dragId ||
      $('tb-ov').classList.contains('open') ||
      $('tb-mv').classList.contains('open');
  }

  // Redrawing mid-drag would yank the card out from under the pointer, and
  // mid-edit would be worse, so a change that lands then is held until after.
  function liveChange() {
    if (busy()) { pendingLive = true; return; }
    load();
  }

  function flushLive() {
    if (!pendingLive || busy()) return;
    pendingLive = false;
    load();
  }

  function subscribe() {
    try {
      client.channel('taskboard')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'club_tasks' }, liveChange)
        .subscribe();
    } catch (e) {
      console.warn('[taskboard] live updates unavailable', e);  // the board still works
    }
  }

  // ── COLUMN VISIBILITY ───────────────────────────────────────────────────
  // Kept on the member row rather than in this browser, so the board looks the
  // same on the desktop and the iPad.

  function savePrefs() {
    var keys = Object.keys(hidden).filter(function (k) { return hidden[k]; });
    return client.from('club_members')
      .update({ board_prefs: { hidden: keys } })
      .eq('user_id', meId)
      .then(function (res) { if (res.error) throw res.error; })
      .catch(function (err) { console.warn('[taskboard] could not save columns', err); });
  }

  // ── QUICK ADD ───────────────────────────────────────────────────────────
  // Capture first, sort later. Title and column only; everything else is
  // filled in by tapping the card afterwards, if ever.

  function subAdd(title, parent, input) {
    if (input) input.disabled = true;
    return client.from('club_tasks')
      .insert({ title: title, status: 'draft', parent_id: parent, position: tasks.length })
      .select()
      .then(function (res) {
        if (res.error) throw res.error;
        if (res.data && res.data[0]) tasks.push(res.data[0]);
        render();
      })
      .catch(function (err) {
        alert('Could not add that subtask: ' + (err.message || 'unknown error'));
      })
      .then(function () { if (input) input.disabled = false; });
  }

  function quickAdd(title, status, input) {
    if (input) input.disabled = true;
    return client.from('club_tasks')
      .insert({ title: title, status: status, position: tasks.length })
      .select()
      .then(function (res) {
        if (res.error) throw res.error;
        if (res.data && res.data[0]) tasks.push(res.data[0]);
        render();                      // quickOpen survives, so the box comes back focused
      })
      .catch(function (err) {
        alert('Could not add that task: ' + (err.message || 'unknown error'));
      })
      .then(function () { if (input) input.disabled = false; });
  }

  function save(id, patch) {
    return client.from('club_tasks').update(patch).eq('id', id).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  // ── RENDER ──────────────────────────────────────────────────────────────

  function matches(t) {
    if (typeFilter && (t.type || '') !== typeFilter) return false;
    if (!filter) return true;
    var hay = (t.title + ' ' + (t.type || '') + ' ' + (t.description || '')).toLowerCase();
    return hay.indexOf(filter) !== -1;
  }

  // The type vocabulary is whatever is already in use. There is no list of
  // valid types here or in the database, so adding one costs nothing.
  function usedTypes() {
    var seen = {};
    tasks.forEach(function (t) { if (t.type) seen[t.type] = 1; });
    return Object.keys(seen).sort();
  }

  function refreshTypes() {
    var list = usedTypes();
    var dl = $('tb-types');
    if (dl) {
      dl.textContent = '';
      list.forEach(function (v) {
        var o = document.createElement('option'); o.value = v; dl.appendChild(o);
      });
    }
    var sel = $('tb-type');
    if (sel) {
      var cur = sel.value;
      sel.textContent = '';
      var all = document.createElement('option');
      all.value = ''; all.textContent = 'All types';
      sel.appendChild(all);
      list.forEach(function (v) {
        var o = document.createElement('option'); o.value = v; o.textContent = v;
        sel.appendChild(o);
      });
      // If the filtered-on type no longer exists, fall back to showing everything.
      sel.value = list.indexOf(cur) !== -1 ? cur : '';
      if (sel.value !== cur) typeFilter = sel.value;
    }
  }

  function dueTag(t) {
    if (!t.due_date) return null;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var d = new Date(t.due_date + 'T00:00:00');
    var days = Math.round((d - today) / 86400000);
    var cls = 'tb-tag due' + (days < 0 ? ' past' : days <= 14 ? ' soon' : '');
    var label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (d.getFullYear() !== today.getFullYear()) label += ' ' + d.getFullYear();
    if (days < 0) label = 'Overdue · ' + label;
    return el('span', cls, label);
  }

  // ── NOTES PREVIEW ───────────────────────────────────────────────────────
  // Hovering the ≡ shows the note itself rather than a badge announcing one.

  var pop = null;

  function popEl() {
    if (!pop) { pop = el('div', 'tb-pop'); document.body.appendChild(pop); }
    return pop;
  }

  function hideNotes() { if (pop) pop.classList.remove('open'); }

  function showNotes(anchor, text) {
    var p = popEl();
    p.textContent = text;
    p.style.left = '0px';
    p.style.top = '0px';
    p.classList.add('open');            // must be visible before it can be measured

    var r = anchor.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var w = p.offsetWidth, h = p.offsetHeight;
    var GAP = 14;

    // Beside the icon, not under it: the pointer is resting on the icon, and
    // anything directly below it ends up half-hidden by the cursor.
    var left, top = r.top - 6;
    if (r.right + GAP + w <= vw - 8) {
      left = r.right + GAP;                      // right of the icon
    } else if (r.left - GAP - w >= 8) {
      left = r.left - GAP - w;                   // no room right, go left
    } else {
      // Narrow screen: fall back to below, far enough down to clear the pointer.
      left = Math.min(Math.max(8, r.left - 24), vw - w - 8);
      top = r.bottom + 26;
      if (top + h > vh - 8 && r.top - h - 26 > 8) top = r.top - h - 26;
    }

    if (top + h > vh - 8) top = vh - h - 8;
    if (top < 8) top = 8;

    p.style.left = (left + window.scrollX) + 'px';
    p.style.top  = (top + window.scrollY) + 'px';
  }

  function card(t, kids) {
    var c = el('div', 'tb-card');
    c.draggable = true;
    c.dataset.id = t.id;
    c.style.borderLeftColor = byKey[t.status] ? byKey[t.status].color : 'transparent';

    var titleRow = el('div', 'tb-card-title');
    titleRow.appendChild(el('span', 'tb-card-text', t.title));

    var sb = el('button', 'tb-sub', '+');
    sb.type = 'button';
    sb.title = 'Add a subtask';
    sb.addEventListener('click', function (e) {
      e.stopPropagation();
      quickOpen = null;            // only one inline box open at a time
      subOpen = (subOpen === t.id) ? null : t.id;
      render();
    });
    titleRow.appendChild(sb);

    c.appendChild(titleRow);

    var meta = el('div', 'tb-card-meta');
    if (t.type) meta.appendChild(el('span', 'tb-tag type', t.type));
    if (t.priority) meta.appendChild(el('span', 'tb-tag ' + t.priority, t.priority));
    var dt = dueTag(t); if (dt) meta.appendChild(dt);
    if (t.description) {
      var nb = el('span', 'tb-notes', '\u2261');
      nb.setAttribute('aria-label', 'Notes');
      nb.addEventListener('mouseenter', function () { showNotes(nb, t.description); });
      nb.addEventListener('mouseleave', hideNotes);
      nb.addEventListener('click', function (e) {       // tap, for touch screens
        e.stopPropagation();
        if (pop && pop.classList.contains('open')) hideNotes();
        else showNotes(nb, t.description);
      });
      meta.appendChild(nb);
    }
    if (t.claude_session_url) {
      var a = el('a', 'tb-chat', '💬');
      a.href = t.claude_session_url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = t.claude_session_title || 'Open the Claude chat this started in';
      a.addEventListener('click', function (e) { e.stopPropagation(); });
      meta.appendChild(a);
    }
    if (t.doc_url) {
      var d = el('a', 'tb-chat', '\ud83d\udcc4');
      d.href = t.doc_url;
      d.target = '_blank';
      d.rel = 'noopener';
      d.title = 'Open the document for this task';
      d.addEventListener('click', function (e) { e.stopPropagation(); });
      meta.appendChild(d);
    }
    var mv = el('button', 'tb-move', 'Move');
    mv.type = 'button';
    mv.addEventListener('click', function (e) { e.stopPropagation(); openMove(t); });
    meta.appendChild(mv);

    if (meta.childNodes.length) c.appendChild(meta);

    if (kids && kids.length) {
      var ul = el('ul', 'tb-kids');
      kids.forEach(function (k) {
        var li = el('li', 'tb-kid' + (k.status === 'complete' ? ' done' : ''));
        var dot = el('span', 'tb-dot');
        dot.style.background = byKey[k.status] ? byKey[k.status].color : '#666';
        li.appendChild(dot);
        li.appendChild(el('span', 'tb-kid-t', k.title));
        li.addEventListener('click', function (e) { e.stopPropagation(); openEditor(k); });
        ul.appendChild(li);
      });
      c.appendChild(ul);
    }

    if (subOpen === t.id) {
      var qs = el('input', 'tb-quick tb-quick-sub');
      qs.type = 'text';
      qs.placeholder = 'Subtask, then Enter';
      qs.maxLength = 300;
      qs.addEventListener('click', function (e) { e.stopPropagation(); });
      qs.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Escape') { subOpen = null; render(); return; }
        if (e.key !== 'Enter') return;
        var title = qs.value.trim();
        if (!title) { subOpen = null; render(); return; }
        qs.value = '';
        subAdd(title, t.id, qs);
      });
      qs.addEventListener('blur', function () {
        setTimeout(function () {
          if (!qs.isConnected || document.activeElement === qs) return;
          if (!qs.value.trim() && subOpen === t.id) { subOpen = null; render(); }
        }, 0);
      });
      c.appendChild(qs);
    }

    c.addEventListener('click', function () { openEditor(t); });
    c.addEventListener('dragstart', function (e) {
      hideNotes();
      dragId = t.id;
      c.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', t.id); } catch (_) {}
    });
    c.addEventListener('dragend', function () {
      dragId = null;
      c.classList.remove('dragging');
      flushLive();
    });
    return c;
  }

  function moveTask(id, toStatus) {
    var t = tasks.find(function (x) { return x.id === id; });
    if (!t || t.status === toStatus) return;
    var before = t.status;
    t.status = toStatus;                   // optimistic
    render();
    save(id, { status: toStatus }).catch(function (err) {
      t.status = before;                   // put it back if the write failed
      render();
      alert('Could not move that task: ' + (err.message || 'unknown error'));
    });
  }

  function wireDrop(node, statusKey) {
    node.addEventListener('dragover', function (e) { e.preventDefault(); node.classList.add('over'); });
    node.addEventListener('dragleave', function () { node.classList.remove('over'); });
    node.addEventListener('drop', function (e) {
      e.preventDefault();
      node.classList.remove('over');
      var id = dragId || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
      if (id) moveTask(id, statusKey);
    });
  }

  function setCollapsed(key, on) {
    hidden[key] = on;
    savePrefs();
    render();
  }

  function render() {
    hideNotes();
    refreshTypes();
    var board = $('tb-board');
    board.textContent = '';

    var kidsOf = {};
    tasks.forEach(function (t) {
      if (t.parent_id) { (kidsOf[t.parent_id] = kidsOf[t.parent_id] || []).push(t); }
    });

    var shown = 0;
    STATUSES.forEach(function (s) {
      if (hidden[s.key]) {
        var cn = tasks.filter(function (t) { return t.status === s.key && !t.parent_id; }).length;
        var spine = el('div', 'tb-col collapsed');
        spine.title = 'Expand ' + s.name;
        var strip = el('div', 'tb-strip');
        var cdot = el('span', 'tb-dot'); cdot.style.background = s.color;
        strip.appendChild(cdot);
        strip.appendChild(el('span', 'tb-strip-name', s.name));
        strip.appendChild(el('span', 'tb-strip-n', String(cn)));
        spine.appendChild(strip);
        spine.addEventListener('click', function () { setCollapsed(s.key, false); });
        wireDrop(spine, s.key);        // still a drop target, so a card can be dragged into it
        board.appendChild(spine);
        return;
      }
      var col = el('div', 'tb-col');
      col.dataset.status = s.key;

      var head = el('div', 'tb-col-head');
      var dot = el('span', 'tb-dot'); dot.style.background = s.color;
      head.appendChild(dot);
      head.appendChild(el('span', 'tb-col-name', s.name));
      var n = el('span', 'tb-col-n');
      head.appendChild(n);
      var cb = el('button', 'tb-collapse', '\u2212');
      cb.type = 'button';
      cb.title = 'Narrow this column';
      cb.addEventListener('click', function (e) { e.stopPropagation(); setCollapsed(s.key, true); });
      head.appendChild(cb);
      col.appendChild(head);

      var rows = tasks.filter(function (t) {
        return t.status === s.key && !t.parent_id && matches(t);
      });
      n.textContent = rows.length;
      shown += rows.length;
      rows.forEach(function (t) { col.appendChild(card(t, kidsOf[t.id])); });

      var add = el('button', 'tb-add', '+');
      add.type = 'button';
      add.title = 'Add to ' + s.name;

      var quick = el('input', 'tb-quick');
      quick.type = 'text';
      quick.placeholder = 'Title, then Enter';
      quick.maxLength = 300;
      quick.hidden = true;

      function stopQuick() {
        quick.value = '';
        quick.hidden = true;
        add.hidden = false;
        if (quickOpen === s.key) quickOpen = null;
      }

      add.addEventListener('click', function () {
        quickOpen = s.key;
        add.hidden = true;
        quick.hidden = false;
        quick.focus();
      });

      quick.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { stopQuick(); return; }
        if (e.key !== 'Enter') return;
        var title = quick.value.trim();
        if (!title) { stopQuick(); return; }
        quick.value = '';
        quickAdd(title, s.key, quick);
      });

      quick.addEventListener('blur', function () {
        // A re-render removes this node and focuses its replacement; that is not
        // the user clicking away, so only an empty, still-attached box closes.
        setTimeout(function () {
          if (!quick.isConnected || document.activeElement === quick) return;
          if (!quick.value.trim()) stopQuick();
        }, 0);
      });

      if (quickOpen === s.key) { add.hidden = true; quick.hidden = false; }

      col.appendChild(add);
      col.appendChild(quick);

      wireDrop(col, s.key);

      board.appendChild(col);
    });

    if (quickOpen || subOpen) {
      var open = board.querySelector('.tb-quick:not([hidden])');
      if (open) open.focus();
    }

    var sub = tasks.filter(function (t) { return t.parent_id; }).length;
    $('tb-count').textContent = shown + (shown === 1 ? ' task' : ' tasks') +
      (sub ? ', ' + sub + ' subtask' + (sub === 1 ? '' : 's') : '') +
      (showArchived ? ' · archived' : '');
  }

  // ── MOVE (touch) ────────────────────────────────────────────────────────

  function openMove(t) {
    var list = $('tb-mv-list');
    list.textContent = '';
    STATUSES.forEach(function (s) {
      var b = el('button', 'tb-move-opt' + (s.key === t.status ? ' cur' : ''));
      b.type = 'button';
      var dot = el('span', 'tb-dot');
      dot.style.background = s.color;
      b.appendChild(dot);
      b.appendChild(document.createTextNode(s.name));
      b.addEventListener('click', function () {
        $('tb-mv').classList.remove('open');
        if (s.key === t.status) return;
        var before = t.status;
        t.status = s.key;
        render();
        save(t.id, { status: s.key }).catch(function (err) {
          t.status = before;
          render();
          alert('Could not move that task: ' + (err.message || 'unknown error'));
        });
      });
      list.appendChild(b);
    });
    $('tb-mv').classList.add('open');
  }

  // ── EDITOR ──────────────────────────────────────────────────────────────

  function fillSelects(t) {
    var st = $('tb-status');
    st.textContent = '';
    STATUSES.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.key; o.textContent = s.name;
      st.appendChild(o);
    });

    var p = $('tb-parent');
    p.textContent = '';
    var none = document.createElement('option');
    none.value = ''; none.textContent = '— none —';
    p.appendChild(none);
    tasks.filter(function (x) {
      return !x.parent_id && x.id !== t.id;   // one level of nesting only
    }).forEach(function (x) {
      var o = document.createElement('option');
      o.value = x.id; o.textContent = x.title;
      p.appendChild(o);
    });
  }

  function openEditor(t) {
    editing = t || {};
    fillSelects(editing);
    $('tb-mt').textContent = editing.id ? 'Edit task' : 'New task';
    $('tb-me').textContent = '';
    $('tb-title').value  = editing.title || '';
    $('tb-desc').value   = editing.description || '';
    $('tb-status').value = editing.status || 'draft';
    $('tb-prio').value   = editing.priority || '';
    $('tb-due').value    = editing.due_date || '';
    $('tb-parent').value = editing.parent_id || '';
    $('tb-chat').value   = editing.claude_session_url || '';
    $('tb-type-in').value = editing.type || '';
    $('tb-doc').value     = editing.doc_url || '';
    $('tb-delbtn').hidden  = !editing.id;
    $('tb-archbtn').hidden = !editing.id;
    $('tb-archbtn').textContent = showArchived ? 'Unarchive' : 'Archive';
    $('tb-ov').classList.add('open');
    setTimeout(function () { $('tb-title').focus(); }, 30);
  }

  function closeEditor() {
    $('tb-ov').classList.remove('open');
    editing = null;
    flushLive();
  }

  function commit() {
    var title = $('tb-title').value.trim();
    if (!title) { $('tb-me').textContent = 'A title is required.'; return; }

    var row = {
      title: title,
      description: $('tb-desc').value.trim() || null,
      status: $('tb-status').value,
      priority: $('tb-prio').value || null,
      due_date: $('tb-due').value || null,
      parent_id: $('tb-parent').value || null,
      claude_session_url: $('tb-chat').value.trim() || null,
      type: $('tb-type-in').value.trim() || null,
      doc_url: $('tb-doc').value.trim() || null
    };

    var p;
    if (editing.id) {
      p = save(editing.id, row);
    } else {
      row.position = tasks.length;
      p = client.from('club_tasks').insert(row).then(function (res) {
        if (res.error) throw res.error;
      });
    }
    p.then(function () { closeEditor(); return load(); })
     .catch(function (err) { $('tb-me').textContent = err.message || 'Could not save that.'; });
  }

  function archive() {
    if (!editing.id) return;
    save(editing.id, { archived: !showArchived })
      .then(function () { closeEditor(); return load(); })
      .catch(function (err) { $('tb-me').textContent = err.message || 'Could not archive that.'; });
  }

  function remove() {
    if (!editing.id) return;
    var kids = tasks.filter(function (t) { return t.parent_id === editing.id; }).length;
    var warn = 'Delete "' + editing.title + '" permanently?';
    if (kids) warn += '\n\nThis also deletes its ' + kids + ' subtask' + (kids === 1 ? '' : 's') + '.';
    warn += '\n\nArchiving keeps it and hides it instead.';
    if (!confirm(warn)) return;
    client.from('club_tasks').delete().eq('id', editing.id).then(function (res) {
      if (res.error) throw res.error;
      closeEditor();
      return load();
    }).catch(function (err) { $('tb-me').textContent = err.message || 'Could not delete that.'; });
  }

  // ── WIRING ──────────────────────────────────────────────────────────────

  function wire() {
    $('tb-q').addEventListener('input', function (e) {
      filter = e.target.value.trim().toLowerCase();
      render();
    });

    $('tb-type').addEventListener('change', function (e) {
      typeFilter = e.target.value;
      render();
    });

    $('tb-arch').addEventListener('click', function () {
      showArchived = !showArchived;
      this.classList.toggle('on', showArchived);
      this.textContent = showArchived ? 'Showing Archived' : 'Show Archived';
      load();
    });

    $('tb-mv').addEventListener('click', function (e) {
      if (e.target === $('tb-mv') || (e.target.closest && e.target.closest('[data-mv="close"]'))) {
        $('tb-mv').classList.remove('open');
        flushLive();
      }
    });

    $('tb-ov').addEventListener('click', function (e) {
      if (e.target === $('tb-ov')) { closeEditor(); return; }
      var btn = e.target.closest('[data-tb]');
      if (!btn) return;
      var a = btn.getAttribute('data-tb');
      if (a === 'close') closeEditor();
      else if (a === 'save') commit();
      else if (a === 'archive') archive();
      else if (a === 'delete') remove();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      hideNotes();
      $('tb-mv').classList.remove('open');
      if ($('tb-ov').classList.contains('open')) closeEditor();
    });

    // A preview pinned to a screen position has to go when the page moves.
    window.addEventListener('scroll', hideNotes, true);
    window.addEventListener('resize', hideNotes);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
