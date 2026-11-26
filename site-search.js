/* Site search for the homepage menu.
   No index file to keep up to date: on first use it reads sitemap.xml, fetches
   each listed page, and searches page titles, descriptions and h1/h2 headings
   (artwork titles, news headlines, game names). Pages not in the sitemap, and
   /dealsheet/, are left out. A result for a heading links with a text fragment
   so supporting browsers scroll to it. */
(function () {
  var form = document.getElementById('site-search');
  if (!form) return;
  var input = form.querySelector('input');
  var list = document.getElementById('site-search-results');
  var SKIP = ['/dealsheet/'];
  var docs = null, loading = null, active = -1, shown = [];

  function norm(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function load() {
    if (loading) return loading;
    loading = fetch('/sitemap.xml').then(function (r) { return r.text(); }).then(function (xml) {
      var urls = Array.prototype.map.call(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('loc'),
        function (n) { return new URL(n.textContent.trim()).pathname; })
        .filter(function (p) { return SKIP.indexOf(p) === -1; });
      return Promise.all(urls.map(function (path) {
        return fetch(path).then(function (r) { return r.ok ? r.text() : ''; }).then(function (html) {
          if (!html) return [];
          var d = new DOMParser().parseFromString(html, 'text/html');
          var title = (d.title || path).split(/\s+[—|–-]\s+/)[0].trim();
          var desc = (d.querySelector('meta[name="description"]') || {}).content || '';
          var out = [{ path: path, page: title, text: title, sub: desc, kind: 'page' }];
          d.querySelectorAll('main h2, main h3, article h2, h2').forEach(function (h) {
            var t = h.textContent.replace(/\s+/g, ' ').trim();
            if (t && t.length < 160 && !out.some(function (o) { return o.text === t; })) {
              out.push({ path: path, page: title, text: t, sub: title, kind: 'heading' });
            }
          });
          return out;
        }).catch(function () { return []; });
      }));
    }).then(function (all) {
      docs = [].concat.apply([], all);
      docs.forEach(function (d) { d.n = norm(d.text); d.ns = norm(d.sub); });
      return docs;
    }).catch(function () { loading = null; docs = []; return docs; });
    return loading;
  }

  function search(q) {
    var words = norm(q).split(' ').filter(Boolean);
    if (!words.length) return [];
    return docs.map(function (d) {
      var score = 0;
      for (var i = 0; i < words.length; i++) {
        var w = words[i], inText = d.n.indexOf(w), inSub = d.ns.indexOf(w);
        if (inText === -1 && inSub === -1) return null;
        score += inText === 0 ? 6 : inText > 0 ? (d.n.indexOf(' ' + w) !== -1 ? 4 : 2) : 1;
      }
      if (d.kind === 'page') score += 2;
      return { d: d, score: score };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score || a.d.text.length - b.d.text.length; })
      .slice(0, 8).map(function (x) { return x.d; });
  }

  function href(d) {
    return d.kind === 'heading' ? d.path + '#:~:text=' + encodeURIComponent(d.text) : d.path;
  }

  function render(q) {
    shown = docs ? search(q) : [];
    active = -1;
    if (!q.trim()) { close(); return; }
    list.innerHTML = !docs ? '<li class="ss-note">Searching…</li>'
      : shown.length ? shown.map(function (d, i) {
          return '<li role="option" id="ss-opt-' + i + '"><a href="' + esc(href(d)) + '"><span class="ss-t">' + esc(d.text) +
            '</span><span class="ss-s">' + esc(d.kind === 'page' ? (d.sub || 'Page') : d.page) + '</span></a></li>';
        }).join('')
      : '<li class="ss-note">Nothing on the site matches “' + esc(q.trim()) + '”.</li>';
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function close() {
    list.hidden = true; list.innerHTML = ''; active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function move(step) {
    if (!shown.length) return;
    active = (active + step + shown.length) % shown.length;
    list.querySelectorAll('li[role="option"]').forEach(function (li, i) { li.classList.toggle('on', i === active); });
    input.setAttribute('aria-activedescendant', 'ss-opt-' + active);
  }

  input.addEventListener('focus', load);
  input.addEventListener('input', function () {
    var q = input.value;
    render(q);
    if (!docs) load().then(function () { if (input.value === q) render(q); });
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Escape') { close(); }
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var pick = shown[active] || shown[0];
    if (pick) location.href = href(pick);
  });
  document.addEventListener('click', function (e) { if (!form.contains(e.target)) close(); });
})();
