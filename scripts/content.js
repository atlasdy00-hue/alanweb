// Reads the plain-text content files (content/*.js, each just a "## Heading"
// / paragraph document assigned to a window global) and fills in the page.
// This is the only script that needs to know the "## Heading" convention —
// everything else just sees regular HTML once this has run.
(function () {
  function parseSections(text) {
    var sections = {};
    var order = [];
    var current = null;
    (text || '').split('\n').forEach(function (line) {
      var m = /^##\s+(.+?)\s*$/.exec(line);
      if (m) {
        current = m[1];
        sections[current] = [];
        order.push(current);
      } else if (current !== null) {
        sections[current].push(line);
      }
    });
    var out = { __order: order };
    order.forEach(function (key) {
      out[key] = sections[key].join('\n').replace(/^\n+|\n+$/g, '');
    });
    return out;
  }

  function escapeHtml(s) {
    return (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function isPlaceholder(s) {
    return /^\[[\s\S]*\]$/.test((s || '').trim());
  }

  // Renders "**bold**" as <strong> and "[label](url)" as a link (relative
  // urls — e.g. files committed to the repo — open in the same tab, http(s)
  // urls open in a new tab). A whole value in [brackets] with no "(url)"
  // after it is left alone: that's the not-yet-filled-in placeholder form.
  function inline(s) {
    return escapeHtml(s)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, url) {
        var external = /^https?:\/\//i.test(url);
        return '<a href="' + url + '"' +
          (external ? ' target="_blank" rel="noopener"' : '') +
          '>' + label + '</a>';
      })
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function paragraphsHtml(s) {
    return (s || '')
      .split(/\n\s*\n/)
      .map(function (p) { return p.trim(); })
      .filter(Boolean)
      .map(function (p) { return '<p>' + inline(p) + '</p>'; })
      .join('');
  }

  function applyPlaceholder(el, rawText) {
    if (el) el.classList.toggle('placeholder', isPlaceholder(rawText));
  }

  function fillInline(selector, text) {
    var el = document.querySelector(selector);
    if (!el) return;
    el.innerHTML = inline(text);
    applyPlaceholder(el, text);
  }

  // ---------------------------------------------------------------- Home
  function renderHome() {
    var s = parseSections(window.CONTENT_HOME);

    fillInline('[data-slot="tagline"]', s['Tagline']);
    fillInline('[data-slot="currently"]', s['Currently']);
    fillInline('[data-slot="research-lede"]', s['Research lede']);

    var eduRows = document.querySelector('[data-slot="education-rows"]');
    if (eduRows) {
      eduRows.innerHTML = '';
      var institutions = (s['Education institution'] || '').split('\n');
      var details = (s['Education details'] || '').split('\n');
      var years = (s['Education year'] || '').split('\n');
      var count = Math.max(institutions.length, details.length, years.length);
      for (var i = 0; i < count; i++) {
        var institution = institutions[i] || '';
        var detail = details[i] || '';
        var year = years[i] || '';
        if (!institution.trim() && !detail.trim() && !year.trim()) continue;

        var row = document.createElement('div');
        row.className = 'edu-row';

        var main = document.createElement('div');
        main.className = 'edu-main';

        var strong = document.createElement('strong');
        strong.innerHTML = inline(institution);
        applyPlaceholder(strong, institution);

        var span = document.createElement('span');
        span.innerHTML = inline(detail);
        applyPlaceholder(span, detail);

        main.appendChild(strong);
        main.appendChild(span);

        var yearEl = document.createElement('div');
        yearEl.className = 'edu-year';
        yearEl.innerHTML = inline(year);
        applyPlaceholder(yearEl, year);

        row.appendChild(main);
        row.appendChild(yearEl);
        eduRows.appendChild(row);
      }
    }

    var grid = document.querySelector('[data-slot="interests"]');
    if (grid) {
      grid.innerHTML = '';
      s.__order.forEach(function (key) {
        var m = /^Interest:\s*(.+)$/.exec(key);
        if (!m) return;
        var card = document.createElement('div');
        card.className = 'interest-card';
        var h3 = document.createElement('h3');
        h3.textContent = m[1];
        var p = document.createElement('p');
        p.innerHTML = inline(s[key]);
        card.appendChild(h3);
        card.appendChild(p);
        grid.appendChild(card);
      });
    }

    // "## Skill: <Category> / <Subgroup>" sections group into a
    // per-category block, each holding one label+description row per
    // subgroup. "## Skill: <Category>" alone (no "/") also works, just
    // without a subgroup label on the row.
    var skillGroups = document.querySelector('[data-slot="skills"]');
    if (skillGroups) {
      skillGroups.innerHTML = '';
      var categories = {};
      var categoryOrder = [];
      s.__order.forEach(function (key) {
        var m = /^Skills?\s*:\s*(.+)$/i.exec(key);
        if (!m) return;
        var slash = m[1].indexOf('/');
        var category = (slash === -1 ? m[1] : m[1].slice(0, slash)).trim();
        var subgroup = slash === -1 ? '' : m[1].slice(slash + 1).trim();
        if (!categories[category]) {
          categories[category] = [];
          categoryOrder.push(category);
        }
        categories[category].push({ subgroup: subgroup, text: s[key] });
      });

      categoryOrder.forEach(function (category) {
        var block = document.createElement('div');
        block.className = 'skill-category';

        var h3 = document.createElement('h3');
        h3.textContent = category;
        block.appendChild(h3);

        categories[category].forEach(function (row) {
          var rowEl = document.createElement('div');
          rowEl.className = 'skill-row';
          if (row.subgroup) {
            var label = document.createElement('span');
            label.className = 'skill-label';
            label.textContent = row.subgroup;
            rowEl.appendChild(label);
          }
          var desc = document.createElement('p');
          desc.className = 'skill-desc';
          desc.innerHTML = inline(row.text);
          applyPlaceholder(desc, row.text);
          rowEl.appendChild(desc);
          block.appendChild(rowEl);
        });

        skillGroups.appendChild(block);
      });
    }
  }

  // ------------------------------------------------------------ Teaching
  function renderTeaching() {
    var s = parseSections(window.CONTENT_TEACHING);

    var intro = document.querySelector('[data-slot="teaching-intro"]');
    if (intro) {
      intro.innerHTML = paragraphsHtml(s['Intro']);
      applyPlaceholder(intro, s['Intro']);
    }

    var list = document.querySelector('[data-slot="teaching-rows"]');
    if (list) {
      list.innerHTML = '';
      var panelSeq = 0;
      s.__order.forEach(function (key) {
        if (key === 'Intro') return;
        var raw = s[key] || '';

        // First line is the role itself; any following paragraphs are the
        // expandable "subject & methods" note revealed by the arrow.
        var nl = raw.indexOf('\n');
        var roleLine = (nl === -1 ? raw : raw.slice(0, nl)).trim();
        var detailsText = nl === -1 ? '' : raw.slice(nl + 1).replace(/^\s+/, '');

        // The role line may optionally carry a "[years]" segment anywhere
        // in the text and a "— faculty" tail; both are split off from the
        // role title and shown on their own lines. Plain lines with
        // neither still render as before.
        var years = '';
        var body = roleLine.replace(/\[([^\]]+)\]/, function (_, y) {
          years = y.trim();
          return '';
        });

        var faculty = '';
        var dash = body.search(/\s[—–]\s/);
        if (dash !== -1) {
          faculty = body.slice(dash).replace(/^\s[—–]\s/, '').trim();
          body = body.slice(0, dash);
        }
        var title = body.replace(/\s{2,}/g, ' ').trim();

        var li = document.createElement('li');
        li.className = 'contact-item teach-item';

        var hasDetails = !!detailsText && !isPlaceholder(detailsText);
        var head = document.createElement(hasDetails ? 'button' : 'div');
        head.className = 'teach-head';

        var label = document.createElement('span');
        label.className = 'label';
        label.textContent = key.replace(/\s+\d+$/, '');

        var value = document.createElement('span');
        value.className = 'value';

        var titleEl = document.createElement('span');
        titleEl.className = 'teach-title';
        titleEl.innerHTML = inline(title);
        value.appendChild(titleEl);
        applyPlaceholder(value, roleLine);

        if (faculty) {
          var facultyEl = document.createElement('span');
          facultyEl.className = 'teach-faculty';
          facultyEl.innerHTML = inline(faculty);
          value.appendChild(facultyEl);
        }

        if (years) {
          var yearsEl = document.createElement('span');
          yearsEl.className = 'teach-year';
          yearsEl.innerHTML = inline(years);
          value.appendChild(yearsEl);
        }

        head.appendChild(label);
        head.appendChild(value);
        li.appendChild(head);

        if (hasDetails) {
          var panelId = 'teach-panel-' + (++panelSeq);
          head.type = 'button';
          head.setAttribute('aria-expanded', 'false');
          head.setAttribute('aria-controls', panelId);

          var arrow = document.createElement('span');
          arrow.className = 'teach-arrow';
          arrow.setAttribute('aria-hidden', 'true');
          head.appendChild(arrow);

          var details = document.createElement('div');
          details.className = 'teach-details';
          details.id = panelId;
          details.hidden = true;
          details.innerHTML = paragraphsHtml(detailsText);
          li.appendChild(details);

          head.addEventListener('click', function () {
            var open = head.getAttribute('aria-expanded') === 'true';
            head.setAttribute('aria-expanded', open ? 'false' : 'true');
            details.hidden = open;
          });
        }

        list.appendChild(li);
      });
    }
  }

  // ----------------------------------------------------------- Biography
  function renderBiography() {
    var s = parseSections(window.CONTENT_BIOGRAPHY);
    var mount = document.querySelector('[data-slot="bio-copy"]');
    if (!mount) return;

    mount.innerHTML = '';

    s.__order.forEach(function (key) {
      if (/^Paragraph\s+\d+$/.test(key)) {
        mount.innerHTML += paragraphsHtml(s[key]);
      }
    });

    if (s['Quote'] !== undefined) {
      var quote = document.createElement('div');
      quote.className = 'bio-quote';
      quote.innerHTML = inline(s['Quote']);
      applyPlaceholder(quote, s['Quote']);
      mount.appendChild(quote);
    }

    if (s['Looking for'] !== undefined) {
      var lookingFor = document.createElement('p');
      lookingFor.innerHTML = inline(s['Looking for']);
      applyPlaceholder(lookingFor, s['Looking for']);
      mount.appendChild(lookingFor);
    }

    if (s['Outside the lab'] !== undefined) {
      var outsideLab = document.createElement('p');
      outsideLab.innerHTML = inline(s['Outside the lab']);
      applyPlaceholder(outsideLab, s['Outside the lab']);
      mount.appendChild(outsideLab);
    }
  }

  // ------------------------------------------------------------- Contact
  // Turns a raw contact value into { href, text } for its field kind.
  function contactLink(kind, value) {
    if (kind === 'orcid') {
      var id = value.replace(/^https?:\/\/(www\.)?orcid\.org\//i, '');
      return { href: 'https://orcid.org/' + id, text: id };
    }
    // generic URL (LinkedIn, GitHub, …)
    var href = /^https?:\/\//i.test(value) ? value : 'https://' + value;
    var text = value;
    try { text = decodeURIComponent(value); } catch (e) { /* keep raw */ }
    text = text.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
    return { href: href, text: text };
  }

  function renderContact() {
    var s = parseSections(window.CONTENT_CONTACT);

    var fields = [
      { key: 'Email', slot: 'contact-email', kind: 'text' },
      { key: 'ORCID', slot: 'contact-orcid', kind: 'orcid' },
      { key: 'GitHub', slot: 'contact-github', kind: 'url' },
      { key: 'LinkedIn', slot: 'contact-linkedin', kind: 'url' }
    ];

    fields.forEach(function (f) {
      var el = document.querySelector('[data-slot="' + f.slot + '"]');
      if (!el) return;
      var li = el.closest('.contact-item');
      var raw = (s[f.key] || '').trim();
      var placeholder = isPlaceholder(raw);
      var value = (placeholder ? raw.slice(1, -1) : raw).trim();

      // No value at all: drop the row rather than leave a dead link.
      if (!value) {
        if (li) li.style.display = 'none';
        return;
      }
      if (li) li.style.display = '';

      // Plain-text row (email): no anchor at all, so bots find no mailto:
      // and "<at>" stays on the page exactly as written.
      if (f.kind === 'text') {
        el.textContent = value;
        el.classList.toggle('placeholder', placeholder);
        return;
      }

      var link = el.querySelector('a') || el;
      var built = contactLink(f.kind, value);
      link.textContent = built.text;
      link.classList.toggle('placeholder', placeholder);

      if (placeholder) {
        // Still a placeholder — make it inert so it can't navigate anywhere.
        link.removeAttribute('href');
        link.removeAttribute('target');
        link.removeAttribute('rel');
        return;
      }

      link.href = built.href;
      if (f.kind === 'email') {
        link.removeAttribute('target');
        link.removeAttribute('rel');
      } else {
        link.target = '_blank';
        link.rel = 'noopener';
      }
    });
  }

  renderHome();
  renderTeaching();
  renderBiography();
  renderContact();
})();
