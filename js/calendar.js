(function (global) {
    'use strict';

    const R = global.ClothoidRender;

    const CALENDAR_CATEGORIES = {
        competition: {
            label: '🏆 대회 일정',
            shortLabel: '대회',
            pillCls: 'bg-rose-100 text-rose-900 border-rose-300',
            dotCls: 'bg-rose-600',
            badgeCls: 'bg-rose-100 text-rose-900'
        },
        seminar: {
            label: '📚 세미나 / 스터디',
            shortLabel: '세미나',
            pillCls: 'bg-blue-100 text-blue-900 border-blue-300',
            dotCls: 'bg-blue-600',
            badgeCls: 'bg-blue-100 text-blue-800'
        },
        meeting: {
            label: '👥 정기모임 / 회의',
            shortLabel: '모임',
            pillCls: 'bg-amber-100 text-amber-900 border-amber-300',
            dotCls: 'bg-amber-500',
            badgeCls: 'bg-amber-100 text-amber-800'
        },
        club: {
            label: '🎉 주요행사 / 모집',
            shortLabel: '행사',
            pillCls: 'bg-emerald-100 text-emerald-900 border-emerald-300',
            dotCls: 'bg-emerald-600',
            badgeCls: 'bg-emerald-100 text-emerald-800'
        }
    };

    const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

    const state = {
        year: new Date().getFullYear(),
        month: new Date().getMonth(), // 0-11
        selectedDate: formatYmd(new Date()),
        categoryFilter: 'all',
        allEvents: []
    };

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function formatYmd(d) {
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }

    function parseYmd(str) {
        if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(String(str).trim())) return null;
        const [y, m, d] = String(str).trim().split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    function getCategoryInfo(catKey) {
        return CALENDAR_CATEGORIES[catKey] || CALENDAR_CATEGORIES.club;
    }

    function renderEventDetailCard(ev) {
        const cat = getCategoryInfo(ev.category);
        const start = parseYmd(ev.date);
        const end = parseYmd(ev.endDate);
        let dateText = ev.date || '일정 미정';
        if (start) {
            const dow = WEEKDAYS[start.getDay()];
            dateText = `${start.getFullYear()}.${pad2(start.getMonth() + 1)}.${pad2(start.getDate())} (${dow})`;
            if (end && end.getTime() > start.getTime()) {
                const endDow = WEEKDAYS[end.getDay()];
                dateText += ` ~ ${pad2(end.getMonth() + 1)}.${pad2(end.getDate())} (${endDow})`;
            }
        }

        return `
            <div class="bg-white rounded-xl p-4 border border-stone-200 shadow-sm space-y-2">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-[11px] font-black px-2.5 py-0.5 rounded ${cat.badgeCls}">${R.escapeHtml(cat.label)}</span>
                    ${ev.time ? `<span class="text-xs font-mono text-stone-500">🕒 ${R.escapeHtml(ev.time)}</span>` : ''}
                </div>
                <h4 class="font-black text-sm md:text-base text-stone-900 leading-snug">${R.escapeHtml(ev.title || '')}</h4>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                    <span class="font-mono text-rose-800 font-bold">📅 ${R.escapeHtml(dateText)}</span>
                    ${ev.location ? `<span>📍 ${R.escapeHtml(ev.location)}</span>` : ''}
                </div>
                ${ev.description ? `<p class="text-xs text-stone-600 leading-relaxed pt-1 border-t border-stone-100">${R.escapeHtml(ev.description)}</p>` : ''}
            </div>
        `;
    }

    function mergeAllEvents(calendarData, competitionsData) {
        const clubEvents = (calendarData && Array.isArray(calendarData.events) ? calendarData.events : []).map(ev => ({
            ...ev,
            category: ev.category || 'club',
            source: 'calendar'
        }));

        const compSchedules = (competitionsData && Array.isArray(competitionsData.schedule) ? competitionsData.schedule : [])
            .filter(s => s && s.date && /^\d{4}-\d{2}-\d{2}$/.test(String(s.date).trim()))
            .map(s => ({
                id: `comp-${s.id || s.title}`,
                category: 'competition',
                date: String(s.date).trim(),
                endDate: s.endDate ? String(s.endDate).trim() : '',
                time: s.status || '',
                title: s.title || '',
                location: s.location || '',
                description: s.competitionName ? `${s.competitionName} 공식 일정` : '',
                source: 'competitions'
            }));

        return [...clubEvents, ...compSchedules].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    }

    function eventOccursOnYmd(ev, ymd) {
        const target = parseYmd(ymd);
        const start = parseYmd(ev.date);
        if (!target || !start) return false;
        const end = parseYmd(ev.endDate) || start;
        return target.getTime() >= start.getTime() && target.getTime() <= end.getTime();
    }

    function eventOccursInMonth(ev, year, month) {
        const start = parseYmd(ev.date);
        if (!start) return false;
        const end = parseYmd(ev.endDate) || start;
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        return start.getTime() <= monthEnd.getTime() && end.getTime() >= monthStart.getTime();
    }

    function getFilteredEvents() {
        if (state.categoryFilter === 'all') return state.allEvents;
        return state.allEvents.filter(ev => ev.category === state.categoryFilter);
    }

    function initCalendarView(calendarData, competitionsData) {
        state.allEvents = mergeAllEvents(calendarData, competitionsData);
        const now = new Date();
        state.year = now.getFullYear();
        state.month = now.getMonth();
        state.selectedDate = formatYmd(now);
        renderCalendarUI();
    }

    function renderCalendarUI() {
        const filterBar = document.getElementById('calendar-category-filters');
        const monthTitle = document.getElementById('calendar-month-title');
        const gridBody = document.getElementById('calendar-days-grid');
        const selectedDateTitle = document.getElementById('calendar-selected-title');
        const selectedDateList = document.getElementById('calendar-selected-events');
        const monthSummaryList = document.getElementById('calendar-month-events');

        if (!gridBody || !monthTitle) return;

        // 1. Category Filter Pills
        if (filterBar) {
            const items = [
                { key: 'all', label: '전체 일정' },
                ...Object.entries(CALENDAR_CATEGORIES).map(([k, v]) => ({ key: k, label: v.label }))
            ];
            filterBar.innerHTML = items.map(it => {
                const active = state.categoryFilter === it.key;
                const cls = active
                    ? 'px-4 py-2 rounded-full text-xs font-bold bg-rose-800 text-white shadow-sm transition-all'
                    : 'px-4 py-2 rounded-full text-xs font-bold bg-white text-stone-600 border border-stone-200 hover:bg-stone-100 transition-all';
                return `<button onclick="setCalendarCategory('${R.escapeHtml(it.key)}')" class="${cls}">${R.escapeHtml(it.label)}</button>`;
            }).join('');
        }

        // 2. Month Header
        monthTitle.textContent = `${state.year}년 ${state.month + 1}월`;

        // 3. Calendar 7xN Grid
        const events = getFilteredEvents();
        const firstDayOfWeek = new Date(state.year, state.month, 1).getDay();
        const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
        const prevMonthDays = new Date(state.year, state.month, 0).getDate();
        const todayYmd = formatYmd(new Date());

        const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;
        const cellsHtml = [];

        for (let i = 0; i < totalCells; i++) {
            let cellDate;
            let isCurrentMonth = true;
            if (i < firstDayOfWeek) {
                const d = prevMonthDays - firstDayOfWeek + 1 + i;
                cellDate = new Date(state.year, state.month - 1, d);
                isCurrentMonth = false;
            } else if (i >= firstDayOfWeek + daysInMonth) {
                const d = i - (firstDayOfWeek + daysInMonth) + 1;
                cellDate = new Date(state.year, state.month + 1, d);
                isCurrentMonth = false;
            } else {
                const d = i - firstDayOfWeek + 1;
                cellDate = new Date(state.year, state.month, d);
            }

            const ymd = formatYmd(cellDate);
            const dow = cellDate.getDay();
            const isToday = ymd === todayYmd;
            const isSelected = ymd === state.selectedDate;
            const dayEvents = events.filter(ev => eventOccursOnYmd(ev, ymd));

            const numColor = !isCurrentMonth
                ? 'text-stone-300'
                : dow === 0
                    ? 'text-rose-600'
                    : dow === 6
                        ? 'text-blue-600'
                        : 'text-stone-800';

            const cellBg = isSelected
                ? 'bg-rose-50/70 ring-2 ring-inset ring-rose-700 z-10'
                : isCurrentMonth
                    ? 'bg-white hover:bg-stone-50'
                    : 'bg-stone-50/60 hover:bg-stone-100/60';

            const pillsHtml = dayEvents.slice(0, 3).map(ev => {
                const cat = getCategoryInfo(ev.category);
                return `
                    <div class="text-[11px] leading-tight px-1.5 py-0.5 rounded border truncate font-semibold ${cat.pillCls}">
                        ${R.escapeHtml(ev.title)}
                    </div>
                `;
            }).join('');

            const moreHtml = dayEvents.length > 3
                ? `<div class="text-[10px] text-stone-500 font-bold pl-1">+${dayEvents.length - 3}건 더보기</div>`
                : '';

            cellsHtml.push(`
                <button type="button" onclick="selectCalendarDate('${ymd}')"
                    class="${cellBg} min-h-[92px] md:min-h-[112px] p-2 border-b border-r border-stone-200 text-left flex flex-col justify-between transition-colors focus:outline-none">
                    <div class="flex items-center justify-between w-full mb-1">
                        <span class="text-xs font-black ${numColor} ${isToday ? 'bg-rose-800 !text-white px-1.5 py-0.5 rounded-md' : ''}">
                            ${cellDate.getDate()}
                        </span>
                        ${isToday ? `<span class="text-[10px] font-bold text-rose-700 hidden sm:inline">오늘</span>` : ''}
                    </div>
                    <div class="w-full space-y-1 overflow-hidden">
                        ${pillsHtml}
                        ${moreHtml}
                    </div>
                </button>
            `);
        }

        gridBody.innerHTML = cellsHtml.join('');

        // 4. Selected Date Panel
        if (selectedDateTitle && selectedDateList) {
            const selObj = parseYmd(state.selectedDate);
            if (selObj) {
                selectedDateTitle.textContent = `${selObj.getFullYear()}년 ${selObj.getMonth() + 1}월 ${selObj.getDate()}일 (${WEEKDAYS[selObj.getDay()]})`;
            }
            const selEvents = events.filter(ev => eventOccursOnYmd(ev, state.selectedDate));
            if (selEvents.length === 0) {
                selectedDateList.innerHTML = `<p class="text-xs text-stone-400 py-6 text-center bg-stone-50 rounded-xl border border-stone-200/80">선택한 날짜에 등록된 일정이 없습니다.</p>`;
            } else {
                selectedDateList.innerHTML = selEvents.map(renderEventDetailCard).join('');
            }
        }

        // 5. Monthly + Upcoming Summary List
        if (monthSummaryList) {
            const monthEvents = events.filter(ev => eventOccursInMonth(ev, state.year, state.month));
            const upcomingOther = events.filter(ev => {
                const st = parseYmd(ev.date);
                return st && st.getTime() >= new Date(todayYmd).getTime() && !eventOccursInMonth(ev, state.year, state.month);
            }).slice(0, 5);

            let html = '';
            if (monthEvents.length === 0) {
                html += `<p class="text-xs text-stone-400 py-4 text-center">${state.month + 1}월에는 등록된 일정이 없습니다.</p>`;
            } else {
                html += monthEvents.map(ev => {
                    const cat = getCategoryInfo(ev.category);
                    return `
                        <button type="button" onclick="selectCalendarDate('${R.escapeHtml(ev.date)}')"
                            class="w-full text-left p-3 rounded-xl bg-stone-50 hover:bg-rose-50/60 border border-stone-200 hover:border-rose-300 transition-all flex items-center gap-3">
                            <span class="h-2.5 w-2.5 rounded-full shrink-0 ${cat.dotCls}"></span>
                            <div class="min-w-0 flex-1">
                                <div class="text-[11px] font-mono font-bold text-stone-500">${R.escapeHtml(ev.date)}${ev.endDate ? ` ~ ${R.escapeHtml(ev.endDate.slice(5))}` : ''}</div>
                                <div class="text-xs font-bold text-stone-900 truncate">${R.escapeHtml(ev.title)}</div>
                            </div>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${cat.badgeCls}">${R.escapeHtml(cat.shortLabel)}</span>
                        </button>
                    `;
                }).join('');
            }

            if (upcomingOther.length > 0) {
                html += `
                    <div class="pt-3 mt-3 border-t border-stone-200">
                        <div class="text-[11px] font-black text-stone-500 uppercase tracking-wider mb-2">다가오는 다른 달 주요 일정 (클릭 시 이동)</div>
                        <div class="space-y-2">
                            ${upcomingOther.map(ev => {
                                const cat = getCategoryInfo(ev.category);
                                return `
                                    <button type="button" onclick="jumpToCalendarDate('${R.escapeHtml(ev.date)}')"
                                        class="w-full text-left p-2.5 rounded-lg bg-white hover:bg-rose-50/50 border border-stone-200 transition-all flex items-center justify-between gap-2">
                                        <div class="min-w-0">
                                            <div class="text-[11px] font-mono text-rose-800 font-bold">${R.escapeHtml(ev.date)}</div>
                                            <div class="text-xs font-semibold text-stone-800 truncate">${R.escapeHtml(ev.title)}</div>
                                        </div>
                                        <span class="text-[10px] px-1.5 py-0.5 rounded shrink-0 ${cat.badgeCls}">${R.escapeHtml(cat.shortLabel)} ↗</span>
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }

            monthSummaryList.innerHTML = html;
        }
    }

    global.changeCalendarMonth = function (delta) {
        const next = new Date(state.year, state.month + delta, 1);
        state.year = next.getFullYear();
        state.month = next.getMonth();
        state.selectedDate = formatYmd(next);
        renderCalendarUI();
    };

    global.goCalendarToday = function () {
        const now = new Date();
        state.year = now.getFullYear();
        state.month = now.getMonth();
        state.selectedDate = formatYmd(now);
        renderCalendarUI();
    };

    global.selectCalendarDate = function (ymd) {
        const d = parseYmd(ymd);
        if (!d) return;
        state.year = d.getFullYear();
        state.month = d.getMonth();
        state.selectedDate = ymd;
        renderCalendarUI();
    };

    global.jumpToCalendarDate = function (ymd) {
        global.selectCalendarDate(ymd);
    };

    global.setCalendarCategory = function (catKey) {
        state.categoryFilter = catKey;
        renderCalendarUI();
    };

    global.ClothoidCalendar = {
        CALENDAR_CATEGORIES,
        getCategoryInfo,
        renderEventDetailCard,
        initCalendarView,
        renderCalendarUI
    };
})(window);
