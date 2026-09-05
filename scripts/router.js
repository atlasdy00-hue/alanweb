// Site-wide: renders the publications list from data/publications.js,
// and the hash-based router that shows/hides the four pages.
(function () {
  // ---------- Render publications from the JSON data block ----------
  function renderPublications() {
    var mount = document.getElementById('pub-list');
    var data = (window.PUBLICATIONS || []).slice();

    if (!data.length) {
      var empty = document.createElement('li');
      empty.className = 'pub-empty';
      empty.textContent = 'No publications listed yet.';
      mount.appendChild(empty);
      return;
    }

    data.sort(function (a, b) { return (b.year || 0) - (a.year || 0); });

    data.forEach(function (p) {
      var li = document.createElement('li');
      li.className = 'pub';

      var year = document.createElement('span');
      year.className = 'pub-year';
      year.textContent = p.year || '';
      li.appendChild(year);

      var body = document.createElement('div');

      var titleP = document.createElement('p');
      titleP.className = 'pub-title';
      var a = document.createElement('a');
      a.href = p.link || '#';
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = p.title || 'Untitled';
      titleP.appendChild(a);
      body.appendChild(titleP);

      var authorsP = document.createElement('p');
      authorsP.className = 'pub-authors';
      (p.authors || []).forEach(function (author, i) {
        if (i > 0) authorsP.appendChild(document.createTextNode(', '));
        var node;
        if (author.me) {
          node = document.createElement('span');
          node.className = 'me';
          node.textContent = author.name;
        } else {
          node = document.createTextNode(author.name);
        }
        authorsP.appendChild(node);
      });
      body.appendChild(authorsP);

      var venueP = document.createElement('p');
      venueP.className = 'pub-venue';
      venueP.appendChild(document.createTextNode(p.venue || ''));
      if (p.citedBy != null) {
        var meta = document.createElement('span');
        meta.className = 'pub-meta';
        meta.textContent = 'cited by ' + p.citedBy;
        venueP.appendChild(meta);
      }
      body.appendChild(venueP);

      li.appendChild(body);
      mount.appendChild(li);
    });
  }

  // ---------- Page router ----------
  var PAGES = ['home', 'teaching', 'biography', 'contact'];

  function currentRoute() {
    return location.hash.replace(/^#\/?/, '') || '';
  }

  function render() {
    var raw = currentRoute();
    var page = PAGES.indexOf(raw) !== -1 ? raw : 'home';

    PAGES.forEach(function (p) {
      var el = document.getElementById('page-' + p);
      if (el) el.hidden = (p !== page);
    });

    var navTarget = (page === 'home' && raw) ? raw : page;
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === navTarget);
    });

    if (page === 'home' && raw && raw !== 'home') {
      var target = document.getElementById(raw);
      if (target) {
        requestAnimationFrame(function () {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        return;
      }
    }
    window.scrollTo(0, 0);
  }

  renderPublications();
  window.addEventListener('hashchange', render);
  render();
})();
