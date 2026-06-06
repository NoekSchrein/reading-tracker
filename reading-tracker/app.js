// ── State ──
let db = null;
let groups = [];
let challenges = [];
let books = [];
let assignments = [];
let filters = { status: 'all', group: 'all' };
let editingBookId = null;

// Goodreads group links — update these if needed
const GOODREADS_GROUPS = [
  {
    name: 'Fanatieke Nederlandse Lezers',
    url: 'https://www.goodreads.com/group/show/79675-fanatieke-nederlandse-lezers',
    icon: './assets/79675.jpg'
  },
  {
    name: 'Everyone Has Read This But Me',
    url: 'https://www.goodreads.com/group/show/189072-everyone-has-read-this-but-me---the-catch-up-book-club',
    icon: './assets/189072.jpg'
  }
];

// ── Supabase ──
function connectSupabase() {
  const url = document.getElementById('sb-url').value.trim();
  const key = document.getElementById('sb-key').value.trim();
  if (!url || !key) { toast('Please enter both URL and key'); return; }
  try {
    db = supabase.createClient(url, key);
    localStorage.setItem('sb_url', url);
    localStorage.setItem('sb_key', key);
    document.getElementById('setup-banner').style.display = 'none';
    toast('Connected! Loading data…');
    loadAll();
  } catch(e) {
    toast('Connection failed: ' + e.message);
  }
}

function dismissSetup() {
  document.getElementById('setup-banner').style.display = 'none';
  toast('Running offline — data saved locally');
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
    toast('⚠️ Tables not found — check the setup instructions');
  } else {
    toast('DB error: ' + err.message);
  }
}

// ── Views ──
function showView(name, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'home') renderHome();
  if (name === 'challenges') renderChallengesView();
  if (name === 'manage') renderManageView();
  if (name === 'books') { renderGroupFilters(); renderBooks(); }
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
  // Stats
  const toRead = books.filter(b => b.status === 'to-read').length;
  const reading = books.filter(b => b.status === 'reading').length;
  const done = books.filter(b => b.status === 'done').length;
  document.getElementById('home-stats').innerHTML = `
    <div class="stat-card"><div class="num">${books.length}</div><div class="lbl">Total books</div></div>
    <div class="stat-card"><div class="num" style="color:var(--berry)">${reading}</div><div class="lbl">Reading</div></div>
    <div class="stat-card"><div class="num" style="color:var(--bordeaux)">${toRead}</div><div class="lbl">To read</div></div>
    <div class="stat-card"><div class="num" style="color:var(--berry)">${done}</div><div class="lbl">Done</div></div>
    <div class="stat-card"><div class="num">${challenges.length}</div><div class="lbl">Challenges</div></div>
  `;

  // Currently reading
  const reading_books = books.filter(b => b.status === 'reading');
  const rl = document.getElementById('home-reading-list');
  if (reading_books.length === 0) {
    rl.innerHTML = '<p style="font-size:.85rem;color:var(--ink-faint);padding:.5rem 0">No books in progress yet</p>';
  } else {
    rl.innerHTML = reading_books.map(b => {
      const cover = b.cover_url
        ? `<div class="mini-cover"><img src="${b.cover_url}" alt=""></div>`
        : `<div class="mini-cover">📖</div>`;
      return `<div class="mini-book-row">
        ${cover}
        <div class="mini-info">
          <strong>${esc(b.title)}</strong>
          <small>${esc(b.author)}</small>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="quickStatus('${b.id}','done')">✓ Done</button>
      </div>`;
    }).join('');
  }

  // Goodreads group links
  const gl = document.getElementById('home-groups-list');
  const groupCards = GOODREADS_GROUPS.map(g => `
    <a href="${g.url}" target="_blank" rel="noopener" class="group-link-card">
      <img class="group-link-icon" src="${g.icon}" alt="Group icon" width="40" height="40">
      <div class="group-link-info">
        <strong>${esc(g.name)}</strong>
        <small>Open on Goodreads ↗</small>
      </div>
    </a>`).join('');

  // Also show local groups if any
  const localGroupLinks = groups.filter(g => g.goodreads_url).map(g => `
    <a href="${esc(g.goodreads_url)}" target="_blank" rel="noopener" class="group-link-card">
      <img class="group-link-icon" src="${g.icon}" alt="Group icon" width="40" height="40">
      <div class="group-link-info">
        <strong>${esc(g.name)}</strong>
        <small>Open on Goodreads ↗</small>
      </div>
    </a>`).join('');

  gl.innerHTML = groupCards + localGroupLinks;

  // Challenge progress
  const cp = document.getElementById('home-challenge-progress');
  if (challenges.length === 0) {
    cp.innerHTML = '<p style="font-size:.85rem;color:var(--ink-faint)">No challenges yet — add some in Manage</p>';
    return;
  }
  cp.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.75rem">` +
    challenges.map(c => {
      const g = groups.find(gr => gr.id === c.group_id);
      const cBooks = assignments.filter(a => a.challenge_id === c.id).map(a => books.find(b => b.id === a.book_id)).filter(Boolean);
      const done = cBooks.filter(b => b.status === 'done').length;
      const total = cBooks.length;
      const pct = total === 0 ? 0 : Math.round((done / total) * 100);
      return `<div class="challenge-progress-row">
        <div class="challenge-progress-header">
          <span class="challenge-progress-name">${esc(c.name)}</span>
          <span class="challenge-progress-count">${done}/${total} done</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="challenge-progress-group">${g ? esc(g.name) : ''}${c.period ? ' · ' + c.period : ''}${c.points ? ' · <strong>' + c.points + ' pts</strong>' : ''}${c.deadline ? ' · deadline ' + new Date(c.deadline).toLocaleDateString('nl-NL',{day:'numeric',month:'short'}) : ''}</div>
      </div>`;
    }).join('') + `</div>`;
}

// ── Books view ──
function renderGroupFilters() {
  const cont = document.getElementById('group-filters');
  if (!cont) return;
  cont.innerHTML = '';
  if (groups.length === 0) return;
  groups.forEach(g => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (filters.group === g.id ? ' active' : '');
    btn.textContent = g.name;
    btn.onclick = function() { setFilter('group', g.id, this); };
    cont.appendChild(btn);
  });
}

function setFilter(key, val, btn) {
  filters[key] = val;
  if (key === 'status') {
    document.querySelectorAll('#status-filters > .filter-btn').forEach(b => b.classList.remove('active'));
  } else {
    document.querySelectorAll('#group-filters .filter-btn').forEach(b => b.classList.remove('active'));
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
      const a = (b.author || '').toLowerCase();
      if (!t.includes(query) && !a.includes(query)) return false;
    }
    return true;
  });

  const grid = document.getElementById('books-grid');
  if (!grid) return;
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty"><div class="icon">📚</div><p>No books found.</p></div>`;
    return;
  }
  grid.innerHTML = filtered.map(b => {
    const bookAssignments = assignments.filter(a => a.book_id === b.id);
    const bookChallenges = bookAssignments.map(a => challenges.find(c => c.id === a.challenge_id)).filter(Boolean);
    const tags = bookChallenges.map(c => `<span class="challenge-tag" title="${esc(c.name)}">${esc(c.name)}</span>`).join('');
    const note = bookAssignments.find(a => a.note)?.note || '';
    const statusLabel = b.status === 'to-read' ? 'To read' : b.status === 'reading' ? 'Reading' : 'Done';
    const cover = b.cover_url
      ? `<img src="${b.cover_url}" alt="Cover" loading="lazy">`
      : `<div class="no-cover">📖</div>`;
    return `
      <div class="card book-card">
        <div class="book-card-cover">
          ${cover}
          <span class="status-badge ${b.status}">${statusLabel}</span>
        </div>
        <div class="book-card-body">
          <h3>${esc(b.title)}</h3>
          <div class="author">${esc(b.author)}${b.year ? ' · ' + b.year : ''}</div>
          ${tags ? `<div class="challenge-tags">${tags}</div>` : ''}
          ${note ? `<div class="book-note">"${esc(note)}"</div>` : ''}
          <div class="book-card-actions">
            <button class="btn btn-ghost btn-sm" onclick="editBook('${b.id}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteBook('${b.id}')">Delete</button>
            ${b.status !== 'done' ? `<button class="btn btn-blush btn-sm" style="margin-left:auto" onclick="quickStatus('${b.id}','${b.status === 'to-read' ? 'reading' : 'done'}')">${b.status === 'to-read' ? '▶ Start' : '✓ Done'}</button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── Challenges view ──
function renderChallengesView() {
  const cont = document.getElementById('challenges-content');
  if (!cont) return;
  if (groups.length === 0) {
    cont.innerHTML = `<div class="empty"><div class="icon">🏆</div><p>No groups yet. Go to <strong>Manage</strong> to add your reading groups and challenges.</p></div>`;
    return;
  }
  cont.innerHTML = groups.map(g => {
    const gChallenges = challenges.filter(c => c.group_id === g.id);
    const rows = gChallenges.map(c => {
      const cAssignments = assignments.filter(a => a.challenge_id === c.id);
      const cBooks = cAssignments.map(a => books.find(b => b.id === a.book_id)).filter(Boolean);
      const bookRows = cBooks.map(b => {
        const note = cAssignments.find(a => a.book_id === b.id)?.note || '';
        const cover = b.cover_url ? `<img src="${b.cover_url}" alt="" loading="lazy">` : `<div class="no-img">📖</div>`;
        return `<div class="challenge-book-row">
          <div class="challenge-book-cover">${cover}</div>
          <div class="challenge-book-info">
            <strong>${esc(b.title)}</strong>
            <small>${esc(b.author)}</small>
          </div>
          <span class="status-badge ${b.status}" style="font-size:.68rem">${b.status === 'to-read' ? 'To read' : b.status === 'reading' ? 'Reading' : 'Done'}</span>
          ${note ? `<div class="challenge-book-note" title="${esc(note)}">${esc(note)}</div>` : ''}
        </div>`;
      }).join('');
      return `<div class="challenge-row">
        <div class="challenge-row-header" onclick="toggleChallenge(this)">
          <span class="chevron">▶</span>
          <span class="challenge-name">${esc(c.name)}</span>
          ${c.period ? `<span class="challenge-period">${esc(c.period)}</span>` : ''}
          ${c.points ? `<span class="challenge-points">${c.points}pts${c.bonus_points ? ' +'+c.bonus_points+' bonus' : ''}</span>` : ''}
          ${c.deadline ? `<span class="challenge-deadline ${new Date(c.deadline) < new Date() ? 'overdue' : (new Date(c.deadline) - new Date() < 7*24*60*60*1000 ? 'urgent' : '')}">${new Date(c.deadline).toLocaleDateString('nl-NL',{day:'numeric',month:'short'})}</span>` : ''}
          <span class="challenge-count">${cBooks.length} book${cBooks.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="challenge-books">
          ${c.description ? `<p style="font-size:.8rem;color:var(--ink-light);margin:.5rem 0 .25rem;font-style:italic">${esc(c.description)}</p>` : ''}
          ${bookRows || '<p style="font-size:.8rem;color:var(--ink-faint);padding:.4rem 0">No books assigned yet</p>'}
        </div>
      </div>`;
    }).join('');

    const grUrl = g.goodreads_url;
    return `<div class="group-section">
      <div class="group-header">
        <h3>${esc(g.name)}</h3>
        <span class="group-badge">${gChallenges.length} challenge${gChallenges.length !== 1 ? 's' : ''}</span>
        <div class="group-header-actions">
          ${grUrl ? `<a href="${esc(grUrl)}" target="_blank" rel="noopener" class="btn btn-goodreads btn-sm">Goodreads ↗</a>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="openChallengeModal('${g.id}')">+ Challenge</button>
        </div>
      </div>
      ${rows || '<p style="color:var(--ink-faint);font-size:.875rem">No challenges yet</p>'}
    </div>`;
  }).join('');
}

function toggleChallenge(header) {
  const b = header.nextElementSibling;
  const ch = header.querySelector('.chevron');
  b.classList.toggle('open');
  ch.classList.toggle('open');
}

// ── Manage view ──
function renderManageView() {
  const gl = document.getElementById('groups-list');
  if (!gl) return;
  gl.innerHTML = groups.length === 0
    ? '<p style="color:var(--ink-faint);font-size:.875rem;margin-bottom:.5rem">No groups yet</p>'
    : groups.map(g => `
        <div class="manage-item">
          <span>${esc(g.name)}<br><small>${challenges.filter(c => c.group_id === g.id).length} challenges</small></span>
          <button class="btn btn-ghost btn-sm" onclick="editGroup('${g.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteGroup('${g.id}')">Del</button>
        </div>`).join('');

  const cl = document.getElementById('challenges-list');
  cl.innerHTML = challenges.length === 0
    ? '<p style="color:var(--ink-faint);font-size:.875rem;margin-bottom:.5rem">No challenges yet</p>'
    : challenges.map(c => {
        const g = groups.find(gr => gr.id === c.group_id);
        return `<div class="manage-item">
          <span>${esc(c.name)}<br><small>${g ? esc(g.name) : ''}${c.period ? ' · ' + c.period : ''}</small></span>
          <button class="btn btn-ghost btn-sm" onclick="editChallenge('${c.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteChallenge('${c.id}')">Del</button>
        </div>`;
      }).join('');
}

// ── Book modal ──
function openBookModal(bookId) {
  editingBookId = bookId || null;
  document.getElementById('book-modal-title').textContent = bookId ? 'Edit book' : 'Add book';
  document.getElementById('ol-search').value = '';
  document.getElementById('ol-results').innerHTML = '';
  document.getElementById('book-id').value = '';
  document.getElementById('book-cover-url').value = '';
  document.getElementById('book-title').value = '';
  document.getElementById('book-author').value = '';
  document.getElementById('book-year').value = '';
  document.getElementById('book-status').value = 'to-read';

  if (bookId) {
    const b = books.find(b => b.id === bookId);
    if (b) {
      document.getElementById('book-id').value = b.id;
      document.getElementById('book-cover-url').value = b.cover_url || '';
      document.getElementById('book-title').value = b.title;
      document.getElementById('book-author').value = b.author;
      document.getElementById('book-year').value = b.year || '';
      document.getElementById('book-status').value = b.status;
    }
  }

  const cont = document.getElementById('challenge-assignments');
  if (challenges.length === 0) {
    cont.innerHTML = '<p style="color:var(--ink-faint);font-size:.82rem">No challenges yet — add some in Manage first</p>';
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
          ${g ? `<span style="font-size:.72rem;color:var(--ink-faint);margin-left:.2rem">${esc(g.name)}</span>` : ''}
        </label>
        <div class="assignment-note ${checked ? 'visible' : ''}">
          <input type="text" placeholder="Why this book? (e.g. set in Japan, female author…)" value="${esc(noteVal)}" data-challenge="${c.id}">
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
  if (!title || !author) { toast('Title and author are required'); return; }

  const bookData = {
    title, author,
    year: document.getElementById('book-year').value.trim() || null,
    status: document.getElementById('book-status').value,
    cover_url: document.getElementById('book-cover-url').value || null,
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
  toast(editingBookId ? 'Book updated!' : 'Book added!');
}

async function deleteBook(id) {
  if (!confirm('Delete this book?')) return;
  if (db) {
    await db.from('assignments').delete().eq('book_id', id);
    await db.from('books').delete().eq('id', id);
  } else {
    books = books.filter(b => b.id !== id);
    assignments = assignments.filter(a => a.book_id !== id);
    saveLocal();
  }
  await loadAll();
  toast('Book deleted');
}

async function quickStatus(id, newStatus) {
  if (db) {
    await db.from('books').update({ status: newStatus }).eq('id', id);
  } else {
    books = books.map(b => b.id === id ? { ...b, status: newStatus } : b);
    saveLocal();
  }
  await loadAll();
  toast('Status updated!');
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
      ? '<p style="padding:.75rem;color:var(--ink-faint);font-size:.82rem">No results found</p>'
      : `<div class="search-results">${results.map(r => {
          const cover = r.cover_i ? `https://covers.openlibrary.org/b/id/${r.cover_i}-S.jpg` : '';
          const author = (r.author_name || []).join(', ');
          return `<div class="search-result-item" onclick="selectBook(${JSON.stringify({
            title: r.title, author,
            year: r.first_publish_year,
            cover: r.cover_i ? `https://covers.openlibrary.org/b/id/${r.cover_i}-M.jpg` : ''
          }).replace(/"/g,'&quot;')})">
            ${cover ? `<img src="${cover}" alt="">` : '<div style="width:30px;height:42px;background:var(--apricot);border-radius:3px;flex-shrink:0"></div>'}
            <div class="info"><strong>${esc(r.title)}</strong><small>${author}${r.first_publish_year ? ' · ' + r.first_publish_year : ''}</small></div>
          </div>`;
        }).join('')}</div>`;
  } catch(e) {
    document.getElementById('ol-results').innerHTML = '<p style="padding:.75rem;color:#9b2c2c;font-size:.82rem">Search failed — check your connection</p>';
  }
  btn.innerHTML = 'Search';
  btn.disabled = false;
}

function selectBook(data) {
  document.getElementById('book-title').value = data.title;
  document.getElementById('book-author').value = data.author;
  document.getElementById('book-year').value = data.year || '';
  document.getElementById('book-cover-url').value = data.cover || '';
  document.getElementById('ol-results').innerHTML = `<p style="font-size:.8rem;color:var(--berrry);padding:.4rem 0">✓ Book selected — you can still edit the fields below</p>`;
}

// ── Group modal ──
function openGroupModal(id) {
  document.getElementById('group-id').value = id || '';
  document.getElementById('group-modal-title').textContent = id ? 'Edit group' : 'Add group';
  const g = id ? groups.find(g => g.id === id) : null;
  document.getElementById('group-name').value = g?.name || '';
  document.getElementById('group-url').value = g?.goodreads_url || '';
  document.getElementById('group-desc').value = g?.description || '';
  document.getElementById('group-modal').style.display = 'flex';
}
function editGroup(id) { openGroupModal(id); }

async function saveGroup() {
  const name = document.getElementById('group-name').value.trim();
  if (!name) { toast('Group name is required'); return; }
  const data = {
    name,
    goodreads_url: document.getElementById('group-url').value.trim() || null,
    description: document.getElementById('group-desc').value.trim() || null
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
  toast(id ? 'Group updated!' : 'Group added!');
}

async function deleteGroup(id) {
  if (!confirm('Delete this group and all its challenges?')) return;
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
  toast('Group deleted');
}

// ── Challenge modal ──
function openChallengeModal(preGroupId) {
  if (groups.length === 0) { toast('Add a group first!'); return; }
  document.getElementById('challenge-id').value = '';
  document.getElementById('challenge-modal-title').textContent = 'Add challenge';
  document.getElementById('challenge-name').value = '';
  document.getElementById('challenge-period').value = '';
  document.getElementById('challenge-deadline').value = '';
  document.getElementById('challenge-points').value = '';
  document.getElementById('challenge-bonus').value = '';
  document.getElementById('challenge-desc').value = '';
  document.getElementById('challenge-group').innerHTML = groups.map(g =>
    `<option value="${g.id}" ${g.id === preGroupId ? 'selected' : ''}>${esc(g.name)}</option>`
  ).join('');
  document.getElementById('challenge-modal').style.display = 'flex';
}

function editChallenge(id) {
  const c = challenges.find(c => c.id === id);
  if (!c) return;
  document.getElementById('challenge-id').value = id;
  document.getElementById('challenge-modal-title').textContent = 'Edit challenge';
  document.getElementById('challenge-name').value = c.name;
  document.getElementById('challenge-period').value = c.period || '';
  document.getElementById('challenge-deadline').value = c.deadline || '';
  document.getElementById('challenge-points').value = c.points || '';
  document.getElementById('challenge-bonus').value = c.bonus_points || '';
  document.getElementById('challenge-desc').value = c.description || '';
  document.getElementById('challenge-group').innerHTML = groups.map(g =>
    `<option value="${g.id}" ${g.id === c.group_id ? 'selected' : ''}>${esc(g.name)}</option>`
  ).join('');
  document.getElementById('challenge-modal').style.display = 'flex';
}

async function saveChallenge() {
  const name = document.getElementById('challenge-name').value.trim();
  const group_id = document.getElementById('challenge-group').value;
  if (!name || !group_id) { toast('Name and group are required'); return; }
  const data = {
    name, group_id,
    period: document.getElementById('challenge-period').value.trim() || null,
    deadline: document.getElementById('challenge-deadline').value || null,
    points: parseInt(document.getElementById('challenge-points').value) || null,
    bonus_points: parseInt(document.getElementById('challenge-bonus').value) || null,
    description: document.getElementById('challenge-desc').value.trim() || null,
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
  toast(id ? 'Challenge updated!' : 'Challenge added!');
}

async function deleteChallenge(id) {
  if (!confirm('Delete this challenge?')) return;
  if (db) {
    await db.from('assignments').delete().eq('challenge_id', id);
    await db.from('challenges').delete().eq('id', id);
  } else {
    assignments = assignments.filter(a => a.challenge_id !== id);
    challenges = challenges.filter(c => c.id !== id);
    saveLocal();
  }
  await loadAll();
  toast('Challenge deleted');
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

// ── Init ──
window.addEventListener('load', () => {
  const url = localStorage.getItem('sb_url');
  const key = localStorage.getItem('sb_key');
  if (url && key) {
    document.getElementById('sb-url').value = url;
    document.getElementById('sb-key').value = key;
    try {
      db = supabase.createClient(url, key);
      document.getElementById('setup-banner').style.display = 'none';
    } catch(e) {}
  }
  loadAll();
});
