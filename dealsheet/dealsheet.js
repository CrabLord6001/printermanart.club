/* DealSheet: renders deals.json as a filterable, sortable table.
   Restaurant picks, ZIP code and controls persist in localStorage. No accounts, no tracking.
   ZIP -> coordinates via api.zippopotam.us; nearest stores via OpenStreetMap's Overpass API. */
(function () {
  'use strict';

  var STORE = 'dealsheet:v1';
  var NEAR_CACHE = 'dealsheet:near:v1';
  var RADIUS_MI = 15; // default; visitors change it with the slider
  var OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
  var HOW_LABEL = { 'in-store': 'In restaurant', 'drive-thru': 'Drive-thru', app: 'App', online: 'Online', delivery: 'Delivery' };
  var CHECK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5 5 9l5-6" fill="none" stroke="#F4C542" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CHEV = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var el = function (id) { return document.getElementById(id); };
  var $rows = el('rows'), $chips = el('chips'), $count = el('sheet-h'), $empty = el('empty'),
      $q = el('q'), $how = el('how'), $sort = el('sort'), $noapp = el('noapp'), $table = el('deals'),
      $picker = el('picker'), $edit = el('edit-picks'), $chainQ = el('chain-q'),
      $zip = el('zip'), $nearStatus = el('near-status'), $zipClear = el('zip-clear');

  var data = { deals: [], chains: [] };
  var chains = [];          // all chain names, A to Z
  var chainInfo = {};       // name -> { ios: App Store id, web: official site }
  var UA = navigator.userAgent || '';
  var IS_IOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  var IS_ANDROID = /Android/.test(UA);
  var osmNames = {};        // chain -> [brand names used on OpenStreetMap]
  var state = load(STORE);
  var near = null;          // { zip, lat, lon, state, place, stores: {chain: {mi, lat, lon}} | null, failed }
  var openId = null;

  function load(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* private mode */ } }
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
  function isLive(d) { return !(d.end && daysUntil(d.end) < 0); }

  // ---------- Location ----------
  function miles(lat1, lon1, lat2, lon2) {
    var R = 3958.8, r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function timeoutFetch(url, opts, ms) {
    var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, ms);
    opts = opts || {}; opts.signal = ac.signal;
    return fetch(url, opts).finally(function () { clearTimeout(t); });
  }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '\\"'); }

  function lookupZip(zip) {
    return timeoutFetch('https://api.zippopotam.us/us/' + zip, {}, 10000).then(function (r) {
      if (r.status === 404) throw new Error('nozip');
      if (!r.ok) throw new Error('zipfail');
      return r.json();
    }).then(function (j) {
      var p = j.places[0];
      return { zip: zip, lat: +p.latitude, lon: +p.longitude, state: p['state abbreviation'], place: p['place name'] };
    });
  }

  // One brand-tag query for the visitor's own restaurants; the first mirror to answer wins.
  // (Public Overpass servers are busy, so the query stays small: picked chains, brand tag only.)
  function lookupStores(loc, list) {
    var names = [];
    list.forEach(function (c) { (osmNames[c] || [c]).forEach(function (n) { names.push(reEsc(n)); }); });
    var q = '[out:json][timeout:40];nwr["brand"~"^(' + names.join('|') + ')$"](around:' +
            Math.round(radius() * 1609) + ',' + loc.lat + ',' + loc.lon + ');out center;';
    var body = 'data=' + encodeURIComponent(q);
    var tries = OVERPASS.map(function (u) {
      return timeoutFetch(u, { method: 'POST', body: body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 45000)
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    });
    return Promise.any(tries).then(function (j) {
      var lookup = {};
      list.forEach(function (c) { (osmNames[c] || [c]).forEach(function (n) { lookup[n] = c; }); });
      var best = {};
      j.elements.forEach(function (e) {
        var t = e.tags || {}, c = lookup[t.brand];
        var lat = e.lat != null ? e.lat : e.center && e.center.lat, lon = e.lon != null ? e.lon : e.center && e.center.lon;
        if (!c || lat == null) return;
        var mi = miles(loc.lat, loc.lon, lat, lon);
        if (!best[c] || mi < best[c].mi) best[c] = { mi: mi, lat: lat, lon: lon };
      });
      return best;
    });
  }

  function radius() { return Math.min(30, Math.max(1, +state.radius || RADIUS_MI)); }
  function showRadius() {
    var r = radius();
    el('radius').value = r;
    el('radius-out').textContent = r + (r === 1 ? ' mile' : ' miles');
  }

  function setNearStatus(msg, err) { $nearStatus.textContent = msg; $nearStatus.classList.toggle('err', !!err); }

  function applyZip(zip, fromLoad) {
    if (!/^\d{5}$/.test(zip)) { setNearStatus('Enter a 5-digit ZIP code.', true); return; }
    var cache = load(NEAR_CACHE);
    var key = picked().slice().sort().join('|') + '@' + radius();
    var fresh = cache.zip === zip && cache.key === key && Date.now() - (cache.at || 0) < 7 * 864e5;
    state.zip = zip; save();
    $zipClear.hidden = false;
    el('radius-wrap').hidden = false;
    el('sort-near').disabled = false;
    if (fresh) { near = cache.near; afterNear(); return; }
    setNearStatus('Looking up ' + zip + '…');
    el('radius-wrap').hidden = false;
    lookupZip(zip).then(function (loc) {
      near = loc; near.stores = null;
      afterNear();
      setNearStatus('Showing for ' + loc.place + '. Finding stores…');
      if (!state.picks || !picked().length) { near.stores = null; near.needPicks = true; afterNear(); return; }
      near.needPicks = false;
      return lookupStores(loc, picked()).then(function (stores) {
        near.stores = stores; near.failed = false;
        try { localStorage.setItem(NEAR_CACHE, JSON.stringify({ zip: zip, near: near, at: Date.now(), key: key })); } catch (e) { /* ignore */ }
        afterNear();
      }, function () {
        near.failed = true; afterNear();
      });
    }, function (err) {
      if (!fromLoad || err.message === 'nozip') {
        setNearStatus(err.message === 'nozip' ? 'We couldn’t find ZIP code ' + zip + '. Check the number and try again.' : 'The ZIP lookup didn’t respond. Try again in a moment.', true);
      }
    });
  }

  function afterNear() {
    if (!near) { setNearStatus(''); render(); renderMine(); return; }
    var where = near.place;
    if (near.needPicks) setNearStatus('Showing for ' + where + '. Choose restaurants to see distances.');
    else if (near.failed) setNearStatus('Showing for ' + where + '. Distances didn’t load, so rows link to a map.');
    else setNearStatus('Showing for ' + where + (near.stores ? '' : '. Finding stores…'));
    renderChips(); renderMine(); render();
  }

  function clearZip() {
    near = null; delete state.zip; save();
    $zip.value = ''; $zipClear.hidden = true; el('radius-wrap').hidden = true;
    var o = el('sort-near'); o.disabled = true;
    if ($sort.value === 'near') { $sort.value = 'ends'; persistControls(); }
    setNearStatus(''); renderChips(); renderMine(); render();
  }

  function distHtml(chain) {
    if (!near) return '';
    var s = near.stores && near.stores[chain];
    if (s) {
      var url = 'https://www.google.com/maps/dir/?api=1&destination=' + s.lat.toFixed(5) + ',' + s.lon.toFixed(5);
      return '<span class="dist"><a href="' + url + '" target="_blank" rel="noopener" aria-label="Directions to the nearest ' + esc(chain) + ', ' + s.mi.toFixed(1) + ' miles away">' + s.mi.toFixed(1) + ' mi away</a></span>';
    }
    var search = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(chain + ' near ' + near.zip);
    if (near.stores) return '<span class="dist far">None within ' + radius() + ' mi · <a href="' + search + '" target="_blank" rel="noopener">Map</a></span>';
    return '<span class="dist"><a href="' + search + '" target="_blank" rel="noopener">Find on map</a></span>';
  }
  function distOf(chain) { var s = near && near.stores && near.stores[chain]; return s ? s.mi : 1e9; }

  // ---------- Table ----------
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
    if (d.areas && d.areas.length) out.unshift('<span class="tag area">Only in ' + esc(d.areas.join(', ')) + '</span>');
    if (d.rewards) out.push('<span class="tag rewards">Rewards members</span>');
    if (d.code) out.push('<span class="tag code" title="Promo code">Code ' + esc(d.code) + '</span>');
    if (!out.length) out.push('<span class="tag">Not stated</span>');
    return '<div class="tags">' + out.join('') + '</div>';
  }
  // The button that starts the order. App deals go to the store listing, which
  // shows "Open" when the app is already installed; online deals go to the
  // deal's own page on the chain's site, or the site's home page.
  function goLink(d) {
    var info = chainInfo[d.chain] || {}, how = d.how || [];
    var online = how.indexOf('online') !== -1 || how.indexOf('delivery') !== -1;
    var app = d.app_only || how.indexOf('app') !== -1;
    var href, label;
    if (online && !d.app_only && (d.official || info.web)) {
      href = d.official || info.web; label = 'Order online';
    } else if (app && (d.app_ios || info.ios || IS_ANDROID)) {
      if (IS_ANDROID) href = 'https://play.google.com/store/search?q=' + encodeURIComponent(d.chain) + '&c=apps';
      else href = 'https://apps.apple.com/us/app/id' + (d.app_ios || info.ios);
      label = (IS_IOS || IS_ANDROID) ? 'Open app' : 'Get the app';
    } else if (app && info.web) {
      href = info.web; label = 'Open site';
    }
    if (!href) return '';
    return '<a class="go" href="' + esc(href) + '" target="_blank" rel="noopener">' + label + '</a>';
  }

  function detailRow(d) {
    var src = '<p><a href="' + esc(d.source.url) + '" target="_blank" rel="noopener">' + esc(d.source.name) + '</a></p>';
    if (d.official) src += '<p><a href="' + esc(d.official) + '" target="_blank" rel="noopener">' + esc(d.chain) + "'s own page</a></p>";
    return '<tr class="detail" id="detail-' + esc(d.id) + '"><td colspan="6"><div class="detail-body">' +
      '<div><h3>Fine print</h3><p>' + esc(d.fine_print || 'None stated by the source. Check with the restaurant.') + '</p></div>' +
      '<div class="src"><h3>Source</h3>' + src + '</div>' +
      '</div></td></tr>';
  }

  function picked() {
    if (!state.picks) return chains.slice();
    return state.picks.filter(function (c) { return chains.indexOf(c) !== -1; });
  }
  function inArea(d) {
    if (!d.areas || !d.areas.length || !near) return true;
    return d.areas.indexOf(near.state) !== -1 || d.areas.indexOf(near.zip) !== -1;
  }

  function visible() {
    var picks = picked(), q = ($q.value || '').trim().toLowerCase(), how = $how.value;
    var list = data.deals.filter(function (d) {
      if (!isLive(d) || picks.indexOf(d.chain) === -1 || !inArea(d)) return false;
      if ($noapp.checked && d.app_only) return false;
      if (how) {
        var h = d.how || [];
        if (how === 'app' ? (h.indexOf('app') === -1 && h.indexOf('online') === -1) : h.indexOf(how) === -1) return false;
      }
      if (q && [d.chain, d.title, d.details, d.fine_print, d.code].join(' ').toLowerCase().indexOf(q) === -1) return false;
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
      new: function (a, b) { return (b.added || '').localeCompare(a.added || '') || endKey(a) - endKey(b); },
      near: function (a, b) { return distOf(a.chain) - distOf(b.chain) || a.chain.localeCompare(b.chain) || endKey(a) - endKey(b); }
    };
    return list.sort(by[$sort.value] || by.ends);
  }

  function liveCounts() {
    var counts = {};
    data.deals.forEach(function (d) { if (isLive(d) && inArea(d)) counts[d.chain] = (counts[d.chain] || 0) + 1; });
    return counts;
  }

  function renderChips() {
    var counts = liveCounts(), picks = picked(), q = ($chainQ.value || '').trim().toLowerCase();
    var shown = chains.filter(function (c) { return !q || c.toLowerCase().indexOf(q) !== -1; });
    $chips.innerHTML = shown.length ? shown.map(function (c) {
      var on = !!state.picks && picks.indexOf(c) !== -1, n = counts[c] || 0;
      return '<button type="button" class="chip" aria-pressed="' + on + '" data-chain="' + esc(c) + '">' +
        '<span class="box">' + CHECK + '</span>' + esc(c) +
        ' <span class="n' + (n ? '' : ' zero') + '">' + (n ? n + (n === 1 ? ' deal' : ' deals') : 'no deals yet') + '</span></button>';
    }).join('') : '<p class="none">No restaurant matches “' + esc($chainQ.value) + '”.</p>';
  }

  function renderMine() {
    var picks = picked(), $l = el('mine-list');
    if (!state.picks || picks.length === chains.length) {
      $l.innerHTML = 'All <strong>' + chains.length + ' restaurants</strong>. Choose yours to cut the list down.';
    } else if (!picks.length) {
      $l.textContent = 'No restaurants chosen yet.';
    } else {
      var names = picks.slice().sort(function (a, b) { return distOf(a) - distOf(b) || a.localeCompare(b); });
      var shown = names.slice(0, 5).map(function (c) {
        var s = near && near.stores && near.stores[c];
        return '<strong>' + esc(c) + '</strong>' + (s ? ' (' + s.mi.toFixed(1) + ' mi)' : '');
      });
      $l.innerHTML = shown.join(', ') + (names.length > 5 ? ', and ' + (names.length - 5) + ' more' : '');
    }
    $edit.textContent = $picker.hidden ? (state.picks ? 'Edit restaurants' : 'Choose restaurants') : 'Close';
  }

  function render() {
    var list = visible(), picks = picked();
    var places = {}; list.forEach(function (d) { places[d.chain] = 1; });
    var np = Object.keys(places).length;
    $count.textContent = list.length + (list.length === 1 ? ' deal' : ' deals') +
      (list.length ? ' at ' + np + (np === 1 ? ' place' : ' places') : '');

    $rows.innerHTML = list.map(function (d, i) {
      var open = openId === d.id, alt = i % 2 ? ' alt' : '';
      return '<tr class="deal' + alt + (open ? ' open' : '') + '">' +
        '<td class="c-chain">' + esc(d.chain) + distHtml(d.chain) + '</td>' +
        '<td class="c-deal"><span class="t">' + esc(d.title) + '</span><span class="d">' + esc(d.details) + '</span></td>' +
        '<td class="c-price">' + priceCell(d) + '</td>' +
        '<td class="c-ends">' + endsCell(d) + '</td>' +
        '<td class="c-how">' + tags(d) + '</td>' +
        '<td class="c-more">' + goLink(d) + '<button type="button" class="more" data-id="' + esc(d.id) + '" aria-expanded="' + open + '" aria-controls="detail-' + esc(d.id) + '">' +
        (open ? 'Hide' : 'Fine print') + CHEV + '</button></td>' +
        '</tr>' + (open ? detailRow(d).replace('class="detail"', 'class="detail' + alt + '"') : '');
    }).join('');

    var none = !list.length;
    $table.parentNode.hidden = none;
    $empty.hidden = !none;
    if (none) {
      el('empty-msg').textContent = !picks.length
        ? 'Choose at least one restaurant to see its deals.'
        : 'None of your restaurants has a deal matching these filters right now.';
    }
  }

  function persistControls() {
    state.q = $q.value; state.how = $how.value; state.sort = $sort.value; state.noapp = $noapp.checked;
    save();
  }
  var picksAtOpen = '';
  function setPicker(open) {
    var key = picked().slice().sort().join('|');
    if (open) picksAtOpen = key;
    else if (near && state.zip && key !== picksAtOpen) applyZip(state.zip);
    $picker.hidden = !open;
    $edit.setAttribute('aria-expanded', open);
    renderMine();
    if (open) { renderChips(); $chainQ.focus(); } else { $edit.focus(); }
  }

  // ---------- Events ----------
  $edit.addEventListener('click', function () { setPicker($picker.hidden); });
  el('done-picks').addEventListener('click', function () { setPicker(false); });
  $picker.addEventListener('keydown', function (e) { if (e.key === 'Escape') setPicker(false); });
  $chainQ.addEventListener('input', renderChips);
  $chips.addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    var c = b.getAttribute('data-chain');
    // First pick replaces "everything" with just that restaurant.
    var picks = state.picks ? picked() : [], i = picks.indexOf(c);
    if (i === -1) picks.push(c); else picks.splice(i, 1);
    state.picks = picks; save();
    renderChips(); renderMine(); render();
  });
  $picker.querySelector('.picker-actions').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pick]'); if (!b) return;
    state.picks = b.getAttribute('data-pick') === 'all' ? chains.slice() : [];
    save(); renderChips(); renderMine(); render();
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
  el('near-form').addEventListener('submit', function (e) { e.preventDefault(); applyZip(($zip.value || '').trim()); });
  $zipClear.addEventListener('click', clearZip);
  el('radius').addEventListener('input', function () { state.radius = +this.value; showRadius(); });
  el('radius').addEventListener('change', function () { state.radius = +this.value; save(); if (state.zip) applyZip(state.zip); });
  el('reset').addEventListener('click', function () {
    $q.value = ''; $how.value = ''; $noapp.checked = false;
    persistControls(); render();
    if (!picked().length) setPicker(true);
  });

  // Restore controls
  showRadius();
  el('radius-wrap').hidden = !state.zip;
  if (state.q) $q.value = state.q;
  if (state.how) $how.value = state.how;
  $noapp.checked = !!state.noapp;

  fetch('deals.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (json) {
      data = json;
      var seen = {};
      (data.chains || []).forEach(function (c) {
        seen[c.name] = 1;
        chainInfo[c.name] = { ios: c.ios, web: c.web };
        var list = (c.osm || [c.name]).slice();
        list.forEach(function (n) { if (n.indexOf("'") !== -1) list.push(n.replace(/'/g, '\u2019')); });
        osmNames[c.name] = list;
      });
      data.deals.forEach(function (d) { if (isLive(d)) seen[d.chain] = 1; });
      chains = Object.keys(seen).sort(function (a, b) { return a.localeCompare(b); });
      if (data.updated) {
        var u = new Date(data.updated);
        el('updated').textContent = 'Last checked ' + u.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + '.';
      }
      if (state.zip) { $zip.value = state.zip; applyZip(state.zip, true); }
      if (state.sort && (state.sort !== 'near' || state.zip)) $sort.value = state.sort;
      renderChips(); renderMine(); render();
    })
    .catch(function () {
      $count.textContent = 'Deals didn’t load';
      $table.parentNode.hidden = true;
      $empty.hidden = false;
      el('empty-msg').textContent = 'The deal list didn’t load. Refresh the page to try again.';
      el('reset').hidden = true;
    });
})();
