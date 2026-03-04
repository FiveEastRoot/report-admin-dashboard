/* =============================================================
   DAILY REPORT ADMIN DASHBOARD — app.js
   Main application logic: API, state, drag-drop, image upload
   ============================================================= */

'use strict';

/* ─── CONFIG ──────────────────────────────────────────────────
   교체 포인트:
   - GAS_URL: GAS 웹앱 엔드포인트 (현재 명세서의 URL로 설정)
   - R2_UPLOAD_URL: Cloudflare Worker 업로드 엔드포인트 (추후 교체)
─────────────────────────────────────────────────────────────── */
const CONFIG = {
  // 직접 브라우저에서 GAS 접근 (text/plain 을 이용해 Preflight 우회, 502 Timeout 방지)
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxosmr9t7qMMFxLTDMmuZZpsbLdZtLJms536RwmY1ArmMOANP99qmZMB0PODt6UOMgi/exec',
  R2_UPLOAD_URL: 'https://dashboard-image-upload.geun9265.workers.dev/',
  POLL_INTERVAL_MS: 5000,        // AI 생성 폴링 주기 (5초)
  POLL_TIMEOUT_MS: 150000,      // 최대 대기 시간 (2.5분)
};

/* ─── IN-MEMORY STATE ─────────────────────────────────────────── */
const state = {
  reportDate: '',          // "YYYY-MM-DD"
  reportData: null,        // GAS에서 받은 Daily 시트 데이터
  articles: [],            // 큐레이션 리스트 (순서 포함)
  activeArticle: null,     // 현재 패널 B 하단에서 편집 중인 기사
  activeEdits: {},         // { uuid → { Subtitle, Core_Content, Key_Point, Item_Thumb } }
  status: 'Draft',         // Draft | Ready | Published
  pollTimer: null,
};

/* ─── DOM REFS ────────────────────────────────────────────────── */
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

  // Report text fields (from‐name → element)
  textFields: ['Headline', 'Head_Desc', 'Why_Imp', 'Point_Now', 'App_Review', 'App_Prep', 'App_Point'],
  imgFields: ['Img_Cover', 'Img_Sec1', 'Img_Sec2', 'Img_Sec3'],
};

/* ─── UTILITIES ───────────────────────────────────────────────── */

/** Format Date → YYYY-MM-DD */
function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * GAS는 시트의 날짜 셀을 JS Date 객체로 직렬화합니다.
 * 모든 reportData 값을 안전하게 문자열로 변환합니다.
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
 * - Content-Type 헤더를 명시하지 않으면 브라우저가 text/plain 으로 보내면서
 *   CORS preflight를 생략합니다.
 * - GAS 웹앱은 302 리다이렉트를 거치므로 redirect: 'follow' 필수.
 */
async function gasApi(action, payload = {}) {
  const body = JSON.stringify({ action, payload });
  const res = await fetch(CONFIG.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // GAS 명세: text/plain 필수 (preflight 방지)
    redirect: 'follow',
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '알 수 없는 오류');
  return json.data;
}

/** Cloudflare R2 Worker 이미지 업로드 */
async function uploadToR2(file) {
  if (!CONFIG.R2_UPLOAD_URL) {
    // Worker URL이 미설정인 경우: 로컬 Object URL로 임시 미리보기
    return URL.createObjectURL(file);
  }
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(CONFIG.R2_UPLOAD_URL, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`R2 업로드 실패: HTTP ${res.status}`);
  const json = await res.json();
  if (!json.url) throw new Error('Worker 응답에 url 키가 없습니다');
  return json.url;
}

/* ── Toast notifications ──────────────────────────────────────── */
function showToast(message, type = 'info', duration = 3500) {
  const container = $('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  toast.innerHTML = `<span>${icons[type] || '💬'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

/* ── Loading overlay ──────────────────────────────────────────── */
function showLoading(label = '처리 중...', desc = '잠시만 기다려주세요.') {
  DOM.loadingLabel.textContent = label;
  DOM.loadingDesc.textContent = desc;
  DOM.loadingOverlay.classList.add('visible');
}

function hideLoading() {
  DOM.loadingOverlay.classList.remove('visible');
}

/* ─── STATUS MANAGEMENT ───────────────────────────────────────── */
function applyStatus(status) {
  state.status = status;
  const badge = DOM.statusBadge;
  badge.className = 'status-badge';

  let label = status;
  if (status === 'Draft') { badge.classList.add('draft'); label = '✏️ Draft'; }
  if (status === 'Ready') { badge.classList.add('ready'); label = '⚡ Ready'; }
  if (status === 'Published') { badge.classList.add('published'); label = '✅ Published'; }

  DOM.statusText.textContent = label;

  // Publish button: only active when Ready
  DOM.btnPublish.disabled = (status !== 'Ready');

  // Lock everything when Published
  if (status === 'Published') {
    document.body.classList.add('is-published');
    DOM.btnSave.disabled = true;
    DOM.btnGenerate.disabled = true;
    DOM.btnPublish.disabled = true;
    // Disable all form inputs
    document.querySelectorAll('.form-input, .form-textarea').forEach(el => (el.disabled = true));
  } else {
    document.body.classList.remove('is-published');
  }
}

/* ─── PANEL A — ARTICLE CURATION ─────────────────────────────── */

function renderArticleList() {
  const list = DOM.articleList;
  const articles = state.articles;

  if (!articles.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>큐레이션된 기사가 없습니다.<br/>[+ 기사 추가]로 추가해 주세요.</p>
      </div>`;
    DOM.articleCount.textContent = '0개';
    return;
  }

  DOM.articleCount.textContent = `${articles.length}개`;
  list.innerHTML = '';

  articles.forEach((art, idx) => {
    const card = document.createElement('div');
    card.className = 'article-card';
    card.dataset.uuid = art.uuid;
    card.dataset.idx = idx;
    card.draggable = true;
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', art.Title_Org || art.title || '기사');

    const thumbHtml = art.Item_Thumb || art.thumb
      ? `<img class="article-thumb" src="${art.Item_Thumb || art.thumb}" alt="썸네일" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="article-thumb-placeholder" style="display:none">📄</div>`
      : `<div class="article-thumb-placeholder">📄</div>`;

    const title = art.Subtitle || '(제목 없음)';
    const subtitle = art.Title_Org || art.title || '';
    const category = art.Category_ID || art.category || '';
    const score = art.AI_Score !== undefined ? art.AI_Score : (art.score !== undefined ? art.score : '');

    card.innerHTML = `
      <span class="index-badge">${idx + 1}</span>
      <span class="drag-handle" title="드래그하여 순서 변경">⠿</span>
      ${thumbHtml}
      <div class="article-info">
        <div class="article-title">${escHtml(title)}</div>
        ${subtitle ? `<div class="article-subtitle" style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">${escHtml(subtitle)}</div>` : ''}
        <div class="article-meta">
          ${category ? `<span class="tag tag-category">${escHtml(String(category))}</span>` : ''}
          ${score !== '' ? `<span class="tag tag-score">⭐ ${score}</span>` : ''}
        </div>
      </div>
      <button class="remove-btn" data-uuid="${art.uuid}" title="제외" aria-label="기사 제외">✕</button>
    `;

    // Select article → populate active editor
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
  const title = art.Subtitle || '기사 편집';
  DOM.activeTitleLabel.textContent = title.length > 40 ? title.slice(0, 40) + '…' : title;
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

/* ─── DRAG & DROP ─────────────────────────────────────────────── */
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

/* ─── MODAL — Add Article ─────────────────────────────────────── */
let allAvailableArticles = [];

async function openAddModal() {
  DOM.addModal.classList.add('open');
  DOM.modalSearch.value = '';
  DOM.modalList.innerHTML = `<div class="empty-state"><div class="empty-icon">🔄</div><p>기사 목록을 불러오는 중...</p></div>`;

  try {
    const date = state.reportDate;
    const data = await gasApi('GET_AVAILABLE_ACTIVES', { startDate: date, endDate: date });
    allAvailableArticles = Array.isArray(data) ? data : [];
    renderModalList(allAvailableArticles);
  } catch (err) {
    DOM.modalList.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>불러오기 실패: ${escHtml(err.message)}</p></div>`;
    showToast('기사 목록 로드 실패: ' + err.message, 'error');
  }
}

function renderModalList(articles) {
  const existing = new Set(state.articles.map(a => a.uuid));
  DOM.modalCount.textContent = `${articles.length}개 기사`;

  if (!articles.length) {
    DOM.modalList.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>검색 결과가 없습니다.</p></div>`;
    return;
  }

  DOM.modalList.innerHTML = '';
  articles.forEach(art => {
    const item = document.createElement('div');
    item.className = 'modal-article-item' + (existing.has(art.uuid) ? ' already-added' : '');
    item.dataset.uuid = art.uuid;

    // Use Subtitle as the main display title, and Title_Org as subtitle
    const title = art.Subtitle || '(제목 없음)';
    const subtitle = art.Title_Org || art.title || '';
    const catHtml = art.category ? `<span class="tag tag-category">${escHtml(art.category)}</span>` : '';
    const scoreHtml = art.score ? `<span class="tag tag-score">★ ${art.score}</span>` : '';

    item.innerHTML = `
      <div class="modal-article-info">
        <div class="modal-article-title">${escHtml(title)}</div>
        ${subtitle ? `<div class="modal-article-subtitle" style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">${escHtml(subtitle)}</div>` : ''}
        <div class="modal-article-meta">
          ${catHtml}
          ${scoreHtml}
          ${art.date ? `<span class="tag" style="background:rgba(255,255,255,0.06);color:var(--text-muted)">${escHtml(art.date)}</span>` : ''}
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
  showToast(`"${(art.Subtitle || art.Title_Org || art.title || art.uuid).slice(0, 30)}…" 추가됨`, 'success');
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

/* ─── PANEL B — IMAGE UPLOAD ──────────────────────────────────── */

const IMAGE_FIELD_IDS = ['Img_Cover', 'Img_Sec1', 'Img_Sec2', 'Img_Sec3', 'Item_Thumb'];

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
    showToast('이미지 파일만 업로드할 수 있습니다.', 'warning');
    return;
  }

  const upInd = $(`up_${fieldName}`);
  if (upInd) upInd.classList.add('visible');

  try {
    const url = await uploadToR2(file);
    $(`f_${fieldName}`).value = url;
    setImagePreview(fieldName, url);
    showToast(`${fieldName} 업로드 완료`, 'success');
  } catch (err) {
    showToast(`업로드 실패: ${err.message}`, 'error');
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

// URL 입력창 직접 입력 → hidden 필드 + 미리보기 동기화
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

/* ─── LOAD REPORT DATA ────────────────────────────────────────── */

async function loadReport(date) {
  showLoading('리포트 로드 중...', `${date} 데이터를 불러오고 있습니다.`);

  try {
    const data = await gasApi('GET_REPORT_DATA', { reportType: 'DAILY', targetDate: date });

    state.reportDate = date;
    state.reportData = data.reportData || {};
    state.articles = Array.isArray(data.includedArticles) ? data.includedArticles : [];
    state.activeEdits = {};
    state.activeArticle = null;

    // Populate text fields — safeStr handles Date objects from GAS
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

    showToast(`${date} 리포트 로드 완료`, 'success');
  } catch (err) {
    showToast('리포트 로드 실패: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

DOM.loadBtn.addEventListener('click', () => {
  const date = DOM.reportDate.value;
  if (!date) { showToast('날짜를 선택해 주세요.', 'warning'); return; }
  loadReport(date);
});

/* ─── COLLECT FORM VALUES ─────────────────────────────────────── */

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

/* ─── PANEL C BUTTON HANDLERS ─────────────────────────────────── */

/* 중간 저장 */
DOM.btnSave.addEventListener('click', async () => {
  if (!state.reportDate) { showToast('리포트를 먼저 로드해 주세요.', 'warning'); return; }

  DOM.btnSave.disabled = true;
  try {
    flushActiveEditsToState();

    // 1 & 2. Save report text/image fields AND Included_Items in one atomic call
    const updates = collectReportUpdates();
    const validUuids = state.articles.map(a => a.uuid).filter(Boolean);
    updates.Included_Items = JSON.stringify(validUuids);

    await gasApi('UPDATE_REPORT_DATA', {
      reportType: 'DAILY',
      targetDate: state.reportDate,
      updates,
    });

    // 3. Save each active article's edits
    const editEntries = Object.entries(state.activeEdits);
    await Promise.all(editEntries.map(([uuid, edits]) =>
      gasApi('UPDATE_ACTIVE_DATA', { uuid, updates: edits }).catch(() => { })
    ));

    showToast('저장 완료 ✓', 'success');
  } catch (err) {
    showToast('저장 실패: ' + err.message, 'error');
  } finally {
    DOM.btnSave.disabled = false;
  }
});

/* 개별 기사 저장 버튼 */
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
    showToast('기사 저장 완료 ✓', 'success');
  } catch (err) {
    showToast('기사 저장 실패: ' + err.message, 'error');
  } finally {
    DOM.saveActiveBtn.disabled = false;
  }
});

/* AI 본문 생성 */
DOM.btnGenerate.addEventListener('click', async () => {
  if (!state.reportDate) { showToast('리포트를 먼저 로드해 주세요.', 'warning'); return; }

  const confirmed = window.confirm(
    'AI 본문 생성을 진행하시겠습니까?\n약 1~2분 소요됩니다.'
  );
  if (!confirmed) return;

  DOM.btnGenerate.disabled = true;
  DOM.generateSpinner.classList.add('visible');
  DOM.generateBtnText.textContent = 'AI 생성 중...';

  try {
    // Trigger generation
    await gasApi('RUN_DAILY_GENERATE', { targetDate: state.reportDate });
    showToast('AI 본문 생성 시작됨. 완료까지 기다립니다…', 'info', 8000);

    // Poll until Status becomes Ready
    await pollUntilReady();
  } catch (err) {
    showToast('AI 생성 실패: ' + err.message, 'error');
    DOM.btnGenerate.disabled = false;
  } finally {
    DOM.generateSpinner.classList.remove('visible');
    DOM.generateBtnText.textContent = '✨ AI 본문 생성';
  }
});

/** Poll GET_REPORT_DATA every POLL_INTERVAL_MS until Status === 'Ready' or timeout */
async function pollUntilReady() {
  const deadline = Date.now() + CONFIG.POLL_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (Date.now() > deadline) {
        reject(new Error('타임아웃: 상태가 Ready로 변경되지 않았습니다.'));
        return;
      }
      try {
        const data = await gasApi('GET_REPORT_DATA', {
          reportType: 'DAILY',
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
          showToast('AI 본문 생성 완료! 상태: Ready ✓', 'success');
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

/* 최종 발행 */
DOM.btnPublish.addEventListener('click', async () => {
  if (state.status !== 'Ready') return;

  const confirmed = window.confirm(
    '최종 발행하시겠습니까?\n발행 후에는 수정이 불가합니다.'
  );
  if (!confirmed) return;

  showLoading('발행 중...', 'DB 상태를 Published로 변경하고 있습니다.');
  try {
    await gasApi('PUBLISH_REPORT', {
      reportType: 'DAILY',
      targetDate: state.reportDate,
    });
    applyStatus('Published');
    showToast('🚀 리포트가 발행되었습니다!', 'success', 6000);
  } catch (err) {
    showToast('발행 실패: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
});

/* ─── UTILITIES ───────────────────────────────────────────────── */

/** Escape HTML special chars */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ─── PREVIEW ─────────────────────────────────────────────────── */

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
  html += `<div class="pv-date">DAILY REPORT — ${escHtml(state.reportDate)}</div>`;
  html += `<h1 class="pv-headline">${escHtml(r.Headline || '(헤드라인 없음)')}</h1>`;
  if (r.Head_Desc) html += `<p class="pv-head-desc">${escHtml(r.Head_Desc)}</p>`;
  html += `</div>`;

  // Cover image
  if (r.Img_Cover) {
    html += `<div class="pv-cover-wrap"><img src="${escHtml(r.Img_Cover)}" alt="커버 이미지" /></div>`;
  }

  // Text sections
  const sections = [
    { key: 'Why_Imp', label: '왜 중요한가 (Why It Matters)', img: 'Img_Sec1' },
    { key: 'Point_Now', label: '지금 주목할 포인트 (Point Now)', img: 'Img_Sec2' },
    { key: 'App_Review', label: '앱 리뷰 (Application Review)', img: 'Img_Sec3' },
    { key: 'App_Prep', label: '준비 사항 (Application Prep)', img: null },
    { key: 'App_Point', label: '핵심 적용 (Application Point)', img: null },
  ];

  sections.forEach(sec => {
    const text = r[sec.key];
    html += `<div class="pv-section">`;
    html += `<div class="pv-section-label">${sec.label}</div>`;
    html += `<div class="pv-section-body${!text ? ' empty' : ''}">${text ? escHtml(text) : '(아직 작성되지 않았습니다)'}</div>`;
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
    html += `<h2 class="pv-articles-title">📰 오늘의 큐레이션 기사 (${arts.length})</h2>`;
    arts.forEach((art, idx) => {
      const edits = state.activeEdits[art.uuid] || {};
      const title = edits.Subtitle || art.Subtitle || '(제목 없음)'; // Use Subtitle as the main display title
      const subtitle = art.Title_Org || art.title || ''; // Use Title_Org/title as subtitle
      const content = edits.Core_Content || art.Core_Content || '';
      const thumb = edits.Item_Thumb || art.Item_Thumb || art.thumb || '';

      const thumbHtml = thumb
        ? `<img class="pv-article-thumb" src="${escHtml(thumb)}" alt="" />`
        : `<div class="pv-article-thumb-placeholder">📄</div>`;

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

function openPreview() {
  const overlay = $('previewOverlay');
  const content = $('previewContent');
  content.innerHTML = buildPreviewHtml();
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePreview() {
  const overlay = $('previewOverlay');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

DOM.btnPreview.addEventListener('click', openPreview);
$('previewCloseBtn').addEventListener('click', closePreview);
$('previewOverlay').addEventListener('click', (e) => {
  if (e.target === $('previewOverlay')) closePreview();
});

/* ─── INIT ────────────────────────────────────────────────────── */

function init() {
  // Get date from URL or default to today (KST: UTC+9)
  const urlParams = new URLSearchParams(window.location.search);
  const queryDate = urlParams.get('date');

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
  console.log('%c[Daily Report Admin] 초기화 완료. 리포트를 로드합니다…', 'color:#7C6AF7;font-weight:bold');
  loadReport(targetDateStr);
}

init();
