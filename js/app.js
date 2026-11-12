/* Stemen–Netzley Family Tree
   A dependency-free single-page app over data/family-tree.json. */
(function () {
  'use strict';

  // ------------------------------------------------------------------ constants
  const MAJOR_LINES = ['stemen', 'netzley', 'hesser', 'brooks', 'wood', 'ferguson'];
  const LINE_LABEL = {
    stemen: 'Stemen', netzley: 'Netzley', hesser: 'Hesser', brooks: 'Brooks', wood: 'Wood',
    ferguson: 'Ferguson', cary: 'Cary', both: 'Stemen & Netzley'
  };
  const MINORS = ['meadow-cary'];
  const CARD_W = 176, CARD_H = 112, SLOT = 192, ROW_H = 160;
  const PAD_T = 46, PAD_B = 40, PAD_L = 170, PAD_R = 60;
  const LS = {
    root: 'ft-root', living: 'ft-show-living', depth: 'ft-depth', todo: 'ft-todo-'
  };

  // ------------------------------------------------------------------ storage
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del(k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  // ------------------------------------------------------------------ state
  const state = {
    data: null,
    byId: new Map(),
    childrenOf: new Map(),
    partnersOf: new Map(),
    branch: new Map(),
    ancCache: new Map(),
    relCache: new Map(),
    root: null,
    showLiving: store.get(LS.living) !== '0',
    depth: parseInt(store.get(LS.depth) || '4', 10) || 4,
    expanded: new Set(),
    collapsed: new Set(),
    sibOpen: new Set(),
    famOpen: new Set(),
    zoom: 1,
    cardPos: new Map(),
    panelId: null
  };

  // ------------------------------------------------------------------ helpers
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const P = (id) => state.byId.get(id);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/["“”'’().,:;!?]/g, ' ').replace(/\s+/g, ' ').trim();

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function fmtDate(d) {
    if (!d) return '';
    const s = String(d);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
    m = s.match(/^(\d{4})-(\d{2})$/);
    if (m) return `${MONTHS[+m[2] - 1]} ${m[1]}`;
    return s;
  }
  function yearOf(d) {
    if (!d) return '';
    const s = String(d);
    const m = s.match(/\d{4}/);
    if (!m) return s.length < 14 ? s : '';
    const approx = /^(c\.|abt|about|ca\.?|bef|aft|~)/i.test(s.trim()) ? 'c. ' : '';
    return approx + m[0];
  }

  function isMinor(p) { return !!p && (p.redacted === 'minor' || p.minor === true || MINORS.includes(p.id)); }
  function detailsHidden(p) { return isMinor(p) || (!!p.living && !state.showLiving); }

  function lifespan(p) {
    if (isMinor(p)) return '';
    if (p.living && !state.showLiving) return 'Living';
    const b = yearOf(p.birth && p.birth.date), d = yearOf(p.death && p.death.date);
    if (b && d) return `${b} – ${d}`;
    if (b) return p.living ? `b. ${b}` : `b. ${b}`;
    if (d) return `d. ${d}`;
    return p.living ? 'Living' : '';
  }

  function firstName(p) {
    if (!p) return '';
    if (p.nickname) return p.nickname;
    const parts = String(p.name).replace(/\(.*?\)/g, ' ').replace(/".*?"/g, ' ').split(/\s+/).filter(Boolean);
    const titles = /^(rev\.?|deacon|dr\.?|bishop|mr\.?|mrs\.?|capt\.?|sgt\.?)$/i;
    const n = parts.find((t) => !titles.test(t));
    return n || p.name;
  }

  // ------------------------------------------------------------------ indexing
  function index(data) {
    state.data = data;
    data.people.forEach((p) => {
      p.parents = p.parents || [];
      p.spouses = p.spouses || [];
      p.children = p.children || [];
      state.byId.set(p.id, p);
    });
    const addPartner = (a, b) => {
      if (!state.byId.has(a) || !state.byId.has(b) || a === b) return;
      if (!state.partnersOf.has(a)) state.partnersOf.set(a, []);
      const l = state.partnersOf.get(a);
      if (!l.includes(b)) l.push(b);
    };
    data.people.forEach((p) => {
      p.parents.forEach((par) => {
        if (!state.byId.has(par)) return;
        if (!state.childrenOf.has(par)) state.childrenOf.set(par, []);
        const l = state.childrenOf.get(par);
        if (!l.includes(p.id)) l.push(p.id);
      });
      p.spouses.forEach((s) => { if (s.id) { addPartner(p.id, s.id); addPartner(s.id, p.id); } });
    });
    data.people.forEach((p) => {
      p.children.forEach((c) => {
        if (!c.id || !state.byId.has(c.id)) return;
        if (!state.childrenOf.has(p.id)) state.childrenOf.set(p.id, []);
        const l = state.childrenOf.get(p.id);
        if (!l.includes(c.id)) l.push(c.id);
      });
      // co-parents count as partners
      const ps = p.parents.filter((x) => state.byId.has(x));
      if (ps.length === 2) { addPartner(ps[0], ps[1]); addPartner(ps[1], ps[0]); }
    });
    data.people.forEach((p) => state.branch.set(p.id, computeBranch(p.id)));
  }

  function parentsOf(id) {
    const p = P(id);
    if (!p) return [];
    return p.parents.filter((x) => state.byId.has(x))
      .sort((a, b) => sexRank(P(a)) - sexRank(P(b)));
  }
  function sexRank(p) { return p.sex === 'M' ? 0 : p.sex === 'F' ? 1 : 2; }
  function childrenOf(id) { return state.childrenOf.get(id) || []; }
  function partnersOf(id) { return state.partnersOf.get(id) || []; }
  function siblingsOf(id) {
    const ps = parentsOf(id);
    const out = [];
    ps.forEach((par) => childrenOf(par).forEach((c) => { if (c !== id && !out.includes(c)) out.push(c); }));
    return out;
  }

  function computeBranch(id, guard) {
    const down = computeBranchDown(id);
    if (down !== 'both' || P(id).line === 'both') return down;
    // Siblings and their families: take the colour of a parent's (or spouse's) side.
    guard = guard || new Set();
    guard.add(id);
    for (const x of parentsOf(id).concat(partnersOf(id))) {
      if (guard.has(x)) continue;
      const b = computeBranch(x, guard);
      if (b !== 'both') return b;
    }
    return 'both';
  }
  function computeBranchDown(id) {
    const p = P(id);
    if (!p) return 'both';
    if (MAJOR_LINES.includes(p.line) || p.line === 'both' || p.line === 'cary') return p.line;
    // Walk down through children until we reach a person on a major line.
    const seen = new Set([id]);
    let frontier = [id];
    while (frontier.length) {
      const next = [];
      for (const x of frontier) {
        for (const c of childrenOf(x)) {
          if (seen.has(c)) continue;
          seen.add(c);
          const cl = P(c).line;
          if (MAJOR_LINES.includes(cl)) return cl;
          next.push(c);
        }
      }
      frontier = next;
    }
    return 'both';
  }
  const branchOf = (id) => state.branch.get(id) || 'both';
  const branchVar = (id) => `var(--line-${branchOf(id)})`;

  // ------------------------------------------------------------------ relationships
  function ancestors(id) {
    if (state.ancCache.has(id)) return state.ancCache.get(id);
    const m = new Map([[id, 0]]);
    const q = [id];
    while (q.length) {
      const x = q.shift();
      const d = m.get(x);
      for (const par of parentsOf(x)) if (!m.has(par)) { m.set(par, d + 1); q.push(par); }
    }
    state.ancCache.set(id, m);
    return m;
  }
  function blood(a, b) {
    if (a === b) return { da: 0, db: 0, ca: a };
    const A = ancestors(a), B = ancestors(b);
    let best = null;
    for (const [id, da] of A) {
      const db = B.get(id);
      if (db === undefined) continue;
      if (!best || da + db < best.da + best.db) best = { da, db, ca: id };
    }
    return best;
  }

  const gx = (sex, m, f, n) => (sex === 'M' ? m : sex === 'F' ? f : n);
  function ord(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  const greats = (n) => (n <= 0 ? '' : n === 1 ? 'great-' : `${ord(n)} great-`);
  function ancTerm(k, sex) {
    const base = gx(sex, 'father', 'mother', 'parent');
    if (k === 1) return base;
    return greats(k - 2) + 'grand' + base;
  }
  function descTerm(k, sex) {
    const base = gx(sex, 'son', 'daughter', 'child');
    if (k === 1) return base;
    return greats(k - 2) + 'grand' + base;
  }
  function uncleTerm(k, sex) {
    const base = gx(sex, 'uncle', 'aunt', 'aunt/uncle');
    return greats(k - 2) + base;
  }
  function nephewTerm(k, sex) {
    const base = gx(sex, 'nephew', 'niece', 'niece/nephew');
    if (k === 2) return base;
    return greats(k - 3) + 'grand' + base;
  }
  function cousinTerm(da, db) {
    const deg = Math.min(da, db) - 1;
    const rem = Math.abs(da - db);
    const remTxt = rem === 0 ? '' : rem === 1 ? ' once removed' : rem === 2 ? ' twice removed' : ` ${rem} times removed`;
    return `${ord(deg)} cousin${remTxt}`;
  }
  function bloodTerm(r, aId, bId) {
    const b = P(bId);
    const { da, db } = r;
    if (da === 0) return descTerm(db, b.sex);
    if (db === 0) return ancTerm(da, b.sex);
    if (da === 1 && db === 1) {
      const pa = parentsOf(aId), pb = parentsOf(bId);
      const shared = pa.filter((x) => pb.includes(x));
      const half = shared.length === 1 && pa.length === 2 && pb.length === 2;
      return (half ? 'half-' : '') + gx(b.sex, 'brother', 'sister', 'sibling');
    }
    if (db === 1) return uncleTerm(da, b.sex);
    if (da === 1) return nephewTerm(db, b.sex);
    return cousinTerm(da, db);
  }
  const spouseWord = (p) => gx(p.sex, 'husband', 'wife', 'spouse');

  function connected(a, b) {
    const seen = new Set([a]);
    const q = [a];
    while (q.length) {
      const x = q.shift();
      if (x === b) return true;
      const nb = [].concat(parentsOf(x), childrenOf(x), partnersOf(x));
      for (const y of nb) if (!seen.has(y)) { seen.add(y); q.push(y); }
    }
    return false;
  }

  function computeRel(aId, bId) {
    const a = P(aId), b = P(bId);
    const R = (term, phrase, kind) => ({ term: cap(term), phrase: cap(phrase), kind });
    if (aId === bId) return R('You', 'You', 'self');

    const r = blood(aId, bId);
    if (r) { const t = bloodTerm(r, aId, bId); return R(t, `your ${t}`, 'blood'); }

    if (partnersOf(aId).includes(bId)) { const t = spouseWord(b); return R(t, `your ${t}`, 'spouse'); }

    // b is married to one of a's blood relatives
    for (const s of partnersOf(bId)) {
      const rs = blood(aId, s);
      if (!rs) continue;
      let t;
      if (rs.da === 0) t = descTerm(rs.db, b.sex) + '-in-law';
      else if (rs.da === 1 && rs.db === 1) t = gx(b.sex, 'brother', 'sister', 'sibling') + '-in-law';
      else if (rs.db === 0) t = (rs.da === 1 ? 'step' : 'step-') + ancTerm(rs.da, b.sex);
      else if (rs.db === 1) t = uncleTerm(rs.da, b.sex) + ' by marriage';
      if (t) return R(t, `your ${t}`, 'inlaw');
      const st = bloodTerm(rs, aId, s);
      return R(`${spouseWord(b)} of ${st}`, `${spouseWord(b)} of your ${st}`, 'inlaw');
    }

    // b is a blood relative of a's spouse
    for (const s of partnersOf(aId)) {
      const rs = blood(s, bId);
      if (!rs) continue;
      const sw = spouseWord(P(s));
      let t;
      if (rs.db === 0 && rs.da === 1) t = ancTerm(1, b.sex) + '-in-law';
      else if (rs.da === 1 && rs.db === 1) t = gx(b.sex, 'brother', 'sister', 'sibling') + '-in-law';
      else if (rs.da === 0 && rs.db === 1) t = 'step' + descTerm(1, b.sex);
      if (t) return R(t, `your ${t}`, 'inlaw');
      const st = bloodTerm(rs, s, bId);
      return R(`${sw}'s ${st}`, `your ${sw}'s ${st}`, 'inlaw');
    }

    // b is married to a blood relative of a's spouse
    for (const s of partnersOf(aId)) {
      for (const t of partnersOf(bId)) {
        const rs = blood(s, t);
        if (!rs) continue;
        const sw = spouseWord(P(s));
        const st = bloodTerm(rs, s, t);
        return R('in-law', `${spouseWord(b)} of your ${sw}'s ${st}`, 'inlaw');
      }
    }

    if (connected(aId, bId)) return R('relative by marriage', 'a relative by marriage', 'inlaw');
    if (aId === 'josiah' && b.relationship) return R(b.relationship, b.relationship, 'fallback');
    return R('no known connection', 'no known connection to you', 'none');
  }
  function rel(bId) {
    const key = state.root + '|' + bId;
    if (!state.relCache.has(key)) state.relCache.set(key, computeRel(state.root, bId));
    return state.relCache.get(key);
  }

  // ------------------------------------------------------------------ search
  function searchPeople(q, limit) {
    const toks = norm(q).split(' ').filter(Boolean);
    if (!toks.length) return [];
    const out = [];
    for (const p of state.data.people) {
      const hay = norm([p.name, p.nickname, p.id.replace(/-/g, ' ')].join(' '));
      if (toks.every((t) => hay.includes(t))) {
        const starts = norm(p.name).startsWith(toks[0]) ? 0 : 1;
        out.push({ p, score: starts });
      }
    }
    out.sort((x, y) => x.score - y.score || x.p.name.localeCompare(y.p.name));
    return out.slice(0, limit || 10).map((x) => x.p);
  }
  function resultItem(p, withRel) {
    const meta = [lifespan(p), withRel && state.root ? rel(p.id).term : ''].filter(Boolean).join(' · ');
    return `<li><button type="button" data-id="${esc(p.id)}"><span class="chip-dot" style="--branch:${branchVar(p.id)}"></span>` +
      `<span class="r-name">${esc(p.name)}</span><span class="r-meta">${esc(meta)}</span></button></li>`;
  }
  function wireSearch(input, list, opts) {
    let hl = -1;
    const render = () => {
      const res = searchPeople(input.value, opts.limit);
      hl = -1;
      if (!input.value.trim()) { list.innerHTML = ''; if (opts.floating) list.hidden = true; return; }
      list.innerHTML = res.length ? res.map((p) => resultItem(p, opts.withRel)).join('')
        : '<li class="muted small" style="padding:8px 10px">No one by that name.</li>';
      list.hidden = false;
    };
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      const btns = $$('button', list);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!btns.length) return;
        hl = (hl + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
        btns.forEach((b, i) => b.classList.toggle('hl', i === hl));
      } else if (e.key === 'Enter') {
        const b = btns[hl >= 0 ? hl : 0];
        if (b) { e.preventDefault(); b.click(); }
      } else if (e.key === 'Escape' && opts.floating) {
        list.hidden = true; input.blur();
      }
    });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]');
      if (!b) return;
      opts.onPick(b.dataset.id);
      if (opts.floating) { input.value = ''; list.hidden = true; list.innerHTML = ''; }
    });
    if (opts.floating) {
      document.addEventListener('click', (e) => { if (!e.target.closest('.quickfind')) list.hidden = true; });
      input.addEventListener('focus', () => { if (input.value.trim()) render(); });
    }
  }

  // ------------------------------------------------------------------ root / picker
  function setRoot(id, opts) {
    if (!P(id)) return;
    state.root = id;
    state.relCache.clear();
    state.expanded.clear();
    state.collapsed.clear();
    state.sibOpen = new Set([id]);
    state.famOpen.clear();
    store.set(LS.root, id);
    const url = new URL(window.location.href);
    if (url.searchParams.get('me') !== id) {
      url.searchParams.set('me', id);
      try { history.replaceState(null, '', url.toString()); } catch (e) { /* file:// */ }
    }
    $('#viewing-as').innerHTML = `Viewing as <strong>${esc(firstName(P(id)))}</strong>`;
    closePicker();
    renderChart();
    if (!opts || !opts.keepScroll) requestAnimationFrame(() => { autoZoom(); centerRoot(); });
    if (state.panelId) openPanel(state.panelId, { noScroll: true });
    renderStories();
  }

  function openPicker() {
    const sug = (state.data.meta.suggestedRoots || []).filter((id) => P(id));
    $('#picker-suggested').innerHTML = sug.map((id) => {
      const p = P(id);
      return `<button type="button" class="pick-btn" data-id="${esc(id)}" style="--branch:${branchVar(id)}">` +
        `<span class="pb-name">${esc(firstName(p))}</span><span class="pb-full">${esc(p.name)}</span></button>`;
    }).join('');
    $('#picker-close').hidden = !state.root;
    $('#picker').hidden = false;
    $('#picker-input').value = '';
    $('#picker-results').innerHTML = '';
    setTimeout(() => { const b = $('.pick-btn', $('#picker')); if (b) b.focus(); }, 30);
  }
  function closePicker() { $('#picker').hidden = true; }

  // ------------------------------------------------------------------ chart layout
  // The chart is a pedigree (ancestors above the chosen person) with optional
  // "side trees": any card can open its siblings sideways, and each sibling can
  // open their spouse(s) and children in the row below. Fathers' siblings open
  // to the left, mothers' to the right, so branches never cross.
  function hiddenAncestorCount(id) { return ancestors(id).size - 1; }
  function showParentsOf(id, depth) {
    if (state.collapsed.has(id)) return false;
    return state.expanded.has(id) || depth < state.depth;
  }
  function sibNamesOf(id) {
    const p = P(id);
    return p && !isMinor(p) && !(p.living && !state.showLiving) ? (p.siblings || []) : [];
  }
  function sibCount(id) { return siblingsOf(id).length + sibNamesOf(id).length; }
  function famOf(id) {
    const p = P(id);
    return {
      sp: partnersOf(id),
      spN: (p.spouses || []).filter((s) => !s.id && s.name).map((s) => s.name),
      kids: childrenOf(id),
      kidN: (p.children || []).filter((c) => !c.id && c.name).map((c) => c.name)
    };
  }
  function famSize(id) {
    if (isMinor(P(id))) return 0;
    const f = famOf(id);
    return f.sp.length + f.spN.length + f.kids.length + f.kidN.length;
  }
  function sibUnits(id) {
    const units = siblingsOf(id).map((sid) => {
      const open = state.famOpen.has(sid) && famSize(sid) > 0;
      const f = open ? famOf(sid) : null;
      const nSp = open ? f.sp.length + f.spN.length : 0;
      const nKids = open ? f.kids.length + f.kidN.length : 0;
      return { id: sid, open, f, w: Math.max(1 + nSp, nKids, 1) };
    });
    sibNamesOf(id).forEach((name) => units.push({ name, w: 1 }));
    return units;
  }

  function buildNode(id, depth, placed, side) {
    const node = { id, depth, side, parents: [], hidden: 0, dup: false, hasParents: false, units: [], sibTotal: 0 };
    if (placed.has(id)) { node.dup = true; return node; }
    placed.add(id);
    node.sibTotal = sibCount(id);
    if (node.sibTotal && state.sibOpen.has(id)) node.units = sibUnits(id);
    const ps = parentsOf(id);
    if (ps.length) {
      node.hasParents = true;
      if (showParentsOf(id, depth)) {
        node.parents = ps.map((p, i) => buildNode(p, depth + 1, placed, ps.length > 1 && i > 0 ? 'R' : 'L'));
      } else node.hidden = hiddenAncestorCount(id);
    }
    return node;
  }
  function measure(n) {
    n.P = n.parents.length ? n.parents.reduce((s, c) => s + measure(c), 0) : 1;
    // The chosen person's own row is otherwise empty, so their siblings sit right
    // beside them instead of reserving space at the edge of the whole band.
    n.S = n.depth === 0 ? 0 : n.units.reduce((s, u) => s + u.w, 0);
    n.w = n.P + n.S;
    return n.w;
  }
  function assign(n, left) {
    const pStart = n.side === 'L' ? left + n.S : left;
    let sStart = n.side === 'L' ? left : left + n.P;
    if (n.parents.length) {
      let cur = pStart;
      n.parents.forEach((c) => { assign(c, cur); cur += c.w; });
      n.x = (n.parents[0].x + n.parents[n.parents.length - 1].x) / 2;
    } else n.x = pStart + 0.5;
    if (n.depth === 0) {
      let cursor = n.x - 0.5;
      n.units.slice().reverse().forEach((u) => {
        u.left = cursor - u.w;
        cursor = u.left;
        u.x = u.left + u.w - 0.5;
      });
      return;
    }
    n.units.forEach((u) => {
      u.left = sStart;
      sStart += u.w;
      // the sibling card sits on the side of its unit nearest the main line
      u.x = n.side === 'L' ? u.left + u.w - 0.5 : u.left + 0.5;
    });
  }
  function walk(n, f) { f(n); n.parents.forEach((c) => walk(c, f)); }

  function rowLabel(d) {
    if (d === 1) return 'Parents';
    if (d === 2) return 'Grandparents';
    return cap(greats(d - 2)) + 'grandparents';
  }

  function cardHTML(id, x, y, opts) {
    const p = P(id);
    const r = rel(id);
    const cls = ['card', `status-${p.status || 'confirmed'}`];
    if (opts.root) cls.push('root');
    if (opts.dup) cls.push('dup');
    if (opts.side) cls.push('side');
    const badge = (p.status === 'likely' || p.status === 'lead')
      ? `<span class="badge badge-${p.status} c-badge" title="${esc((state.data.meta.statusKey || {})[p.status] || '')}">${p.status}</span>` : '';
    const sub = opts.dup ? 'Also shown elsewhere in this tree' : lifespan(p);
    let tog = '';
    if (opts.sibs) {
      tog = `<button type="button" class="c-tog" data-act="sibs" data-id="${esc(id)}" aria-expanded="${opts.sibsOpen}">` +
        (opts.sibsOpen ? 'Hide siblings' : `⇆ ${opts.sibs} sibling${opts.sibs === 1 ? '' : 's'}`) + `</button>`;
    } else if (opts.fam) {
      tog = `<button type="button" class="c-tog" data-act="fam" data-id="${esc(id)}" aria-expanded="${opts.famOpen}">` +
        (opts.famOpen ? 'Hide family' : `▾ Family (${opts.fam})`) + `</button>`;
    }
    return `<div role="button" tabindex="0" class="${cls.join(' ')}" data-id="${esc(id)}" ` +
      `style="left:${x}px;top:${y}px;height:${opts.dup ? 64 : CARD_H}px;--branch:${branchVar(id)}" ` +
      `aria-label="${esc(p.name)}, ${esc(r.term)}">` +
      `${badge}<span class="c-rel">${esc(r.term)}</span>` +
      `<span class="c-name">${esc(p.name)}</span>` +
      (sub ? `<span class="c-dates">${esc(sub)}</span>` : '') + tog +
      `</div>`;
  }
  function miniHTML(name, x, y, note) {
    return `<div class="card mini" style="left:${x}px;top:${y}px;height:64px;--branch:var(--rule-2)">` +
      `<span class="c-rel">${esc(note)}</span><span class="c-name">${esc(name)}</span></div>`;
  }

  function renderChart() {
    const chart = $('#chart');
    if (!state.root) { chart.innerHTML = ''; return; }
    const placed = new Set();
    const tree = buildNode(state.root, 0, placed, 'L');
    measure(tree);
    assign(tree, 0);
    const nodes = [];
    walk(tree, (n) => nodes.push(n));
    let maxD = 0;
    nodes.forEach((n) => { maxD = Math.max(maxD, n.depth); });

    // ---- collect every card as an item with a slot position
    const items = [];
    const add = (o) => { items.push(o); return o; };
    nodes.forEach((n) => { n.item = add({ id: n.id, x: n.x, depth: n.depth, fixed: true, node: n }); });

    const sideGroups = []; // for connectors: {node, sibs:[item], fams:[{sib, spouses:[item], kids:[item]}]}
    nodes.forEach((n) => {
      if (!n.units.length) return;
      const dir = n.side;
      const g = { node: n, sibs: [], fams: [] };
      n.units.forEach((u) => {
        if (u.name) { g.sibs.push(add({ name: u.name, note: 'Sibling', x: u.x, depth: n.depth, dir })); return; }
        const sib = add({ id: u.id, x: u.x, depth: n.depth, dir, side: true, fam: famSize(u.id), famOpen: u.open });
        g.sibs.push(sib);
        if (!u.open) return;
        const f = u.f;
        const step = dir === 'L' ? -1 : 1;
        const spouses = [];
        f.sp.forEach((sid, i) => spouses.push(add({ id: sid, x: u.x + step * (i + 1), depth: n.depth, dir, side: true })));
        f.spN.forEach((name, i) => spouses.push(add({ name, note: 'Spouse', x: u.x + step * (f.sp.length + i + 1), depth: n.depth, dir })));
        const kidList = f.kids.map((id) => ({ id })).concat(f.kidN.map((name) => ({ name })));
        const center = u.left + u.w / 2;
        const kids = kidList.map((k, i) => add(Object.assign(
          k.id ? { id: k.id, side: true } : { name: k.name, note: 'Child' },
          { x: center - kidList.length / 2 + 0.5 + i, depth: n.depth - 1, dir })));
        g.fams.push({ sib, spouses, kids });
      });
      sideGroups.push(g);
    });

    // ---- the chosen person's own spouse(s) and children
    const root = P(state.root);
    const rootX = tree.x;
    const rootSp = [];
    partnersOf(state.root).forEach((id, i) => rootSp.push(add({ id, x: rootX + i + 1, depth: 0, fixed: true })));
    (root.spouses || []).filter((s) => !s.id && s.name).forEach((s, i) =>
      rootSp.push(add({ name: s.name, note: 'Spouse', x: rootX + rootSp.length + 1 + i, depth: 0, fixed: true })));
    const rootKidList = childrenOf(state.root).map((id) => ({ id }))
      .concat((root.children || []).filter((c) => !c.id && c.name).map((c) => ({ name: c.name })));
    const kidCenter = rootSp.length ? rootX + 0.5 : rootX;
    const rootKids = rootKidList.map((k, i) => add(Object.assign(
      k.id ? { id: k.id } : { name: k.name, note: 'Child' },
      { x: kidCenter - (rootKidList.length - 1) / 2 + i, depth: -1, fixed: true })));

    // ---- resolve overlaps: side-tree cards slide outward, away from the main line
    const rows = new Map();
    items.forEach((it) => { if (!rows.has(it.depth)) rows.set(it.depth, []); rows.get(it.depth).push(it); });
    rows.forEach((row) => {
      const placedRow = row.filter((it) => it.fixed);
      const hit = (x) => placedRow.filter((o) => Math.abs(o.x - x) < 0.999);
      row.filter((it) => !it.fixed && it.dir === 'R').sort((a, b) => a.x - b.x).forEach((it) => {
        let h;
        while ((h = hit(it.x)).length) it.x = Math.max.apply(null, h.map((o) => o.x)) + 1;
        placedRow.push(it);
      });
      row.filter((it) => !it.fixed && it.dir === 'L').sort((a, b) => b.x - a.x).forEach((it) => {
        let h;
        while ((h = hit(it.x)).length) it.x = Math.min.apply(null, h.map((o) => o.x)) - 1;
        placedRow.push(it);
      });
    });

    let minDepth = 0;
    items.forEach((it) => { minDepth = Math.min(minDepth, it.depth); });
    const xs = items.map((it) => it.x);
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    const left = (x) => PAD_L + (x - minX) * SLOT;
    const top = (d) => PAD_T + (maxD - d) * ROW_H;
    const W = PAD_L + (maxX - minX) * SLOT + CARD_W + PAD_R;
    const H = top(minDepth) + CARD_H + PAD_B;
    const cx = (it) => left(it.x) + CARD_W / 2;
    const gap = ROW_H - CARD_H;

    let cards = '', links = '', ctrls = '', labels = '';
    state.cardPos.clear();

    for (let d = 1; d <= maxD; d++) {
      labels += `<div class="row-label" style="top:${top(d) + CARD_H / 2 - 8}px">${esc(rowLabel(d))}</div>`;
    }
    if (rootKids.length) labels += `<div class="row-label" style="top:${top(-1) + CARD_H / 2 - 8}px">Children</div>`;

    // pedigree connectors and expanders
    nodes.forEach((n) => {
      const it = n.item;
      const t = top(n.depth);
      if (n.parents.length) {
        const jy = t - gap / 2;
        n.parents.forEach((c) => {
          const bottom = top(c.depth) + (c.dup ? 64 : CARD_H);
          links += `<path d="M${cx(c.item)} ${bottom} V${jy} H${cx(it)}"${c.dup ? ' class="dup"' : ''}/>`;
        });
        links += `<path d="M${cx(it)} ${jy} V${t}"/>`;
        ctrls += `<button type="button" class="expander" data-act="collapse" data-id="${esc(n.id)}" ` +
          `style="left:${cx(it)}px;top:${t - gap / 2 - 11}px" title="Hide ancestors">−</button>`;
      } else if (n.hidden) {
        ctrls += `<button type="button" class="expander more" data-act="expand" data-id="${esc(n.id)}" ` +
          `style="left:${cx(it)}px;top:${t - 30}px" title="Show ${n.hidden} more ancestors">▲ ${n.hidden}</button>`;
      }
    });

    // side-tree connectors
    sideGroups.forEach((g) => {
      const t = top(g.node.depth);
      const sy = t - 14;
      const xsSib = g.sibs.map(cx).concat([cx(g.node.item)]);
      links += `<path class="side" d="M${Math.min.apply(null, xsSib)} ${sy} H${Math.max.apply(null, xsSib)}"/>`;
      links += `<path class="side" d="M${cx(g.node.item)} ${sy} V${t}"/>`;
      g.sibs.forEach((s) => { links += `<path class="side" d="M${cx(s)} ${sy} V${t}"/>`; });
      g.fams.forEach((f) => {
        const my = t + CARD_H / 2;
        if (f.spouses.length) {
          const all = [f.sib].concat(f.spouses).map((o) => left(o.x));
          links += `<path class="side marriage" d="M${Math.min.apply(null, all) + CARD_W} ${my} H${Math.max.apply(null, all)}"/>`;
        }
        if (f.kids.length) {
          const first = f.spouses[0];
          const fromX = first ? (cx(f.sib) + cx(first)) / 2 : cx(f.sib);
          const fromY = first ? my : t + CARD_H;
          const ky = top(g.node.depth - 1);
          const jy = ky - gap / 2;
          const kx = f.kids.map(cx);
          links += `<path class="side" d="M${fromX} ${fromY} V${jy}"/>`;
          links += `<path class="side" d="M${Math.min(fromX, Math.min.apply(null, kx))} ${jy} H${Math.max(fromX, Math.max.apply(null, kx))}"/>`;
          kx.forEach((x) => { links += `<path class="side" d="M${x} ${jy} V${ky}"/>`; });
        }
      });
    });

    // the chosen person's own family
    const rt = top(0);
    if (rootSp.length) {
      const far = Math.max.apply(null, rootSp.map((o) => left(o.x)));
      links += `<path class="marriage" d="M${left(tree.item.x) + CARD_W} ${rt + CARD_H / 2} H${far}"/>`;
    }
    if (rootKids.length) {
      const ky = top(-1);
      const jy = ky - gap / 2;
      const fromX = rootSp.length ? (cx(tree.item) + cx(rootSp[0])) / 2 : cx(tree.item);
      const fromY = rootSp.length ? rt + CARD_H / 2 : rt + CARD_H;
      const kx = rootKids.map(cx);
      links += `<path d="M${fromX} ${fromY} V${jy}"/>`;
      links += `<path d="M${Math.min(fromX, Math.min.apply(null, kx))} ${jy} H${Math.max(fromX, Math.max.apply(null, kx))}"/>`;
      kx.forEach((x) => { links += `<path d="M${x} ${jy} V${ky}"/>`; });
    }

    // cards
    items.forEach((it) => {
      const l = left(it.x), t = top(it.depth);
      if (!it.id) { cards += miniHTML(it.name, l, t, it.note); return; }
      const n = it.node;
      const opts = n
        ? { root: n.depth === 0, dup: n.dup, sibs: n.dup ? 0 : n.sibTotal, sibsOpen: state.sibOpen.has(n.id) }
        : { side: it.side, fam: it.fam, famOpen: it.famOpen };
      cards += cardHTML(it.id, l, t, opts);
      if (!(n && n.dup) && !state.cardPos.has(it.id)) state.cardPos.set(it.id, { x: l, y: t });
    });

    chart.style.width = W + 'px';
    chart.style.height = H + 'px';
    chart.innerHTML = `<svg class="links" width="${W}" height="${H}" aria-hidden="true">${links}</svg>${labels}${cards}${ctrls}`;
    state.chartW = W;
    state.chartH = H;
    applyZoom();
    updateSibToggle();
  }

  // every ancestor in view (plus the chosen person) that has siblings
  function sibCandidates() {
    return [...ancestors(state.root).keys()].filter((id) => sibCount(id) > 0);
  }
  function updateSibToggle() {
    const b = $('#sibs-all');
    if (!b) return;
    const c = sibCandidates();
    const allOpen = c.length && c.every((id) => state.sibOpen.has(id));
    b.textContent = allOpen ? 'Hide siblings' : 'Show all siblings';
    b.setAttribute('aria-pressed', String(!!allOpen));
    b.hidden = !c.length;
  }

  // Find how to bring a person into view: as an ancestor, a sibling of one,
  // or a spouse/child of such a sibling. Returns a function that opens it.
  function locate(id) {
    if (state.cardPos.has(id)) return () => {};
    const anc = ancestors(state.root);
    const openPath = (a) => { (ancestorPath(state.root, a) || []).forEach((x) => { state.expanded.add(x); state.collapsed.delete(x); }); };
    if (anc.has(id)) return () => openPath(id);
    const sibHost = (sid) => [...anc.keys()].find((a) => siblingsOf(a).includes(sid));
    let a = sibHost(id);
    if (a) return () => { openPath(a); state.sibOpen.add(a); };
    for (const s of partnersOf(id).concat(parentsOf(id))) {
      a = sibHost(s);
      if (a) return () => { openPath(a); state.sibOpen.add(a); state.famOpen.add(s); };
    }
    return null;
  }

  // ------------------------------------------------------------------ zoom / pan
  function applyZoom(keepCenter) {
    const vp = $('#chart-viewport');
    let cx, cy;
    if (keepCenter) {
      cx = (vp.scrollLeft + vp.clientWidth / 2) / keepCenter;
      cy = (vp.scrollTop + vp.clientHeight / 2) / keepCenter;
    }
    const z = state.zoom;
    $('#chart').style.transform = `scale(${z})`;
    const sizer = $('#chart-sizer');
    sizer.style.width = Math.ceil(state.chartW * z) + 'px';
    sizer.style.height = Math.ceil(state.chartH * z) + 'px';
    if (keepCenter) {
      vp.scrollLeft = cx * z - vp.clientWidth / 2;
      vp.scrollTop = cy * z - vp.clientHeight / 2;
    }
  }
  function setZoom(z) {
    const old = state.zoom;
    state.zoom = Math.max(0.2, Math.min(1.6, z));
    applyZoom(old);
  }
  function fit() {
    const vp = $('#chart-viewport');
    const z = Math.min(1, (vp.clientWidth - 20) / state.chartW, (vp.clientHeight - 20) / state.chartH);
    state.zoom = Math.max(0.2, z);
    applyZoom();
    vp.scrollLeft = (vp.scrollWidth - vp.clientWidth) / 2;
    vp.scrollTop = vp.scrollHeight;
  }
  function scrollToCard(id, smooth) {
    const pos = state.cardPos.get(id);
    if (!pos) return false;
    const vp = $('#chart-viewport');
    const z = state.zoom;
    const x = (pos.x + CARD_W / 2) * z - vp.clientWidth / 2;
    const y = (pos.y + CARD_H / 2) * z - vp.clientHeight / 2;
    vp.scrollTo({ left: x, top: y, behavior: smooth ? 'smooth' : 'auto' });
    return true;
  }
  function centerRoot() {
    if (!state.root) return;
    const vp = $('#chart-viewport');
    const pos = state.cardPos.get(state.root);
    if (!pos) return;
    const z = state.zoom;
    vp.scrollLeft = (pos.x + CARD_W / 2) * z - vp.clientWidth / 2;
    vp.scrollTop = (pos.y + CARD_H) * z - vp.clientHeight * (childrenOf(state.root).length ? 0.62 : 0.8);
  }
  function autoZoom() {
    const vp = $('#chart-viewport');
    if (!vp.clientWidth || !state.chartW) return;
    const minZ = vp.clientWidth < 700 ? 0.6 : 0.5;
    state.zoom = Math.max(minZ, Math.min(1, (vp.clientWidth - 24) / state.chartW, (vp.clientHeight - 24) / state.chartH * 1.6));
    applyZoom();
  }
  function highlight(id) {
    const el = $(`#chart .card[data-id="${CSS.escape(id)}"]:not(.dup)`);
    if (!el) return;
    el.classList.remove('highlight');
    void el.offsetWidth;
    el.classList.add('highlight');
  }
  function showInChart(id) {
    if (!state.cardPos.has(id)) {
      const open = locate(id);
      if (!open) return false;
      open();
      renderChart();
    }
    go('tree');
    requestAnimationFrame(() => { scrollToCard(id, true); highlight(id); });
    return true;
  }
  function ancestorPath(from, to) {
    const prev = new Map([[from, null]]);
    const q = [from];
    while (q.length) {
      const x = q.shift();
      if (x === to) break;
      for (const par of parentsOf(x)) if (!prev.has(par)) { prev.set(par, x); q.push(par); }
    }
    if (!prev.has(to)) return null;
    const path = [];
    let cur = prev.get(to);
    while (cur) { path.push(cur); cur = prev.get(cur); }
    return path;
  }

  function wireChart() {
    const vp = $('#chart-viewport');
    $('#chart').addEventListener('click', (e) => {
      const ctrl = e.target.closest('.expander, .c-tog');
      if (ctrl) {
        e.stopPropagation();
        if (dragMoved) return;
        const id = ctrl.dataset.id;
        const act = ctrl.dataset.act;
        const flip = (set) => { if (set.has(id)) set.delete(id); else set.add(id); };
        if (act === 'expand') { state.expanded.add(id); state.collapsed.delete(id); }
        else if (act === 'collapse') { state.collapsed.add(id); state.expanded.delete(id); }
        else if (act === 'sibs') flip(state.sibOpen);
        else if (act === 'fam') flip(state.famOpen);
        const before = state.cardPos.get(id);
        const vx = before ? before.x * state.zoom - vp.scrollLeft : 0;
        const vy = before ? before.y * state.zoom - vp.scrollTop : 0;
        renderChart();
        const after = state.cardPos.get(id);
        if (before && after) {
          vp.scrollLeft = after.x * state.zoom - vx;
          vp.scrollTop = after.y * state.zoom - vy;
        }
        return;
      }
      const card = e.target.closest('.card[data-id]');
      if (card && !dragMoved) openPanel(card.dataset.id);
    });
    $('#chart').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.closest('button')) return;
      const card = e.target.closest('.card[data-id]');
      if (card) { e.preventDefault(); openPanel(card.dataset.id); }
    });
    $('#sibs-all').addEventListener('click', () => {
      const c = sibCandidates();
      const allOpen = c.every((id) => state.sibOpen.has(id));
      state.sibOpen = allOpen ? new Set() : new Set(c);
      renderChart();
    });

    // drag to pan (mouse only; touch scrolls natively)
    let drag = null, dragMoved = false;
    vp.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, sl: vp.scrollLeft, st: vp.scrollTop };
      dragMoved = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!dragMoved && Math.abs(dx) + Math.abs(dy) > 5) { dragMoved = true; vp.classList.add('dragging'); }
      if (dragMoved) { vp.scrollLeft = drag.sl - dx; vp.scrollTop = drag.st - dy; }
    });
    window.addEventListener('pointerup', () => {
      drag = null;
      vp.classList.remove('dragging');
      setTimeout(() => { dragMoved = false; }, 0);
    });
    vp.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(state.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    }, { passive: false });

    $('#zoom-in').addEventListener('click', () => setZoom(state.zoom * 1.2));
    $('#zoom-out').addEventListener('click', () => setZoom(state.zoom / 1.2));
    $('#zoom-fit').addEventListener('click', fit);
    $('#center-root').addEventListener('click', () => { centerRoot(); highlight(state.root); });
    const ds = $('#depth-select');
    if (![...ds.options].some((o) => +o.value === state.depth)) state.depth = 4;
    ds.value = String(state.depth);
    ds.addEventListener('change', () => {
      state.depth = parseInt(ds.value, 10);
      store.set(LS.depth, String(state.depth));
      state.expanded.clear();
      state.collapsed.clear();
      renderChart();
      autoZoom();
      centerRoot();
    });
    $('#legend-toggle').addEventListener('click', (e) => {
      const lg = $('#legend');
      lg.hidden = !lg.hidden;
      e.currentTarget.setAttribute('aria-expanded', String(!lg.hidden));
    });
  }

  function renderLegend() {
    const groups = {};
    state.data.people.forEach((p) => {
      const b = branchOf(p.id);
      if (!groups[b]) groups[b] = new Set();
      if (p.line && p.line !== b && !MAJOR_LINES.includes(p.line)) groups[b].add(p.line);
    });
    const order = MAJOR_LINES.concat(['cary', 'both']).filter((b) => groups[b]);
    const items = order.map((b) => {
      const subs = [...groups[b]].map(cap).join(', ');
      return `<span class="legend-item"><span class="legend-swatch" style="background:var(--line-${b})"></span>` +
        `<span><strong>${esc(LINE_LABEL[b] || cap(b))}</strong>${subs ? ` <span class="legend-sub">incl. ${esc(subs)}</span>` : ''}</span></span>`;
    }).join('');
    const sk = state.data.meta.statusKey || {};
    const status = ['likely', 'lead'].map((s) =>
      `<span class="legend-item" title="${esc(sk[s] || '')}"><span class="badge badge-${s}">${s}</span>` +
      `<span>${esc(s === 'likely' ? 'one link not yet proven' : 'possible connection, unproven')}</span></span>`).join('');
    $('#legend').innerHTML = items + '<span class="legend-sep"></span>' +
      `<span class="legend-item"><span class="badge badge-confirmed">confirmed</span><span>solid outline</span></span>` + status;
  }

  // ------------------------------------------------------------------ panel
  function chip(id, extra) {
    const p = P(id);
    if (!p) return '';
    return `<button type="button" class="chip" data-open="${esc(id)}" style="--branch:${branchVar(id)}">` +
      `<span class="dot"></span>${esc(p.name)}${extra ? ` <small>${esc(extra)}</small>` : ''}</button>`;
  }
  function plainChip(name, extra) {
    return `<span class="chip plain">${esc(name)}${extra ? ` <small>${esc(extra)}</small>` : ''}</span>`;
  }
  const section = (title, body) => body ? `<section class="p-section"><h3>${esc(title)}</h3>${body}</section>` : '';
  function placeLine(o) {
    if (!o) return '';
    const bits = [];
    if (o.date) bits.push(esc(fmtDate(o.date)));
    if (o.place) bits.push(esc(o.place));
    return bits.join(' · ');
  }
  function linkOrText(title, url) {
    return url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a>` : esc(title);
  }

  function gravestoneHTML(g) {
    if (!g) return '';
    let h = '';
    const src = g.photo || g.photoUrl;
    if (src) {
      h += `<figure><img src="${esc(src)}" alt="Gravestone photo" loading="lazy" referrerpolicy="no-referrer"` +
        ` data-fallback="${esc(g.photo && g.photoUrl ? g.photoUrl : '')}">` +
        `<figcaption>${esc(g.photoCredit || 'Photo: Find a Grave contributor')}</figcaption></figure>`;
    } else if (g.photoNote) {
      h += `<p class="muted small">${esc(g.photoNote)}</p>`;
    }
    if (g.note) h += `<p>${esc(g.note)}</p>`;
    const links = [];
    if (g.memorialUrl) links.push(`<a class="btn btn-small" href="${esc(g.memorialUrl)}" target="_blank" rel="noopener">View memorial ↗</a>`);
    if (g.searchUrl) links.push(`<a class="btn btn-small" href="${esc(g.searchUrl)}" target="_blank" rel="noopener">Search Find a Grave ↗</a>`);
    if (links.length) h += `<div class="p-actions">${links.join('')}</div>`;
    return h;
  }

  function openPanel(id, opts) {
    const p = P(id);
    if (!p) return;
    state.panelId = id;
    const r = rel(id);
    const minor = isMinor(p);
    const hidden = detailsHidden(p);
    const sk = state.data.meta.statusKey || {};
    let h = '';

    h += `<div class="p-head" style="--branch:${branchVar(id)}">` +
      `<div class="p-rel">${esc(r.kind === 'self' ? 'You' : r.phrase)}</div>` +
      `<h2 class="p-name">${esc(p.name)}</h2><div class="p-sub">`;
    if (!minor && p.nickname) h += `<span>Known as “${esc(p.nickname)}”</span>`;
    if (!minor && lifespan(p)) h += `<span>${esc(lifespan(p))}</span>`;
    h += `<span class="badge badge-${esc(p.status || 'confirmed')}" title="${esc(sk[p.status] || '')}">${esc(p.status || 'confirmed')}</span>`;
    if (p.living) h += `<span class="badge badge-living">living</span>`;
    h += `</div></div>`;

    const actions = [];
    if (id !== state.root) actions.push(`<button type="button" class="btn btn-small btn-primary" data-reroot="${esc(id)}">View tree as ${esc(firstName(p))}</button>`);
    if (locate(id)) actions.push(`<button type="button" class="btn btn-small" data-show="${esc(id)}">Show in chart</button>`);
    if (actions.length) h += `<div class="p-actions">${actions.join('')}</div>`;

    if (minor) {
      h += `<div class="redacted-note">Details aren't shown for children. Only the name appears in this tree.</div>`;
      $('#panel-body').innerHTML = h;
      showPanel(opts);
      return;
    }

    // relationship
    let relBody = `<dl class="facts-grid"><dt>To you</dt><dd>${esc(r.kind === 'self' ? 'You' : r.term)}</dd>`;
    if (state.root !== 'josiah' && P('josiah')) {
      const rj = computeRel('josiah', id);
      const toJ = rj.kind === 'none' && p.relationship ? p.relationship : (rj.kind === 'self' ? 'Josiah himself' : rj.term);
      relBody += `<dt>To Josiah</dt><dd>${esc(toJ)}</dd>`;
    }
    relBody += `<dt>Family line</dt><dd>${esc(cap(p.line || ''))}${p.line !== branchOf(id) ? ` <span class="muted">(${esc(LINE_LABEL[branchOf(id)] || branchOf(id))} side)</span>` : ''}</dd>`;
    if (sk[p.status]) relBody += `<dt>Status</dt><dd>${esc(sk[p.status])}</dd>`;
    relBody += `</dl>`;
    h += section('Relationship', relBody);

    if (hidden) {
      h += `<div class="redacted-note" style="margin-top:14px">${esc(p.name.split(' ')[0])} is living, so dates and personal details are hidden. ` +
        `Turn on <em>Show details for living people</em> in Settings to see them.</div>`;
    } else if (p.redacted === 'living') {
      h += `<div class="redacted-note" style="margin-top:14px">Details for living people aren't published on this public site.</div>`;
    }

    // vital
    if (!hidden) {
      let v = '';
      if (p.birth && (p.birth.date || p.birth.place)) v += `<dt>Born</dt><dd>${placeLine(p.birth)}</dd>`;
      if (p.death && (p.death.date || p.death.place)) v += `<dt>Died</dt><dd>${placeLine(p.death)}</dd>`;
      if (p.burial) {
        const b = p.burial;
        const bits = [b.cemetery, b.location, b.date ? fmtDate(b.date) : ''].filter(Boolean).map(esc).join(' · ');
        v += `<dt>Buried</dt><dd>${bits}${b.notes ? `<div class="muted small">${esc(b.notes)}</div>` : ''}</dd>`;
      }
      if (v) h += section('Life events', `<dl class="facts-grid">${v}</dl>`);
    }

    // family
    let fam = '';
    const parents = parentsOf(id);
    if (parents.length) fam += `<dt>Parents</dt><dd class="chip-row">${parents.map((x) => chip(x)).join('')}</dd>`;
    const sp = p.spouses.slice();
    partnersOf(id).forEach((x) => { if (!sp.some((s) => s.id === x)) sp.push({ id: x }); });
    if (sp.length) {
      fam += `<dt>Spouse${sp.length > 1 ? 's' : ''}</dt><dd>`;
      fam += sp.map((s) => {
        const c = s.id && P(s.id) ? chip(s.id) : plainChip(s.name || 'Unknown');
        const m = hidden ? '' : [s.marriageDate ? 'Married ' + fmtDate(s.marriageDate) : '', s.marriagePlace].filter(Boolean).join(' · ');
        const note = hidden ? '' : s.notes || '';
        return `<div style="margin-bottom:6px">${c}${m ? `<div class="muted small">${esc(m)}</div>` : ''}${note ? `<div class="muted small">${esc(note)}</div>` : ''}</div>`;
      }).join('');
      fam += `</dd>`;
    }
    const kids = childrenOf(id).slice();
    const kidNames = p.children.filter((c) => !c.id && c.name);
    if (kids.length || kidNames.length) {
      fam += `<dt>Children</dt><dd class="chip-row">${kids.map((x) => chip(x)).join('')}${kidNames.map((c) => plainChip(c.name)).join('')}</dd>`;
    }
    const sibs = siblingsOf(id);
    const sibNames = hidden ? [] : (p.siblings || []);
    if (sibs.length || sibNames.length) {
      fam += `<dt>Siblings</dt><dd><div class="chip-row">${sibs.map((x) => chip(x)).join('')}</div>` +
        (sibNames.length ? `<ul class="p-list" style="margin-top:${sibs.length ? 8 : 0}px">${sibNames.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : '') + `</dd>`;
    }
    if (fam) h += section('Family', `<dl class="facts-grid">${fam}</dl>`);

    if (!hidden) {
      let life = '';
      if (p.residences && p.residences.length) {
        life += `<dt>Residences</dt><dd><ul class="p-list">${p.residences.map((x) => `<li>${x.year ? `<strong>${esc(x.year)}</strong> · ` : ''}${esc(x.place || '')}</li>`).join('')}</ul></dd>`;
      }
      if (p.occupation) life += `<dt>Occupation</dt><dd>${esc(p.occupation)}</dd>`;
      if (p.religion) life += `<dt>Religion</dt><dd>${esc(p.religion)}</dd>`;
      if (p.military) life += `<dt>Military</dt><dd>${esc(p.military)}</dd>`;
      if (life) h += section('Life', `<dl class="facts-grid">${life}</dl>`);

      if (p.biography) h += section('Biography', p.biography.split(/\n\n+/).map((t) => `<p>${esc(t)}</p>`).join(''));

      if (p.facts && p.facts.length) {
        h += section('Facts', `<ul class="p-list">${p.facts.map((f) => typeof f === 'string' ? `<li>${esc(f)}</li>`
          : `<li>${esc(f.text)}${f.source ? `<span class="src">${esc(f.source)}</span>` : ''}</li>`).join('')}</ul>`);
      }

      if (p.gravestone) h += section('Gravestone', `<div class="grave">${gravestoneHTML(p.gravestone)}</div>`);
    }

    const stories = (state.data.stories || []).filter((s) => (s.people || []).includes(id));
    if (stories.length) {
      h += section('Stories', `<ul class="p-list">${stories.map((s) => `<li><a href="#stories/${esc(s.id)}">${esc(s.title)}</a></li>`).join('')}</ul>`);
    }

    if (!hidden) {
      if (p.openQuestions && p.openQuestions.length) {
        h += section('Open questions', `<ul class="p-list">${p.openQuestions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>`);
      }
      if (p.sources && p.sources.length) {
        h += section('Sources', `<ul class="p-list">${p.sources.map((s) => `<li>${linkOrText(s.title || s.url, s.url)}</li>`).join('')}</ul>`);
      }
    }

    $('#panel-body').innerHTML = h;
    $$('#panel-body img[data-fallback]').forEach((img) => {
      img.addEventListener('error', function onErr() {
        const fb = img.dataset.fallback;
        if (fb && img.src !== fb) { img.dataset.fallback = ''; img.src = fb; return; }
        img.removeEventListener('error', onErr);
        const fig = img.closest('figure');
        if (fig) fig.outerHTML = '<p class="muted small">The gravestone photo couldn\'t be loaded. Open the memorial to see it.</p>';
      });
    });
    showPanel(opts);
  }
  function showPanel(opts) {
    const panel = $('#panel');
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    if (!opts || !opts.noScroll) $('#panel-body').scrollTop = 0;
  }
  function closePanel() {
    const panel = $('#panel');
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    state.panelId = null;
  }
  function wirePanel() {
    $('#panel-close').addEventListener('click', closePanel);
    document.addEventListener('click', (e) => {
      const o = e.target.closest('[data-open]');
      if (o) { e.preventDefault(); openPanel(o.dataset.open); return; }
      const rr = e.target.closest('[data-reroot]');
      if (rr) { setRoot(rr.dataset.reroot); go('tree'); return; }
      const sh = e.target.closest('[data-show]');
      if (sh) { showInChart(sh.dataset.show); if (window.innerWidth < 700) closePanel(); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#settings').hidden) { $('#settings').hidden = true; return; }
      if (!$('#picker').hidden && state.root) { closePicker(); return; }
      if ($('#panel').classList.contains('open')) closePanel();
    });
  }

  // ------------------------------------------------------------------ stories
  function renderStories() {
    const el = $('#view-stories');
    const stories = state.data.stories || [];
    const book = stories.map((s) => s.source).find((s) => s && /History of the Stemen Family/i.test(s.title || ''));
    let h = `<div class="page-inner"><p class="eyebrow">Stories</p><h1>Family stories</h1>` +
      `<p class="lede">Short histories drawn from the 1881 family history, obituaries, and memorial pages. Click a name to open that person.</p>`;
    if (book) {
      h += `<div class="feature"><div class="f-icon">1881</div><div><h3>History of the Stemen Family</h3>` +
        `<p>C. B. Stemen's history, read at the family reunion at Enslen's Grove, Allen County, Ohio, May 28, 1881. The scanned book is free to read in the FamilySearch digital library (sign-in may be required).</p>` +
        `<a class="btn btn-small btn-primary" href="${esc(book.url)}" target="_blank" rel="noopener">Read the 1881 book ↗</a></div></div>`;
    }
    h += stories.map((s) => {
      const chips = (s.people || []).filter((id) => P(id)).map((id) => chip(id, state.root ? rel(id).term : '')).join('');
      return `<article class="story" id="story-${esc(s.id)}"><h2>${esc(s.title)}</h2>` +
        `${String(s.text || '').split(/\n\n+/).map((t) => `<p class="text">${esc(t)}</p>`).join('')}` +
        `<div class="s-foot">${chips ? `<div class="chip-row">${chips}</div>` : ''}` +
        `${s.source ? `<div class="s-src">Source: ${linkOrText(s.source.title || s.source.url, s.source.url)}</div>` : ''}</div></article>`;
    }).join('');
    h += `</div>`;
    el.innerHTML = h;
  }

  // ------------------------------------------------------------------ routing
  function go(route) {
    if (location.hash.replace('#', '').split('/')[0] !== route) location.hash = route;
    else route_();
  }
  function route_() {
    const [r, arg] = location.hash.replace('#', '').split('/');
    const route = ['tree', 'stories'].includes(r) ? r : 'tree';
    ['tree', 'stories'].forEach((x) => { $('#view-' + x).hidden = x !== route; });
    $$('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
    if (route === 'stories' && arg) {
      const t = document.getElementById('story-' + arg);
      if (t) {
        $$('.story.target').forEach((s) => s.classList.remove('target'));
        t.classList.add('target');
        requestAnimationFrame(() => t.scrollIntoView({ block: 'start' }));
        if (window.innerWidth < 900) closePanel();
      }
    }
    if (route === 'tree' && state.chartW) applyZoom();
  }

  // ------------------------------------------------------------------ settings
  function wireSettings() {
    const cb = $('#show-living');
    cb.checked = state.showLiving;
    $('#lock-device').addEventListener('click', () => {
      store.del('ft-key');
      location.reload();
    });
    cb.addEventListener('change', () => {
      state.showLiving = cb.checked;
      store.set(LS.living, cb.checked ? '1' : '0');
      renderChart();
      if (state.panelId) openPanel(state.panelId, { noScroll: true });
    });
    $('#settings-btn').addEventListener('click', () => {
      const url = new URL(location.href);
      url.hash = '';
      if (state.root) url.searchParams.set('me', state.root);
      $('#share-link').value = url.toString();
      $('#settings').hidden = false;
    });
    $('#settings-close').addEventListener('click', () => { $('#settings').hidden = true; });
    $('#settings').addEventListener('click', (e) => { if (e.target.id === 'settings') $('#settings').hidden = true; });
    $('#copy-link').addEventListener('click', async () => {
      const inp = $('#share-link');
      try { await navigator.clipboard.writeText(inp.value); $('#copy-link').textContent = 'Copied'; }
      catch (e) { inp.select(); document.execCommand && document.execCommand('copy'); $('#copy-link').textContent = 'Copied'; }
      setTimeout(() => { $('#copy-link').textContent = 'Copy'; }, 1500);
    });
  }

  // ------------------------------------------------------------------ unlock
  // data/family-tree.enc.json is made by tools/encrypt.ps1:
  // PBKDF2-SHA256 -> 64 bytes (AES-256 key + HMAC key), AES-CBC data, HMAC-SHA256 over iv+ct.
  const KEY_STORE = 'ft-key';
  const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const b64e = (u8) => btoa(String.fromCharCode.apply(null, Array.from(u8)));
  async function deriveKeyBits(password, enc) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(enc.salt), iterations: enc.iter }, base, 512);
    return new Uint8Array(bits);
  }
  async function decryptWith(bits, enc) {
    const iv = b64d(enc.iv), ct = b64d(enc.ct);
    const macKey = await crypto.subtle.importKey('raw', bits.slice(32, 64), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const msg = new Uint8Array(iv.length + ct.length);
    msg.set(iv); msg.set(ct, iv.length);
    if (!(await crypto.subtle.verify('HMAC', macKey, b64d(enc.mac), msg))) return null;
    const aesKey = await crypto.subtle.importKey('raw', bits.slice(0, 32), { name: 'AES-CBC' }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, ct);
    return JSON.parse(new TextDecoder().decode(plain));
  }
  async function unlockData() {
    if (!window.crypto || !crypto.subtle) throw new Error('this browser cannot open encrypted pages; try a current version of Chrome, Safari, Edge or Firefox');
    const res = await fetch('data/family-tree.enc.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    const enc = await res.json();

    // A device that chose "Remember" keeps the derived key (not the password).
    try {
      const saved = JSON.parse(store.get(KEY_STORE) || 'null');
      if (saved && saved.salt === enc.salt) {
        const data = await decryptWith(b64d(saved.key), enc);
        if (data) return data;
      }
    } catch (e) { /* fall through to the prompt */ }

    const modal = $('#unlock'), form = $('#unlock-form'), input = $('#unlock-password');
    const btn = $('#unlock-btn'), err = $('#unlock-error');
    modal.hidden = false;
    setTimeout(() => input.focus(), 30);
    return new Promise((resolve) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.hidden = true;
        btn.disabled = true;
        btn.textContent = 'Unlocking…';
        try {
          const bits = await deriveKeyBits(input.value, enc);
          const data = await decryptWith(bits, enc);
          if (!data) throw new Error('bad password');
          if ($('#unlock-remember').checked) store.set(KEY_STORE, JSON.stringify({ salt: enc.salt, key: b64e(bits) }));
          input.value = '';
          modal.hidden = true;
          resolve(data);
        } catch (x) {
          err.hidden = false;
          input.select();
        } finally {
          btn.disabled = false;
          btn.textContent = 'Open the tree';
        }
      });
    });
  }

  // ------------------------------------------------------------------ boot
  async function boot() {
    let data;
    try {
      data = await unlockData();
    } catch (e) {
      $('#chart-viewport').innerHTML = `<p class="loading">Couldn't load the family data (${esc(e.message)}).</p>`;
      return;
    }
    index(data);
    document.title = data.meta.title || document.title;

    wireChart();
    wirePanel();
    wireSettings();
    renderLegend();
    wireSearch($('#quickfind'), $('#quickfind-results'), {
      floating: true, withRel: true, limit: 8,
      onPick: (id) => { openPanel(id); if (state.cardPos.has(id)) { go('tree'); scrollToCard(id, true); highlight(id); } }
    });
    wireSearch($('#picker-input'), $('#picker-results'), { withRel: false, limit: 12, onPick: (id) => setRoot(id) });
    $('#picker-suggested').addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (b) setRoot(b.dataset.id);
    });
    $('#switch-person').addEventListener('click', openPicker);
    $('#picker-close').addEventListener('click', closePicker);
    window.addEventListener('hashchange', route_);
    window.addEventListener('resize', () => { if (state.chartW) applyZoom(); });

    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('me');
    const saved = store.get(LS.root);
    const start = (fromUrl && P(fromUrl)) ? fromUrl : (saved && P(saved)) ? saved : (data.meta.rootPerson && P(data.meta.rootPerson)) ? data.meta.rootPerson : null;

    renderStories();
    route_();
    if (start) setRoot(start);
    else {
      $('#viewing-as').innerHTML = 'Viewing as —';
      openPicker();
    }
  }

  // Expose a few internals for debugging in the console.
  window.familyTree = { state, computeRel, rel: (a, b) => computeRel(a, b).term };
  boot();
})();
