/* =============================================================
   DAILY REPORT ADMIN DASHBOARD ??app.js
   Main application logic: API, state, drag-drop, image upload
   ============================================================= */

'use strict';

/* ??? CONFIG ??????????????????????????????????????????????????
   援먯껜 ?ъ씤??
   - GAS_URL: GAS ?뱀빋 ?붾뱶?ъ씤??(?꾩옱 紐낆꽭?쒖쓽 URL濡??ㅼ젙)
   - R2_UPLOAD_URL: Cloudflare Worker ?낅줈???붾뱶?ъ씤??(異뷀썑 援먯껜)
??????????????????????????????????????????????????????????????? */
const CONFIG = {
  // 吏곸젒 釉뚮씪?곗??먯꽌 GAS ?묎렐 (text/plain ???댁슜??Preflight ?고쉶, 502 Timeout 諛⑹?)
  GAS_URL: 'https://script.google.com/macros/s/AKfycbygxB_Xd7VyET-QKtaP1PqRno7XuTkaVKFW2vmDSQ1wD3FMoA_XEmKCFMqPE3YvBSc_/exec',
  R2_UPLOAD_URL: 'https://dashboard-image-upload.geun9265.workers.dev/',
  POLL_INTERVAL_MS: 5000,        // AI ?앹꽦 ?대쭅 二쇨린 (5珥?
  POLL_TIMEOUT_MS: 150000,      // 理쒕? ?湲??쒓컙 (2.5遺?
};

/* ??? IN-MEMORY STATE ??????????????????????????????????????????? */
const state = {
  reportDate: '',          // "YYYY-MM-DD"
  reportData: null,        // GAS?먯꽌 諛쏆? Daily ?쒗듃 ?곗씠??
  articles: [],            // ?먮젅?댁뀡 由ъ뒪??(?쒖꽌 ?ы븿)
  activeArticle: null,     // ?꾩옱 ?⑤꼸 B ?섎떒?먯꽌 ?몄쭛 以묒씤 湲곗궗
  activeEdits: {},         // { uuid ??{ Subtitle, Core_Content, Key_Point, Item_Thumb } }
  status: 'Draft',         // Draft | Ready | Published
  pollTimer: null,
};

/* ??? DOM REFS ?????????????????????????????????????????????????? */
const $ = (id) => document.getElementById(id);

const DOM = {
  reportDate: $('reportDate'),
  loadBtn: $('loadReportBtn'),
  articleList: $('articleList'),
  articleCount: $('articleCount'),
  addArticleBtn: $('addArticleBtn'),

  // Modal
  addModal: $('addArticleModal'),
  modalClose: $('modalCloseBtn'),
  modalCancel: $('modalCancelBtn'),
  modalSearch: $('modalSearchInput'),
  modalList: $('modalArticleList'),
  modalCount: $('modalCount'),

  // Status & action bar
  statusBadge: $('statusBadge'),
  statusText: $('statusText'),
  btnSave: $('btnSave'),
  btnGenerate: $('btnGenerate'),
  generateSpinner: $('generateSpinner'),
  generateBtnText: $('generateBtnText'),
  btnPublish: $('btnPublish'),
  btnUnpublish: $('btnUnpublish'),
  btnPreview: $('btnPreview'),

  // Active article section
  activeSection: $('activeArticleSection'),
  activeTitleLabel: $('activeArticleTitleLabel'),
  activeUuidLabel: $('activeArticleUuidLabel'),
  saveActiveBtn: $('saveActiveBtn'),

  // Loading overlay
  loadingOverlay: $('loadingOverlay'),
  loadingLabel: $('loadingLabel'),
  loadingDesc: $('loadingDesc'),

  // Report text fields (from?릒ame ??element)
  textFields: ['Headline', 'Head_Desc', 'Context_Chg', 'Point_Def', 'Body_Flow', 'Body_Issues', 'Body_3Key', 'App_Question', 'App_Predict', 'Section_Note'],
  imgFields: ['Img_Cover', 'Img_Sec1', 'Img_Sec2', 'Img_Body_Mid', 'Img_Sec3'],
};

/* ??? UTILITIES ????????????????????????????????????????????????? */

/** Format Date ??YYYY-MM-DD */
function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * GAS???쒗듃???좎쭨 ???JS Date 媛앹껜濡?吏곷젹?뷀빀?덈떎.
 * 紐⑤뱺 reportData 媛믪쓣 ?덉쟾?섍쾶 臾몄옄?대줈 蹂?섑빀?덈떎.
 */
function safeStr(val) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date || (typeof val === 'object' && val.constructor && val.constructor.name === 'Date')) {
    return fmtDate(new Date(val));
  }
  return String(val);
}

/**
 * GAS POST helper
 * - Content-Type ?ㅻ뜑瑜?紐낆떆?섏? ?딆쑝硫?釉뚮씪?곗?媛 text/plain ?쇰줈 蹂대궡硫댁꽌
 *   CORS preflight瑜??앸왂?⑸땲??
 * - GAS ?뱀빋? 302 由щ떎?대젆?몃? 嫄곗튂誘濡?redirect: 'follow' ?꾩닔.
 */
async function gasApi(action, payload = {}) {
  const body = JSON.stringify({ action, payload });
  const res = await fetch(CONFIG.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // GAS 紐낆꽭: text/plain ?꾩닔 (preflight 諛⑹?)
    redirect: 'follow',
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '?????녿뒗 ?ㅻ쪟');
  return json.data;
}

/** Cloudflare R2 Worker ?대?吏 ?낅줈??*/
async function uploadToR2(file) {
  if (!CONFIG.R2_UPLOAD_URL) {
    // Worker URL??誘몄꽕?뺤씤 寃쎌슦: 濡쒖뺄 Object URL濡??꾩떆 誘몃━蹂닿린
    return URL.createObjectURL(file);
  }
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(CONFIG.R2_UPLOAD_URL, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`R2 ?낅줈???ㅽ뙣: HTTP ${res.status}`);
  const json = await res.json();
  if (!json.url) throw new Error('Worker ?묐떟??url ?ㅺ? ?놁뒿?덈떎');
  return json.url;
}

/* ?? Toast notifications ???????????????????????????????????????? */
function showToast(message, type = 'info', duration = 3500) {
  const container = $('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span></span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

/* ?? Loading overlay ???????????????????????????????????????????? */
function showLoading(label = '泥섎━ 以?..', desc = '?좎떆留?湲곕떎?ㅼ＜?몄슂.') {
  DOM.loadingLabel.textContent = label;
  DOM.loadingDesc.textContent = desc;
  DOM.loadingOverlay.classList.add('visible');
}

function hideLoading() {
  DOM.loadingOverlay.classList.remove('visible');
}

/* ??? STATUS MANAGEMENT ????????????????????????????????????????? */
function applyStatus(status) {
  state.status = status;
  const badge = DOM.statusBadge;
  badge.className = 'status-badge';

  let label = status;
  if (status === 'Draft') { badge.classList.add('draft'); label = 'Draft'; }
  if (status === 'Ready') { badge.classList.add('ready'); label = 'Ready'; }
  if (status === 'Published') { badge.classList.add('published'); label = 'Published'; }

  DOM.statusText.textContent = label;

  // Publish button: only active when Ready
  DOM.btnPublish.disabled = (status !== 'Ready');

  // Lock everything when Published
  if (status === 'Published') {
    document.body.classList.add('is-published');
    DOM.btnSave.disabled = true;
    DOM.btnGenerate.disabled = true;
    DOM.btnPublish.disabled = true;
    DOM.btnPublish.style.display = 'none';
    if (DOM.btnUnpublish) DOM.btnUnpublish.style.display = 'flex';
    // Disable all form inputs
    document.querySelectorAll('.form-input, .form-textarea').forEach(el => (el.disabled = true));
  } else {
    document.body.classList.remove('is-published');
    DOM.btnPublish.style.display = 'flex';
    if (DOM.btnUnpublish) DOM.btnUnpublish.style.display = 'none';
    document.querySelectorAll('.form-input, .form-textarea').forEach(el => (el.disabled = false));
  }
}

/* ??? PANEL A ??ARTICLE CURATION ??????????????????????????????? */

function renderArticleList() {
  const list = DOM.articleList;
  const articles = state.articles;

  if (!articles.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"></div>
        <p>?먮젅?댁뀡??湲곗궗媛 ?놁뒿?덈떎.<br/>[+ 湲곗궗 異붽?]濡?異붽???二쇱꽭??</p>
      </div>`;
    DOM.articleCount.textContent = '0媛?;
    return;
  }

  DOM.articleCount.textContent = `${articles.length}媛?;
  list.innerHTML = '';

  articles.forEach((art, idx) => {
    const card = document.createElement('div');
    card.className = 'article-card';
    card.dataset.uuid = art.uuid;
    card.dataset.idx = idx;
    card.draggable = true;
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', art.Title_Org || art.title || '湲곗궗');

    const thumbHtml = art.Item_Thumb || art.thumb
      ? `<img class="article-thumb" src="${art.Item_Thumb || art.thumb}" alt="?몃꽕?? loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="article-thumb-placeholder" style="display:none"></div>`
      : `<div class="article-thumb-placeholder"></div>`;

    const title = art.Subtitle || '(?쒕ぉ ?놁쓬)';
    const subtitle = art.Title_Org || art.title || '';
    const category = art.Category_ID || art.category || '';
    const score = art.AI_Score !== undefined ? art.AI_Score : (art.score !== undefined ? art.score : '');

    card.innerHTML = `
      <span class="index-badge">${idx + 1}</span>
      <span class="drag-handle" title="?쒕옒洹명븯???쒖꽌 蹂寃?>??/span>
      ${thumbHtml}
      <div class="article-info">
        <div class="article-title">${escHtml(title)}</div>
        ${subtitle ? `<div class="article-subtitle" style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">${escHtml(subtitle)}</div>` : ''}
        <div class="article-meta">
          ${category ? `<span class="tag tag-category">${escHtml(String(category))}</span>` : ''}
          ${score !== '' ? `<span class="tag tag-score">${score}</span>` : ''}
        </div>
      </div>
      <button class="remove-btn" data-uuid="${art.uuid}" title="?쒖쇅" aria-label="湲곗궗 ?쒖쇅">??/button>
    `;

    // Select article ??populate active editor
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-btn')) return;
      selectArticle(art, card);
    });

    // Remove button
    card.querySelector('.remove-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      removeArticle(art.uuid);
    });

    // Drag & Drop events
    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragover', onDragOver);
    card.addEventListener('dragleave', onDragLeave);
    card.addEventListener('drop', onDrop);
    card.addEventListener('dragend', onDragEnd);

    list.appendChild(card);
  });
}

function removeArticle(uuid) {
  state.articles = state.articles.filter(a => a.uuid !== uuid);
  if (state.activeArticle && state.activeArticle.uuid === uuid) {
    state.activeArticle = null;
    DOM.activeSection.classList.add('hidden');
  }
  renderArticleList();
}

function selectArticle(art, cardEl) {
  // Save current edits for previous active article
  flushActiveEditsToState();

  // Mark selected card
  document.querySelectorAll('.article-card.selected').forEach(c => c.classList.remove('selected'));
  cardEl.classList.add('selected');

  state.activeArticle = art;

  // Populate editor fields from edits cache or article data
  const edits = state.activeEdits[art.uuid] || {};
  $('f_Subtitle').value = edits.Subtitle ?? art.Subtitle ?? '';
  $('f_Core_Content').value = edits.Core_Content ?? art.Core_Content ?? '';
  $('f_Key_Point').value = edits.Key_Point ?? art.Key_Point ?? '';

  // Thumb
  const thumbUrl = edits.Item_Thumb ?? art.Item_Thumb ?? '';
  $('f_Item_Thumb').value = thumbUrl;
  $('url_Item_Thumb').value = thumbUrl;
  setImagePreview('Item_Thumb', thumbUrl);

  // Labels
  const title = art.Subtitle || '湲곗궗 ?몄쭛';
  DOM.activeTitleLabel.textContent = title.length > 40 ? title.slice(0, 40) + '?? : title;
  DOM.activeUuidLabel.textContent = art.uuid;

  DOM.activeSection.classList.remove('hidden');
  DOM.activeSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Flush the currently-open active article editor values into state.activeEdits */
function flushActiveEditsToState() {
  if (!state.activeArticle) return;
  const uuid = state.activeArticle.uuid;
  state.activeEdits[uuid] = {
    Subtitle: $('f_Subtitle').value,
    Core_Content: $('f_Core_Content').value,
    Key_Point: $('f_Key_Point').value,
    Item_Thumb: $('f_Item_Thumb').value,
  };
}

/* ??? DRAG & DROP ??????????????????????????????????????????????? */
let dragSrcIdx = null;

function onDragStart(e) {
  dragSrcIdx = parseInt(this.dataset.idx);
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(dragSrcIdx));
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  this.classList.add('drag-over');
}

function onDragLeave() {
  this.classList.remove('drag-over');
}

function onDrop(e) {
  e.preventDefault();
  const destIdx = parseInt(this.dataset.idx);
  this.classList.remove('drag-over');

  if (dragSrcIdx === null || dragSrcIdx === destIdx) return;

  const items = [...state.articles];
  const [moved] = items.splice(dragSrcIdx, 1);
  items.splice(destIdx, 0, moved);
  state.articles = items;
  renderArticleList();
}

function onDragEnd() {
  this.classList.remove('dragging');
  document.querySelectorAll('.article-card.drag-over').forEach(c => c.classList.remove('drag-over'));
  dragSrcIdx = null;
}

/* ??? MODAL ??Add Article ??????????????????????????????????????? */
let allAvailableArticles = [];

async function openAddModal() {
  DOM.addModal.classList.add('open');
  DOM.modalSearch.value = '';
  DOM.modalList.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><p>湲곗궗 紐⑸줉??遺덈윭?ㅻ뒗 以?..</p></div>`;

  try {
    const date = state.reportDate;
    const data = await gasApi('GET_AVAILABLE_ACTIVES', { startDate: date, endDate: date });
    allAvailableArticles = Array.isArray(data) ? data : [];
    renderModalList(allAvailableArticles);
  } catch (err) {
    DOM.modalList.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><p>遺덈윭?ㅺ린 ?ㅽ뙣: ${escHtml(err.message)}</p></div>`;
    showToast('湲곗궗 紐⑸줉 濡쒕뱶 ?ㅽ뙣: ' + err.message, 'error');
  }
}

function renderModalList(articles) {
  const existing = new Set(state.articles.map(a => a.uuid));
  DOM.modalCount.textContent = `${articles.length}媛?湲곗궗`;

  if (!articles.length) {
    DOM.modalList.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><p>寃??寃곌낵媛 ?놁뒿?덈떎.</p></div>`;
    return;
  }

  DOM.modalList.innerHTML = '';
  articles.forEach(art => {
    const item = document.createElement('div');
    item.className = 'modal-article-item' + (existing.has(art.uuid) ? ' already-added' : '');
    item.dataset.uuid = art.uuid;

    // Use Subtitle as the main display title, and Title_Org as subtitle
    const title = art.Subtitle || '(?쒕ぉ ?놁쓬)';
    const subtitle = art.Title_Org || art.title || '';
    const catHtml = art.category ? `<span class="tag tag-category">${escHtml(art.category)}</span>` : '';
    const scoreHtml = art.score ? `<span class="tag tag-score">${art.score}</span>` : '';

    item.innerHTML = `
      <div class="modal-article-info">
        <div class="modal-article-title">${escHtml(title)}</div>
        ${subtitle ? `<div class="modal-article-subtitle" style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">${escHtml(subtitle)}</div>` : ''}
        <div class="modal-article-meta">
          ${catHtml}
          ${scoreHtml}
          ${art.date ? `<span class="tag" style="background:rgba(0,45,84,0.06);color:var(--text-muted)">${escHtml(art.date)}</span>` : ''}
        </div>
      </div>
    `;

    if (!existing.has(art.uuid)) {
      item.addEventListener('click', () => {
        addArticleFromModal(art);
        closeAddModal();
      });
    }

    DOM.modalList.appendChild(item);
  });
}

function addArticleFromModal(art) {
  state.articles.push(art);
  renderArticleList();
  showToast(`"${(art.Subtitle || art.Title_Org || art.title || art.uuid).slice(0, 30)}?? 異붽???, 'success');
}

function closeAddModal() {
  DOM.addModal.classList.remove('open');
}

DOM.addArticleBtn.addEventListener('click', openAddModal);
DOM.modalClose.addEventListener('click', closeAddModal);
DOM.modalCancel.addEventListener('click', closeAddModal);
DOM.addModal.addEventListener('click', (e) => {
  if (e.target === DOM.addModal) closeAddModal();
});

DOM.modalSearch.addEventListener('input', () => {
  const q = DOM.modalSearch.value.trim().toLowerCase();
  if (!q) { renderModalList(allAvailableArticles); return; }
  const filtered = allAvailableArticles.filter(a =>
    (a.Subtitle || '').toLowerCase().includes(q) ||
    (a.Title_Org || '').toLowerCase().includes(q) ||
    (a.title || '').toLowerCase().includes(q) ||
    (a.category || '').toLowerCase().includes(q)
  );
  renderModalList(filtered);
});

/* ??? PANEL B ??IMAGE UPLOAD ???????????????????????????????????? */

const IMAGE_FIELD_IDS = ['Img_Cover', 'Img_Sec1', 'Img_Sec2', 'Img_Body_Mid', 'Img_Sec3', 'Item_Thumb'];

function setImagePreview(fieldName, url) {
  const prev = $(`prev_${fieldName}`);
  const urlIn = $(`url_${fieldName}`);
  if (!prev) return;
  if (url) {
    prev.src = url;
    prev.classList.add('visible');
  } else {
    prev.src = '';
    prev.classList.remove('visible');
  }
  if (urlIn) urlIn.value = url || '';
}

async function handleImageUpload(fieldName, file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('?대?吏 ?뚯씪留??낅줈?쒗븷 ???덉뒿?덈떎.', 'warning');
    return;
  }

  const upInd = $(`up_${fieldName}`);
  if (upInd) upInd.classList.add('visible');

  try {
    const url = await uploadToR2(file);
    $(`f_${fieldName}`).value = url;
    setImagePreview(fieldName, url);
    showToast(`${fieldName} ?낅줈???꾨즺`, 'success');
  } catch (err) {
    showToast(`?낅줈???ㅽ뙣: ${err.message}`, 'error');
  } finally {
    if (upInd) upInd.classList.remove('visible');
  }
}

function setupDropZone(fieldName) {
  const dz = $(`dz_${fieldName}`);
  const fileIn = $(`file_${fieldName}`);
  if (!dz || !fileIn) return;

  dz.addEventListener('click', () => fileIn.click());
  dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileIn.click(); });

  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.classList.add('drag-active');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-active'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('drag-active');
    const file = e.dataTransfer.files[0];
    if (file) handleImageUpload(fieldName, file);
  });

  fileIn.addEventListener('change', () => {
    const file = fileIn.files[0];
    if (file) handleImageUpload(fieldName, file);
  });
}

IMAGE_FIELD_IDS.forEach(setupDropZone);

// URL ?낅젰李?吏곸젒 ?낅젰 ??hidden ?꾨뱶 + 誘몃━蹂닿린 ?숆린??
IMAGE_FIELD_IDS.forEach(fieldName => {
  const urlInput = $(`url_${fieldName}`);
  if (!urlInput) return;
  urlInput.addEventListener('input', () => {
    const url = urlInput.value.trim();
    const hidden = $(`f_${fieldName}`);
    if (hidden) hidden.value = url;
    const prev = $(`prev_${fieldName}`);
    if (!prev) return;
    if (url) {
      prev.src = url;
      prev.classList.add('visible');
    } else {
      prev.src = '';
      prev.classList.remove('visible');
    }
  });
});

/* ??? LOAD REPORT DATA ?????????????????????????????????????????? */

async function loadReport(date) {
  showLoading('由ы룷??濡쒕뱶 以?..', `${date} ?곗씠?곕? 遺덈윭?ㅺ퀬 ?덉뒿?덈떎.`);

  try {
    const data = await gasApi('GET_REPORT_DATA', { reportType: 'WEEKLY', targetDate: date });

    state.reportDate = date;
    state.reportData = data.reportData || {};
    state.articles = Array.isArray(data.includedArticles) ? data.includedArticles : [];
    state.activeEdits = {};
    state.activeArticle = null;

    // Populate text fields ??safeStr handles Date objects from GAS
    DOM.textFields.forEach(name => {
      const el = $(`f_${name}`);
      if (el) el.value = safeStr(state.reportData[name]);
    });

    // Populate image fields
    DOM.imgFields.forEach(name => {
      const url = safeStr(state.reportData[name]);
      const fEl = $(`f_${name}`);
      if (fEl) fEl.value = url;
      setImagePreview(name, url);
    });

    // Status
    applyStatus(state.reportData.Status || 'Draft');

    // Render article list
    renderArticleList();

    // Hide active article editor
    DOM.activeSection.classList.add('hidden');

    // Enable action buttons
    DOM.btnSave.disabled = false;
    DOM.btnGenerate.disabled = false;
    DOM.btnPreview.disabled = false;

    showToast(`${date} 由ы룷??濡쒕뱶 ?꾨즺`, 'success');
  } catch (err) {
    showToast('由ы룷??濡쒕뱶 ?ㅽ뙣: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

DOM.loadBtn.addEventListener('click', () => {
  const date = DOM.reportDate.value;
  if (!date) { showToast('?좎쭨瑜??좏깮??二쇱꽭??', 'warning'); return; }
  loadReport(date);
});

/* ??? COLLECT FORM VALUES ??????????????????????????????????????? */

function collectReportUpdates() {
  const updates = {};
  DOM.textFields.forEach(name => {
    const el = $(`f_${name}`);
    if (el) updates[name] = el.value;
  });
  DOM.imgFields.forEach(name => {
    const el = $(`f_${name}`);
    if (el) updates[name] = el.value;
  });
  return updates;
}

/* ??? PANEL C BUTTON HANDLERS ??????????????????????????????????? */

async function saveData() {
  if (!state.reportDate) { showToast('由ы룷?몃? 癒쇱? 濡쒕뱶??二쇱꽭??', 'warning'); throw new Error('No date'); }

  DOM.btnSave.disabled = true;
  try {
    flushActiveEditsToState();

    // 1 & 2. Save report text/image fields AND Included_Items in one atomic call
    const updates = collectReportUpdates();
    const validUuids = state.articles.map(a => a.uuid).filter(Boolean);
    updates.Included_Items = JSON.stringify(validUuids);

    await gasApi('UPDATE_REPORT_DATA', {
      reportType: 'WEEKLY',
      targetDate: state.reportDate,
      updates,
    });

    // 3. Save each active article's edits
    const editEntries = Object.entries(state.activeEdits);
    await Promise.all(editEntries.map(([uuid, edits]) =>
      gasApi('UPDATE_ACTIVE_DATA', { uuid, updates: edits }).catch(() => { })
    ));

    showToast('????꾨즺', 'success');
  } catch (err) {
    showToast('????ㅽ뙣: ' + err.message, 'error');
    throw err;
  } finally {
    DOM.btnSave.disabled = false;
  }
}

/* 以묎컙 ???*/
DOM.btnSave.addEventListener('click', () => {
  saveData().catch(() => { });
});

/* 媛쒕퀎 湲곗궗 ???踰꾪듉 */
DOM.saveActiveBtn.addEventListener('click', async () => {
  if (!state.activeArticle) return;
  flushActiveEditsToState();
  const uuid = state.activeArticle.uuid;
  const edits = state.activeEdits[uuid] || {};
  DOM.saveActiveBtn.disabled = true;
  try {
    await gasApi('UPDATE_ACTIVE_DATA', { uuid, updates: edits });
    // Keep article-list thumb in sync
    const artInList = state.articles.find(a => a.uuid === uuid);
    if (artInList && edits.Item_Thumb) artInList.Item_Thumb = edits.Item_Thumb;
    renderArticleList();
    showToast('湲곗궗 ????꾨즺 ??, 'success');
  } catch (err) {
    showToast('湲곗궗 ????ㅽ뙣: ' + err.message, 'error');
  } finally {
    DOM.saveActiveBtn.disabled = false;
  }
});

/* AI 蹂몃Ц ?앹꽦 */
DOM.btnGenerate.addEventListener('click', async () => {
  if (!state.reportDate) { showToast('由ы룷?몃? 癒쇱? 濡쒕뱶??二쇱꽭??', 'warning'); return; }

  const confirmed = window.confirm(
    'AI 蹂몃Ц ?앹꽦??吏꾪뻾?섏떆寃좎뒿?덇퉴?\n??1~2遺??뚯슂?⑸땲??'
  );
  if (!confirmed) return;

  DOM.btnGenerate.disabled = true;
  DOM.generateSpinner.classList.add('visible');
  DOM.generateBtnText.textContent = 'AI ?앹꽦 以?..';

  try {
    // Trigger generation
    await gasApi('RUN_WEEKLY_GENERATE', { targetDate: state.reportDate });
    showToast('AI 二쇨컙 ?붿빟 ?앹꽦 ?쒖옉?? ?꾨즺源뚯? 湲곕떎由쎈땲?ㅲ?, 'info', 8000);

    // Poll until Status becomes Ready
    await pollUntilReady();
  } catch (err) {
    showToast('AI ?앹꽦 ?ㅽ뙣: ' + err.message, 'error');
    DOM.btnGenerate.disabled = false;
  } finally {
    DOM.generateSpinner.classList.remove('visible');
    DOM.generateBtnText.textContent = 'AI 蹂몃Ц ?앹꽦';
  }
});

/** Poll GET_REPORT_DATA every POLL_INTERVAL_MS until Status === 'Ready' or timeout */
async function pollUntilReady() {
  const deadline = Date.now() + CONFIG.POLL_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (Date.now() > deadline) {
        reject(new Error('??꾩븘?? ?곹깭媛 Ready濡?蹂寃쎈릺吏 ?딆븯?듬땲??'));
        return;
      }
      try {
        const data = await gasApi('GET_REPORT_DATA', {
          reportType: 'WEEKLY',
          targetDate: state.reportDate,
        });
        const newStatus = data?.reportData?.Status || '';
        if (newStatus === 'Ready' || newStatus === 'Published') {
          // Refresh all field values
          state.reportData = data.reportData;
          DOM.textFields.forEach(name => {
            const el = $(`f_${name}`);
            if (el) el.value = state.reportData[name] ?? '';
          });
          applyStatus(newStatus);
          showToast('AI 蹂몃Ц ?앹꽦 ?꾨즺! ?곹깭: Ready ??, 'success');
          DOM.btnGenerate.disabled = false;
          resolve();
        } else {
          state.pollTimer = setTimeout(tick, CONFIG.POLL_INTERVAL_MS);
        }
      } catch {
        state.pollTimer = setTimeout(tick, CONFIG.POLL_INTERVAL_MS);
      }
    };
    tick();
  });
}

/* 理쒖쥌 諛쒗뻾 */
DOM.btnPublish.addEventListener('click', async () => {
  if (state.status !== 'Ready') return;

  const confirmed = window.confirm(
    '理쒖쥌 諛쒗뻾?섏떆寃좎뒿?덇퉴?\n諛쒗뻾 ?꾩뿉???섏젙??遺덇??⑸땲??'
  );
  if (!confirmed) return;

  showLoading('諛쒗뻾 以?..', 'DB ?곹깭瑜?Published濡?蹂寃쏀븯怨??덉뒿?덈떎.');
  try {
    await gasApi('PUBLISH_REPORT', {
      reportType: 'WEEKLY',
      targetDate: state.reportDate,
    });
    applyStatus('Published');
    showToast('由ы룷?멸? 諛쒗뻾?섏뿀?듬땲??', 'success', 6000);
  } catch (err) {
    showToast('諛쒗뻾 ?ㅽ뙣: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
});

/* Ready濡??꾪솚 (Unpublish) */
if (DOM.btnUnpublish) {
  DOM.btnUnpublish.addEventListener('click', async () => {
    if (state.status !== 'Published') return;

    const confirmed = window.confirm('Ready ?곹깭濡??섎룎由ъ떆寃좎뒿?덇퉴?\\n?ㅼ떆 諛고룷 ?꾧퉴吏 ?섏젙??媛?ν빐吏묐땲??');
    if (!confirmed) return;

    showLoading('?꾪솚 以?..', 'DB ?곹깭瑜?Ready濡?蹂寃쏀븯怨??덉뒿?덈떎.');
    try {
      await gasApi('UPDATE_REPORT_DATA', {
        reportType: 'WEEKLY',
        targetDate: state.reportDate,
        updates: { Status: 'Ready' }
      });
      applyStatus('Ready');
      showToast('?곹깭媛 Ready濡?蹂寃쎈릺?덉뒿?덈떎.', 'success', 4000);
    } catch (err) {
      showToast('?곹깭 ?꾪솚 ?ㅽ뙣: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  });
}

/* ??? UTILITIES ????????????????????????????????????????????????? */

/** Escape HTML special chars */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ??? PREVIEW ??????????????????????????????????????????????????? */

function buildPreviewHtml() {
  const r = {};
  DOM.textFields.forEach(name => {
    const el = $(`f_${name}`);
    r[name] = el ? el.value : '';
  });
  DOM.imgFields.forEach(name => {
    const el = $(`f_${name}`);
    r[name] = el ? el.value : '';
  });

  // Flush latest active edits
  flushActiveEditsToState();

  let html = '';

  // Header
  html += `<div class="pv-header">`;
  html += `<div class="pv-date">WEEKLY REPORT ??${escHtml(state.reportDate)}</div>`;
  html += `<h1 class="pv-headline">${escHtml(r.Headline || '(?ㅻ뱶?쇱씤 ?놁쓬)')}</h1>`;
  if (r.Head_Desc) html += `<p class="pv-head-desc">${escHtml(r.Head_Desc)}</p>`;
  html += `</div>`;

  // Cover image
  if (r.Img_Cover) {
    html += `<div class="pv-cover-wrap"><img src="${escHtml(r.Img_Cover)}" alt="而ㅻ쾭 ?대?吏" /></div>`;
  }

  // Text sections
  const sections = [
    { key: 'Context_Chg', label: '留λ씫 蹂??(Context Change)', img: 'Img_Sec1' },
    { key: 'Point_Def', label: '二쇱슂 ?ъ씤??(Point Definition)', img: 'Img_Sec2' },
    { key: 'Body_Flow', label: '蹂몃Ц ?먮쫫 (Body Flow)', img: 'Img_Body_Mid' },
    { key: 'Body_Issues', label: '二쇱슂 ?댁뒋 (Body Issues)', img: null },
    { key: 'Body_3Key', label: '?듭떖 3 ?붿빟 (Body 3 Key)', img: null },
    { key: 'App_Question', label: '?곸슜 吏덈Ц (App Question)', img: 'Img_Sec3' },
    { key: 'App_Predict', label: '?ν썑 ?꾨쭩 (App Predict)', img: null },
  ];

  sections.forEach(sec => {
    const text = r[sec.key];
    html += `<div class="pv-section">`;
    html += `<div class="pv-section-label">${sec.label}</div>`;
    html += `<div class="pv-section-body${!text ? ' empty' : ''}">${text ? escHtml(text) : '(?꾩쭅 ?묒꽦?섏? ?딆븯?듬땲??'}</div>`;
    html += `</div>`;

    // Section image
    if (sec.img && r[sec.img]) {
      html += `<div class="pv-sec-image"><img src="${escHtml(r[sec.img])}" alt="${sec.img}" /></div>`;
    }
  });

  // Divider
  html += `<div class="pv-divider"></div>`;

  // Included articles
  const arts = state.articles;
  if (arts.length) {
    html += `<h2 class="pv-articles-title">?벐 ?ㅻ뒛???먮젅?댁뀡 湲곗궗 (${arts.length})</h2>`;
    arts.forEach((art, idx) => {
      const edits = state.activeEdits[art.uuid] || {};
      const title = edits.Subtitle || art.Subtitle || '(?쒕ぉ ?놁쓬)'; // Use Subtitle as the main display title
      const subtitle = art.Title_Org || art.title || ''; // Use Title_Org/title as subtitle
      const content = edits.Core_Content || art.Core_Content || '';
      const thumb = edits.Item_Thumb || art.Item_Thumb || art.thumb || '';

      const thumbHtml = thumb
        ? `<img class="pv-article-thumb" src="${escHtml(thumb)}" alt="" />`
        : `<div class="pv-article-thumb-placeholder">?뱞</div>`;

      html += `<div class="pv-article-card">`;
      html += `<span class="pv-article-idx">${idx + 1}</span>`;
      html += thumbHtml;
      html += `<div class="pv-article-body">`;
      html += `<div class="pv-article-title">${escHtml(title)}</div>`;
      if (subtitle) html += `<div class="pv-article-subtitle">${escHtml(subtitle)}</div>`;
      if (content) html += `<div class="pv-article-content">${escHtml(content)}</div>`;
      html += `</div></div>`;
    });
  }

  return html;
}

async function openPreview() {
  const currentVal = DOM.reportDate.value;
  if (!currentVal) return;

  const overlay = document.getElementById('previewOverlay');
  const iframe = document.getElementById('previewIframe');
  if (!overlay || !iframe) return;

  // Show loading indicator in iframe
  iframe.srcdoc = '<div style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; color: #555;"><h3 style="color: #453FE8; margin-bottom: 8px;">誘몃━蹂닿린 以鍮?以?..</h3><p>理쒖떊 蹂寃쎌궗??쓣 ??ν븯怨??덉뒿?덈떎.</p></div>';
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Auto-save before previewing
  try {
    showToast('誘몃━蹂닿린 ???먮룞 ???以?..', 'info', 2000);
    await saveData();
    showToast('????꾨즺! 誘몃━蹂닿린瑜?濡쒕뱶?⑸땲??', 'success', 1500);
  } catch (e) {
    console.error('Preview auto-save failed:', e);
    showToast('?먮룞 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.', 'error', 3000);
  }

  // Simply load the actual viewer page in the iframe.
  // The viewer page has its own CSS, JS, and fetches saved data from the API.
  iframe.removeAttribute('srcdoc');
  iframe.src = './viewer_weekly.html?week=' + encodeURIComponent(currentVal);
}


function closePreview() {
  const overlay = document.getElementById('previewOverlay');
  const iframe = document.getElementById('previewIframe');
  if (overlay) overlay.classList.remove('open');
  if (iframe) {
    if (iframe.src && iframe.src.startsWith('blob:')) URL.revokeObjectURL(iframe.src);
    iframe.src = '';
    iframe.removeAttribute('srcdoc');
  }
  document.body.style.overflow = '';
}

DOM.btnPreview.addEventListener('click', openPreview);
const previewCloseBtn = document.getElementById('previewCloseBtn');
if (previewCloseBtn) previewCloseBtn.addEventListener('click', closePreview);
const previewOverlay = document.getElementById('previewOverlay');
if (previewOverlay) {
  previewOverlay.addEventListener('click', (e) => {
    if (e.target === previewOverlay) closePreview();
  });
}

/* ??? INIT ?????????????????????????????????????????????????????? */

function init() {
  // Get date from URL or default to today (KST: UTC+9)
  const urlParams = new URLSearchParams(window.location.search);
  const queryDate = urlParams.get('week');

  const today = new Date(Date.now() + 9 * 3600 * 1000);
  const targetDateStr = queryDate || fmtDate(today);

  DOM.reportDate.value = targetDateStr;
  state.reportDate = targetDateStr;

  // Keyboard shortcut: Escape closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAddModal();
      closePreview();
    }
  });

  // Auto-load on page open
  console.log('%c[Weekly Report Admin] 珥덇린???꾨즺. 由ы룷?몃? 濡쒕뱶?⑸땲?ㅲ?, 'color:#7C6AF7;font-weight:bold');
  loadReport(targetDateStr);
}

init();
