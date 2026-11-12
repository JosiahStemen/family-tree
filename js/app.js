/* Stemen–Netzley Family Tree
   A dependency-free single-page app over data/family-tree.json. */
(function () {
  'use strict';

  // ------------------------------------------------------------------ constants
  const MAJOR_LINES = ['stemen', 'netzley', 'hesser', 'brooks', 'wood', 'ferguson'];
  const LINE_LABEL = {
    stemen: 'Stemen', netzley: 'Netzley', hesser: 'Hesser', brooks: 'Brooks', wood: 'Wood',
    ferguson: 'Ferguson', cary: 'Cary', cramer: "Cramer (Alivia's family)", both: 'Stemen & Netzley'
  };
  const MINORS = ['meadow-cary'];
  const SIDE_LINES = ['cary', 'cramer']; // in-law families with their own colour
  const CARD_W = 176, CARD_H = 112, SLOT = 192, ROW_H = 160;
  const PAD_T = 46, PAD_B = 40, PAD_L = 170, PAD_R = 60;
  const LS = {
    root: 'ft-root', living: 'ft-show-living', depth: 'ft-depth', todo: 'ft-todo-', storyFam: 'ft-story-family'
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
    if (MAJOR_LINES.includes(p.line) || p.line === 'both' || SIDE_LINES.includes(p.line)) return p.line;
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
          if (MAJOR_LINES.includes(cl) || SIDE_LINES.includes(cl)) return cl;
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
    const order = MAJOR_LINES.concat(SIDE_LINES, ['both']).filter((b) => groups[b]);
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
    if (editingOn() && !minor) {
      h += `<button type="button" class="btn btn-edit-big" data-edit="${esc(id)}">✎ Add or fix something about ${esc(firstName(p))}</button>`;
    }

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
    const ev = p.evidence;
    if (ev && ((ev.supports && ev.supports.length) || ev.unproven)) {
      relBody += `<dt>Evidence</dt><dd>`;
      if (ev.supports && ev.supports.length) relBody += `<ul class="evidence-list">${ev.supports.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
      if (ev.unproven) relBody += `<p class="muted evidence-gap"><strong>Not yet proven:</strong> ${esc(ev.unproven)}</p>`;
      relBody += `</dd>`;
    }
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
      if (sh) { showInChart(sh.dataset.show); if (window.innerWidth < 700) closePanel(); return; }
      const ed = e.target.closest('[data-edit]');
      if (ed) { openEditor({ personId: ed.dataset.edit }); return; }
      if (e.target.closest('[data-edit-story]')) openEditor({ action: 'story' });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#editor').hidden) { if (!editor.busy) closeEditor(); return; }
      if (!$('#settings').hidden) { $('#settings').hidden = true; return; }
      if (!$('#picker').hidden && state.root) { closePicker(); return; }
      if ($('#panel').classList.contains('open')) closePanel();
    });
  }

  // ------------------------------------------------------------------ stories
  // Which family's stories to show: an explicit choice, else the side of whoever the tree is viewed as.
  const STORY_FAMILIES = [
    { key: 'josiah', label: "Josiah's family",
      lede: 'Short histories drawn from the 1881 family history, obituaries, memorial pages, and memories shared by the family. Click a name to open that person.' },
    { key: 'alivia', label: "Alivia's family",
      lede: "Short histories of Alivia's Pennsylvania families, drawn from wills, court records, censuses, obituaries and memorial pages. Click a name to open that person." }
  ];
  const storyFamily = (s) => s.family || 'josiah';
  function currentStoryFamily() {
    const saved = store.get(LS.storyFam);
    if (saved === 'josiah' || saved === 'alivia') return saved;
    return state.root && branchOf(state.root) === 'cramer' ? 'alivia' : 'josiah';
  }
  function renderStories() {
    const el = $('#view-stories');
    const fam = currentStoryFamily();
    const famInfo = STORY_FAMILIES.find((f) => f.key === fam);
    const all = state.data.stories || [];
    const hasAlivia = all.some((s) => storyFamily(s) === 'alivia');
    const stories = hasAlivia ? all.filter((s) => storyFamily(s) === fam) : all;
    const book = fam === 'josiah' && stories.map((s) => s.source).find((s) => s && /History of the Stemen Family/i.test(s.title || ''));
    let h = `<div class="page-inner"><p class="eyebrow">Stories</p><h1>Family stories</h1>`;
    if (hasAlivia) {
      h += `<div class="story-toggle" role="group" aria-label="Whose family stories">` +
        STORY_FAMILIES.map((f) => `<button type="button" data-story-fam="${f.key}" aria-pressed="${f.key === fam}"` +
          `${f.key === fam ? ' class="on"' : ''}>${esc(f.label)}</button>`).join('') + `</div>`;
    }
    h += `<p class="lede">${esc(famInfo.lede)}</p>`;
    if (editingOn()) h += `<p><button type="button" class="btn btn-edit-big" data-edit-story="1">✎ Share a memory or story</button></p>`;
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
    $$('[data-story-fam]', el).forEach((b) => b.addEventListener('click', () => {
      store.set(LS.storyFam, b.dataset.storyFam);
      renderStories();
    }));
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
      const wanted = (state.data && state.data.stories || []).find((s) => s.id === arg);
      if (wanted && storyFamily(wanted) !== currentStoryFamily()) {
        store.set(LS.storyFam, storyFamily(wanted));
        renderStories();
      }
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
  const b64e = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
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
        const bits = b64d(saved.key);
        const data = await decryptWith(bits, enc);
        if (data) { state.keyBits = bits; state.enc = enc; return data; }
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
          state.keyBits = bits; state.enc = enc;
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

  // ------------------------------------------------------------------ family editing
  // Anyone with the password can add people, fix details and share memories.
  // The GitHub key that saves changes lives inside the encrypted data
  // (meta.editing, put there by tools/encrypt.ps1). A save fetches the newest
  // encrypted file from GitHub, decrypts it with the key already derived from
  // the password, applies one change, re-encrypts it (same salt, new IV) and
  // commits it back. Every change is logged in data.changes with what's needed
  // to undo it.
  const ED_NAME = 'ft-editor-name';
  const editingOn = () => !!(state.data && state.data.meta && state.data.meta.editing && state.data.meta.editing.token && state.keyBits);
  const editor = { busy: false };

  function reindex(data) {
    ['byId', 'childrenOf', 'partnersOf', 'branch', 'ancCache', 'relCache'].forEach((k) => state[k].clear());
    index(data);
    if (state.root && !P(state.root)) state.root = data.meta.rootPerson;
    renderChart();
    renderStories();
    if (state.panelId) { if (P(state.panelId)) openPanel(state.panelId, { noScroll: true }); else closePanel(); }
  }

  // ---- dates typed by people: "June 3, 1925", "6/3/1925", "1925", "about 1850"
  function parseDate(text) {
    const s = String(text || '').trim().replace(/\s+/g, ' ');
    if (!s) return { value: null, label: '' };
    const mon = (w) => {
      const i = MONTHS.findIndex((m) => m.toLowerCase().startsWith(w.toLowerCase().replace(/\.$/, '').slice(0, 3)));
      return w.replace(/\.$/, '').length >= 3 ? i : -1;
    };
    const iso = (y, m, d) => {
      if (m != null && (m < 0 || m > 11)) return null;
      if (d != null && (d < 1 || d > 31)) return null;
      return y + (m != null ? '-' + String(m + 1).padStart(2, '0') : '') + (d != null ? '-' + String(d).padStart(2, '0') : '');
    };
    const ok = (v) => v ? { value: v, label: fmtDate(v) } : null;
    let m, r;
    const approx = s.match(/^(about|abt\.?|around|circa|ca\.?|c\.|before|bef\.?|after|aft\.?)\s+(.*)$/i);
    if (approx) {
      const inner = parseDate(approx[2]);
      const word = /^(before|bef)/i.test(approx[1]) ? 'before' : /^(after|aft)/i.test(approx[1]) ? 'after' : 'about';
      const v = inner.value ? `${word} ${inner.label}` : s;
      return { value: v, label: v };
    }
    if ((m = s.match(/^(\d{4})$/))) return ok(m[1]);
    if ((m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/)) && (r = ok(iso(m[1], +m[2] - 1, m[3] ? +m[3] : null)))) return r;
    if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)) && (r = ok(iso(m[3], +m[1] - 1, +m[2])))) return r;
    if ((m = s.match(/^(\d{1,2})[/.-](\d{4})$/)) && (r = ok(iso(m[2], +m[1] - 1, null)))) return r;
    if ((m = s.match(/^([A-Za-z.]+) (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/)) && mon(m[1]) >= 0 && (r = ok(iso(m[3], mon(m[1]), +m[2])))) return r;
    if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)? (?:of )?([A-Za-z.]+),? (\d{4})$/)) && mon(m[2]) >= 0 && (r = ok(iso(m[3], mon(m[2]), +m[1])))) return r;
    if ((m = s.match(/^([A-Za-z.]+),? (\d{4})$/)) && mon(m[1]) >= 0 && (r = ok(iso(m[2], mon(m[1]), null)))) return r;
    return { value: s, label: s, unsure: true };
  }
  const shown = (v) => v ? fmtDate(v) : '';

  // ---- applying one change to a copy of the data
  function slugify(s) {
    return norm(s).replace(/[^a-z0-9 ]/g, '').trim().replace(/ +/g, '-').slice(0, 40) || 'person';
  }
  function newId(data, name) {
    const base = slugify(name);
    let id = base, n = 2;
    while (data.people.some((p) => p.id === id)) id = `${base}-${n++}`;
    return id;
  }
  const REL_WORD = {
    parent: { M: 'father', F: 'mother', _: 'parent' },
    child: { M: 'son', F: 'daughter', _: 'child' },
    sibling: { M: 'brother', F: 'sister', _: 'brother or sister' },
    spouse: { M: 'husband', F: 'wife', _: 'husband or wife' }
  };
  const relWord = (rel, sex) => REL_WORD[rel][sex] || REL_WORD[rel]._;
  const today = () => new Date().toISOString().slice(0, 10);
  const firstOf = (p) => p ? firstName(p) : '';

  function makePerson(data, f, anchor, gen, who, rel) {
    const yr = (d) => parseInt((String(d || '').match(/\d{4}/) || [])[0], 10);
    const by = yr(f.bdate);
    let living = f.living === 'yes' ? true : f.living === 'no' ? false : null;
    if (living === null) {
      // "Not sure": guess from the birth year, or from the relative's.
      const ay = yr(anchor.birth && anchor.birth.date);
      const est = by || (ay ? ay + (rel === 'parent' ? -30 : rel === 'child' ? 30 : 0) : 0);
      living = est ? est >= 1925 : !!anchor.living && rel !== 'parent';
    }
    const p = {
      id: newId(data, f.name), name: f.name.trim(), nickname: (f.nickname || '').trim() || null,
      sex: f.sex || null, living, status: 'confirmed',
      birth: { date: f.bdate || null, place: (f.bplace || '').trim() || null },
      death: { date: living ? null : (f.ddate || null), place: living ? null : ((f.dplace || '').trim() || null) },
      burial: null, parents: [], spouses: [], children: [], siblings: [], residences: [],
      occupation: null, religion: null, military: null, biography: (f.notes || '').trim(),
      facts: [], gravestone: null,
      sources: [{ title: `Added by ${who} on the family site, ${fmtDate(today())}` }],
      openQuestions: [], generation: gen, line: anchor.line, relationship: null, addedBy: who
    };
    if (living && by && new Date().getFullYear() - by < 18) p.minor = true;
    data.people.push(p);
    return p;
  }

  function applyOp(data, op, who) {
    data.people = data.people || [];
    data.stories = data.stories || [];
    data.changes = data.changes || [];
    const find = (id) => data.people.find((p) => p.id === id);
    const before = new Map(data.people.map((p) => [p.id, JSON.stringify(p)]));
    const storiesBefore = new Set(data.stories.map((s) => s.id));
    const entry = {
      id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      when: new Date().toISOString(), by: who, type: op.type, summary: '', focus: null
    };

    if (op.type === 'add') {
      const a = find(op.anchor);
      if (!a) throw new Error('That person is no longer in the tree.');
      a.parents = a.parents || []; a.spouses = a.spouses || []; a.children = a.children || []; a.siblings = a.siblings || [];
      const f = op.person;
      const g = typeof a.generation === 'number' ? a.generation : 0;
      const word = relWord(op.rel, f.sex);
      if (op.rel === 'sibling' && !a.parents.some(find)) {
        const yrs = [yearOf(f.bdate), f.living === 'yes' ? '' : yearOf(f.ddate)].filter(Boolean).join('–');
        a.siblings.push(f.name.trim() + (yrs ? ` (${yrs})` : ''));
        entry.focus = a.id;
      } else {
        const gen = op.rel === 'parent' ? g + 1 : op.rel === 'child' ? g - 1 : g;
        const p = makePerson(data, f, a, gen, who, op.rel);
        entry.focus = p.id;
        if (op.rel === 'parent') {
          const other = a.parents.map(find).filter(Boolean)[0];
          a.parents.push(p.id);
          p.children.push({ id: a.id });
          if (other) {
            p.spouses.push({ id: other.id });
            other.spouses = other.spouses || [];
            if (!other.spouses.some((s) => s.id === p.id)) other.spouses.push({ id: p.id });
          }
        } else if (op.rel === 'child') {
          p.parents.push(a.id);
          a.children.push({ id: p.id });
          const o = op.otherParent && find(op.otherParent);
          if (o) { p.parents.push(o.id); o.children = o.children || []; o.children.push({ id: p.id }); }
        } else if (op.rel === 'sibling') {
          a.parents.map(find).filter(Boolean).forEach((par) => {
            p.parents.push(par.id);
            par.children = par.children || [];
            par.children.push({ id: p.id });
          });
        } else if (op.rel === 'spouse') {
          const s = { id: a.id };
          if (f.mdate) s.marriageDate = f.mdate;
          if ((f.mplace || '').trim()) s.marriagePlace = f.mplace.trim();
          p.spouses.push(s);
          a.spouses.push(Object.assign({}, s, { id: p.id }));
        }
      }
      entry.summary = `Added ${f.name.trim()} as ${a.name}'s ${word}`;
    } else if (op.type === 'edit') {
      const p = find(op.id);
      if (!p) throw new Error('That person is no longer in the tree.');
      const done = [];
      const set = op.set || {};
      const label = { name: 'name', nickname: 'nickname', living: 'living', bdate: 'birth date', bplace: 'birthplace', ddate: 'death date', dplace: 'place of death', cemetery: 'burial', burialPlace: 'burial place', occupation: 'occupation' };
      Object.keys(set).forEach((k) => {
        const v = set[k];
        if (k === 'name') p.name = v;
        else if (k === 'nickname') p.nickname = v;
        else if (k === 'living') p.living = v;
        else if (k === 'occupation') p.occupation = v;
        else if (k === 'bdate' || k === 'bplace') { p.birth = p.birth || {}; p.birth[k === 'bdate' ? 'date' : 'place'] = v; }
        else if (k === 'ddate' || k === 'dplace') { p.death = p.death || {}; p.death[k === 'ddate' ? 'date' : 'place'] = v; }
        else if (k === 'cemetery' || k === 'burialPlace') { p.burial = p.burial || {}; p.burial[k === 'cemetery' ? 'cemetery' : 'location'] = v; }
        else return;
        done.push(label[k]);
      });
      if (p.burial && !p.burial.cemetery && !p.burial.location && !p.burial.notes && !p.burial.date) p.burial = null;
      if ((op.note || '').trim()) {
        p.facts = p.facts || [];
        p.facts.push({ text: op.note.trim(), source: `Shared by ${who}, ${fmtDate(today())}` });
        done.push('a note');
      }
      if (!done.length) throw new Error('Nothing was changed.');
      p.sources = p.sources || [];
      p.sources.push({ title: `Updated by ${who} on the family site, ${fmtDate(today())}` });
      entry.focus = p.id;
      entry.summary = `Updated ${p.name}: ${done.join(', ')}`;
    } else if (op.type === 'story') {
      const p = find(op.person);
      const people = p ? [p.id] : [];
      const id = 'memory-' + Date.now().toString(36);
      data.stories.push({
        id, title: (op.title || '').trim() || (p ? `A memory of ${firstOf(p)}` : 'A family memory'),
        text: op.text.trim(), people, addedBy: who, source: { title: `Shared by ${who}, ${fmtDate(today())}` }
      });
      entry.focus = p ? p.id : null;
      entry.story = id;
      entry.summary = p ? `Shared a memory about ${p.name}` : 'Shared a family memory';
    } else if (op.type === 'undo') {
      const c = data.changes.find((x) => x.id === op.change);
      if (!c || !c.undo) throw new Error('That change can no longer be undone.');
      if (c.undone) throw new Error('That change was already undone.');
      const u = c.undo;
      u.restore.forEach((old) => {
        const i = data.people.findIndex((p) => p.id === old.id);
        if (i >= 0) data.people[i] = old; else data.people.push(old);
      });
      data.people = data.people.filter((p) => !u.remove.includes(p.id));
      data.people.forEach((p) => {
        p.parents = (p.parents || []).filter((x) => !u.remove.includes(x));
        p.children = (p.children || []).filter((x) => !u.remove.includes(x.id));
        p.spouses = (p.spouses || []).filter((x) => !u.remove.includes(x.id));
      });
      data.stories = data.stories.filter((s) => !u.removeStories.includes(s.id));
      c.undone = { when: entry.when, by: who };
      entry.focus = c.focus && data.people.some((p) => p.id === c.focus) ? c.focus : null;
      entry.summary = `Undid: ${c.summary}`;
    }

    if (op.type !== 'undo') {
      const restore = [], remove = [];
      data.people.forEach((p) => {
        const b = before.get(p.id);
        if (b === undefined) remove.push(p.id);
        else if (b !== JSON.stringify(p)) restore.push(JSON.parse(b));
      });
      entry.undo = { restore, remove, removeStories: data.stories.filter((s) => !storiesBefore.has(s.id)).map((s) => s.id) };
    }
    data.changes.push(entry);
    return entry;
  }

  // ---- talking to GitHub
  async function encryptWith(bits, like, data) {
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const aesKey = await crypto.subtle.importKey('raw', bits.slice(0, 32), { name: 'AES-CBC' }, false, ['encrypt']);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aesKey, new TextEncoder().encode(JSON.stringify(data))));
    const macKey = await crypto.subtle.importKey('raw', bits.slice(32, 64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const msg = new Uint8Array(iv.length + ct.length);
    msg.set(iv); msg.set(ct, iv.length);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', macKey, msg));
    return {
      v: 1, kdf: like.kdf || 'PBKDF2-SHA256', iter: like.iter, cipher: like.cipher || 'AES-256-CBC+HMAC-SHA256',
      saved: new Date().toISOString(), salt: like.salt, iv: b64e(iv), mac: b64e(mac), ct: b64e(ct)
    };
  }
  class SaveError extends Error { constructor(kind, msg) { super(msg || kind); this.kind = kind; } }
  async function gh(path, opts) {
    const e = state.data.meta.editing;
    const o = opts || {};
    let r;
    try {
      r = await fetch(`https://api.github.com/repos/${e.owner}/${e.repo}/${path}`, {
        method: o.method || 'GET', cache: 'no-store', body: o.body,
        headers: Object.assign({ Authorization: `Bearer ${e.token}`, Accept: o.accept || 'application/vnd.github+json' },
          o.body ? { 'Content-Type': 'application/json' } : {})
      });
    } catch (x) { throw new SaveError('offline'); }
    if (r.status === 401 || r.status === 403 || r.status === 404) throw new SaveError('key', `GitHub said ${r.status}`);
    return r;
  }
  async function fetchLatest() {
    const e = state.data.meta.editing;
    const r = await gh(`contents/${e.path}?ref=${encodeURIComponent(e.branch)}&t=${Date.now()}`);
    if (!r.ok) throw new SaveError('github', `GitHub said ${r.status}`);
    const m = await r.json();
    let text;
    if (m.content && m.encoding === 'base64') text = new TextDecoder().decode(b64d(m.content.replace(/\s/g, '')));
    else {
      const b = await gh(`git/blobs/${m.sha}`, { accept: 'application/vnd.github.raw' });
      if (!b.ok) throw new SaveError('github', `GitHub said ${b.status}`);
      text = await b.text();
    }
    const enc = JSON.parse(text);
    if (enc.salt !== state.enc.salt) throw new SaveError('password');
    const data = await decryptWith(state.keyBits, enc);
    if (!data) throw new SaveError('password');
    return { sha: m.sha, enc, data };
  }
  async function saveOp(op, who) {
    const e = state.data.meta.editing;
    for (let attempt = 0; attempt < 4; attempt++) {
      const latest = await fetchLatest();
      const entry = applyOp(latest.data, op, who);
      const enc = await encryptWith(state.keyBits, latest.enc, latest.data);
      const r = await gh(`contents/${e.path}`, {
        method: 'PUT',
        body: JSON.stringify({ message: `Family edit: ${entry.summary} (by ${who})`, content: btoa(JSON.stringify(enc)), sha: latest.sha, branch: e.branch })
      });
      if (r.status === 409 || r.status === 422) continue; // someone else saved at the same moment: start again from theirs
      if (!r.ok) throw new SaveError('github', `GitHub said ${r.status}`);
      state.enc = enc;
      reindex(latest.data);
      return entry;
    }
    throw new SaveError('busy');
  }
  async function refreshFromGitHub() {
    if (!editingOn()) return;
    try {
      const latest = await fetchLatest();
      if ((latest.enc.saved || '') > (state.enc.saved || '')) { state.enc = latest.enc; reindex(latest.data); }
    } catch (e) { /* the published copy is fine to show */ }
  }
  function saveErrorText(e) {
    switch (e && e.kind) {
      case 'offline': return 'We couldn\'t reach the internet. Check that you\'re connected, then press “Try again.”';
      case 'key': return 'The tree\'s saving key isn\'t working any more (it may have expired). Nothing was changed. Please let Josiah know.';
      case 'password': return 'The family password was changed since you opened the tree. Please reload the page, type the new password, and try again.';
      case 'busy': return 'Several people were saving at the same time. Please press “Try again.”';
      default: return 'Something went wrong and nothing was saved. Please press “Try again.” If it keeps happening, let Josiah know.' + (e && e.message ? ` (${e.message})` : '');
    }
  }

  // ---- the step-by-step screens
  const ACTIONS = [
    { key: 'parent', icon: '👪', label: (n) => `Add ${n}'s mother or father` },
    { key: 'child', icon: '🍼', label: (n) => `Add ${n}'s son or daughter` },
    { key: 'sibling', icon: '🤝', label: (n) => `Add ${n}'s brother or sister` },
    { key: 'spouse', icon: '💍', label: (n) => `Add ${n}'s husband or wife` },
    { key: 'edit', icon: '✏️', label: (n) => `Fix or fill in ${n}'s dates, places and details` },
    { key: 'story', icon: '📝', label: (n) => `Share a memory or story about ${n}` }
  ];
  function openEditor(opts) {
    if (!editingOn()) return;
    Object.assign(editor, { busy: false, personId: null, action: null, form: {}, forms: {}, error: null, result: null, confirmUndo: null }, opts || {});
    editor.step = editor.personId ? (editor.action ? 'form' : 'what') : 'who';
    if (editor.personId && editor.action) startForm();
    $('#editor').hidden = false;
    renderEditor();
  }
  function closeEditor() { $('#editor').hidden = true; editor.busy = false; }

  const field = (id, label, value, o) => {
    o = o || {};
    const input = o.area
      ? `<textarea id="ef-${id}" rows="${o.rows || 5}" placeholder="${esc(o.ph || '')}">${esc(value || '')}</textarea>`
      : `<input id="ef-${id}" type="text" value="${esc(value || '')}" placeholder="${esc(o.ph || '')}" autocomplete="off"${o.date ? ' data-date="1"' : ''}>`;
    return `<div class="ef-field"><label for="ef-${id}">${esc(label)}</label>${o.help ? `<p class="ef-help">${esc(o.help)}</p>` : ''}${input}` +
      (o.date ? `<p class="ef-date-hint" id="ef-${id}-hint" aria-live="polite"></p>` : '') + `</div>`;
  };
  const choice = (name, options, current) => `<div class="ef-choices" role="radiogroup">${options.map(([v, l]) =>
    `<button type="button" class="ef-choice${current === v ? ' on' : ''}" role="radio" aria-checked="${current === v}" data-choice="${esc(name)}" data-value="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;

  function startForm() {
    const p = P(editor.personId);
    // Going "Back" and returning keeps what was already typed.
    const key = `${editor.personId}|${editor.action}`;
    editor.forms = editor.forms || {};
    if (editor.forms[key]) { editor.form = editor.forms[key]; return; }
    const f = editor.form = editor.forms[key] = {};
    if (editor.action === 'edit' && p) {
      Object.assign(f, {
        name: p.name, nickname: p.nickname || '', living: p.living ? 'yes' : 'no',
        bdate: shown(p.birth && p.birth.date), bplace: (p.birth && p.birth.place) || '',
        ddate: shown(p.death && p.death.date), dplace: (p.death && p.death.place) || '',
        cemetery: (p.burial && p.burial.cemetery) || '', burialPlace: (p.burial && p.burial.location) || '',
        occupation: p.occupation || '', note: ''
      });
    } else if (editor.action === 'child') {
      const partners = partnersOf(p.id);
      f.otherParent = partners.length === 1 ? partners[0] : '';
    }
    if (editor.action === 'parent' && p) {
      const have = parentsOf(p.id).map((x) => P(x).sex);
      if (have.length === 1) f.sex = have[0] === 'M' ? 'F' : have[0] === 'F' ? 'M' : '';
    }
  }

  const back = (to, text) => `<button type="button" class="btn ef-back" data-ed-go="${to}">← ${esc(text || 'Back')}</button>`;
  function renderEditor() {
    const el = $('#editor-body');
    const p = P(editor.personId);
    const n = p ? firstName(p) : '';
    let h = '';

    if (editor.step === 'who') {
      const sug = [state.panelId, state.root].filter((x, i, a) => x && P(x) && a.indexOf(x) === i && !isMinor(P(x)));
      h += `<p class="eyebrow">Add to the family tree</p><h2>${editor.action === 'story' ? 'Who is your memory about?' : 'Who is it about?'}</h2>` +
        `<p class="ef-lede">Start by choosing the person. If you're adding someone new, choose their parent, child, brother, sister, or husband or wife who is already in the tree.</p>`;
      if (sug.length) h += `<div class="ef-big-list">${sug.map((id) => `<button type="button" class="ef-big" data-ed-person="${esc(id)}"><span class="ef-big-icon">👤</span><span><strong>${esc(P(id).name)}</strong><small>${esc(lifespan(P(id)))}</small></span></button>`).join('')}</div>`;
      h += `<div class="ef-field"><label for="ef-who">${sug.length ? 'Or type a name to find someone else' : 'Type a name'}</label>` +
        `<input id="ef-who" type="search" placeholder="For example: Ruth or Netzley" autocomplete="off"></div><div id="ef-who-results" class="ef-big-list"></div>`;
      if (editor.action === 'story') h += `<button type="button" class="btn ef-link" data-ed-person="">It's about the whole family, not one person</button>`;
      h += `<div class="ef-foot"><button type="button" class="btn ef-link" data-ed-go="changes">See recent changes</button></div>`;
    } else if (editor.step === 'what') {
      const twoParents = parentsOf(p.id).length >= 2;
      h += `<p class="eyebrow">${esc(p.name)}</p><h2>What would you like to do?</h2><div class="ef-big-list">` +
        ACTIONS.map((a) => {
          const off = a.key === 'parent' && twoParents;
          return `<button type="button" class="ef-big" data-ed-action="${a.key}"${off ? ' disabled' : ''}><span class="ef-big-icon">${a.icon}</span>` +
            `<span><strong>${esc(a.label(n))}</strong>${off ? '<small>Both parents are already in the tree.</small>' : ''}</span></button>`;
        }).join('') + `</div><div class="ef-foot">${back('who', 'Choose a different person')}<button type="button" class="btn ef-link" data-ed-go="changes">See recent changes</button></div>`;
    } else if (editor.step === 'form') {
      h += formHTML(p, n);
    } else if (editor.step === 'review') {
      h += reviewHTML(p, n);
    } else if (editor.step === 'saving') {
      h += `<div class="ef-center"><div class="ef-spinner" aria-hidden="true"></div><h2>Saving…</h2><p class="ef-lede">Please wait a moment and don't close this page.</p></div>`;
    } else if (editor.step === 'done') {
      const r = editor.result;
      h += `<div class="ef-center"><div class="ef-check" aria-hidden="true">✓</div><h2>Thank you${editor.who ? ', ' + esc(editor.who.split(' ')[0]) : ''}!</h2>` +
        `<p class="ef-lede">${esc(r.summary)}.</p><p class="ef-lede">It's saved for the whole family. On other computers and phones it shows up within a few minutes.</p>` +
        `<div class="ef-buttons">${r.focus && P(r.focus) ? `<button type="button" class="btn btn-primary ef-main" data-ed-show="${esc(r.focus)}">Show me</button>` : ''}` +
        `<button type="button" class="btn ef-main" data-ed-go="again">Add something else</button>` +
        `<button type="button" class="btn ef-main" data-ed-close>I'm finished</button></div></div>`;
    } else if (editor.step === 'error') {
      h += `<div class="ef-center"><div class="ef-check ef-bad" aria-hidden="true">!</div><h2>That didn't save</h2><p class="ef-lede">${esc(editor.error)}</p>` +
        `<div class="ef-buttons"><button type="button" class="btn btn-primary ef-main" data-ed-save>Try again</button>${editor.built && editor.built.op.type === 'undo' ? back('changes') : back('form', 'Go back to the form')}</div></div>`;
    } else if (editor.step === 'changes') {
      h += changesHTML();
    }
    el.innerHTML = h;
    el.scrollTop = 0;
    wireEditorStep();
  }

  function formHTML(p, n) {
    const f = editor.form, a = editor.action;
    let h = '';
    const who = `<div class="ef-field ef-you">${field('yourname', 'Your name', editor.who || store.get(ED_NAME) || '', { help: 'So the family knows who shared this.', ph: 'For example: Aunt Mary Smith' })}</div>`;
    if (a === 'edit') {
      h += `<p class="eyebrow">${esc(p.name)}</p><h2>Fix or fill in details</h2><p class="ef-lede">Change anything that's wrong or missing. Leave the rest as it is.</p>` +
        field('name', 'Full name', f.name, { help: 'For women, you can put the maiden name in brackets, like Mary (Smith) Jones.' }) +
        field('nickname', 'Nickname (if they had one)', f.nickname) +
        `<div class="ef-field"><label>Is ${esc(n)} still living?</label>${choice('living', [['yes', 'Yes, living'], ['no', 'No, has passed away']], f.living)}</div>` +
        `<fieldset class="ef-group"><legend>Birth</legend>${field('bdate', 'Date of birth', f.bdate, { date: 1, ph: 'June 3, 1925 — or just 1925' })}${field('bplace', 'Where they were born', f.bplace, { ph: 'Town, County, State' })}</fieldset>` +
        `<fieldset class="ef-group" data-if-dead><legend>Death</legend>${field('ddate', 'Date of death', f.ddate, { date: 1, ph: 'March 12, 1998 — or just 1998' })}${field('dplace', 'Where they died', f.dplace, { ph: 'Town, County, State' })}` +
        `${field('cemetery', 'Cemetery where buried', f.cemetery)}${field('burialPlace', 'Cemetery town', f.burialPlace)}</fieldset>` +
        field('occupation', 'Work or occupation', f.occupation, { ph: 'Farmer, teacher, nurse…' }) +
        field('note', 'Anything else to add or explain?', f.note, { area: 1, rows: 4, help: 'For example: "She was born at home on the farm," or "The date on the gravestone is wrong."' });
    } else if (a === 'story') {
      h += `<p class="eyebrow">${esc(p ? p.name : 'The whole family')}</p><h2>Share a memory or story</h2>` +
        `<p class="ef-lede">Write it just as you'd tell it. There's no wrong way to do it.</p>` +
        field('title', 'A short title (you can skip this)', f.title, { ph: p ? `A memory of ${n}` : 'A family memory' }) +
        field('text', 'Your memory or story', f.text, { area: 1, rows: 10 });
    } else {
      const sexChoices = {
        parent: [['M', 'Father'], ['F', 'Mother']], child: [['M', 'Son'], ['F', 'Daughter']],
        sibling: [['M', 'Brother'], ['F', 'Sister']], spouse: [['M', 'Husband'], ['F', 'Wife']]
      }[a];
      const title = { parent: `Add ${n}'s mother or father`, child: `Add ${n}'s son or daughter`, sibling: `Add ${n}'s brother or sister`, spouse: `Add ${n}'s husband or wife` }[a];
      h += `<p class="eyebrow">${esc(p.name)}</p><h2>${esc(title)}</h2>`;
      h += `<div class="ef-field"><label>Is this ${esc(n)}'s…</label>${choice('sex', sexChoices, f.sex)}</div>`;
      if (a === 'sibling' && !parentsOf(p.id).length) {
        h += `<p class="ef-note">${esc(n)}'s parents aren't in the tree yet, so this brother or sister will be listed by name on ${esc(n)}'s page. (Tip: add the parents first, and then brothers and sisters will appear in the chart.)</p>`;
      }
      if (a === 'child') {
        const partners = partnersOf(p.id);
        h += `<div class="ef-field"><label>Who is the other parent?</label>${choice('otherParent',
          partners.map((x) => [x, P(x).name]).concat([['', 'Someone else, or not sure']]), f.otherParent || '')}</div>`;
      }
      h += field('name', 'Full name', f.name, { help: 'First, middle and last name if you know them. For women, you can put the maiden name in brackets, like Mary (Smith) Jones.', ph: 'For example: Mary Ellen (Smith) Jones' }) +
        `<div class="ef-field"><label>Are they still living?</label>${choice('living', [['yes', 'Yes, living'], ['no', 'No, passed away'], ['unsure', 'Not sure']], f.living)}</div>` +
        `<fieldset class="ef-group"><legend>Birth</legend>${field('bdate', 'Date of birth (if you know it)', f.bdate, { date: 1, ph: 'June 3, 1925 — or just 1925' })}${field('bplace', 'Where they were born', f.bplace, { ph: 'Town, County, State' })}</fieldset>` +
        `<fieldset class="ef-group" data-if-dead><legend>Death</legend>${field('ddate', 'Date of death (if you know it)', f.ddate, { date: 1, ph: 'March 12, 1998 — or just 1998' })}${field('dplace', 'Where they died', f.dplace, { ph: 'Town, County, State' })}</fieldset>`;
      if (a === 'spouse') h += `<fieldset class="ef-group"><legend>Marriage</legend>${field('mdate', 'Wedding date (if you know it)', f.mdate, { date: 1, ph: 'June 3, 1950 — or just 1950' })}${field('mplace', 'Where they married', f.mplace, { ph: 'Town, County, State' })}</fieldset>`;
      h += field('notes', 'Anything else about them?', f.notes, { area: 1, rows: 4, help: 'Where they lived, their work, what they were like… anything you\'d like the family to know.' });
    }
    h += who;
    h += `<p class="ef-error" id="ef-error" hidden></p>`;
    h += `<div class="ef-foot">${back(editor.fromWhat === false ? 'who' : 'what')}<button type="button" class="btn btn-primary ef-main" data-ed-review>Next →</button></div>`;
    return h;
  }

  function collectForm() {
    $$('#editor-body [id^="ef-"]').forEach((i) => {
      if (i.matches('input, textarea') && i.id !== 'ef-who-results') editor.form[i.id.slice(3)] = i.value;
    });
    if (editor.form.yourname != null) editor.who = editor.form.yourname.trim();
  }

  function buildOp() {
    const f = editor.form, a = editor.action, p = P(editor.personId);
    const d = (k) => parseDate(f[k]).value;
    const t = (k) => (f[k] || '').trim() || null;
    if (!editor.who) return { error: 'Please type your name in the “Your name” box, so the family knows who shared this.' };
    if (a === 'story') {
      if (!(f.text || '').trim()) return { error: 'Please write your memory or story in the big box.' };
      return { op: { type: 'story', person: p ? p.id : null, title: f.title || '', text: f.text } };
    }
    if (a === 'edit') {
      const set = {};
      const cur = {
        name: p.name, nickname: p.nickname || null, living: !!p.living, bdate: (p.birth && p.birth.date) || null, bplace: (p.birth && p.birth.place) || null,
        ddate: (p.death && p.death.date) || null, dplace: (p.death && p.death.place) || null, cemetery: (p.burial && p.burial.cemetery) || null,
        burialPlace: (p.burial && p.burial.location) || null, occupation: p.occupation || null
      };
      const next = {
        name: t('name'), nickname: t('nickname'), living: f.living === 'yes', bdate: d('bdate'), bplace: t('bplace'),
        ddate: d('ddate'), dplace: t('dplace'), cemetery: t('cemetery'), burialPlace: t('burialPlace'), occupation: t('occupation')
      };
      if (!next.name) return { error: 'The name can\'t be empty.' };
      // dates the person didn't touch keep their exact stored form
      ['bdate', 'ddate'].forEach((k) => { if ((f[k] || '').trim() === shown(cur[k])) next[k] = cur[k]; });
      if (next.living) { next.ddate = cur.ddate; next.dplace = cur.dplace; }
      Object.keys(next).forEach((k) => { if (next[k] !== cur[k]) set[k] = next[k]; });
      if (!Object.keys(set).length && !(f.note || '').trim()) return { error: 'Nothing has been changed yet. Change a box above, or press “Back.”' };
      return { op: { type: 'edit', id: p.id, set, note: f.note || '' }, set, cur };
    }
    if (!f.sex) return { error: `Please choose ${relWord(a, 'M')} or ${relWord(a, 'F')} at the top.` };
    if (!t('name')) return { error: 'Please type their name.' };
    if (!f.living) return { error: 'Please choose whether they are still living.' };
    const person = { name: t('name'), sex: f.sex, living: f.living, bdate: d('bdate'), bplace: t('bplace'), ddate: d('ddate'), dplace: t('dplace'), notes: t('notes') };
    if (a === 'spouse') { person.mdate = d('mdate'); person.mplace = t('mplace'); }
    return { op: { type: 'add', anchor: p.id, rel: a, otherParent: a === 'child' ? (f.otherParent || null) : null, person } };
  }

  function reviewHTML(p, n) {
    const b = editor.built, op = b.op;
    const line = (label, v) => v ? `<dt>${esc(label)}</dt><dd>${esc(v)}</dd>` : '';
    let h = `<p class="eyebrow">Almost done</p><h2>Is this right?</h2><div class="ef-review">`;
    if (op.type === 'add') {
      const x = op.person;
      h += `<p class="ef-sentence">Add <strong>${esc(x.name)}</strong> as ${esc(p.name)}'s <strong>${esc(relWord(op.rel, x.sex))}</strong>.</p><dl>` +
        line('Living', x.living === 'yes' ? 'Yes' : x.living === 'no' ? 'No' : 'Not sure') +
        line('Born', [shown(x.bdate), x.bplace].filter(Boolean).join(', ')) +
        (x.living === 'yes' ? '' : line('Died', [shown(x.ddate), x.dplace].filter(Boolean).join(', '))) +
        line('Married', [shown(x.mdate), x.mplace].filter(Boolean).join(', ')) +
        (op.otherParent && P(op.otherParent) ? line('Other parent', P(op.otherParent).name) : '') +
        line('Notes', x.notes) + `</dl>`;
      const twins = state.data.people.filter((q) => norm(q.name) === norm(x.name));
      if (twins.length) h += `<p class="ef-note">There's already someone named ${esc(twins[0].name)}${lifespan(twins[0]) ? ` (${esc(lifespan(twins[0]))})` : ''} in the tree. If that's the same person, go back and don't add them twice.</p>`;
    } else if (op.type === 'edit') {
      const lab = { name: 'Name', nickname: 'Nickname', living: 'Living', bdate: 'Born', bplace: 'Birthplace', ddate: 'Died', dplace: 'Place of death', cemetery: 'Cemetery', burialPlace: 'Cemetery town', occupation: 'Work' };
      const fmt = (k, v) => k === 'living' ? (v ? 'Yes' : 'No') : (k === 'bdate' || k === 'ddate') ? shown(v) : v;
      const rows = Object.keys(b.set).map((k) => `<tr><th>${esc(lab[k])}</th><td class="ef-old">${esc(fmt(k, b.cur[k]) || '(blank)')}</td><td>→</td><td class="ef-new">${esc(fmt(k, b.set[k]) || '(blank)')}</td></tr>`).join('');
      h += `<p class="ef-sentence">Update <strong>${esc(p.name)}</strong>:</p>${rows ? `<table class="ef-diff">${rows}</table>` : ''}` +
        ((op.note || '').trim() ? `<p><strong>Note:</strong> ${esc(op.note.trim())}</p>` : '');
    } else if (op.type === 'story') {
      h += `<p class="ef-sentence">Share this ${p ? `memory of <strong>${esc(p.name)}</strong>` : 'family memory'}:</p>` +
        `<blockquote>${esc(op.text.trim()).replace(/\n/g, '<br>')}</blockquote>`;
    }
    h += `<p class="muted">Shared by ${esc(editor.who)}</p></div>` +
      `<div class="ef-foot"><button type="button" class="btn ef-back" data-ed-go="form">← Go back and change it</button>` +
      `<button type="button" class="btn btn-primary ef-main" data-ed-save>Yes, save it</button></div>`;
    return h;
  }

  function changesHTML() {
    const list = (state.data.changes || []).slice().reverse().slice(0, 40);
    let h = `<p class="eyebrow">Family tree</p><h2>Recent changes</h2>`;
    if (!list.length) h += `<p class="ef-lede">No one has made any changes on the site yet.</p>`;
    else {
      h += `<p class="ef-lede">Newest first. If something was a mistake, you can undo it.</p><ul class="ef-changes">` + list.map((c) => {
        const when = new Date(c.when);
        const date = isNaN(when) ? '' : when.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        let act = '';
        if (c.undone) act = `<span class="muted small">Undone by ${esc(c.undone.by)}</span>`;
        else if (c.undo && editor.confirmUndo === c.id) act = `<span class="ef-confirm">Undo this? <button type="button" class="btn btn-primary" data-ed-undo-yes="${esc(c.id)}">Yes, undo it</button> <button type="button" class="btn" data-ed-undo-no>No</button></span>`;
        else if (c.undo) act = `<button type="button" class="btn" data-ed-undo="${esc(c.id)}">Undo</button>`;
        return `<li><div><strong>${esc(c.summary)}</strong><div class="muted small">${esc(c.by)}${date ? ' · ' + esc(date) : ''}</div></div>${act}</li>`;
      }).join('') + `</ul>`;
    }
    h += `<div class="ef-foot"><button type="button" class="btn ef-back" data-ed-go="${editor.personId ? 'what' : 'who'}">← Back</button></div>`;
    return h;
  }

  function updateDateHints() {
    $$('#editor-body input[data-date]').forEach((i) => {
      const hint = document.getElementById(i.id + '-hint');
      if (!hint) return;
      const r = parseDate(i.value);
      hint.className = 'ef-date-hint' + (r.unsure ? ' unsure' : '');
      hint.textContent = !i.value.trim() ? '' : r.unsure ? `We'll save it just as you typed it: “${r.label}”` : `✓ ${r.label}`;
    });
    const dead = $('#editor-body [data-if-dead]');
    if (dead) dead.hidden = editor.form.living === 'yes';
  }

  function wireEditorStep() {
    const who = $('#ef-who');
    if (who) {
      const res = $('#ef-who-results');
      who.addEventListener('input', () => {
        const found = searchPeople(who.value, 8).filter((x) => !isMinor(x));
        res.innerHTML = !who.value.trim() ? '' : found.length
          ? found.map((x) => `<button type="button" class="ef-big" data-ed-person="${esc(x.id)}"><span class="ef-big-icon">👤</span><span><strong>${esc(x.name)}</strong><small>${esc([lifespan(x), state.root ? rel(x.id).term : ''].filter(Boolean).join(' · '))}</small></span></button>`).join('')
          : `<p class="ef-note">No one by that name yet. Try just a first name or just a last name.</p>`;
      });
      if (!$('.ef-big', $('#editor-body'))) setTimeout(() => who.focus(), 30);
    }
    $$('#editor-body input[data-date]').forEach((i) => i.addEventListener('input', updateDateHints));
    updateDateHints();
  }

  function wireEditor() {
    const modal = $('#editor');
    $('#editor-close').addEventListener('click', () => { if (!editor.busy) closeEditor(); });
    modal.addEventListener('click', async (e) => {
      const t = (s) => e.target.closest(s);
      let b;
      if ((b = t('[data-ed-person]'))) {
        editor.personId = b.dataset.edPerson || null;
        if (editor.action === 'story') { editor.fromWhat = false; startForm(); editor.step = 'form'; }
        else editor.step = 'what';
        renderEditor();
      } else if ((b = t('[data-ed-action]'))) {
        editor.action = b.dataset.edAction; editor.fromWhat = true;
        startForm(); editor.step = 'form'; renderEditor();
      } else if ((b = t('[data-choice]'))) {
        collectForm();
        editor.form[b.dataset.choice] = b.dataset.value;
        $$(`[data-choice="${b.dataset.choice}"]`, modal).forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
        updateDateHints();
      } else if (t('[data-ed-review]')) {
        collectForm();
        const built = buildOp();
        const err = $('#ef-error');
        if (built.error) { err.textContent = built.error; err.hidden = false; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
        store.set(ED_NAME, editor.who);
        editor.built = built; editor.step = 'review'; renderEditor();
      } else if (t('[data-ed-save]')) {
        if (editor.busy) return;
        editor.busy = true; editor.step = 'saving'; renderEditor();
        try {
          editor.result = await saveOp(editor.built.op, editor.who);
          editor.step = 'done';
        } catch (x) {
          editor.error = saveErrorText(x); editor.step = 'error';
        }
        editor.busy = false;
        renderEditor();
      } else if ((b = t('[data-ed-show]'))) {
        const id = b.dataset.edShow;
        closeEditor();
        go('tree');
        openPanel(id);
        if (locate(id)) showInChart(id);
      } else if ((b = t('[data-ed-go]'))) {
        const to = b.dataset.edGo;
        if (editor.step === 'form') collectForm();
        if (to === 'again') { openEditor({ personId: editor.personId }); return; }
        if (to === 'who') { editor.personId = null; if (editor.step === 'what') editor.action = null; }
        if (to === 'what') editor.action = null;
        editor.confirmUndo = null;
        editor.step = to; renderEditor();
      } else if (t('[data-ed-close]')) {
        closeEditor();
      } else if ((b = t('[data-ed-undo]'))) {
        editor.confirmUndo = b.dataset.edUndo; renderEditor();
      } else if (t('[data-ed-undo-no]')) {
        editor.confirmUndo = null; renderEditor();
      } else if ((b = t('[data-ed-undo-yes]'))) {
        if (editor.busy) return;
        if (!editor.who) editor.who = store.get(ED_NAME) || 'A family member';
        editor.built = { op: { type: 'undo', change: b.dataset.edUndoYes } };
        editor.busy = true; editor.step = 'saving'; renderEditor();
        try { editor.result = await saveOp(editor.built.op, editor.who); editor.step = 'done'; }
        catch (x) { editor.error = saveErrorText(x); editor.step = 'error'; }
        editor.busy = false;
        renderEditor();
      }
    });
    $('#edit-btn').addEventListener('click', () => openEditor({ personId: null }));
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
    wireEditor();
    $('#edit-btn').hidden = !editingOn();
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
    refreshFromGitHub();
  }

  // Expose a few internals for debugging in the console.
  window.familyTree = { state, computeRel, rel: (a, b) => computeRel(a, b).term };
  boot();
})();
