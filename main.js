'use strict';

const CONFIG = {
    GAS_URL: 'https://script.google.com/macros/s/AKfycbxosmr9t7qMMFxLTDMmuZZpsbLdZtLJms536RwmY1ArmMOANP99qmZMB0PODt6UOMgi/exec',
};

const DOM = {
    dailyList: document.getElementById('dailyList'),
    weeklyList: document.getElementById('weeklyList'),
    loadingOverlay: document.getElementById('loadingOverlay'),
};

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

        renderList(DOM.dailyList, json.data.daily, 'daily.html', 'date');
        renderList(DOM.weeklyList, json.data.weekly, 'weekly.html', 'week');
    } catch (err) {
        console.error(err);
        alert('데이터를 불러오는데 실패했습니다:\n' + err.message);
    } finally {
        hideLoading();
    }
}

function renderList(container, items, linkPage, paramName) {
    if (!items || items.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding:40px 0;text-align:center;color:#666;">최근 작성된 리포트가 없습니다.</div>`;
        return;
    }

    let html = '';
    items.forEach(item => {
        const dateStr = item.date;
        const headline = item.headline || '(헤드라인 없음)';
        const status = item.status || 'Draft';

        let statusClass = 'draft';
        if (status.toLowerCase() === 'ready') statusClass = 'ready';
        if (status.toLowerCase() === 'published') statusClass = 'published';

        html += `
      <a href="${linkPage}?${paramName}=${encodeURIComponent(dateStr)}" class="report-item">
        <div class="report-info">
          <span class="report-date">${escapeHtml(dateStr)}</span>
          <span class="report-headline">${escapeHtml(headline)}</span>
        </div>
        <div class="status-badge ${statusClass}">
          <span class="status-dot"></span>
          <span>${escapeHtml(status)}</span>
        </div>
      </a>
    `;
    });

    container.innerHTML = html;
}

fetchStats();
