'use strict';

const CONFIG = {
    GAS_URL: 'https://script.google.com/macros/s/AKfycbygxB_Xd7VyET-QKtaP1PqRno7XuTkaVKFW2vmDSQ1wD3FMoA_XEmKCFMqPE3YvBSc_/exec',
};

const DOM = {
    dailyList: document.getElementById('dailyList'),
    weeklyList: document.getElementById('weeklyList'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingLabel: document.getElementById('loadingLabel'),
    searchInput: document.getElementById('searchInput'),
    btnRunCrawler: document.getElementById('btnRunCrawler'),
    btnRunDaily: document.getElementById('btnRunDaily'),
    btnRunWeekly: document.getElementById('btnRunWeekly'),
};

let dashboardData = { daily: [], weekly: [] };

function showLoading(label) {
    if (label && DOM.loadingLabel) DOM.loadingLabel.innerText = label;
    DOM.loadingOverlay.classList.add('active');
}

function hideLoading() {
    if (DOM.loadingLabel) DOM.loadingLabel.innerText = '리포트 현황을 불러오는 중...';
    DOM.loadingOverlay.classList.remove('active');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function callGAS(action, payload, loadingLabel) {
    showLoading(loadingLabel || action + ' 처리 중...');
    try {
        const res = await fetch(CONFIG.GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action, payload: payload || {} }),
            redirect: 'follow',
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Server Error');
        return json.data;
    } finally {
        hideLoading();
    }
}

function setButtonLoading(btn, isLoading, originalHtml) {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.style.opacity = isLoading ? '0.65' : '1';
    btn.style.cursor = isLoading ? 'not-allowed' : 'pointer';
    if (!isLoading && originalHtml) btn.innerHTML = originalHtml;
}

async function fetchStats() {
    try {
        const data = await callGAS('GET_DASHBOARD_STATS', {}, '리포트 현황을 불러오는 중...');
        dashboardData.daily = data.daily || [];
        dashboardData.weekly = data.weekly || [];
        renderAll();
    } catch (err) {
        console.error(err);
        alert('데이터를 불러오는데 실패했습니다:\n' + err.message);
    }
}

function renderAll(filterQuery) {
    const q = (filterQuery || '').toLowerCase();
    const filterFn = (item) => !q || (item.date && item.date.toLowerCase().includes(q));

    renderList(DOM.dailyList, dashboardData.daily.filter(filterFn), 'daily.html', 'date');
    renderList(DOM.weeklyList, dashboardData.weekly.filter(filterFn), 'weekly.html', 'week');
}

if (DOM.searchInput) {
    DOM.searchInput.addEventListener('input', function (e) {
        renderAll(e.target.value.trim());
    });
}

// 🚀 크롤러 실행
if (DOM.btnRunCrawler) {
    DOM.btnRunCrawler.addEventListener('click', async function () {
        if (!confirm('새로운 크롤링 작업을 실행하시겠습니까?\n(수집 데이터가 구글 시트에 업데이트됩니다.)')) return;

        const btn = DOM.btnRunCrawler;
        const origHtml = btn.innerHTML;
        setButtonLoading(btn, true);
        btn.innerHTML = '<span style="font-size:1.2em">⏳</span> 요청 중...';

        try {
            await callGAS('TRIGGER_CRAWLER', {}, 'GitHub 크롤러 실행 요청 중...');
            alert('크롤러 실행 요청 성공! 🚀\n잠시 후 GitHub Actions 탭에서 진행 상황을 확인하세요.');
        } catch (err) {
            console.error(err);
            alert('크롤러 실행 요청 실패:\n' + err.message);
        } finally {
            setButtonLoading(btn, false, origHtml);
        }
    });
}

// 📰 데일리 실행 (RAW 필터 배치)
if (DOM.btnRunDaily) {
    DOM.btnRunDaily.addEventListener('click', async function () {
        if (!confirm('전체 데일리 파이프라인을 실행하시겠습니까?\n필터링 → Active 인제스트 → 초안 생성 → AI 본문 생성 순서로 진행됩니다.\n(수 분 소요될 수 있습니다.)')) return;

        const btn = DOM.btnRunDaily;
        const origHtml = btn.innerHTML;
        setButtonLoading(btn, true);
        btn.innerHTML = '<span style="font-size:1.2em">⏳</span> 실행 중...';

        try {
            const data = await callGAS('RUN_AUTO_PIPELINE', {}, '데일리 파이프라인 실행 중...');
            const stage = (data && data.stage) ? data.stage : 'DONE';
            const msg = (data && data.message) ? data.message : '';
            alert('데일리 파이프라인 완료! 📰\n단계: ' + stage + (msg ? '\n' + msg : '') + '\n\n데일리 에디터에서 결과를 확인하세요.');
            await fetchStats();
        } catch (err) {
            console.error(err);
            alert('데일리 실행 실패:\n' + err.message);
        } finally {
            setButtonLoading(btn, false, origHtml);
        }
    });
}

// 📊 위클리 실행 (드래프트 + 본문 생성)
if (DOM.btnRunWeekly) {
    DOM.btnRunWeekly.addEventListener('click', async function () {
        if (!confirm('이번 주 위클리 드래프트 생성 및 AI 본문 생성을 실행하시겠습니까?\n(수 분 소요될 수 있습니다.)')) return;

        const btn = DOM.btnRunWeekly;
        const origHtml = btn.innerHTML;
        setButtonLoading(btn, true);
        btn.innerHTML = '<span style="font-size:1.2em">⏳</span> 실행 중...';

        try {
            const data = await callGAS('RUN_WEEKLY_DRAFT_AND_GENERATE', {}, '위클리 드래프트/본문 생성 중...');
            const weekStart = (data && data.week_start) ? data.week_start : '?';
            alert('위클리 파이프라인 완료! 📊\n주 시작일: ' + weekStart + '\n위클리 에디터에서 결과를 확인하세요.');
            await fetchStats();
        } catch (err) {
            console.error(err);
            alert('위클리 실행 실패:\n' + err.message);
        } finally {
            setButtonLoading(btn, false, origHtml);
        }
    });
}

function renderList(container, items, linkPage, paramName) {
    if (!items || items.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:40px 0;text-align:center;color:#666;">최근 작성된 리포트가 없습니다.</div>';
        return;
    }

    items.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

    var groups = { published: [], ready: [], draft: [] };
    items.forEach(function (item) {
        var s = (item.status || 'Draft').toLowerCase();
        if (s === 'published') groups.published.push(item);
        else if (s === 'ready') groups.ready.push(item);
        else groups.draft.push(item);
    });

    var html = '';

    function renderGroup(groupTitle, groupItems, statusClass) {
        if (groupItems.length === 0) return '';
        var g = '<div class="status-group" style="margin-bottom: 24px;">';
        g += '<h3 style="font-size: 14px; margin-bottom: 12px; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">' + groupTitle + '</h3>';
        groupItems.forEach(function (item) {
            var dateStr = item.date;
            var headline = item.headline || '(헤드라인 없음)';
            g += '<a href="' + linkPage + '?' + paramName + '=' + encodeURIComponent(dateStr) + '" class="report-item" style="margin-bottom: 8px;">' +
                '<div class="report-info">' +
                '<span class="report-date">' + escapeHtml(dateStr) + '</span>' +
                '<span class="report-headline">' + escapeHtml(headline) + '</span>' +
                '</div>' +
                '<div class="status-badge ' + statusClass + '">' +
                '<span class="status-dot"></span>' +
                '<span>' + escapeHtml(item.status || 'Draft') + '</span>' +
                '</div>' +
                '</a>';
        });
        g += '</div>';
        return g;
    }

    html += renderGroup('Draft', groups.draft.slice(0, 5), 'draft');
    html += renderGroup('Published', groups.published.slice(0, 5), 'published');
    html += renderGroup('Ready', groups.ready.slice(0, 5), 'ready');

    if (!html) {
        html = '<div class="empty-state" style="padding:40px 0;text-align:center;color:#666;">해당 리포트가 없습니다.</div>';
    }
    container.innerHTML = html;
}

fetchStats();
