'use strict';

const CONFIG = {
    GAS_URL: 'https://script.google.com/macros/s/AKfycbygxB_Xd7VyET-QKtaP1PqRno7XuTkaVKFW2vmDSQ1wD3FMoA_XEmKCFMqPE3YvBSc_/exec',
};

const DOM = {
    dailyList: document.getElementById('dailyList'),
    weeklyList: document.getElementById('weeklyList'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    searchInput: document.getElementById('searchInput'),
};

let dashboardData = { daily: [], weekly: [] };

function showLoading() {
    DOM.loadingOverlay.classList.add('active');
}

function hideLoading() {
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

async function fetchStats() {
    showLoading();
    try {
        const res = await fetch(CONFIG.GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'GET_DASHBOARD_STATS', payload: {} }),
            redirect: 'follow',
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Server Error');

        dashboardData.daily = json.data.daily || [];
        dashboardData.weekly = json.data.weekly || [];
        renderAll();
    } catch (err) {
        console.error(err);
        alert('데이터를 불러오는데 실패했습니다:\n' + err.message);
    } finally {
        hideLoading();
    }
}

function renderAll(filterQuery = '') {
    const q = filterQuery.toLowerCase();
    const filterFn = (item) => !q || (item.date && item.date.toLowerCase().includes(q));

    renderList(DOM.dailyList, dashboardData.daily.filter(filterFn), 'daily.html', 'date');
    renderList(DOM.weeklyList, dashboardData.weekly.filter(filterFn), 'weekly.html', 'week');
}

if (DOM.searchInput) {
    DOM.searchInput.addEventListener('input', (e) => {
        renderAll(e.target.value.trim());
    });
}

function renderList(container, items, linkPage, paramName) {
    if (!items || items.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding:40px 0;text-align:center;color:#666;">최근 작성된 리포트가 없습니다.</div>`;
        return;
    }

    // Sort items by date descending
    items.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Group by status
    const groups = {
        published: [],
        ready: [],
        draft: []
    };

    items.forEach(item => {
        const s = (item.status || 'Draft').toLowerCase();
        if (s === 'published') groups.published.push(item);
        else if (s === 'ready') groups.ready.push(item);
        else groups.draft.push(item);
    });

    let html = '';

    const renderGroup = (groupTitle, groupItems, statusClass) => {
        if (groupItems.length === 0) return '';
        let groupHtml = `<div class="status-group" style="margin-bottom: 24px;">`;
        groupHtml += `<h3 style="font-size: 14px; margin-bottom: 12px; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">${groupTitle}</h3>`;
        groupItems.forEach(item => {
            const dateStr = item.date;
            const headline = item.headline || '(헤드라인 없음)';

            groupHtml += `
              <a href="${linkPage}?${paramName}=${encodeURIComponent(dateStr)}" class="report-item" style="margin-bottom: 8px;">
                <div class="report-info">
                  <span class="report-date">${escapeHtml(dateStr)}</span>
                  <span class="report-headline">${escapeHtml(headline)}</span>
                </div>
                <div class="status-badge ${statusClass}">
                  <span class="status-dot"></span>
                  <span>${escapeHtml(item.status || 'Draft')}</span>
                </div>
              </a>
            `;
        });
        groupHtml += `</div>`;
        return groupHtml;
    };

    html += renderGroup('Draft', groups.draft.slice(0, 5), 'draft');
    html += renderGroup('Published', groups.published.slice(0, 5), 'published');
    html += renderGroup('Ready', groups.ready.slice(0, 5), 'ready');

    if (!html) {
        html = `<div class="empty-state" style="padding:40px 0;text-align:center;color:#666;">해당 리포트가 없습니다.</div>`;
    }
    container.innerHTML = html;
}

fetchStats();
