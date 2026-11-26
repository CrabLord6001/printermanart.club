/* DealSheet: renders deals.json as a filterable, sortable table.
   Restaurant picks and controls persist in localStorage. No accounts, no tracking. */
(function () {
  'use strict';

  var STORE = 'dealsheet:v1';
  var HOW_LABEL = { 'in-store': 'In restaurant', 'drive-thru': 'Drive-thru', app: 'App', online: 'Online', delivery: 'Delivery' };
  var CHECK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5 5 9l5-6" fill="none" stroke="#F4C542" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CHEV = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var el = function (id) { return document.getElementById(id); };
  var $rows = el('rows'), $chips = el('chips'), $count = el('sheet-h'), $empty = el('empty'),
      $q = el('q'), $how = el('how'), $sort = el('sort'), $noapp = el('noapp'), $table = el('deals');

  var data = { deals: [] };
  var chains = [];
  var state = load();
  var openId = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Dates are calendar days in the visitor's own time zone.
  function day(iso) { var p = iso.split('-'); return new Date(+p[0], p[1] - 1, +p[2]); }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function daysUntil(iso) { return Math.round((day(iso) - today()) / 864e5); }
  function fmt(iso) { return day(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); }

  function isLive(d) {
    if (d.end && daysUntil(d.end) < 0) return false;
    return true;
  }

  function endsCell(d) {
    if (d.start && daysUntil(d.start) > 0) {
      var s = daysUntil(d.start);
      return '<span class="when upcoming">' + (s === 1 ? 'Starts tomorrow' : 'Starts in ' + s + ' days') + '</span>' +
        '<span class="date">' + fmt(d.start) + (d.end ? (d.end === d.start ? ' only' : ' to ' + fmt(d.end)) : '') + '</span>';
    }
    if (!d.end) return '<span class="when open-ended">' + (d.ongoing ? 'Ongoing' : 'No end date given') + '</span>';
    var n = daysUntil(d.end), cls = n <= 2 ? 'soon' : n <= 7 ? 'week' : 'later';
    var label = n === 0 ? 'Ends today' : n === 1 ? 'Ends tomorrow' : n + ' days left';
    return '<span class="when ' + cls + '">' + label + '</span><span class="date">' + fmt(d.end) + '</span>';
  }

  function priceCell(d) {
    if (d.price_value === 0) return '<span class="free">' + esc(d.price || 'Free') + '</span>';
    return esc(d.price || '');
  }

  function tags(d) {
    var out = (d.how || []).filter(function (h) { return !(d.app_only && h === 'app'); }).map(function (h) {
      return '<span class="tag' + (h === 'app' ? ' app' : '') + '">' + esc(HOW_LABEL[h] || h) + '</span>';
    });
    if (d.app_only) out.unshift('<span class="tag app">App only</span>');
    if (d.rewards) out.push('<span class="tag rewards">Rewards members</span>');
    if (d.code) out.push('<span class="tag code" title="Promo code">Code ' + esc(d.code) + '</span>');
    if (!out.length) out.push('<span class="tag">Not stated</span>');
    return '<div class="tags">' + out.join('') + '</div>';
  }

  function detailRow(d) {
    var src = '<p><a href="' + esc(d.source.url) + '" target="_blank" rel="noopener">' + esc(d.source.name) + '</a></p>';
    if (d.official) src += '<p><a href="' + esc(d.official) + '" target="_blank" rel="noopener">' + esc(d.chain) + "'s own page</a></p>";
    return '<tr class="detail" id="detail-' + esc(d.id) + '"><td colspan="6"><div class="detail-body">' +
      '<div><h3>Fine print</h3><p>' + esc(d.fine_print || 'None stated by the source. Check with the restaurant.') + '</p></div>' +
      '<div class="src"><h3>Where we found it</h3>' + src + '</div>' +
      '</div></td></tr>';
  }

  function picked() {
    if (!state.picks) return chains.slice();
    return state.picks.filter(function (c) { return chains.indexOf(c) !== -1; });
  }

  function visible() {
    var picks = picked(), q = ($q.value || '').trim().toLowerCase(), how = $how.value;
    var list = data.deals.filter(function (d) {
      if (!isLive(d)) return false;
      if (picks.indexOf(d.chain) === -1) return false;
      if ($noapp.checked && d.app_only) return false;
      if (how) {
        var h = d.how || [];
        if (how === 'app' ? (h.indexOf('app') === -1 && h.indexOf('online') === -1) : h.indexOf(how) === -1) return false;
      }
      if (q) {
        var hay = [d.chain, d.title, d.details, d.fine_print, d.code].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    var endKey = function (d) { return d.end ? daysUntil(d.end) : 9999; };
    var by = {
      ends: function (a, b) { return endKey(a) - endKey(b) || a.chain.localeCompare(b.chain); },
      chain: function (a, b) { return a.chain.localeCompare(b.chain) || endKey(a) - endKey(b); },
      price: function (a, b) {
        var pa = a.price_value == null ? 1e9 : a.price_value, pb = b.price_value == null ? 1e9 : b.price_value;
        return pa - pb || endKey(a) - endKey(b);
      },
      new: function (a, b) { return (b.added || '').localeCompare(a.added || '') || endKey(a) - endKey(b); }
    };
    return list.sort(by[$sort.value] || by.ends);
  }

  function renderChips() {
    var counts = {};
    data.deals.forEach(function (d) { if (isLive(d)) counts[d.chain] = (counts[d.chain] || 0) + 1; });
    var picks = picked();
    $chips.innerHTML = chains.map(function (c) {
      var on = picks.indexOf(c) !== -1;
      return '<button type="button" class="chip" aria-pressed="' + on + '" data-chain="' + esc(c) + '">' +
        '<span class="box">' + CHECK + '</span>' + esc(c) +
        ' <span class="n" aria-label="' + (counts[c] || 0) + ' deals">' + (counts[c] || 0) + '</span></button>';
    }).join('');
  }

  function render() {
    var list = visible(), picks = picked();
    var places = {}; list.forEach(function (d) { places[d.chain] = 1; });
    var np = Object.keys(places).length;
    $count.textContent = list.length + (list.length === 1 ? ' deal' : ' deals') +
      (list.length ? ' at ' + np + (np === 1 ? ' place' : ' places') : '');

    $rows.innerHTML = list.map(function (d) {
      var open = openId === d.id;
      return '<tr class="deal' + (open ? ' open' : '') + '">' +
        '<td class="c-chain">' + esc(d.chain) + '</td>' +
        '<td class="c-deal"><span class="t">' + esc(d.title) + '</span><span class="d">' + esc(d.details) + '</span></td>' +
        '<td class="c-price">' + priceCell(d) + '</td>' +
        '<td class="c-ends">' + endsCell(d) + '</td>' +
        '<td class="c-how">' + tags(d) + '</td>' +
        '<td class="c-more"><button type="button" class="more" data-id="' + esc(d.id) + '" aria-expanded="' + open + '" aria-controls="detail-' + esc(d.id) + '">' +
        (open ? 'Hide' : 'Fine print') + CHEV + '</button></td>' +
        '</tr>' + (open ? detailRow(d) : '');
    }).join('');

    var none = !list.length;
    $table.parentNode.hidden = none;
    $empty.hidden = !none;
    if (none) {
      el('empty-msg').textContent = !picks.length
        ? 'Pick at least one restaurant above to see its deals.'
        : 'No deals match these filters right now.';
    }
  }

  function persistControls() {
    state.q = $q.value; state.how = $how.value; state.sort = $sort.value; state.noapp = $noapp.checked;
    save();
  }

  $chips.addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    var c = b.getAttribute('data-chain'), picks = picked(), i = picks.indexOf(c);
    if (i === -1) picks.push(c); else picks.splice(i, 1);
    state.picks = picks; save();
    b.setAttribute('aria-pressed', i === -1);
    render();
  });
  document.querySelector('.picker-actions').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pick]'); if (!b) return;
    state.picks = b.getAttribute('data-pick') === 'all' ? chains.slice() : [];
    save(); renderChips(); render();
  });
  $rows.addEventListener('click', function (e) {
    var b = e.target.closest('.more'); if (!b) return;
    var id = b.getAttribute('data-id');
    openId = openId === id ? null : id;
    render();
    var again = $rows.querySelector('.more[data-id="' + CSS.escape(id) + '"]');
    if (again) again.focus();
  });
  [$q, $how, $sort, $noapp].forEach(function (c) {
    c.addEventListener(c === $q ? 'input' : 'change', function () { persistControls(); render(); });
  });
  el('reset').addEventListener('click', function () {
    $q.value = ''; $how.value = ''; $noapp.checked = false;
    state.picks = chains.slice(); persistControls(); renderChips(); render();
  });

  // Restore controls
  if (state.q) $q.value = state.q;
  if (state.how) $how.value = state.how;
  if (state.sort) $sort.value = state.sort;
  $noapp.checked = !!state.noapp;

  fetch('deals.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (json) {
      data = json;
      var seen = {};
      data.deals.forEach(function (d) { if (isLive(d)) seen[d.chain] = 1; });
      chains = Object.keys(seen).sort(function (a, b) { return a.localeCompare(b); });
      if (data.updated) {
        var u = new Date(data.updated);
        el('updated').textContent = 'Last checked ' + u.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + '.';
      }
      renderChips(); render();
    })
    .catch(function () {
      $count.textContent = 'Deals didn’t load';
      $table.parentNode.hidden = true;
      $empty.hidden = false;
      el('empty-msg').textContent = 'The deal list didn’t load. Refresh the page to try again.';
      el('reset').hidden = true;
    });
})();
