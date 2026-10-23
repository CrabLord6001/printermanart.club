// Catalogue popovers: one open at a time, dismissed by clicking away or Escape.
// The <details> element handles open/close on its own; this only adds dismissal.
(function () {
  var sel = "details.cite";
  function closeAll(except) {
    document.querySelectorAll(sel + "[open]").forEach(function (d) {
      if (d !== except) d.open = false;
    });
  }
  // "toggle" does not bubble, so listen in the capture phase.
  document.addEventListener("toggle", function (e) {
    if (e.target.matches && e.target.matches(sel) && e.target.open) closeAll(e.target);
  }, true);
  document.addEventListener("click", function (e) {
    var inside = e.target.closest ? e.target.closest(sel) : null;
    closeAll(inside);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeAll(null);
  });
}());
