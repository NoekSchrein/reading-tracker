// ── State ──
let db = null;
let groups = [];
let challenges = [];
let books = [];
let assignments = [];
let filters = { status: 'all', group: 'all' };
let editingBookId = null;

const GOODREADS_GROUPS = [];

// ── Supabase ──
function connectSupabase() {
  const url = document.getElementById('sb-url').value.trim();
  const key = document.getElementById('sb-key').value.trim();
  if (!url || !key) { toast('Vul zowel de URL als de sleutel in'); return; }
  try {
    db = supabase.createClient(url, key);
    localStorage.setItem('sb_url', url);
    localStorage.setItem('sb_key', key);
    document.getElementById('connection-panel').classList.add('hidden');
    updateConnectionStatus(true);
    toast('Verbonden! Gegevens worden geladen…');
    loadAll();
  } catch(e) {
    toast('Verbinding mislukt: ' + e.message);
  }
}

function dismissSetup() {
  document.getElementById('connection-panel').classList.add('hidden');
  toast('Offline modus — gegevens lokaal opgeslagen');
}

async function loadAll() {
  if (db) {
    const [g, c, b, a] = await Promise.all([
      db.from('groups').select('*').order('created_at'),
      db.from('challenges').select('*').order('created_at'),
      db.from('books').select('*').order('created_at'),
      db.from('assignments').select('*'),
    ]);
    if (g.error) { handleDbError(g.error); return; }
    groups = g.data || [];
    challenges = c.data || [];
    books = b.data || [];
    assignments = a.data || [];
  } else {
    groups = JSON.parse(localStorage.getItem('groups') || '[]');
    challenges = JSON.parse(localStorage.getItem('challenges') || '[]');
    books = JSON.parse(localStorage.getItem('books') || '[]');
    assignments = JSON.parse(localStorage.getItem('assignments') || '[]');
  }
  renderAll();
}

function saveLocal() {
  localStorage.setItem('groups', JSON.stringify(groups));
  localStorage.setItem('challenges', JSON.stringify(challenges));
  localStorage.setItem('books', JSON.stringify(books));
  localStorage.setItem('assignments', JSON.stringify(assignments));
}

function handleDbError(err) {
  console.error(err);
  if (err.message && err.message.includes('does not exist')) {
    toast('⚠️ Tabellen niet gevonden — controleer de installatie-instructies');
  } else {
    toast('Databasefout: ' + err.message);
  }
}

// ── Views ──
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.getElementById('view-' + name).classList.add('active');
  closeMobileNav();
  if (name === 'home') renderHome();
  if (name === 'challenges') renderChallengesView();
  if (name === 'manage') renderManageView();
  if (name === 'books') { renderGroupFilters(); renderBooks(); }
  animateView(name);
}

// ── Mobile nav ──
function toggleMobileNav() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('mobile-overlay').classList.toggle('open');
}

function closeMobileNav() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('mobile-overlay').classList.remove('open');
}

// ── Connection panel ──
function toggleConnectionPanel() {
  document.getElementById('connection-panel').classList.toggle('hidden');
}

function updateConnectionStatus(connected) {
  const dot = document.getElementById('connection-dot');
  const label = document.getElementById('connection-label');
  if (connected) {
    dot.className = 'conn-dot connected';
    label.textContent = 'Verbonden met Supabase';
  } else {
    dot.className = 'conn-dot offline';
    label.textContent = 'Verbinding instellen';
  }
}

// ── Render all ──
function renderAll() {
  renderHome();
  renderGroupFilters();
  renderBooks();
  renderChallengesView();
  renderManageView();
}

// ── Home view ──
function renderHome() {
  // Date
  const dateEl = document.getElementById('home-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('nl-NL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  animateHero();

  const dash = document.getElementById('home-dashboard');
  if (challenges.length === 0) {
    dash.innerHTML = `
      <div class="dash-empty">
        <div class="dash-empty-icon">📚</div>
        <p>Nog geen opdrachten.</p>
        <p style="margin-top:.35rem">Ga naar <strong>Beheer</strong> om je leesgroepen en opdrachten toe te voegen.</p>
      </div>`;
    return;
  }

  // ── Build data per challenge ──
  function chalData(c) {
    const g = groups.find(gr => gr.id === c.group_id);
    const cAssignments = assignments.filter(a => a.challenge_id === c.id);
    const cBooks = cAssignments.map(a => {
      const bk = books.find(b => b.id === a.book_id);
      return bk ? { book: bk, note: a.note } : null;
    }).filter(Boolean);
    const doneCount    = cBooks.filter(x => x.book.status === 'done').length;
    const readingCount = cBooks.filter(x => x.book.status === 'reading').length;
    const total        = cBooks.length;
    const isComplete   = total > 0 && doneCount === total;
    const isActive     = readingCount > 0;
    const needsBook    = total === 0;
    const notStarted   = total > 0 && readingCount === 0 && !isComplete;

    let daysLeft = null;
    let urgency  = '';
    if (c.deadline && !isComplete) {
      daysLeft = Math.ceil((new Date(c.deadline) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysLeft < 0)       urgency = 'overdue';
      else if (daysLeft <= 7) urgency = 'critical';
      else if (daysLeft <= 30) urgency = 'soon';
    }

    const booksRequired = c.books_required || null;
    const missing = booksRequired !== null ? Math.max(0, booksRequired - total) : null;

    return { g, cBooks, doneCount, total, isComplete, isActive, needsBook, notStarted, daysLeft, urgency, booksRequired, missing };
  }

  // ── Render a single challenge card ──
  function renderChalCard(c) {
    const { g, cBooks, doneCount, total, isComplete, needsBook, daysLeft, urgency, booksRequired, missing } = chalData(c);
    const denominator = booksRequired || total;
    const pct = denominator === 0 ? 0 : Math.round((doneCount / denominator) * 100);
    const fractionLabel = booksRequired ? `${doneCount}/${booksRequired}` : `${doneCount}/${total}`;

    // Deadline pill — no emojis, CSS color does the work
    let deadlinePill = '';
    if (c.deadline && !isComplete) {
      const label = daysLeft < 0
        ? `${Math.abs(daysLeft)}d te laat`
        : daysLeft === 0 ? 'Vandaag'
        : daysLeft <= 7 ? `nog ${daysLeft}d`
        : new Date(c.deadline).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
      const cls = urgency === 'overdue' ? 'dl-overdue' : urgency === 'critical' ? 'dl-critical' : urgency === 'soon' ? 'dl-soon' : 'dl-normal';
      deadlinePill = `<span class="chal-deadline-pill ${cls}">${label}</span>`;
    } else if (isComplete && c.deadline) {
      deadlinePill = `<span class="chal-deadline-pill dl-done">Klaar</span>`;
    }

    // Meta line: group · period · points
    const metaParts = [];
    if (g) metaParts.push(esc(g.name));
    if (c.period) metaParts.push(esc(c.period));
    if (c.points) metaParts.push(`${c.points} pts`);
    const metaHtml = metaParts.length
      ? `<div class="chal-header-meta">${metaParts.join('<span class="chal-meta-sep">·</span>')}</div>`
      : '';

    // Sort books: reading first, then to-read, then done
    const sortedBooks = [...cBooks].sort((a, b) => {
      const order = { reading: 0, 'to-read': 1, done: 2 };
      return (order[a.book.status] ?? 3) - (order[b.book.status] ?? 3);
    });

    // Book rows — status dot + title + author + action only
    const bookRows = sortedBooks.map(({ book: b, note }) => {
      const dotCls = b.status === 'done' ? 'dot-done' : b.status === 'reading' ? 'dot-reading' : 'dot-to-read';
      const rowCls = b.status === 'done' ? ' is-done' : b.status === 'reading' ? ' is-reading' : '';
      const actionBtn = b.status === 'reading'
        ? `<button class="btn btn-accent btn-sm" onclick="event.stopPropagation();quickStatus('${b.id}','done')">Klaar</button>`
        : b.status === 'to-read'
          ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();quickStatus('${b.id}','reading')">Start</button>`
          : '';
      const grLink = b.goodreads_url
        ? `<a href="${b.goodreads_url}" target="_blank" rel="noopener" class="chal-gr-link" onclick="event.stopPropagation()" title="Goodreads">↗</a>`
        : '';
      const noteHtml = note ? `<span class="chal-book-note">${esc(note)}</span>` : '';
      return `<div class="chal-book-row${rowCls}">
        <span class="chal-status-dot ${dotCls}"></span>
        <div class="chal-book-info">
          <strong>${esc(b.title)}</strong>
          <span>${esc(b.author)}${noteHtml ? ' — ' : ''}${noteHtml}</span>
        </div>
        <div class="chal-book-actions">${actionBtn}${grLink}</div>
      </div>`;
    }).join('');

    const addBookBtn = !isComplete
      ? `<button class="chal-add-book" onclick="event.stopPropagation();openBookForChallenge('${c.id}')" title="Boek toevoegen aan deze opdracht">
           <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
             <path d="M1 1.5h5v10H1z"/>
             <path d="M6 2.5c.6-.7 1.6-1 2.5-1s2 .4 2 .4v8.5s-.9-.4-2-.4-2.5.7-2.5.7V2.5Z"/>
             <line x1="10" y1="8" x2="10" y2="13"/>
             <line x1="7.5" y1="10.5" x2="12.5" y2="10.5"/>
           </svg>
         </button>`
      : '';

    const cardClass = isComplete ? 'chal-card done' : urgency ? `chal-card ${urgency}` : 'chal-card';

    return `<div class="${cardClass}">
      <div class="chal-card-header" onclick="openChallengeDetailPopup('${c.id}')">
        <div class="chal-header-top">
          <span class="chal-card-name">${esc(c.name)}</span>
          ${deadlinePill}
        </div>
        ${metaHtml}
        ${denominator > 0 ? `
          <div class="chal-card-progress">
            <div class="bar-bg"><div class="bar-fill" style="width:${pct}%"></div></div>
            <span class="chal-card-fraction">${fractionLabel}</span>
          </div>` : ''}
      </div>
      <div class="chal-card-books">
        ${missing > 0 ? `<div class="chal-missing-row"><span class="chal-missing-pill">${missing} boek${missing !== 1 ? 'en' : ''} nog te zoeken</span></div>` : ''}
        ${bookRows || '<p class="chal-no-books">Geen boeken toegewezen</p>'}
        ${addBookBtn}
      </div>
    </div>`;
  }

  // ── Sort challenges: urgent first, then active, then not-started, then needs-book, then done ──
  function priority(c) {
    const d = chalData(c);
    if (d.isComplete) return 5;
    if (d.urgency === 'overdue')  return 0;
    if (d.urgency === 'critical') return 1;
    if (d.isActive) return 2;
    if (d.notStarted) return 3;
    if (d.needsBook) return 4;
    if (d.urgency === 'soon') return 2;
    return 3;
  }

  const sorted = [...challenges].sort((a, b) => {
    const pa = priority(a), pb = priority(b);
    if (pa !== pb) return pa - pb;
    // Secondary: deadline
    if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });

  // ── Section definitions ──
  const sections = [
    {
      id: 'urgent',
      title: 'Urgent',
      icon: '🔥',
      filter: c => { const d = chalData(c); return !d.isComplete && (d.urgency === 'overdue' || d.urgency === 'critical'); }
    },
    {
      id: 'active',
      title: 'Actief',
      icon: '📖',
      filter: c => { const d = chalData(c); return !d.isComplete && d.isActive && d.urgency !== 'overdue' && d.urgency !== 'critical'; }
    },
    {
      id: 'not-started',
      title: 'Nog te starten',
      icon: '⏳',
      filter: c => { const d = chalData(c); return !d.isComplete && d.notStarted && !d.needsBook && d.urgency !== 'overdue' && d.urgency !== 'critical'; }
    },
    {
      id: 'needs-book',
      title: 'Boek nog te kiezen',
      icon: '❓',
      filter: c => { const d = chalData(c); return !d.isComplete && d.needsBook; }
    },
    {
      id: 'done',
      title: 'Afgerond',
      icon: '✅',
      filter: c => chalData(c).isComplete
    },
  ];

  let html = '';
  for (const sec of sections) {
    const items = sorted.filter(sec.filter);
    if (items.length === 0) continue;
    const isCollapsed = sec.id === 'done';
    html += `<div class="dash-section ${isCollapsed ? 'dash-section--collapsible' : ''}">
      <div class="dash-section-header" ${isCollapsed ? `onclick="this.parentElement.classList.toggle('open')"` : ''}>
        <span class="dash-section-icon">${sec.icon}</span>
        <span class="dash-section-title">${sec.title}</span>
        <span class="dash-section-count">${items.length}</span>
        ${isCollapsed ? '<span class="dash-section-chevron">›</span>' : ''}
      </div>
      <div class="dash-section-body dash-grid">
        ${items.map(c => renderChalCard(c)).join('')}
      </div>
    </div>`;
  }

  dash.innerHTML = html;
  animateHomeRows();
  animateProgressBars(dash);
}

// Open book modal pre-linked to a specific challenge
function openBookForChallenge(challengeId) {
  openBookModal();
  // After modal opens, pre-check the challenge checkbox
  setTimeout(() => {
    const cb = document.querySelector(`#challenge-assignments input[value="${challengeId}"]`);
    if (cb) { cb.checked = true; toggleAssignmentNote(cb); }
  }, 50);
}

// ── Books view ──
function renderGroupFilters() {
  const cont = document.getElementById('group-filters');
  if (!cont) return;
  cont.innerHTML = '';
  if (groups.length === 0) return;

  const makeChip = (text, val) => {
    const btn = document.createElement('button');
    btn.className = 'chip' + (filters.group === val ? ' active' : '');
    btn.textContent = text;
    btn.dataset.groupVal = val;
    btn.onclick = function() {
      // clicking the active group chip toggles it off
      const newVal = (val !== 'all' && filters.group === val) ? 'all' : val;
      const target = newVal === 'all' ? cont.querySelector('[data-group-val="all"]') : this;
      setFilter('group', newVal, target);
    };
    cont.appendChild(btn);
  };

  makeChip('Alle', 'all');
  groups.forEach(g => makeChip(g.name, g.id));
}

function setFilter(key, val, btn) {
  filters[key] = val;
  if (key === 'status') {
    document.querySelectorAll('#status-filters > .chip').forEach(b => b.classList.remove('active'));
  } else {
    document.querySelectorAll('#group-filters .chip').forEach(b => b.classList.remove('active'));
  }
  btn.classList.add('active');
  renderBooks();
}

function renderBooks() {
  const query = (document.getElementById('book-search-input')?.value || '').toLowerCase();
  let filtered = books.filter(b => {
    if (filters.status !== 'all' && b.status !== filters.status) return false;
    if (filters.group !== 'all') {
      const bookChallengeIds = assignments.filter(a => a.book_id === b.id).map(a => a.challenge_id);
      const bookGroupIds = challenges.filter(c => bookChallengeIds.includes(c.id)).map(c => c.group_id);
      if (!bookGroupIds.includes(filters.group)) return false;
    }
    if (query) {
      const t = (b.title || '').toLowerCase();
      const au = (b.author || '').toLowerCase();
      if (!t.includes(query) && !au.includes(query)) return false;
    }
    return true;
  });

  const grid = document.getElementById('books-grid');
  if (!grid) return;
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty"><span class="icon">📚</span><p>Geen boeken gevonden.</p></div>`;
    return;
  }

  const statusGroups = [
    { key: 'reading',  label: 'Bezig',    dotCls: 'dot-reading' },
    { key: 'to-read',  label: 'Te lezen', dotCls: 'dot-to-read' },
    { key: 'done',     label: 'Gelezen',  dotCls: 'dot-done', collapsible: true },
  ];

  grid.innerHTML = statusGroups
    .map(sg => ({ ...sg, items: filtered.filter(b => b.status === sg.key) }))
    .filter(sg => sg.items.length > 0)
    .map(sg => {
      const rows = sg.items.map(b => {
        const bookAssignments = assignments.filter(a => a.book_id === b.id);
        const bookChallenges = bookAssignments.map(a => challenges.find(c => c.id === a.challenge_id)).filter(Boolean);
        const tags = bookChallenges.map(c => `<span class="challenge-tag">${esc(c.name)}</span>`).join('');
        const cover = b.cover_url
          ? `<img src="${b.cover_url}" alt="" loading="lazy">`
          : `<div class="bk-no-cover"></div>`;
        const quickBtn = b.status === 'reading'
          ? `<button class="btn btn-accent btn-sm" onclick="quickStatus('${b.id}','done')">Klaar</button>`
          : b.status === 'to-read'
            ? `<button class="btn btn-ghost btn-sm" onclick="quickStatus('${b.id}','reading')">Start</button>`
            : '';
        return `<div class="bk-row">
          <div class="bk-cover">${cover}</div>
          <div class="bk-info">
            <div class="bk-title">${esc(b.title)}</div>
            <div class="bk-author">${esc(b.author)}${b.year ? ' · ' + b.year : ''}</div>
            ${tags ? `<div class="bk-tags">${tags}</div>` : ''}
          </div>
          <div class="bk-actions">
            ${quickBtn}
            ${b.goodreads_url ? `<a href="${b.goodreads_url}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm chal-gr-link" title="Goodreads">↗</a>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="editBook('${b.id}')">Bewerken</button>
            <button class="btn btn-danger btn-sm" onclick="deleteBook('${b.id}')">×</button>
          </div>
        </div>`;
      }).join('');

      return `<div class="bk-section${sg.collapsible ? ' bk-section--collapsible' : ''}">
        <div class="bk-section-header"${sg.collapsible ? ` onclick="this.parentElement.classList.toggle('open')"` : ''}>
          <span class="chal-status-dot ${sg.dotCls}"></span>
          <span class="bk-section-title">${sg.label}</span>
          <span class="bk-section-count">${sg.items.length}</span>
          ${sg.collapsible ? '<span class="bk-chevron">›</span>' : ''}
        </div>
        <div class="bk-list">${rows}</div>
      </div>`;
    }).join('');

  animateBookCards();
}

// ── Challenges view ──
function renderChallengesView() {
  const cont = document.getElementById('challenges-content');
  if (!cont) return;
  if (groups.length === 0) {
    cont.innerHTML = `<div class="empty"><span class="icon">🏆</span><p>Nog geen groepen. Ga naar <strong>Beheer</strong> om je leesgroepen toe te voegen.</p></div>`;
    return;
  }
  cont.innerHTML = groups.map(g => {
    const gChallenges = challenges.filter(c => c.group_id === g.id);
    const totalBooks = gChallenges.reduce((sum, c) => sum + assignments.filter(a => a.challenge_id === c.id).length, 0);

    const rows = gChallenges.map(c => {
      const cAssignments = assignments.filter(a => a.challenge_id === c.id);
      const cBooks = cAssignments.map(a => books.find(b => b.id === a.book_id)).filter(Boolean);
      const doneCount = cBooks.filter(b => b.status === 'done').length;
      const readingCount = cBooks.filter(b => b.status === 'reading').length;
      const total = cBooks.length;
      const booksRequired = c.books_required || null;
      const missing = booksRequired !== null ? Math.max(0, booksRequired - total) : null;
      const denominator = booksRequired || total;
      const pct = denominator === 0 ? 0 : Math.round((doneCount / denominator) * 100);
      const isComplete = total > 0 && doneCount === total && (!booksRequired || total >= booksRequired);
      const dotCls = isComplete ? 'dot-done' : readingCount > 0 ? 'dot-reading' : total === 0 ? 'dot-empty' : 'dot-to-read';

      let deadlinePill = '';
      if (c.deadline && !isComplete) {
        const daysLeft = Math.ceil((new Date(c.deadline) - new Date()) / (1000 * 60 * 60 * 24));
        const urgency = daysLeft < 0 ? 'overdue' : daysLeft <= 7 ? 'critical' : daysLeft <= 30 ? 'soon' : '';
        const label = daysLeft < 0 ? `${Math.abs(daysLeft)}d te laat`
          : daysLeft === 0 ? 'Vandaag'
          : daysLeft <= 7 ? `nog ${daysLeft}d`
          : new Date(c.deadline).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
        const dlCls = urgency === 'overdue' ? 'dl-overdue' : urgency === 'critical' ? 'dl-critical' : urgency === 'soon' ? 'dl-soon' : 'dl-normal';
        deadlinePill = `<span class="chal-deadline-pill ${dlCls}">${label}</span>`;
      } else if (isComplete) {
        deadlinePill = `<span class="chal-deadline-pill dl-done">Klaar</span>`;
      }

      const fractionLabel = booksRequired ? `${doneCount}/${booksRequired}` : (total > 0 ? `${doneCount}/${total}` : '');
      const metaParts = [];
      if (c.period) metaParts.push(esc(c.period));
      if (c.points) metaParts.push(`${c.points} pts`);
      if (fractionLabel) metaParts.push(`${fractionLabel} boeken`);
      const missingPill = missing > 0 ? `<span class="chal-missing-pill">${missing} te zoeken</span>` : '';

      return `<div class="chal-row${isComplete ? ' is-done' : ''}">
        <span class="chal-status-dot ${dotCls}"></span>
        <div class="chal-row-info">
          <div class="chal-row-name">${esc(c.name)}</div>
          ${metaParts.length ? `<div class="chal-row-meta">${metaParts.join(' · ')}</div>` : ''}
        </div>
        ${denominator > 0 ? `<div class="chal-row-bar"><div class="bar-bg"><div class="bar-fill" style="width:${pct}%"></div></div></div>` : '<div class="chal-row-bar"></div>'}
        ${missingPill}${deadlinePill}
        <div class="chal-row-actions">
          <button class="btn btn-ghost btn-sm" onclick="openChallengeDetailPopup('${c.id}')">Details</button>
          <button class="btn btn-ghost btn-sm" onclick="editChallenge('${c.id}')">Bewerken</button>
        </div>
      </div>`;
    }).join('');

    return `<div class="grp-section">
      <div class="grp-header">
        <div class="grp-header-left">
          <h2 class="grp-name">${esc(g.name)}</h2>
          <span class="grp-meta">${gChallenges.length} opdracht${gChallenges.length !== 1 ? 'en' : ''}${totalBooks > 0 ? ` · ${totalBooks} boek${totalBooks !== 1 ? 'en' : ''}` : ''}</span>
        </div>
        <div class="grp-header-right">
          ${g.goodreads_url ? `<a href="${esc(g.goodreads_url)}" target="_blank" rel="noopener" class="btn btn-goodreads btn-sm">Goodreads ↗</a>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="openChallengeModal('${g.id}')">+ Opdracht</button>
        </div>
      </div>
      <div class="chal-table">
        ${rows || '<p class="grp-empty">Nog geen opdrachten in deze groep</p>'}
      </div>
    </div>`;
  }).join('');
  animateChallengeRows();
}

// ── Manage view ──
function renderManageView() {
  const gl = document.getElementById('groups-list');
  if (!gl) return;
  gl.innerHTML = groups.length === 0
    ? '<p style="color:var(--text-3);font-size:.875rem;margin-bottom:.5rem">Nog geen groepen</p>'
    : groups.map(g => `
        <div class="manage-item">
          <span>${esc(g.name)}<small>${challenges.filter(c => c.group_id === g.id).length} opdrachten</small></span>
          <button class="btn btn-ghost btn-sm" onclick="editGroup('${g.id}')">Bewerken</button>
          <button class="btn btn-danger btn-sm" onclick="deleteGroup('${g.id}')">Verwijderen</button>
        </div>`).join('');

  const cl = document.getElementById('challenges-list');
  cl.innerHTML = challenges.length === 0
    ? '<p style="color:var(--text-3);font-size:.875rem;margin-bottom:.5rem">Nog geen opdrachten</p>'
    : challenges.map(c => {
        const g = groups.find(gr => gr.id === c.group_id);
        return `<div class="manage-item">
          <span>${esc(c.name)}<small>${g ? esc(g.name) : ''}${c.period ? ' · ' + c.period : ''}</small></span>
          <button class="btn btn-ghost btn-sm" onclick="editChallenge('${c.id}')">Bewerken</button>
          <button class="btn btn-danger btn-sm" onclick="deleteChallenge('${c.id}')">Verwijderen</button>
        </div>`;
      }).join('');
  animateManageItems();
}

// ── Book modal ──
function openBookModal(bookId) {
  editingBookId = bookId || null;
  document.getElementById('book-modal-title').textContent = bookId ? 'Boek bewerken' : 'Boek toevoegen';
  document.getElementById('ol-search').value = '';
  document.getElementById('ol-results').innerHTML = '';
  document.getElementById('book-id').value = '';
  document.getElementById('book-cover-url').value = '';
  document.getElementById('book-title').value = '';
  document.getElementById('book-author').value = '';
  document.getElementById('book-year').value = '';
  document.getElementById('book-status').value = 'to-read';
  document.getElementById('book-goodreads-url').value = '';

  if (bookId) {
    const b = books.find(b => b.id === bookId);
    if (b) {
      document.getElementById('book-id').value = b.id;
      document.getElementById('book-cover-url').value = b.cover_url || '';
      document.getElementById('book-title').value = b.title;
      document.getElementById('book-author').value = b.author;
      document.getElementById('book-year').value = b.year || '';
      document.getElementById('book-status').value = b.status;
      document.getElementById('book-goodreads-url').value = b.goodreads_url || '';
    }
  }

  const cont = document.getElementById('challenge-assignments');
  if (challenges.length === 0) {
    cont.innerHTML = '<p style="color:var(--text-3);font-size:.82rem">Nog geen opdrachten — voeg eerst enkele toe in het beheer</p>';
  } else {
    const bookAssignments = bookId ? assignments.filter(a => a.book_id === bookId) : [];
    cont.innerHTML = challenges.map(c => {
      const g = groups.find(gr => gr.id === c.group_id);
      const existing = bookAssignments.find(a => a.challenge_id === c.id);
      const checked = existing ? 'checked' : '';
      const noteVal = existing?.note || '';
      return `<div class="challenge-assignment">
        <label>
          <input type="checkbox" value="${c.id}" ${checked} onchange="toggleAssignmentNote(this)">
          <span style="font-weight:600">${esc(c.name)}</span>
          ${g ? `<span style="font-size:.72rem;color:var(--text-3);margin-left:.2rem">${esc(g.name)}</span>` : ''}
        </label>
        <div class="assignment-note ${checked ? 'visible' : ''}">
          <input type="text" placeholder="Waarom dit boek?" value="${esc(noteVal)}" data-challenge="${c.id}">
        </div>
      </div>`;
    }).join('');
  }
  document.getElementById('book-modal').style.display = 'flex';
}

function editBook(id) { openBookModal(id); }

function toggleAssignmentNote(checkbox) {
  checkbox.closest('.challenge-assignment').querySelector('.assignment-note').classList.toggle('visible', checkbox.checked);
}

async function saveBook() {
  const title = document.getElementById('book-title').value.trim();
  const author = document.getElementById('book-author').value.trim();
  if (!title || !author) { toast('Titel en auteur zijn verplicht'); return; }

  const bookData = {
    title, author,
    year: document.getElementById('book-year').value.trim() || null,
    status: document.getElementById('book-status').value,
    cover_url: document.getElementById('book-cover-url').value || null,
    goodreads_url: document.getElementById('book-goodreads-url').value.trim() || null,
  };

  const newAssignments = [];
  document.querySelectorAll('#challenge-assignments input[type=checkbox]:checked').forEach(cb => {
    const noteInput = cb.closest('.challenge-assignment').querySelector('input[type=text]');
    newAssignments.push({ challenge_id: cb.value, note: noteInput?.value?.trim() || null });
  });

  if (db) {
    let bookId = editingBookId;
    if (bookId) {
      const { error } = await db.from('books').update(bookData).eq('id', bookId);
      if (error) { handleDbError(error); return; }
    } else {
      const { data, error } = await db.from('books').insert(bookData).select().single();
      if (error) { handleDbError(error); return; }
      bookId = data.id;
    }
    await db.from('assignments').delete().eq('book_id', bookId);
    if (newAssignments.length > 0) {
      await db.from('assignments').insert(newAssignments.map(a => ({ ...a, book_id: bookId })));
    }
  } else {
    let bookId = editingBookId;
    if (bookId) {
      books = books.map(b => b.id === bookId ? { ...b, ...bookData } : b);
    } else {
      bookId = uid();
      books.push({ id: bookId, ...bookData, created_at: new Date().toISOString() });
    }
    assignments = assignments.filter(a => a.book_id !== bookId);
    newAssignments.forEach(a => assignments.push({ id: uid(), book_id: bookId, ...a }));
    saveLocal();
  }

  await loadAll();
  closeModal('book-modal');
  toast(editingBookId ? 'Boek bijgewerkt!' : 'Boek toegevoegd!');
}

async function deleteBook(id) {
  if (!confirm('Dit boek verwijderen?')) return;
  if (db) {
    await db.from('assignments').delete().eq('book_id', id);
    await db.from('books').delete().eq('id', id);
  } else {
    books = books.filter(b => b.id !== id);
    assignments = assignments.filter(a => a.book_id !== id);
    saveLocal();
  }
  await loadAll();
  toast('Boek verwijderd');
}

async function quickStatus(id, newStatus) {
  if (db) {
    await db.from('books').update({ status: newStatus }).eq('id', id);
  } else {
    books = books.map(b => b.id === id ? { ...b, status: newStatus } : b);
    saveLocal();
  }
  await loadAll();
  toast('Status bijgewerkt!');
}

// ── Open Library search ──
async function searchOpenLibrary() {
  const q = document.getElementById('ol-search').value.trim();
  if (!q) return;
  const btn = document.getElementById('ol-btn');
  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled = true;
  try {
    const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8&fields=key,title,author_name,first_publish_year,cover_i`);
    const data = await res.json();
    const results = data.docs || [];
    document.getElementById('ol-results').innerHTML = results.length === 0
      ? '<p style="padding:.75rem;color:var(--text-3);font-size:.82rem">Geen resultaten gevonden</p>'
      : `<div class="search-results">${results.map(r => {
          const cover = r.cover_i ? `https://covers.openlibrary.org/b/id/${r.cover_i}-S.jpg` : '';
          const author = (r.author_name || []).join(', ');
          return `<div class="search-result-item" onclick="selectBook(${JSON.stringify({
            title: r.title, author,
            year: r.first_publish_year,
            cover: r.cover_i ? `https://covers.openlibrary.org/b/id/${r.cover_i}-M.jpg` : ''
          }).replace(/"/g,'&quot;')})">
            ${cover ? `<img src="${cover}" alt="">` : '<div style="width:30px;height:42px;background:var(--accent-light);border-radius:3px;flex-shrink:0"></div>'}
            <div class="info"><strong>${esc(r.title)}</strong><small>${author}${r.first_publish_year ? ' · ' + r.first_publish_year : ''}</small></div>
          </div>`;
        }).join('')}</div>`;
  } catch(e) {
    document.getElementById('ol-results').innerHTML = '<p style="padding:.75rem;color:var(--danger);font-size:.82rem">Zoeken mislukt — controleer uw verbinding</p>';
  }
  btn.innerHTML = 'Zoeken';
  btn.disabled = false;
}

function selectBook(data) {
  document.getElementById('book-title').value = data.title;
  document.getElementById('book-author').value = data.author;
  document.getElementById('book-year').value = data.year || '';
  document.getElementById('book-cover-url').value = data.cover || '';
  document.getElementById('ol-results').innerHTML = `<p style="font-size:.8rem;color:var(--success);padding:.4rem 0">✓ Boek geselecteerd — je kunt de velden hieronder nog aanpassen</p>`;
}

// ── Group modal ──
function openGroupModal(id) {
  document.getElementById('group-id').value = id || '';
  document.getElementById('group-modal-title').textContent = id ? 'Groep bewerken' : 'Groep toevoegen';
  const g = id ? groups.find(g => g.id === id) : null;
  document.getElementById('group-name').value = g?.name || '';
  document.getElementById('group-url').value = g?.goodreads_url || '';
  document.getElementById('group-desc').value = g?.description || '';
  document.getElementById('group-icon-url').value = g?.icon_url || '';
  document.getElementById('group-icon-file').value = '';
  document.getElementById('group-icon-filename').textContent = '';
  const preview = document.getElementById('group-icon-preview');
  if (g?.icon_url) {
    preview.innerHTML = `<img src="${g.icon_url}" alt="Icoon">`;
  } else {
    preview.innerHTML = '<span class="icon-preview-placeholder">📖</span>';
  }
  document.getElementById('group-modal').style.display = 'flex';
}
function editGroup(id) { openGroupModal(id); }

function previewIcon(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('group-icon-filename').textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('group-icon-preview').innerHTML = `<img src="${e.target.result}" alt="Preview">`;
  };
  reader.readAsDataURL(file);
}

async function saveGroup() {
  const name = document.getElementById('group-name').value.trim();
  if (!name) { toast('Groepsnaam is verplicht'); return; }

  let icon_url = document.getElementById('group-icon-url').value || null;
  const fileInput = document.getElementById('group-icon-file');
  const file = fileInput.files[0];

  if (file && db) {
    toast('Icoon uploaden…');
    const ext = file.name.split('.').pop();
    const filename = `group-${uid()}.${ext}`;
    const { error: uploadError } = await db.storage.from('icons').upload(filename, file, { upsert: true });
    if (uploadError) { toast('Upload mislukt: ' + uploadError.message); return; }
    const { data: urlData } = db.storage.from('icons').getPublicUrl(filename);
    icon_url = urlData.publicUrl;
  } else if (file && !db) {
    icon_url = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  }

  const data = {
    name,
    goodreads_url: document.getElementById('group-url').value.trim() || null,
    description: document.getElementById('group-desc').value.trim() || null,
    icon_url,
  };
  const id = document.getElementById('group-id').value;
  if (db) {
    if (id) { await db.from('groups').update(data).eq('id', id); }
    else { await db.from('groups').insert(data); }
  } else {
    if (id) { groups = groups.map(g => g.id === id ? { ...g, ...data } : g); }
    else { groups.push({ id: uid(), ...data, created_at: new Date().toISOString() }); }
    saveLocal();
  }
  await loadAll();
  closeModal('group-modal');
  toast(id ? 'Groep bijgewerkt!' : 'Groep toegevoegd!');
}

async function deleteGroup(id) {
  if (!confirm('Deze groep en al zijn opdrachten verwijderen?')) return;
  const cIds = challenges.filter(c => c.group_id === id).map(c => c.id);
  if (db) {
    for (const cId of cIds) await db.from('assignments').delete().eq('challenge_id', cId);
    await db.from('challenges').delete().eq('group_id', id);
    await db.from('groups').delete().eq('id', id);
  } else {
    cIds.forEach(cId => { assignments = assignments.filter(a => a.challenge_id !== cId); });
    challenges = challenges.filter(c => c.group_id !== id);
    groups = groups.filter(g => g.id !== id);
    saveLocal();
  }
  await loadAll();
  toast('Groep verwijderd');
}

// ── Challenge modal ──
function openChallengeModal(preGroupId) {
  if (groups.length === 0) { toast('Voeg eerst een groep toe!'); return; }
  document.getElementById('challenge-id').value = '';
  document.getElementById('challenge-modal-title').textContent = 'Opdracht toevoegen';
  document.getElementById('challenge-name').value = '';
  document.getElementById('challenge-period').value = '';
  document.getElementById('challenge-deadline').value = '';
  document.getElementById('challenge-books-required').value = '';
  document.getElementById('challenge-points').value = '';
  document.getElementById('challenge-bonus').value = '';
  document.getElementById('challenge-desc').value = '';
  document.getElementById('challenge-goodreads-url').value = '';
  document.getElementById('challenge-group').innerHTML = groups.map(g =>
    `<option value="${g.id}" ${g.id === preGroupId ? 'selected' : ''}>${esc(g.name)}</option>`
  ).join('');
  document.getElementById('challenge-modal').style.display = 'flex';
}

function editChallenge(id) {
  const c = challenges.find(c => c.id === id);
  if (!c) return;
  document.getElementById('challenge-id').value = id;
  document.getElementById('challenge-modal-title').textContent = 'Opdracht bewerken';
  document.getElementById('challenge-name').value = c.name;
  document.getElementById('challenge-period').value = c.period || '';
  document.getElementById('challenge-deadline').value = c.deadline || '';
  document.getElementById('challenge-books-required').value = c.books_required || '';
  document.getElementById('challenge-points').value = c.points || '';
  document.getElementById('challenge-bonus').value = c.bonus_points || '';
  document.getElementById('challenge-desc').value = c.description || '';
  document.getElementById('challenge-goodreads-url').value = c.goodreads_url || '';
  document.getElementById('challenge-group').innerHTML = groups.map(g =>
    `<option value="${g.id}" ${g.id === c.group_id ? 'selected' : ''}>${esc(g.name)}</option>`
  ).join('');
  document.getElementById('challenge-modal').style.display = 'flex';
}

async function saveChallenge() {
  const name = document.getElementById('challenge-name').value.trim();
  const group_id = document.getElementById('challenge-group').value;
  if (!name || !group_id) { toast('Naam en groep zijn verplicht'); return; }
  const data = {
    name, group_id,
    period: document.getElementById('challenge-period').value.trim() || null,
    deadline: document.getElementById('challenge-deadline').value || null,
    books_required: parseInt(document.getElementById('challenge-books-required').value) || null,
    points: parseInt(document.getElementById('challenge-points').value) || null,
    bonus_points: parseInt(document.getElementById('challenge-bonus').value) || null,
    description: document.getElementById('challenge-desc').value.trim() || null,
    goodreads_url: document.getElementById('challenge-goodreads-url').value.trim() || null,
  };
  const id = document.getElementById('challenge-id').value;
  if (db) {
    if (id) { await db.from('challenges').update(data).eq('id', id); }
    else { await db.from('challenges').insert(data); }
  } else {
    if (id) { challenges = challenges.map(c => c.id === id ? { ...c, ...data } : c); }
    else { challenges.push({ id: uid(), ...data, created_at: new Date().toISOString() }); }
    saveLocal();
  }
  await loadAll();
  closeModal('challenge-modal');
  toast(id ? 'Opdracht bijgewerkt!' : 'Opdracht toegevoegd!');
}

async function deleteChallenge(id) {
  if (!confirm('Deze opdracht verwijderen?')) return;
  if (db) {
    await db.from('assignments').delete().eq('challenge_id', id);
    await db.from('challenges').delete().eq('id', id);
  } else {
    assignments = assignments.filter(a => a.challenge_id !== id);
    challenges = challenges.filter(c => c.id !== id);
    saveLocal();
  }
  await loadAll();
  toast('Opdracht verwijderd');
}

// ── Utils ──
function closeModal(id, event) {
  if (event && event.target !== document.getElementById(id)) return;
  document.getElementById(id).style.display = 'none';
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Challenge sort ──
function setChallengeSort(val) {
  window._challengeSort = val;
  renderHome();
}

// ── Group popup ──
function openGroupPopup(groupId) {
  const g = groups.find(gr => gr.id === groupId);
  if (!g) return;
  const gChallenges = challenges.filter(c => c.group_id === groupId);
  const challengeRows = gChallenges.length === 0
    ? '<p style="color:var(--text-3);font-size:.875rem;text-align:center;padding:1rem">Geen lopende opdrachten</p>'
    : gChallenges.map(c => {
        const cBooks = assignments.filter(a => a.challenge_id === c.id).map(a => books.find(b => b.id === a.book_id)).filter(Boolean);
        const done = cBooks.filter(b => b.status === 'done').length;
        const total = cBooks.length;
        const pct = total === 0 ? 0 : Math.round((done / total) * 100);
        const deadlineStr = c.deadline ? new Date(c.deadline).toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'}) : null;
        return `<div class="group-popup-challenge" onclick="closeGroupPopup();openChallengeDetailPopup('${c.id}','${groupId}')">
          <div class="group-popup-challenge-header">
            <span class="group-popup-challenge-name">${esc(c.name)}</span>
            ${c.points ? `<span class="challenge-points">${c.points}pts</span>` : ''}
          </div>
          ${c.period || deadlineStr ? `<div style="font-size:.72rem;color:var(--text-3);margin:.15rem 0 .4rem">${c.period ? esc(c.period) : ''}${c.period && deadlineStr ? ' · ' : ''}${deadlineStr ? 'deadline ' + deadlineStr : ''}</div>` : ''}
          <div class="bar-bg" style="margin:.3rem 0 .2rem">
            <div class="bar-fill" style="width:${pct}%"></div>
          </div>
          <div style="font-size:.72rem;color:var(--text-2)">${done}/${total} boeken gelezen</div>
        </div>`;
      }).join('');

  const iconHtml = g.icon_url
    ? `<img src="${esc(g.icon_url)}" alt="${esc(g.name)}" style="width:48px;height:48px;border-radius:50%;object-fit:cover">`
    : `<div style="width:48px;height:48px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:1.4rem;color:white">📚</div>`;

  const el = document.getElementById('group-popup');
  el.innerHTML = `
    <div class="group-popup-box">
      <div class="group-popup-header">
        ${iconHtml}
        <div style="flex:1;min-width:0">
          <h3 style="font-family:'Cormorant Garamond',serif;font-size:1.2rem;font-weight:600;color:var(--text)">${esc(g.name)}</h3>
          ${g.description ? `<p style="font-size:.8rem;color:var(--text-2);margin-top:.1rem">${esc(g.description)}</p>` : ''}
        </div>
        <button class="modal-close" onclick="closeGroupPopup()">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="group-popup-body">
        <p style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3);margin-bottom:.75rem">Opdrachten (${gChallenges.length})</p>
        ${challengeRows}
      </div>
      ${g.goodreads_url ? `
        <div class="group-popup-footer">
          <a href="${esc(g.goodreads_url)}" target="_blank" rel="noopener" class="btn btn-goodreads" style="width:100%;justify-content:center">Open in Goodreads ↗</a>
        </div>` : ''}
    </div>`;
  el.style.display = 'flex';
  animateProgressBars(el);
}

function closeGroupPopup() {
  document.getElementById('group-popup').style.display = 'none';
}

// ── Challenge detail popup ──
function openChallengeDetailPopup(challengeId, fromGroupId) {
  const c = challenges.find(ch => ch.id === challengeId);
  if (!c) return;
  const g = groups.find(gr => gr.id === c.group_id);
  const cBooks = assignments.filter(a => a.challenge_id === c.id).map(a => {
    const bk = books.find(b => b.id === a.book_id);
    return bk ? { book: bk, note: a.note } : null;
  }).filter(Boolean);
  const done = cBooks.filter(x => x.book.status === 'done').length;
  const total = cBooks.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const deadlineStr = c.deadline ? new Date(c.deadline).toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'}) : null;

  const bookRows = cBooks.length === 0
    ? '<p style="color:var(--text-3);font-size:.875rem;padding:.5rem 0">Nog geen boeken gekoppeld aan deze opdracht</p>'
    : cBooks.map(({ book: b, note }) => {
        const statusLabel = b.status === 'to-read' ? 'Te lezen' : b.status === 'reading' ? 'Aan het lezen' : '✓ Gelezen';
        const cover = b.cover_url
          ? `<img src="${b.cover_url}" alt="Cover" style="width:38px;height:52px;object-fit:cover;border-radius:4px">`
          : `<div style="width:38px;height:52px;background:var(--accent-light);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:1.1rem">📖</div>`;
        return `<div class="cdp-book-row">
          ${cover}
          <div class="cdp-book-info">
            <strong>${esc(b.title)}</strong>
            <small>${esc(b.author)}${b.year ? ' · ' + b.year : ''}</small>
            ${note ? `<span class="challenge-book-note">${esc(note)}</span>` : ''}
          </div>
          <span class="badge badge-${b.status}" style="font-size:.68rem;flex-shrink:0">${statusLabel}</span>
        </div>`;
      }).join('');

  let popupUrgencyPill = '';
  if (c.deadline && !(total > 0 && done === total)) {
    const daysLeft = Math.ceil((new Date(c.deadline) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) {
      popupUrgencyPill = `<span class="cdp-urgency-pill overdue">⚠️ Deadline verstreken</span>`;
    } else if (daysLeft <= 7) {
      popupUrgencyPill = `<span class="cdp-urgency-pill critical">🔥 Nog ${daysLeft} dag${daysLeft !== 1 ? 'en' : ''}!</span>`;
    } else if (daysLeft <= 30) {
      popupUrgencyPill = `<span class="cdp-urgency-pill soon">⏰ Nog ${daysLeft} dagen</span>`;
    }
  }

  const el = document.getElementById('challenge-detail-popup');
  el.innerHTML = `
    <div class="modal" style="max-width:500px">
      <div class="modal-header">
        <h2 class="modal-title">${esc(c.name)}</h2>
        <button class="btn btn-ghost btn-sm" onclick="closeChallengeDetailPopup();editChallenge('${c.id}')">✏️ Bewerken</button>
        <button class="modal-close" onclick="closeChallengeDetailPopup()">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        ${fromGroupId ? `<button class="cdp-back-btn" onclick="closeChallengeDetailPopup();openGroupPopup('${fromGroupId}')">← Terug naar groep</button>` : ''}
        ${popupUrgencyPill}
        <div class="cdp-meta">
          ${g ? `<span class="cdp-meta-pill">👥 ${esc(g.name)}</span>` : ''}
          ${c.period ? `<span class="cdp-meta-pill">📅 ${esc(c.period)}</span>` : ''}
          ${deadlineStr ? `<span class="cdp-meta-pill">⏰ ${deadlineStr}</span>` : ''}
          ${c.points ? `<span class="cdp-meta-pill challenge-points">${c.points} pts${c.bonus_points ? ' + ' + c.bonus_points + ' bonus' : ''}</span>` : ''}
        </div>
        ${c.description ? `<div class="cdp-description">${esc(c.description)}</div>` : ''}
        <div class="cdp-progress-section">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.4rem">
            <span style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)">Voortgang</span>
            <span style="font-size:.8rem;color:var(--text-2)">${done}/${total} gelezen (${pct}%)</span>
          </div>
          <div class="bar-bg"><div class="bar-fill" style="width:${pct}%"></div></div>
        </div>
        <p style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3);margin:1.25rem 0 .6rem">Boeken</p>
        ${bookRows}
        ${c.goodreads_url ? `<div style="margin-top:1.25rem"><a href="${esc(c.goodreads_url)}" target="_blank" rel="noopener" class="btn btn-goodreads" style="width:100%;justify-content:center">Open opdracht op Goodreads ↗</a></div>` : ''}
      </div>
    </div>`;
  el.style.display = 'flex';
  animateProgressBars(el);
}

function closeChallengeDetailPopup() {
  document.getElementById('challenge-detail-popup').style.display = 'none';
}

// ── Init ──
window.addEventListener('load', () => {
  const url = localStorage.getItem('sb_url');
  const key = localStorage.getItem('sb_key');
  if (url && key) {
    document.getElementById('sb-url').value = url;
    document.getElementById('sb-key').value = key;
    try {
      db = supabase.createClient(url, key);
      updateConnectionStatus(true);
    } catch(e) {
      updateConnectionStatus(false);
    }
  } else {
    document.getElementById('connection-panel').classList.remove('hidden');
    updateConnectionStatus(false);
  }
  loadAll();
});
