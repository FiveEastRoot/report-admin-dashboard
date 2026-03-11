/**
 * K-BRAIN REPORT VIEWER SCRIPT
 * Handles data fetching and DOM manipulation for Published Reports.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

// ⚠️ 나중에 앱스 스크립트(GAS)를 새로 만들면 여기에 새 배포 URL을 넣으세요.
const API_URL = "https://script.google.com/macros/s/AKfycbygxB_Xd7VyET-QKtaP1PqRno7XuTkaVKFW2vmDSQ1wD3FMoA_XEmKCFMqPE3YvBSc_/exec";
const MOCK_MODE = false; // 실제 GAS가 완성되기 전까지 true로 두고 테스트합니다.

// ============================================================================
// UTILITIES
// ============================================================================

function getUrlParam(param) {
    if (param === 'date' && window.INJECTED_DATE) return window.INJECTED_DATE;
    if (param === 'week' && window.INJECTED_WEEK) return window.INJECTED_WEEK;

    const params = new URLSearchParams(window.location.search);
    return params.get(param);
}

function showLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.remove('hidden');
}

function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');
}

function showError(msg) {
    hideLoader();
    const content = document.getElementById('viewerContent');
    if (content) {
        content.style.display = 'block';
        content.innerHTML = `
      <div style="text-align:center; padding: 100px 20px;">
        <h2 style="color:var(--text-muted); margin-bottom:16px;">오류가 발생했습니다</h2>
        <p style="color:var(--color-primary);">${msg}</p>
        <a href="viewer_list.html" style="display:inline-block; margin-top:24px; text-decoration:underline;">목록으로 돌아가기</a>
      </div>
    `;
    }
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

// ============================================================================
// DATA FETCHING (API OR MOCK)
// ============================================================================

async function fetchReportData(action, payload) {
    if (MOCK_MODE) {
        console.log(`[MOCK MODE] Mocking API Response for action: ${action}`, payload);
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(getMockData(action, payload));
            }, 800); // 0.8초의 가짜 네트워크 지연
        });
    }

    // 실제 GAS 호출 모드
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action, payload })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Server error');
        return json.data;
    } catch (err) {
        console.error('API Fetch Error:', err);
        throw new Error('데이터를 불러오지 못했습니다. 네트워크 연결이나 주소를 확인해주세요.');
    }
}

// ============================================================================
// PAGE INITIALIZERS
// ============================================================================

/** 
 * 리스트 페이지 초기화 
 * viewer_list.html 에서 호출됨
 */
async function initViewerList() {
    try {
        const data = await fetchReportData('GET_DASHBOARD_STATS', {});

        // 이 시점에 data.daily 와 data.weekly 가 존재해야 함
        renderListCards('dailyGrid', data.daily, 'viewer_daily.html', 'date');
        renderListCards('weeklyGrid', data.weekly, 'viewer_weekly.html', 'week');

        hideLoader();
    } catch (e) {
        hideLoader();
        const errEl = document.getElementById('errorState');
        if (errEl) {
            errEl.style.display = 'block';
            errEl.innerHTML = `<p style="color:red;">${e.message}</p>`;
        }
    }
}

function renderListCards(containerId, items, linkPage, paramKey) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:var(--text-muted); padding: 40px;">발행된 리포트가 없습니다.</p>`;
        return;
    }

    // 최신 순으로 표시된다고 가정
    const html = items.filter(item => item.status === 'Published').map(item => `
    <a href="${linkPage}?${paramKey}=${item.date}" class="report-card">
      <div class="rc-date">${item.date}</div>
      <div class="rc-title">${escapeHtml(item.headline || '제목 없는 리포트')}</div>
    </a>
  `).join('');

    container.innerHTML = html;
}

/** 
 * 데일리 리포트 뷰어 초기화 
 * viewer_daily.html 에서 호출됨
 */
async function initDailyViewer() {
    let targetDate = getUrlParam('date');
    if (!targetDate) {
        if (MOCK_MODE) targetDate = '2026-03-04'; // 로컬 테스트 편의용 기본값
        else return showError('날짜 정보가 지정되지 않았습니다.');
    }

    try {
        const data = await fetchReportData('GET_REPORT_DATA', { reportType: 'DAILY', targetDate });
        renderReport(data.reportData, data.includedArticles, 'Daily');
        hideLoader();
        document.getElementById('viewerContent').style.display = 'block';
    } catch (e) {
        showError(e.message);
    }
}

/** 
 * 위클리 리포트 뷰어 초기화 
 * viewer_weekly.html 에서 호출됨
 */
async function initWeeklyViewer() {
    let targetWeek = getUrlParam('week');
    if (!targetWeek) {
        if (MOCK_MODE) targetWeek = '2026-03-02'; // 로컬 테스트 편의용 기본값
        else return showError('주차 정보가 지정되지 않았습니다.');
    }

    try {
        const data = await fetchReportData('GET_REPORT_DATA', { reportType: 'WEEKLY', targetDate: targetWeek });
        renderReport(data.reportData, data.includedArticles, 'Weekly');
        hideLoader();
        document.getElementById('viewerContent').style.display = 'block';
    } catch (e) {
        showError(e.message);
    }
}

// ============================================================================
// DOM RENDERING LOGIC
// ============================================================================

function renderReport(report, articles, type) {
    // 1. Header Setting
    const dateEl = document.getElementById('reportDate');
    if (dateEl) {
        dateEl.textContent = type === 'Daily' ? String(report.Date).substring(0, 10) : String(report.Week_Start).substring(0, 10);
    }

    safeSetText('val_Headline', report.Headline || '제목 없음');
    safeSetText('val_Head_Desc', report.Head_Desc || '');
    const headDescWrap = document.getElementById('wrap_Head_Desc');
    if (headDescWrap) {
        headDescWrap.style.display = report.Head_Desc ? 'block' : 'none';
    }

    // 2. Cover image
    safeSetImage('val_Img_Cover', 'wrap_Img_Cover', report.Img_Cover);

    // 3. Sections Content & Images
    // Daily / Weekly 모두 대응 가능하게 모든 ID를 순회
    const sections = [
        { text: 'Why_Imp', img: 'Img_Sec1' },
        { text: 'Point_Now', img: 'Img_Sec2' },
        { text: 'App_Review', img: 'Img_Sec3' },
        { text: 'App_Prep', img: null },
        { text: 'App_Point', img: null },

        // Weekly
        { text: 'Context_Chg', img: 'Img_Sec1' },
        { text: 'Point_Def', img: 'Img_Sec2' },
        { text: 'Body_Flow', img: 'Img_Body_Mid' },
        { text: 'Body_Issues', img: null },
        { text: 'Body_3Key', img: null },
        { text: 'App_Question', img: 'Img_Sec3' },
        { text: 'App_Predict', img: null },

        // Shared additional
        { text: 'Source_List', img: null },
        { text: 'Section_Note', img: null }
    ];

    sections.forEach(sec => {
        const textVal = report[sec.text];
        const secWrapper = document.getElementById(`sec_${sec.text}`);
        // Handle special cases where text wrapper isn't a sec_ but wrap_
        const altWrapper = document.getElementById(`wrap_${sec.text}`);
        const wrapperTarget = secWrapper || altWrapper;

        if (wrapperTarget) {
            if (textVal) {
                wrapperTarget.style.display = 'block';
                const contentEl = document.getElementById(`val_${sec.text}`);
                if (!contentEl) return;

                // Section_Note는 HTML 배너 삽입을 위해 innerHTML 허용
                if (sec.text === 'Section_Note') {
                    contentEl.innerHTML = textVal;
                } else if (sec.text === 'Source_List') {
                    // Source List Parsing: "Title | URL" -> <a> links
                    const lines = textVal.split('\n').filter(l => l.trim().length > 0);
                    let htmlList = '<div class="source-list-links">';
                    lines.forEach(line => {
                        const parts = line.replace(/^- /, '').split(' | ');
                        if (parts.length >= 2) {
                            const title = parts[0].trim();
                            const url = parts.slice(1).join(' | ').trim();
                            const linkClass = type === 'Weekly' ? 'source-link-item minimal' : 'source-link-item';
                            htmlList += `<a href="${url}" target="_blank" class="${linkClass}">
                                <span class="source-icon">🔗</span> 
                                <div class="source-info">
                                    <span class="source-title">${title}</span>
                                    <span class="source-url">${url}</span>
                                </div>
                            </a>`;
                        } else {
                            htmlList += `<div class="source-link-item">${line}</div>`;
                        }
                    });
                    htmlList += '</div>';
                    contentEl.innerHTML = htmlList;
                } else if (sec.text === 'Body_Flow') {
                    // Body Flow Parsing: "[제목] 내용" -> HTML 블록으로 포맷팅
                    const lines = textVal.split('\n');
                    let htmlFlow = '';
                    let currentBlock = '';
                    let inUl = false;

                    lines.forEach(line => {
                        line = line.trim();
                        if (!line) return;

                        // [블록 제목] 매칭
                        const titleMatch = line.match(/^\[(.*?)\](.*)$/);
                        if (titleMatch) {
                            // 이전 블록 닫기
                            if (inUl) { currentBlock += '</ul>'; inUl = false; }
                            if (currentBlock) { htmlFlow += `<div class="body-flow-block">${currentBlock}</div>`; }

                            // 새 블록 시작
                            currentBlock = `<h4 class="flow-block-title">${titleMatch[1]}</h4>`;
                            const trailingText = titleMatch[2].trim();
                            if (trailingText) currentBlock += `<p>${trailingText}</p>`;
                        } else if (line.startsWith('- ')) {
                            // 리스트 아이템 처리
                            if (!inUl) { currentBlock += '<ul class="flow-ul">'; inUl = true; }
                            currentBlock += `<li>${line.substring(2)}</li>`;
                        } else {
                            // 일반 텍스트
                            if (inUl) { currentBlock += '</ul>'; inUl = false; }
                            currentBlock += `<p>${line}</p>`;
                        }
                    });
                    // 마지막 블록 닫기
                    if (inUl) { currentBlock += '</ul>'; }
                    if (currentBlock) { htmlFlow += `<div class="body-flow-block">${currentBlock}</div>`; }
                    else { htmlFlow = `<p>${textVal}</p>`; } // 매칭 안될 경우 원본 대비

                    contentEl.innerHTML = htmlFlow;
                } else {
                    const lines = textVal.split('\n');
                    let htmlContent = '';
                    let inUl = false;
                    lines.forEach(line => {
                        const tLine = line.trim();
                        if (tLine.startsWith('- ')) {
                            if (!inUl) { htmlContent += '<ul class="flow-ul" style="margin-top: 4px; margin-bottom: 4px;">'; inUl = true; }
                            htmlContent += `<li>${tLine.substring(2)}</li>`;
                        } else {
                            if (inUl) { htmlContent += '</ul>'; inUl = false; }
                            if (tLine) { htmlContent += `<div>${tLine}</div>`; }
                            else { htmlContent += `<div style="height: 8px;"></div>`; }
                        }
                    });
                    if (inUl) { htmlContent += '</ul>'; }
                    contentEl.innerHTML = htmlContent;
                }
            } else {
                wrapperTarget.style.display = 'none'; // 내용이 없으면 섹션 숨김
            }
        }
    });

    // Handle standalone images
    ['Img_Sec1', 'Img_Sec2', 'Img_Sec3', 'Img_Body_Mid'].forEach(imgKey => {
        safeSetImage(`val_${imgKey}`, `wrap_${imgKey}`, report[imgKey]);
    });

    // 4. Articles Segment mapping to categories
    const artWrapper = document.getElementById('sec_Articles');
    if (articles && articles.length > 0 && artWrapper) {
        artWrapper.style.display = 'block';

        const catMapping = {
            'CAT_01': 'AI·데이터 트렌드',
            'CAT_02': 'AI·데이터 활용 사례',
            'CAT_03': 'AI 인프라·플랫폼·도구',
            'CAT_04': '정책, 제도, 거버넌스',
            'CAT_05': '교육 인재 역량 개발',
            'CAT_06': '연구 기술 동향 요약'
        };

        const tagMapping = {
            'CAT_01': ['#글로벌이슈', '#국내이슈', '#생성형AI', '#데이터행정', '#자동화확산', '#변화방향'],
            'CAT_02': ['#공공사례', '#민간사례', '#AI챔피언', '#데이터기반행정', '#시범사업', '#PoC', '#현업적용'],
            'CAT_03': ['#LLM', '#도구', '#인프라', '#플랫폼', '#업데이트', '#데이터분석', '#업무자동화', '#교육환경적용'],
            'CAT_04': ['#AI기본법', '#데이터법', '#거버넌스', '#운영기준', '#조직운영시사점'],
            'CAT_05': ['#교육트렌드', '#인재육성전략', '#AI챔피언', '#전문가양성', '#교육설계', '#업무인사이트'],
            'CAT_06': ['#최신기술흐름', '#모델업데이트', '#연구성과', '#실무번역', '#적용가능성']
        };

        // Group articles by Category_ID
        const groupedArts = {};
        articles.forEach(art => {
            const catId = art.Category_ID || 'UNCLASSIFIED';
            if (!groupedArts[catId]) groupedArts[catId] = [];
            groupedArts[catId].push(art);
        });

        // Custom sorting of category keys based on CAT_01 -> CAT_06
        const sortedCats = Object.keys(groupedArts).sort();

        let artHtml = '';

        sortedCats.forEach(catId => {
            const catName = catMapping[catId] || catId;
            const groupArticles = groupedArts[catId];

            if (groupArticles.length > 0) {
                artHtml += `
                    <div class="category-group">
                        <h3 class="category-heading ${catId.toLowerCase()}">${escapeHtml(catName)}</h3>
                        <div class="category-list">
                `;

                groupArticles.forEach(art => {
                    const isWeekly = type === 'Weekly';

                    // Unifying design: No thumbnails for both daily/weekly as per premium design
                    const thumbHtml = '';

                    let tagsList = [];
                    if (art.Detailed_Tags) {
                        tagsList = art.Detailed_Tags.split(',').map(t => t.trim());
                    } else if (tagMapping[catId]) {
                        tagsList = tagMapping[catId].slice(0, 2);
                    } else {
                        tagsList = ['#AI'];
                    }

                    const tagsHtml = tagsList.map(t => `<span class="tag ${catId.toLowerCase()}">${escapeHtml(t)}</span>`).join('');
                    const cardClass = 'premium-article-card'; // Unified class

                    // Parse Key Point as bullet list if it contains newlines or starts with '-'
                    let keyPointHtml = '';
                    const kpText = art.Key_Point || '';
                    if (kpText.includes('\n') || kpText.trim().startsWith('-')) {
                        const lines = kpText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                        keyPointHtml = '<ul class="summary-ul">';
                        lines.forEach(line => {
                            const content = line.startsWith('-') ? line.substring(1).trim() : line;
                            keyPointHtml += `<li>${escapeHtml(content)}</li>`;
                        });
                        keyPointHtml += '</ul>';
                    } else {
                        keyPointHtml = `<p class="summary-text">${escapeHtml(kpText)}</p>`;
                    }

                    artHtml += `
                        <div class="${cardClass}" onclick="window.open('${art.Link || '#'}', '_blank')">
                            ${thumbHtml}
                            <div class="card-content">
                                <div class="card-top">
                                    <div class="card-tags">
                                        ${tagsHtml}
                                    </div>
                                    <h4 class="card-title">${escapeHtml(art.Subtitle || art.Title_Org || '(제목없음)')}</h4>
                                </div>
                                
                                <div class="card-summary-v2">
                                    <div class="summary-box">
                                        <div class="box-label">내용</div>
                                        <div class="box-content">
                                            <p class="summary-text">${escapeHtml(art.Core_Content || '')}</p>
                                        </div>
                                    </div>
                                    <div class="summary-box">
                                        <div class="box-label">의의</div>
                                        <div class="box-content">
                                            ${keyPointHtml}
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="card-footer">
                                    <span class="card-source">출처: ${escapeHtml(art.Source_Name || '출처 불명')}</span>
                                    <button class="btn-read" onclick="event.stopPropagation(); window.open('${art.Link || '#'}', '_blank')">
                                        원문 이동
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                });

                artHtml += `
                        </div>
                    </div>
                `;
            }
        });

        document.getElementById('val_Articles').innerHTML = artHtml;
    }
}

// 헬퍼: 안전하게 텍스트 삽입
function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// 헬퍼: 안전하게 이미지 삽입 처리 및 래퍼 컨트롤
function safeSetImage(imgId, wrapId, url) {
    const imgEl = document.getElementById(imgId);
    const wrapEl = document.getElementById(wrapId);
    if (imgEl && wrapEl) {
        if (url) {
            wrapEl.style.display = 'block';
            imgEl.src = url;
        } else {
            wrapEl.style.display = 'none';
            imgEl.src = '';
        }
    }
}

// ============================================================================
// MOCK DATA GENERATOR (For Initial Testing Only)
// ============================================================================
function getMockData(action, payload) {
    if (action === 'GET_DASHBOARD_STATS') {
        return {
            daily: [
                { date: '2026-03-04', headline: 'AI 관련 규제 및 기술 동향 변화', status: 'Published' },
                { date: '2026-03-03', headline: 'The Rise of Open Source Models in Enterprise', status: 'Published' },
            ],
            weekly: [
                { date: '2026-03-02', headline: 'Weekly AI Recap: Major Framework Updates', status: 'Published' }
            ]
        };
    }

    if (action === 'GET_REPORT_DATA') {
        if (payload.reportType === 'DAILY') {
            return {
                reportData: {
                    Date: payload.targetDate || '2026-03-04',
                    Headline: 'AI 관련 규제 및 기술 동향 변화',
                    Head_Desc: '최근 AI 관련 규제와 기술 발전이 주목받고 있다. 공공 실무자는 AI 도구의 윤리적 사용과 보안 강화를 고려해야 한다.',
                    Img_Cover: 'https://pub-03167621cdbf4cc3bd490e069b232ca3.r2.dev/reports/1772616682750-9ddnqn.png',
                    Img_Sec1: 'https://pub-03167621cdbf4cc3bd490e069b232ca3.r2.dev/reports/1772614820039-flmt3d.png',
                    Why_Imp: '- NIST의 외국인 연구자 접근 제한 정책은 보안 리스크를 줄여 연구소의 기밀성을 강화할 수 있다.\n- AI 도구의 윤리 기준 논란은 거버넌스 체계의 신뢰성을 저하시킬 수 있으며, 향후 법적 문제를 유발할 가능성이 있다.\n- 이공계 연구생활장려금 확대는 예산 효율성을 높이고, 연구 인력의 질적 향상을 도모할 수 있다.',
                    Point_Now: '- NIST의 외국인 연구자 접근 제한 규정에 따라, 연구소의 보안 절차를 점검하고 고위험 국가 연구자의 접근 권한을 재검토해야 한다.\n- AI 도구의 윤리 기준과 관련하여, 내부 가이드라인을 검토하고 향후 정책 방향을 이해관계자와 공유할 필요가 있다.\n- 이공계 연구생활장려금 지원 사업 확대에 따른 예산 배분 계획을 수립하고, 참여 대학과의 협력 방안을 논의해야 한다.',
                    Img_Sec2: 'https://pub-03167621cdbf4cc3bd490e069b232ca3.r2.dev/reports/1772619019745-nz4ewm.jpg',
                    App_Review: '- 최근 AI 관련 법안과 정책이 강화되면서, 연구자 접근 제한 및 AI 도구의 윤리 기준 논란이 부각되고 있다. 이는 공공기관의 AI 활용 및 거버넌스에 직접적인 영향을 미칠 것으로 예상된다.\n- AI 기술의 발전과 함께, 인공지능 모델의 업데이트와 산업 밀착형 인재 양성 프로그램이 증가하고 있다. 이는 공공부문에서의 AI 활용 가능성을 높이고, 인재 육성 전략에 기여할 것이다.',
                    App_Prep: '- 주체: AI 관련 법안 검토 → 법적 준수 여부 확인 → 기한(이번주)\n- 주체: 내부 AI 윤리 기준 마련 → 가이드라인 초안 작성 → 기한(이번달)\n- 주체: AI 도구 활용 교육 프로그램 개발 → 교육 자료 및 일정 수립 → 기한(이번분기)\n- 주체: 연구자 접근 제한 정책 분석 → 영향 평가 및 대응 방안 마련 → 기한(이번주)',
                    App_Point: '- AI 도구의 윤리 기준 미비 → AI 활용 증가 시 법적 문제 발생 가능성 → 내부 검토 및 법적 자문 필요\n- 연구자 접근 제한으로 인한 인력 유출 → 특정 국가 연구자에 대한 제한 조치 시 발생 → 관련 연구자 동향 모니터링 필요\n- AI 모델의 신뢰성 문제 → AI 생성 결과의 법적 인정 여부에 따른 법적 분쟁 가능성 → AI 활용 사례 분석 및 법적 대응 준비 필요\n- 산업 밀착형 인재 양성 부족 → AI 인재 수요 증가에 따른 인력 부족 우려 → 교육 프로그램 효과성 및 참여도 모니터링 필요',
                    Img_Sec3: 'https://pub-03167621cdbf4cc3bd490e069b232ca3.r2.dev/reports/1772619046767-6a6di.jpg',
                    Section_Note: `
                        <div class="promo-banner">
                            <div class="promo-content">
                                <h3>K-BRAIN 플래티넘 멤버십 특별 혜택</h3>
                                <p>지금 가입하고 최신 산업 동향과 프리미엄 AI 리포트를 데이터 제한 없이 무제한으로 열람하세요.</p>
                            </div>
                            <a href="#" class="promo-btn" onclick="event.preventDefault(); alert('가입 페이지로 이동합니다.');">자세히 보기</a>
                        </div>
                    `
                },
                includedArticles: [
                    {
                        Category_ID: 'CAT_04',
                        Source_Name: 'NIST',
                        Title_Org: 'NIST 외국인 연구자 접근 제한 규정 업데이트',
                        Core_Content: 'NIST는 보안 강화를 위해 고위험 국가 출신 연구자에 대한 데이터 접근을 제한하는 새로운 정책을 시행합니다.',
                        Key_Point: '공공 연구기관의 보안 절차 개편 필요성을 시사하며, 협력 연구 시 데이터 권한 관리에 유의해야 합니다.',
                        Item_Thumb: 'https://picsum.photos/seed/nist/400/200',
                        Link: '#'
                    },
                    {
                        Category_ID: 'CAT_05',
                        Source_Name: '과학기술정보통신부',
                        Title_Org: '이공계 연구생활장려금 지원 확대 계획 발표',
                        Core_Content: '정부는 우수 이공계 인력 양성을 위해 연구생활장려금 예산을 크게 늘리기로 결정했습니다.',
                        Key_Point: '대학 연구 역량을 높일 수 있는 기회이며, 관련 부처의 예산 재편성 및 지원 방안 수립이 요구됩니다.',
                        Item_Thumb: 'https://picsum.photos/seed/science/400/200',
                        Link: '#'
                    },
                    {
                        Category_ID: 'CAT_01',
                        Source_Name: 'Tech News',
                        Title_Org: '오픈소스 AI 도구 윤리 기준 논란, 신뢰성 문제 제기',
                        Core_Content: '일부 오픈소스 모델이 편향적 결과를 도출함에 따라 명확한 가이드라인 시급.',
                        Key_Point: '내부 가이드라인 검토 및 윤리 기준 적용이 프로젝트 도입 전에 필수적임을 보여줍니다.',
                        Item_Thumb: 'https://picsum.photos/seed/ai-ethics/400/200',
                        Link: '#'
                    }
                ]
            };
        } else { // WEEKLY
            return {
                reportData: {
                    Week_Start: payload.targetDate || '2026-03-02',
                    Headline: '데이터법과 AI기본법 강화로 변화하는 정책',
                    Head_Desc: '이번 주 데이터법과 AI기본법 관련 정책이 강화되고 있다. 이는 공공기관의 데이터 거버넌스와 AI 기술 활용에 큰 영향을 미칠 것으로 보인다. 다음 주에는 관련 법안의 구체적인 시행 방안에 주목해야 한다.',
                    Img_Cover: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?q=80&w=800&auto=format&fit=crop',
                    Img_Sec1: 'https://picsum.photos/seed/weekly1/800/400',
                    Context_Chg: '- 이번 주 데이터법 강화 → 공공기관의 데이터 거버넌스 및 글로벌 협력 필요성이 증가하고 있다.\n- AI기본법에 따른 소프트웨어 혁신 → 공공 부문에서 AI 기술의 접근성과 효율성을 높일 수 있는 기회가 마련되었다.\n- 해외 디지털 인재 활용 전략 등장 → 공공기관의 인재 육성 전략에 새로운 방향성이 제시되었다.\n- 에너지바우처 자동화 서비스 도입 → 공공 서비스의 효율성을 높이고 에너지 취약계층에 대한 지원이 확대되었다.',
                    Point_Def: '- 데이터 상호운용성: 데이터의 원활한 이동과 활용을 위한 정책으로, 공공기관의 데이터 관리 및 서비스 개선에 필수적이다.\n- AI기본법: AI 기술의 발전과 활용을 촉진하는 법률로, 공공 부문에서의 AI 도입을 가속화할 수 있다.\n- RPA(업무 자동화 도구): 반복적인 업무를 자동화하여 효율성을 높이는 기술로, 공공기관의 민원 처리 속도를 개선할 수 있다.\n- AI Fluency: AI 기술에 대한 이해도를 높이는 교육 과정으로, 공공기관의 인재 육성 전략에 중요한 역할을 한다.',
                    Img_Sec2: 'https://picsum.photos/seed/weekly2/800/400',
                    Body_Flow: '[주간 흐름 요약]\n이번 주는 데이터 상호운용성과 AI 기술의 발전이 주요 이슈로 부각되며, 공공기관의 업무 자동화와 인재 양성 전략이 강조되고 있다. 이러한 흐름은 글로벌 데이터 정책 변화와 AI 혁신의 필요성에 의해 더욱 가속화되고 있다.\n\n[이번 주 핵심 전개]\n- 주요국들은 데이터 상호운용성 및 이동권 정책을 강화하고 있으며, 한국도 법제도 개편을 통해 데이터 주권을 강화하고 있다.\n- AI 기술은 글로벌 경제와 산업을 재편하는 핵심 요소로 자리잡고 있으며, 소프트웨어의 역할이 중요해지고 있다.\n- 국내 디지털 인재 부족 문제 해결을 위해 해외 인재 활용 전략이 필요하다는 목소리가 커지고 있다.\n- 공공기관에서는 RPA와 AI 기술을 활용한 자동화 사례가 증가하고 있으며, 이는 업무 효율성을 크게 향상시키고 있다.\n- AI 교육 체계는 산업 수요에 맞춰 재구성되고 있으며, 정부와 민간의 협력이 강조되고 있다.\n\n[공공 실무로 번역]\n- 공공기관은 데이터 거버넌스를 강화하고, 글로벌 협력에 나서야 한다. 이는 데이터 주권을 확보하는 데 필수적이다.\n- AI 기술의 발전에 따라 소프트웨어 개발 및 인력 양성에 대한 정책적 지원이 필요하다.\n- 해외 인재를 활용한 전략은 디지털 인재 부족 문제를 해결하는 데 중요한 역할을 할 수 있다.\n- RPA와 AI 기술을 통한 업무 자동화는 공공서비스의 질을 높이고, 민원 처리 시간을 단축하는 데 기여하고 있다.\n- AI 교육 체계의 재구성은 실무에 적합한 인재 양성을 위한 필수적인 과정이다.\n\n[다음 주 관찰 포인트]\n- 데이터 상호운용성 정책의 구체적인 변화와 그에 따른 공공기관의 대응 방안을 주의 깊게 살펴볼 필요가 있다.\n- AI 기술의 발전 속도와 이에 따른 정책적 지원의 변화가 어떻게 이루어질지 관찰해야 한다.\n- 해외 인재 활용 전략의 구체적인 실행 사례와 그 효과를 평가하는 것이 중요하다.\n- 공공기관의 업무 자동화 사례가 증가함에 따라, 이로 인한 서비스 개선 효과를 분석해야 한다.\n- AI 교육 체계의 변화가 실제 인재 양성에 실제 역량 향상으로 이어지는지 모니터링할 필요가 있다.',
                    Img_Body_Mid: 'https://picsum.photos/seed/weeklymid/800/400',
                    Body_Issues: '- 데이터 상호운용성 정책 강화 → 글로벌 데이터 정책 변화에 대응하지 못할 경우 → 공공 리스크(운영)\n- AI 인재 유출 문제 → 국내 인재 부족으로 인해 해외로 유출될 경우 → 공공 리스크(인재육성)\n- 오픈소스AI 활용 부족 → 기업들이 오픈소스 기술을 활용하지 않을 경우 → 공공 리스크(조달)\n- AI 교육 체계 미비 → 산업 수요에 맞지 않는 교육이 이루어질 경우 → 공공 리스크(운영)\n- 병역 민원 처리 지연 → 자동화 도구 도입이 지연될 경우 → 공공 리스크(운영)\n- 지능형 배리어프리 서비스 부족 → 문화 취약계층에 대한 서비스가 미비할 경우 → 공공 리스크(운영)\n- AI 기반 수질 예측 시스템 미비 → 기후 변화에 대응하지 못할 경우 → 공공 리스크(운영)',
                    Body_3Key: '- 핵심요점: 데이터 상호운용성 정책 강화가 필요하다. + 데이터법\n- 핵심요점: AI 인재 유출 문제를 해결해야 한다. + 인재육성전략\n- 핵심요점: 오픈소스AI 활용이 필수적이다. + 거버넌스',
                    Img_Sec3: 'https://picsum.photos/seed/weekly3/800/400',
                    App_Question: '- 매주 반복되는 질문과 토의주제? #데이터법 #거버넌스\n- AI 기술을 활용한 업무 자동화의 효과를 극대화하기 위한 전략은 무엇인가요? #업무자동화 #AI기본법\n- 해외 디지털 인재 활용을 위한 정책 방향은 어떻게 설정해야 할까요? #조직운영시사점 #AI기본법\n- 오픈소스 AI 기술을 조직 내에서 효과적으로 활용하기 위한 조건은 무엇인가요? #거버넌스 #AI기본법',
                    App_Predict: '- (AI 기술 발전) → (업무 자동화와 데이터 활용이 증가) → (조직의 혁신적 변화와 인재 육성이 필요)\n- (데이터 법제 개편) → (데이터 상호운용성 강화 및 글로벌 협력 증대) → (정책적 지원과 거버넌스 체계 구축 필요)\n- (해외 인재 유입 증가) → (국내 AI 인재 부족 문제 완화) → (인재 육성을 위한 교육 체계 개선 필요)\n- (오픈소스 AI 활용 증가) → (AI 개발 비용 절감 및 혁신 촉진) → (조직 내 오픈소스 생태계 조성 필요)',
                    Source_List: '- SPRi 연구자료 수집 | https://spri.kr/posts/view/23944\n- SPRi 연구자료 수집 | https://spri.kr/posts/view/23939\n- SPRi 연구자료 수집 | https://spri.kr/posts/view/23954\n- SPRi 연구자료 수집 | https://spri.kr/posts/view/23952\n- SPRi 연구자료 수집 | https://spri.kr/posts/view/23951\n- NIA AI 활용사례 게시판 | https://www.nia.or.kr/site/nia_kor/ex/bbs/View.do\n- GeekNews | https://news.hada.io/topic?id=27111\n- GeekNews | https://news.hada.io/topic?id=27108\n- Hacker News | https://github.com/AlexsJones/llmfit',
                    Section_Note: `
                        <div class="promo-banner">
                            <div class="promo-content">
                                <h3>K-BRAIN 플래티넘 멤버십 특별 혜택</h3>
                                <p>지금 가입하고 최신 산업 동향과 프리미엄 AI 리포트를 데이터 제한 없이 무제한으로 열람하세요.</p>
                            </div>
                            <a href="#" class="promo-btn" onclick="event.preventDefault(); alert('가입 페이지로 이동합니다.');">자세히 보기</a>
                        </div>
                    `
                },
                includedArticles: [
                    {
                        Category_ID: 'CAT_04',
                        Source_Name: 'NIST',
                        Title_Org: 'NIST 외국인 연구자 접근 제한 규정 업데이트',
                        Core_Content: 'NIST는 보안 강화를 위해 고위험 국가 출신 연구자에 대한 데이터 접근을 제한하는 새로운 정책을 시행합니다.',
                        Key_Point: '공공 연구기관의 보안 절차 개편 필요성을 시사하며, 협력 연구 시 데이터 권한 관리에 유의해야 합니다.',
                        Item_Thumb: 'https://picsum.photos/seed/nist/400/200',
                        Link: '#'
                    },
                    {
                        Category_ID: 'CAT_05',
                        Source_Name: '과학기술정보통신부',
                        Title_Org: '이공계 연구생활장려금 지원 확대 계획 발표',
                        Core_Content: '정부는 우수 이공계 인력 양성을 위해 연구생활장려금 예산을 크게 늘리기로 결정했습니다.',
                        Key_Point: '대학 연구 역량을 높일 수 있는 기회이며, 관련 부처의 예산 재편성 및 지원 방안 수립이 요구됩니다.',
                        Item_Thumb: 'https://picsum.photos/seed/science/400/200',
                        Link: '#'
                    },
                    {
                        Category_ID: 'CAT_01',
                        Source_Name: 'Tech News',
                        Title_Org: '오픈소스 AI 도구 윤리 기준 논란, 신뢰성 문제 제기',
                        Core_Content: '일부 오픈소스 모델이 편향적 결과를 도출함에 따라 명확한 가이드라인 시급.',
                        Key_Point: '내부 가이드라인 검토 및 윤리 기준 적용이 프로젝트 도입 전에 필수적임을 보여줍니다.',
                        Item_Thumb: 'https://picsum.photos/seed/ai-ethics/400/200',
                        Link: '#'
                    }
                ]
            };
        }
    }
}

// -----------------------------------------------------------------------------
// LIST PAGE LOGIC (viewer_list.html)
// -----------------------------------------------------------------------------
let listState = {
    allDaily: [],
    allWeekly: [],
    currentTab: 'daily',
    searchTerm: '',
    startDate: '',
    endDate: '',
    currentPage: 1,
    itemsPerPage: 10
};

async function initViewerList() {
    const errorEl = document.getElementById('errorState');

    try {
        if (!API_URL) {
            throw new Error("API_URL이 설정되지 않았습니다.");
        }

        // 실제 GAS 환경 API 통신
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'GET_REPORT_LIST',
                payload: {}
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || "데이터를 불러오는 데 실패했습니다.");
        }

        const data = result.data;

        if ((!data.daily || data.daily.length === 0) && (!data.weekly || data.weekly.length === 0)) {
            errorEl.style.display = 'block';
            return;
        }

        listState.allDaily = data.daily || [];
        listState.allWeekly = data.weekly || [];

        setupListEventListeners();
        renderCurrentList();

    } catch (e) {
        console.error('List fetching error:', e);
        errorEl.textContent = '리포트 목록을 불러오지 못했습니다.';
        errorEl.style.display = 'block';
    } finally {
        hideLoader();
    }
}

function setupListEventListeners() {
    document.getElementById('tabDaily').addEventListener('click', (e) => {
        document.getElementById('tabWeekly').classList.remove('active');
        e.target.classList.add('active');
        listState.currentTab = 'daily';
        listState.currentPage = 1;
        renderCurrentList();
    });

    document.getElementById('tabWeekly').addEventListener('click', (e) => {
        document.getElementById('tabDaily').classList.remove('active');
        e.target.classList.add('active');
        listState.currentTab = 'weekly';
        listState.currentPage = 1;
        renderCurrentList();
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            listState.searchTerm = e.target.value.toLowerCase().trim();
            listState.currentPage = 1;
            renderCurrentList();
        });
    }

    const startDateInput = document.getElementById('startDate');
    if (startDateInput) {
        startDateInput.addEventListener('change', (e) => {
            listState.startDate = e.target.value;
            listState.currentPage = 1;
            renderCurrentList();
        });
    }

    const endDateInput = document.getElementById('endDate');
    if (endDateInput) {
        endDateInput.addEventListener('change', (e) => {
            listState.endDate = e.target.value;
            listState.currentPage = 1;
            renderCurrentList();
        });
    }
}

function renderCurrentList() {
    const dailyGrid = document.getElementById('dailyGrid');
    const weeklyGrid = document.getElementById('weeklyGrid');
    const dailyPagination = document.getElementById('dailyPagination');
    const weeklyPagination = document.getElementById('weeklyPagination');

    if (listState.currentTab === 'daily') {
        dailyGrid.style.display = 'grid';
        dailyPagination.style.display = 'flex';
        weeklyGrid.style.display = 'none';
        weeklyPagination.style.display = 'none';
    } else {
        weeklyGrid.style.display = 'grid';
        weeklyPagination.style.display = 'flex';
        dailyGrid.style.display = 'none';
        dailyPagination.style.display = 'none';
    }

    const currentDataSet = listState.currentTab === 'daily' ? listState.allDaily : listState.allWeekly;

    // 1. Search Filtering
    const filteredData = currentDataSet.filter(item => {
        const itemDate = listState.currentTab === 'daily' ? item.date : item.week;

        // Date Filtering
        if (listState.startDate && itemDate < listState.startDate) return false;
        if (listState.endDate && itemDate > listState.endDate) return false;

        // Text Filtering
        if (listState.searchTerm) {
            if (!item.title.toLowerCase().includes(listState.searchTerm)) return false;
        }

        return true;
    });

    if (filteredData.length === 0) {
        if (listState.currentTab === 'daily') {
            dailyGrid.innerHTML = '<p style="text-align:center; grid-column: 1/-1; color: var(--text-muted); padding: 40px 0;">검색 결과가 없습니다.</p>';
            dailyPagination.innerHTML = '';
        } else {
            weeklyGrid.innerHTML = '<p style="text-align:center; grid-column: 1/-1; color: var(--text-muted); padding: 40px 0;">검색 결과가 없습니다.</p>';
            weeklyPagination.innerHTML = '';
        }
        return;
    }

    // 2. Pagination
    const totalPages = Math.ceil(filteredData.length / listState.itemsPerPage);
    const startIndex = (listState.currentPage - 1) * listState.itemsPerPage;
    const paginatedData = filteredData.slice(startIndex, startIndex + listState.itemsPerPage);

    // 3. Render Items
    let htmlCards = '';
    paginatedData.forEach(item => {
        if (listState.currentTab === 'daily') {
            htmlCards += `
                <a href="./viewer_daily.html?date=${String(item.date).substring(0, 10).trim()}" class="report-card">
                    <div class="rc-date">Daily | ${String(item.date).substring(0, 10)}</div>
                    <div class="rc-title">${escapeHtml(item.title)}</div>
                </a>
            `;
        } else {
            htmlCards += `
                <a href="./viewer_weekly.html?week=${String(item.week).substring(0, 10).trim()}" class="report-card">
                    <div class="rc-date">Weekly | ${String(item.week).substring(0, 10)}</div>
                    <div class="rc-title">${escapeHtml(item.title)}</div>
                </a>
            `;
        }
    });

    if (listState.currentTab === 'daily') {
        dailyGrid.innerHTML = htmlCards;
    } else {
        weeklyGrid.innerHTML = htmlCards;
    }

    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    const targetPagination = listState.currentTab === 'daily'
        ? document.getElementById('dailyPagination')
        : document.getElementById('weeklyPagination');

    if (totalPages <= 1) {
        targetPagination.innerHTML = '';
        return;
    }

    let pageHtml = '';
    for (let i = 1; i <= totalPages; i++) {
        const activeClass = i === listState.currentPage ? 'active' : '';
        pageHtml += `<button class="page-btn ${activeClass}" onclick="changePage(${i})">${i}</button>`;
    }

    targetPagination.innerHTML = pageHtml;
}

// Global scope for onclick event in HTML
window.changePage = function (pageNum) {
    listState.currentPage = pageNum;
    renderCurrentList();
    // 부드럽게 목록 상단으로 스크롤 이동
    window.scrollTo({ top: 0, behavior: 'smooth' });
};
