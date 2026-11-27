(function () {
    'use strict';

    const R = window.ClothoidRender;

    let currentView = 'home';
    let chartsInitialized = false;
    let roleRadarChart = null;
    let penaltyBarChart = null;
    let challengeState = null;
    let currentRoleId = 'perception';

    async function fetchJson(path) {
        const res = await fetch(path, { cache: 'no-cache' });
        if (!res.ok) {
            throw new Error(`${path} 로드 실패 (HTTP ${res.status})`);
        }
        return res.json();
    }

    let activeCompMode = 'all';
    let activeCompYear = 'all';

    function populateHome(reposData, competitionsData, projectsData) {
        const repoGrid = document.getElementById('repo-grid');
        if (repoGrid && reposData && Array.isArray(reposData.repositories)) {
            repoGrid.innerHTML = reposData.repositories.map(R.renderRepositoryCard).join('');
        }

        const allComps = (competitionsData && Array.isArray(competitionsData.competitions))
            ? competitionsData.competitions
            : [];
        const pinnedComps = allComps.filter(c => Boolean(c.pinnedOnHome));

        const countBadge = document.getElementById('home-comp-count-badge');
        if (countBadge) {
            countBadge.textContent = `총 ${allComps.length}건`;
        }

        const homePinnedGrid = document.getElementById('home-pinned-competitions');
        if (homePinnedGrid) {
            if (pinnedComps.length > 0) {
                homePinnedGrid.innerHTML = pinnedComps.map(c => R.renderCompetitionCard(c)).join('');
            } else {
                homePinnedGrid.innerHTML = `
                    <div class="md:col-span-2 bg-stone-100/70 border border-stone-200 rounded-2xl p-8 text-center text-stone-500 text-sm">
                        메인 화면에 고정된 대표 실적이 없습니다. 우측 상단 버튼을 눌러 전체 대회 및 수상 기록을 확인해 보세요!
                    </div>
                `;
            }
        }

        populateCompetitionsPage(competitionsData);

        const projectsGrid = document.getElementById('projects-grid');
        if (projectsGrid && projectsData && Array.isArray(projectsData.projects)) {
            projectsGrid.innerHTML = projectsData.projects.map(R.renderProjectCard).join('');
        }
    }

    function populateCompetitionsPage(competitionsData) {
        if (!competitionsData) return;
        const allComps = Array.isArray(competitionsData.competitions) ? competitionsData.competitions : [];

        const compSchedBox = document.getElementById('competition-schedule-box');
        const compSchedList = document.getElementById('competition-schedule-list');
        if (compSchedBox && compSchedList && Array.isArray(competitionsData.schedule) && competitionsData.schedule.length > 0) {
            compSchedList.innerHTML = competitionsData.schedule.map(R.renderCompetitionScheduleItem).join('');
            compSchedBox.classList.remove('hidden');
        } else if (compSchedBox) {
            compSchedBox.classList.add('hidden');
        }

        const yearContainer = document.getElementById('competition-year-filters');
        if (yearContainer) {
            const years = Array.from(new Set(
                allComps.map(c => String(c.year || '').trim()).filter(Boolean)
            )).sort((a, b) => b.localeCompare(a, 'ko', { numeric: true }));

            if (years.length > 0) {
                const allBtn = `<button onclick="filterCompetitionsByYear('all')" data-comp-year-btn="all" class="px-3.5 py-1.5 rounded-full text-xs font-bold bg-stone-800 text-white transition-all">전체 연도</button>`;
                const yearBtns = years.map(y => `<button onclick="filterCompetitionsByYear('${R.escapeHtml(y)}')" data-comp-year-btn="${R.escapeHtml(y)}" class="px-3.5 py-1.5 rounded-full text-xs font-bold bg-stone-100 text-stone-600 hover:bg-stone-200 transition-all">${R.escapeHtml(y)}년</button>`);
                yearContainer.innerHTML = [allBtn, ...yearBtns].join('');
            }
        }

        const compGrid = document.getElementById('competitions-grid');
        if (compGrid) {
            compGrid.innerHTML = allComps.map(c => R.renderCompetitionCard(c)).join('');
        }
    }

    function applyCompetitionFilters() {
        document.querySelectorAll('#competitions-grid .competition-card').forEach(card => {
            const hasAward = card.getAttribute('data-has-award') === 'true';
            const isPinned = card.getAttribute('data-pinned') === 'true';
            const year = card.getAttribute('data-year') || '';

            let modeOk = true;
            if (activeCompMode === 'awarded') modeOk = hasAward;
            else if (activeCompMode === 'pinned') modeOk = isPinned;

            const yearOk = activeCompYear === 'all' || year === activeCompYear;

            if (modeOk && yearOk) {
                card.classList.remove('hidden-filter');
            } else {
                card.classList.add('hidden-filter');
            }
        });
    }

    window.filterCompetitions = function (mode) {
        activeCompMode = mode;
        const ids = ['all', 'awarded', 'pinned'];
        const activeCls = 'px-5 py-2.5 rounded-full text-sm font-bold bg-rose-800 text-white shadow-sm transition-all';
        const inactiveCls = 'px-5 py-2.5 rounded-full text-sm font-bold bg-white text-stone-600 border border-stone-200 hover:bg-stone-100 transition-all';
        ids.forEach(id => {
            const btn = document.getElementById(`comp-filter-${id}`);
            if (btn) btn.className = id === mode ? activeCls : inactiveCls;
        });
        applyCompetitionFilters();
    };

    window.filterCompetitionsByYear = function (year) {
        activeCompYear = year;
        document.querySelectorAll('#competition-year-filters button').forEach(btn => {
            const val = btn.getAttribute('data-comp-year-btn');
            btn.className = val === year
                ? 'px-3.5 py-1.5 rounded-full text-xs font-bold bg-stone-800 text-white transition-all'
                : 'px-3.5 py-1.5 rounded-full text-xs font-bold bg-stone-100 text-stone-600 hover:bg-stone-200 transition-all';
        });
        applyCompetitionFilters();
    };

    let activeMemberDivision = 'all';
    let activeMemberCohort = 'all';

    function populateMembers(membersData) {
        if (!membersData) return;

        const filtersContainer = document.getElementById('member-filters');
        if (filtersContainer && Array.isArray(membersData.filters)) {
            filtersContainer.innerHTML = membersData.filters.map((f, idx) => {
                const isFirst = idx === 0;
                const cls = isFirst
                    ? 'px-5 py-2.5 rounded-full text-sm font-bold bg-rose-800 text-white transition-all shadow-sm'
                    : 'px-5 py-2.5 rounded-full text-sm font-bold bg-white text-stone-600 border border-stone-200 hover:bg-stone-100 transition-all';
                return `<button onclick="filterMembers('${R.escapeHtml(f.id)}')" id="filter-btn-${R.escapeHtml(f.id)}" class="${cls}">${R.escapeHtml(f.label)}</button>`;
            }).join('');
        }

        const cohortContainer = document.getElementById('member-cohort-filters');
        if (cohortContainer && Array.isArray(membersData.members)) {
            const cohorts = Array.from(new Set(
                membersData.members
                    .map(m => R.formatCohort(m.cohort))
                    .filter(Boolean)
            )).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));

            if (cohorts.length > 0) {
                const allBtn = `<button onclick="filterMembersByCohort('all')" data-cohort-btn="all" class="px-3.5 py-1.5 rounded-full text-xs font-bold bg-stone-800 text-white transition-all">전체 기수</button>`;
                const btns = cohorts.map(c => `<button onclick="filterMembersByCohort('${R.escapeHtml(c)}')" data-cohort-btn="${R.escapeHtml(c)}" class="px-3.5 py-1.5 rounded-full text-xs font-bold bg-stone-100 text-stone-600 hover:bg-stone-200 transition-all">${R.escapeHtml(c)}</button>`);
                cohortContainer.innerHTML = [allBtn, ...btns].join('');
            }
        }

        const memberGrid = document.getElementById('member-grid');
        if (memberGrid && Array.isArray(membersData.members)) {
            memberGrid.innerHTML = membersData.members.map(R.renderMemberCard).join('');
        }
    }

    function populateChallenge(challengeData) {
        if (!challengeData) return;
        challengeState = challengeData;

        if (challengeData.overview) {
            const titleEl = document.getElementById('overview-title');
            const descEl = document.getElementById('overview-description');
            const missionGrid = document.getElementById('mission-grid');
            if (titleEl) titleEl.textContent = challengeData.overview.title || '';
            if (descEl) descEl.textContent = challengeData.overview.description || '';
            if (missionGrid && Array.isArray(challengeData.overview.missions)) {
                missionGrid.innerHTML = challengeData.overview.missions.map(R.renderMissionCard).join('');
            }
        }

        if (challengeData.roles && Array.isArray(challengeData.roles.items) && challengeData.roles.items.length > 0) {
            const roleButtons = document.getElementById('role-buttons');
            currentRoleId = challengeData.roles.items[0].id;
            if (roleButtons) {
                roleButtons.innerHTML = challengeData.roles.items.map((role, idx) => {
                    const activeCls = idx === 0
                        ? 'nav-button active px-6 py-3 rounded-lg font-bold border-2 border-rose-800 text-rose-800 hover:bg-rose-50 transition-colors'
                        : 'nav-button px-6 py-3 rounded-lg font-bold border-2 border-stone-300 text-stone-600 hover:bg-stone-50 transition-colors';
                    return `<button id="role-btn-${R.escapeHtml(role.id)}" onclick="updateRoleView('${R.escapeHtml(role.id)}')" class="${activeCls}">${R.escapeHtml(role.buttonLabel)}</button>`;
                }).join('');
            }
            renderRoleDetail(currentRoleId);
        }

        if (challengeData.rules) {
            const rulesList = document.getElementById('rules-list');
            if (rulesList && Array.isArray(challengeData.rules.items)) {
                rulesList.innerHTML = challengeData.rules.items.map(R.renderRuleItem).join('');
            }
            const captionEl = document.getElementById('penalty-caption');
            if (captionEl && challengeData.rules.penaltyChart) {
                captionEl.textContent = challengeData.rules.penaltyChart.caption || '';
            }
        }

        if (challengeData.infra) {
            const platformEl = document.getElementById('infra-platform');
            if (platformEl && challengeData.infra.platform) {
                platformEl.innerHTML = R.renderPlatformBanner(challengeData.infra.platform);
            }
            const sensorGrid = document.getElementById('sensor-grid');
            if (sensorGrid && Array.isArray(challengeData.infra.sensors)) {
                sensorGrid.innerHTML = challengeData.infra.sensors.map(R.renderSensorCard).join('');
            }
        }

        if (Array.isArray(challengeData.schedule)) {
            const timelineEl = document.getElementById('timeline-list');
            if (timelineEl) {
                timelineEl.innerHTML = challengeData.schedule.map(R.renderTimelineItem).join('');
            }
        }
    }

    function renderRoleDetail(roleId) {
        if (!challengeState || !challengeState.roles || !Array.isArray(challengeState.roles.items)) return;
        const role = challengeState.roles.items.find(r => r.id === roleId) || challengeState.roles.items[0];
        if (!role) return;

        currentRoleId = role.id;

        const buttons = document.querySelectorAll('#role-buttons button');
        buttons.forEach(btn => {
            btn.className = 'nav-button px-6 py-3 rounded-lg font-bold border-2 border-stone-300 text-stone-600 hover:bg-stone-50 transition-colors';
        });
        const activeBtn = document.getElementById(`role-btn-${role.id}`);
        if (activeBtn) {
            activeBtn.className = 'nav-button active px-6 py-3 rounded-lg font-bold border-2 border-rose-800 text-rose-800 hover:bg-rose-50 transition-colors';
        }

        const titleEl = document.getElementById('role-title');
        if (titleEl) titleEl.textContent = role.title || '';

        const listEl = document.getElementById('role-list');
        if (listEl && Array.isArray(role.tasks)) {
            listEl.innerHTML = role.tasks.map(t => {
                if (typeof t === 'string') {
                    return `<li>${R.escapeHtml(t)}</li>`;
                }
                const labelPart = t.label ? `<strong>${R.escapeHtml(t.label)}:</strong> ` : '';
                return `<li>${labelPart}${R.escapeHtml(t.detail || '')}</li>`;
            }).join('');
        }

        if (chartsInitialized && roleRadarChart && Array.isArray(role.scores)) {
            roleRadarChart.data.datasets[0].data = role.scores;
            roleRadarChart.update();
        }
    }

    window.updateRoleView = function (roleId) {
        renderRoleDetail(roleId);
    };

    window.toggleMobileMenu = function () {
        const drawer = document.getElementById('mobile-nav-drawer');
        const btn = document.getElementById('mobile-menu-btn');
        const icon = document.getElementById('mobile-menu-icon');
        if (!drawer) return;
        const willOpen = drawer.classList.contains('hidden');
        drawer.classList.toggle('hidden', !willOpen);
        if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        if (icon) icon.textContent = willOpen ? '✕' : '☰';
    };

    window.closeMobileMenu = function () {
        const drawer = document.getElementById('mobile-nav-drawer');
        const btn = document.getElementById('mobile-menu-btn');
        const icon = document.getElementById('mobile-menu-icon');
        if (drawer) drawer.classList.add('hidden');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        if (icon) icon.textContent = '☰';
    };

    window.switchView = function (viewName) {
        currentView = viewName;

        const viewHome = document.getElementById('view-home');
        const viewCompetitions = document.getElementById('view-competitions');
        const viewCalendar = document.getElementById('view-calendar');
        const viewMembers = document.getElementById('view-members');
        const viewProject = document.getElementById('view-project');

        if (viewHome) viewHome.classList.add('hidden');
        if (viewCompetitions) viewCompetitions.classList.add('hidden');
        if (viewCalendar) viewCalendar.classList.add('hidden');
        if (viewMembers) viewMembers.classList.add('hidden');
        if (viewProject) viewProject.classList.add('hidden');

        if (viewName === 'home' && viewHome) {
            viewHome.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (viewName === 'competitions' && viewCompetitions) {
            viewCompetitions.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (viewName === 'calendar' && viewCalendar) {
            viewCalendar.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (viewName === 'members' && viewMembers) {
            viewMembers.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (viewName === 'project' && viewProject) {
            viewProject.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });

            if (!chartsInitialized) {
                setTimeout(initCharts, 50);
            }
        }
    };

    window.scrollToSection = function (sectionId) {
        if (currentView !== 'home') {
            window.switchView('home');
            setTimeout(() => {
                const element = document.getElementById(sectionId);
                if (element) element.scrollIntoView({ behavior: 'smooth' });
            }, 150);
        } else {
            const element = document.getElementById(sectionId);
            if (element) element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    function applyMemberFilters() {
        const cards = document.querySelectorAll('#member-grid .member-card');
        cards.forEach(card => {
            const divisions = (card.getAttribute('data-divisions') || '').split(/\s+/);
            const cohort = card.getAttribute('data-cohort') || '';
            const divOk = divisions.includes(activeMemberDivision);
            const cohortOk = activeMemberCohort === 'all' || cohort === activeMemberCohort;
            if (divOk && cohortOk) {
                card.classList.remove('hidden-filter');
            } else {
                card.classList.add('hidden-filter');
            }
        });
    }

    window.filterMembers = function (division) {
        activeMemberDivision = division;
        const filterButtons = document.querySelectorAll('#member-filters button');
        filterButtons.forEach(btn => {
            btn.className = 'px-5 py-2.5 rounded-full text-sm font-bold bg-white text-stone-600 border border-stone-200 hover:bg-stone-100 transition-all';
        });

        const activeBtn = document.getElementById(`filter-btn-${division}`);
        if (activeBtn) {
            activeBtn.className = 'px-5 py-2.5 rounded-full text-sm font-bold bg-rose-800 text-white transition-all shadow-sm';
        }
        applyMemberFilters();
    };

    window.filterMembersByCohort = function (cohort) {
        activeMemberCohort = cohort;
        document.querySelectorAll('#member-cohort-filters button').forEach(btn => {
            const val = btn.getAttribute('data-cohort-btn');
            btn.className = val === cohort
                ? 'px-3.5 py-1.5 rounded-full text-xs font-bold bg-stone-800 text-white transition-all'
                : 'px-3.5 py-1.5 rounded-full text-xs font-bold bg-stone-100 text-stone-600 hover:bg-stone-200 transition-all';
        });
        applyMemberFilters();
    };

    function initCharts() {
        if (chartsInitialized || !challengeState) return;

        const radarCanvas = document.getElementById('roleChart');
        const barCanvas = document.getElementById('penaltyChart');
        if (!radarCanvas || !barCanvas) return;

        const rolesCfg = challengeState.roles || {};
        const activeRole = (rolesCfg.items || []).find(r => r.id === currentRoleId) || (rolesCfg.items || [])[0] || {};
        const radarLabels = rolesCfg.chartLabels || ['센서/비전', '알고리즘', '동역학/수학', 'ROS 2 활용', 'C++/Python'];
        const radarScores = activeRole.scores || [80, 80, 80, 80, 80];

        roleRadarChart = new Chart(radarCanvas.getContext('2d'), {
            type: 'radar',
            data: {
                labels: radarLabels,
                datasets: [{
                    label: '요구 역량 비중',
                    data: radarScores,
                    backgroundColor: 'rgba(159, 18, 57, 0.2)',
                    borderColor: 'rgba(159, 18, 57, 1)',
                    pointBackgroundColor: 'rgba(159, 18, 57, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(0, 0, 0, 0.1)' },
                        grid: { color: 'rgba(0, 0, 0, 0.1)' },
                        pointLabels: { font: { size: 12, family: "'Noto Sans KR', sans-serif" }, color: '#444' },
                        ticks: { display: false, min: 0, max: 100 }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });

        const pChart = (challengeState.rules && challengeState.rules.penaltyChart) || {};
        penaltyBarChart = new Chart(barCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: pChart.labels || ['완벽 주행', '콘 1회 충돌', '콘 충돌 + 코스 이탈'],
                datasets: [
                    {
                        label: '순수 랩타임',
                        data: pChart.baseLaptime || [60, 60, 60],
                        backgroundColor: '#9f1239'
                    },
                    {
                        label: '콘 충돌 페널티',
                        data: pChart.conePenalty || [0, 5, 5],
                        backgroundColor: '#f59e0b'
                    },
                    {
                        label: '코스 이탈 페널티',
                        data: pChart.offTrackPenalty || [0, 0, 15],
                        backgroundColor: '#ef4444'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: { stacked: true, title: { display: true, text: '총 소요 시간 (초)' } },
                    y: { stacked: true }
                },
                plugins: {
                    tooltip: { mode: 'index', intersect: false },
                    legend: { position: 'bottom' }
                }
            }
        });

        chartsInitialized = true;
    }

    function showDataLoadNotice(err) {
        console.error('데이터 로드 오류:', err);
        const banner = document.getElementById('data-error-banner');
        if (!banner) return;
        const isFileProtocol = window.location.protocol === 'file:';
        banner.innerHTML = isFileProtocol
            ? `<strong>로컬 파일(file://) 직접 열기 감지:</strong> 브라우저 보안 정책으로 인해 <code>data/*.json</code> 파일을 불러오려면 로컬 웹 서버(예: <code>python -m http.server 8080</code> 또는 VS Code Live Server)나 GitHub Pages 주소로 접속해 주세요.`
            : `<strong>데이터를 불러오지 못했습니다:</strong> ${R.escapeHtml(err.message || String(err))}`;
        banner.classList.remove('hidden');
    }

    async function initApp() {
        try {
            const [membersData, reposData, competitionsData, calendarData, projectsData, challengeData] = await Promise.all([
                fetchJson('data/members.json'),
                fetchJson('data/repositories.json'),
                fetchJson('data/competitions.json'),
                fetchJson('data/calendar.json'),
                fetchJson('data/projects.json'),
                fetchJson('data/challenge.json')
            ]);

            populateHome(reposData, competitionsData, projectsData);
            populateMembers(membersData);
            populateChallenge(challengeData);
            if (window.ClothoidCalendar) {
                window.ClothoidCalendar.initCalendarView(calendarData, competitionsData);
            }

            const hash = window.location.hash.replace('#', '');
            if (hash === 'competitions' || hash === 'calendar' || hash === 'members' || hash === 'project') {
                window.switchView(hash);
            }
        } catch (err) {
            showDataLoadNotice(err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
})();
