(function (global) {
    'use strict';

    const BADGE_THEMES = {
        'rose-soft': { label: '로즈 소프트 (연분홍)', classes: 'bg-rose-50 text-rose-800' },
        'rose': { label: '로즈 (버건디 강조)', classes: 'bg-rose-100 text-rose-900' },
        'amber-soft': { label: '앰버 소프트 (연노랑)', classes: 'bg-amber-50 text-amber-800' },
        'amber': { label: '앰버 (골드/회장단)', classes: 'bg-amber-100 text-amber-800' },
        'blue': { label: '블루 (인지/기술)', classes: 'bg-blue-100 text-blue-800' },
        'green': { label: '그린 (판단/알고리즘)', classes: 'bg-green-100 text-green-800' },
        'teal': { label: '틸 (청록/출력)', classes: 'bg-teal-100 text-teal-800' },
        'purple': { label: '퍼플 (보라)', classes: 'bg-purple-100 text-purple-800' },
        'stone': { label: '스톤 (기본 그레이)', classes: 'bg-stone-100 text-stone-700' },
        'stone-solid': { label: '스톤 진한형 (연구과제)', classes: 'bg-stone-200 text-stone-700' },
        'dark': { label: '다크 (졸업생/블랙)', classes: 'bg-stone-800 text-white' }
    };

    const SENSOR_ACCENT_THEMES = {
        'blue': { label: '블루 (LiDAR 등)', classes: 'border-l-blue-500' },
        'green': { label: '그린 (Camera 등)', classes: 'border-l-green-500' },
        'purple': { label: '퍼플 (GPS 등)', classes: 'border-l-purple-500' },
        'amber': { label: '앰버 (제어/출력 등)', classes: 'border-l-amber-500' },
        'rose': { label: '로즈 (핵심 토픽)', classes: 'border-l-rose-600' },
        'teal': { label: '틸 (보조 센서)', classes: 'border-l-teal-500' }
    };

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function safeUrl(url) {
        if (!url) return '#';
        const trimmed = String(url).trim();
        if (/^(https?:\/\/|mailto:|\/|#)/i.test(trimmed)) {
            return escapeHtml(trimmed);
        }
        return '#';
    }

    function getBadgeClasses(themeKey, fallbackKey = 'stone') {
        const entry = BADGE_THEMES[themeKey] || BADGE_THEMES[fallbackKey] || BADGE_THEMES.stone;
        return entry.classes;
    }

    function getSensorAccentClasses(themeKey) {
        const entry = SENSOR_ACCENT_THEMES[themeKey] || SENSOR_ACCENT_THEMES.blue;
        return entry.classes;
    }

    function renderRepositoryCard(repo) {
        const badgeCls = getBadgeClasses(repo.badgeTheme, 'rose-soft');
        return `
            <div class="bg-white rounded-xl p-6 border border-stone-200 shadow-sm hover:border-rose-500 transition-all flex flex-col justify-between h-full">
                <div>
                    <div class="flex justify-between items-start mb-4">
                        <span class="text-3xl">${escapeHtml(repo.icon || '📦')}</span>
                        <span class="${badgeCls} text-xs font-bold px-2 py-1 rounded">${escapeHtml(repo.badgeText || '')}</span>
                    </div>
                    <h3 class="text-lg font-bold text-stone-900 mb-2">${escapeHtml(repo.title || '')}</h3>
                    <p class="text-xs text-stone-500 mb-4 font-mono">${escapeHtml(repo.repoPath || '')}</p>
                    <p class="text-sm text-stone-600 leading-relaxed mb-6">${escapeHtml(repo.description || '')}</p>
                </div>
                <a href="${safeUrl(repo.url)}" target="_blank" rel="noopener noreferrer" class="w-full text-center py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-lg transition-colors block">
                    ${escapeHtml(repo.buttonText || '바로가기')}
                </a>
            </div>
        `;
    }

    function formatCohort(raw) {
        if (raw === null || raw === undefined) return '';
        const trimmed = String(raw).trim();
        if (!trimmed) return '';
        return /^\d+$/.test(trimmed) ? `${trimmed}기` : trimmed;
    }

    function renderMemberCard(member) {
        const isAlumni = Boolean(member.isAlumni);
        const divisionSet = new Set(['all', ...(Array.isArray(member.divisions) ? member.divisions : [])]);
        if (isAlumni) divisionSet.add('alumni');
        const divisionsAttr = escapeHtml(Array.from(divisionSet).join(' '));
        const cohortText = formatCohort(member.cohort);
        const cohortAttr = escapeHtml(cohortText || 'none');

        const cardCls = isAlumni
            ? 'member-card bg-stone-100 rounded-xl p-6 border border-rose-200 shadow-sm flex flex-col justify-between animate-fade-in h-full'
            : 'member-card bg-white rounded-xl p-6 border border-stone-200 shadow-sm flex flex-col justify-between animate-fade-in h-full';

        const badgeCls = getBadgeClasses(member.badgeTheme, isAlumni ? 'dark' : 'stone');
        const cohortBadgeCls = isAlumni
            ? 'bg-rose-800 text-white'
            : 'bg-rose-900 text-white';
        const specialtyCls = isAlumni ? 'text-xs font-semibold text-rose-800' : 'text-xs font-semibold text-stone-400';
        const subtitleCls = isAlumni ? 'text-xs text-rose-800 mb-4' : 'text-xs text-stone-500 mb-4';
        const borderTopCls = isAlumni ? 'border-stone-200' : 'border-stone-100';
        const tagBgCls = isAlumni ? 'bg-white/80' : 'bg-stone-100';

        const tags = Array.isArray(member.tags) ? member.tags : [];
        const tagsHtml = tags
            .filter(Boolean)
            .map(tag => {
                const cleanTag = String(tag).replace(/^#+/, '');
                return `<span class="${tagBgCls} px-2 py-1 rounded">#${escapeHtml(cleanTag)}</span>`;
            })
            .join('');

        const subtitleHtml = member.githubUrl
            ? `<a href="${safeUrl(member.githubUrl)}" target="_blank" rel="noopener noreferrer" class="${subtitleCls} inline-flex items-center gap-1 hover:underline">${escapeHtml(member.subtitle || '')} <span class="text-[10px]">↗</span></a>`
            : `<p class="${subtitleCls}">${escapeHtml(member.subtitle || '')}</p>`;

        const cohortHtml = cohortText
            ? `<span class="text-xs font-black ${cohortBadgeCls} px-2 py-1 rounded">${escapeHtml(cohortText)}</span>`
            : '';

        return `
            <div class="${cardCls}" data-divisions="${divisionsAttr}" data-cohort="${cohortAttr}">
                <div>
                    <div class="flex justify-between items-center mb-4 gap-2">
                        <div class="flex flex-wrap items-center gap-1.5">
                            ${cohortHtml}
                            <span class="text-xs font-black tracking-widest ${badgeCls} px-2.5 py-1 rounded">${escapeHtml(member.roleBadge || '')}</span>
                        </div>
                        <span class="${specialtyCls} text-right">${escapeHtml(member.specialty || '')}</span>
                    </div>
                    <h3 class="text-xl font-black text-stone-900 mb-1">${escapeHtml(member.name || '')}</h3>
                    ${subtitleHtml}
                    <p class="text-sm text-stone-600 leading-relaxed mb-6">${escapeHtml(member.bio || '')}</p>
                </div>
                <div class="flex flex-wrap gap-2 text-xs border-t ${borderTopCls} pt-4 text-stone-500">
                    ${tagsHtml}
                </div>
            </div>
        `;
    }

    function renderProjectCard(project) {
        const badges = Array.isArray(project.badges) ? project.badges : [];
        const badgesHtml = badges
            .map(b => `<span class="${getBadgeClasses(b.theme, 'stone-solid')} text-xs font-bold px-2.5 py-1 rounded-md">${escapeHtml(b.text || '')}</span>`)
            .join('');

        if (project.featured) {
            const side = project.sideHighlight || {};
            const headlineHtml = escapeHtml(side.headline || '').replace(/\n/g, '<br>');

            let wrapperOpen = `<div class="lg:col-span-2 group bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-200 hover:border-rose-500 hover:shadow-lg transition-all flex flex-col md:flex-row">`;
            let wrapperClose = `</div>`;

            if (project.actionType === 'view' && project.actionTarget) {
                wrapperOpen = `<div onclick="switchView('${escapeHtml(project.actionTarget)}')" class="lg:col-span-2 group cursor-pointer bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-200 hover:border-rose-500 hover:shadow-lg transition-all flex flex-col md:flex-row">`;
            } else if (project.actionType === 'url' && project.actionTarget) {
                wrapperOpen = `<a href="${safeUrl(project.actionTarget)}" target="_blank" rel="noopener noreferrer" class="lg:col-span-2 group cursor-pointer bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-200 hover:border-rose-500 hover:shadow-lg transition-all flex flex-col md:flex-row">`;
                wrapperClose = `</a>`;
            }

            return `
                ${wrapperOpen}
                    <div class="p-8 flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex flex-wrap items-center gap-2 mb-4">
                                ${badgesHtml}
                            </div>
                            <h3 class="text-2xl font-black group-hover:text-rose-700 transition-colors mb-3">${escapeHtml(project.title || '')}</h3>
                            <p class="text-stone-600 text-sm mb-6 leading-relaxed">${escapeHtml(project.description || '')}</p>
                        </div>
                        ${project.ctaText ? `
                        <div class="flex items-center text-rose-800 font-bold gap-2 text-sm">
                            <span>${escapeHtml(project.ctaText)}</span>
                        </div>` : ''}
                    </div>
                    <div class="bg-rose-950 md:w-48 p-8 flex flex-col justify-center items-center text-white text-center border-t md:border-t-0 md:border-l border-rose-900/80">
                        <div class="text-4xl mb-2">${escapeHtml(side.icon || '🏁')}</div>
                        <div class="text-xs text-rose-200">${escapeHtml(side.caption || '')}</div>
                        <div class="text-lg font-black mt-1">${headlineHtml}</div>
                    </div>
                ${wrapperClose}
            `;
        }

        const footerHtml = project.actionType === 'url' && project.actionTarget
            ? `<a href="${safeUrl(project.actionTarget)}" target="_blank" rel="noopener noreferrer" class="text-rose-800 hover:underline text-xs mt-6 font-bold inline-block">${escapeHtml(project.statusText || '자세히 보기 →')}</a>`
            : `<span class="text-stone-400 text-xs mt-6 font-semibold">${escapeHtml(project.statusText || '')}</span>`;

        return `
            <div class="bg-stone-100/60 p-8 rounded-2xl border border-stone-200/60 flex flex-col justify-between h-full">
                <div>
                    <div class="flex flex-wrap gap-2 mb-4">${badgesHtml}</div>
                    <h4 class="text-xl font-bold text-stone-900 mb-2">${escapeHtml(project.title || '')}</h4>
                    <p class="text-stone-500 text-sm leading-relaxed">${escapeHtml(project.description || '')}</p>
                </div>
                ${footerHtml}
            </div>
        `;
    }

    function renderMissionCard(mission) {
        return `
            <div class="bg-stone-50 rounded-xl p-6 border border-stone-200">
                <div class="text-4xl mb-4">${escapeHtml(mission.icon || '🎯')}</div>
                <h3 class="text-xl font-bold mb-2">${escapeHtml(mission.title || '')}</h3>
                <p class="text-sm text-stone-600">${escapeHtml(mission.description || '')}</p>
            </div>
        `;
    }

    function renderRuleItem(rule) {
        const highlightHtml = rule.highlight
            ? ` <span class="font-bold text-red-500">${escapeHtml(rule.highlight)}</span>`
            : '';
        const suffixHtml = rule.suffix ? ` ${escapeHtml(rule.suffix)}` : '';
        return `
            <li class="flex items-start">
                <span class="mr-3 text-xl">${escapeHtml(rule.icon || '⚠️')}</span>
                <div>
                    <strong class="text-stone-800 block">${escapeHtml(rule.title || '')}</strong>
                    <span class="text-sm text-stone-600">${escapeHtml(rule.description || '')}${highlightHtml}${suffixHtml}</span>
                </div>
            </li>
        `;
    }

    function renderPlatformBanner(platform) {
        if (!platform) return '';
        const subLinks = Array.isArray(platform.subLinks) ? platform.subLinks : [];
        const subLinksHtml = subLinks.map(sub => `
            <div class="bg-rose-950/60 p-4 rounded-xl flex justify-between items-center gap-3">
                <div>
                    <h4 class="font-bold text-sm">${escapeHtml(sub.title || '')}</h4>
                    <p class="text-xs text-rose-200 mt-1">${escapeHtml(sub.subtitle || '')}</p>
                </div>
                <a href="${safeUrl(sub.url)}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 rounded text-xs font-bold text-white transition-colors whitespace-nowrap">
                    ${escapeHtml(sub.buttonText || 'GitHub')}
                </a>
            </div>
        `).join('');

        return `
            <div class="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h3 class="text-xl font-bold mb-1">${escapeHtml(platform.title || '')}</h3>
                    <p class="text-rose-200 text-sm">${escapeHtml(platform.subtitle || '')}</p>
                </div>
                <a href="${safeUrl(platform.url)}" target="_blank" rel="noopener noreferrer" class="px-6 py-3 bg-white text-rose-900 font-bold rounded-lg hover:bg-rose-50 transition-colors shadow-sm text-sm whitespace-nowrap">
                    ${escapeHtml(platform.buttonText || 'GitHub')}
                </a>
            </div>
            ${subLinksHtml ? `<div class="border-t border-rose-800/80 pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">${subLinksHtml}</div>` : ''}
        `;
    }

    function renderSensorCard(sensor) {
        const accentCls = getSensorAccentClasses(sensor.accentTheme);
        const dirBadgeCls = sensor.directionTheme === 'teal'
            ? 'bg-teal-100 text-teal-800'
            : 'bg-stone-100 text-stone-600';

        return `
            <div class="bg-white p-6 rounded-xl border-l-4 ${accentCls} shadow-sm border-y border-r border-stone-100">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="font-bold text-lg">${escapeHtml(sensor.name || '')}</h4>
                    <span class="text-xs ${dirBadgeCls} px-2 py-1 rounded">${escapeHtml(sensor.direction || '')}</span>
                </div>
                <p class="text-sm font-mono bg-stone-100 p-2 rounded mb-2 text-stone-700">Topic: ${escapeHtml(sensor.topic || '')}</p>
                <p class="text-sm text-stone-500 mb-2">Type: ${escapeHtml(sensor.msgType || '')}</p>
                <p class="text-sm text-stone-700">${escapeHtml(sensor.description || '')}</p>
            </div>
        `;
    }

    function renderTimelineItem(item) {
        if (item.isFinal) {
            return `
                <div class="relative">
                    <div class="timeline-dot" style="background-color:#f59e0b; border:4px solid #ffffff; box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>
                    <h4 class="text-xl font-black text-amber-600">${escapeHtml(item.stepTitle || '')}</h4>
                    <p class="text-stone-800 mt-1 font-medium">${escapeHtml(item.description || '')}</p>
                </div>
            `;
        }
        return `
            <div class="relative">
                <div class="timeline-dot"></div>
                <h4 class="text-lg font-bold text-rose-800">${escapeHtml(item.stepTitle || '')}</h4>
                <p class="text-stone-600 text-sm mt-1">${escapeHtml(item.description || '')}</p>
            </div>
        `;
    }

    function isPdfPath(rawSrc, resolvedSrc) {
        return /\.pdf(\?|#|$)/i.test(String(rawSrc || '').trim()) ||
            /^data:application\/pdf/i.test(String(resolvedSrc || '').trim());
    }

    function safeImageSrc(src, resolveImage) {
        if (!src) return '';
        if (typeof resolveImage === 'function') {
            const resolved = resolveImage(src);
            if (resolved) return resolved;
        }
        const trimmed = String(src).trim();
        if (/^(data:image\/|data:application\/pdf|blob:|https?:\/\/|\/|image\/|\.\/image\/)/i.test(trimmed)) {
            return escapeHtml(trimmed);
        }
        return '';
    }

    function parseLocalDate(ymd) {
        if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(String(ymd).trim())) return null;
        const [y, m, d] = String(ymd).trim().split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    function formatSchedulePeriod(item) {
        if (item.dateLabel && String(item.dateLabel).trim()) {
            return String(item.dateLabel).trim();
        }
        const start = parseLocalDate(item.date);
        const end = parseLocalDate(item.endDate);
        const pad = n => String(n).padStart(2, '0');
        if (!start) return '일정 추후 공지';
        const sStr = `${start.getFullYear()}.${pad(start.getMonth() + 1)}.${pad(start.getDate())}`;
        if (!end || end.getTime() === start.getTime()) return sStr;
        if (end.getFullYear() === start.getFullYear()) {
            return `${sStr} ~ ${pad(end.getMonth() + 1)}.${pad(end.getDate())}`;
        }
        return `${sStr} ~ ${end.getFullYear()}.${pad(end.getMonth() + 1)}.${pad(end.getDate())}`;
    }

    function computeDdayBadge(item) {
        const start = parseLocalDate(item.date);
        if (!start) {
            return { text: '일정 예정', cls: 'bg-stone-200 text-stone-700', isPast: false };
        }
        const end = parseLocalDate(item.endDate) || start;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffStart = Math.round((start.getTime() - today.getTime()) / 86400000);
        const diffEnd = Math.round((end.getTime() - today.getTime()) / 86400000);

        if (diffStart <= 0 && diffEnd >= 0) {
            return { text: 'D-Day · 진행 중', cls: 'bg-rose-700 text-white animate-pulse', isPast: false };
        }
        if (diffStart > 0) {
            const urgent = diffStart <= 30;
            return {
                text: `D-${diffStart}`,
                cls: urgent ? 'bg-rose-800 text-white' : 'bg-stone-900 text-white',
                isPast: false
            };
        }
        return { text: '종료', cls: 'bg-stone-200 text-stone-500', isPast: true };
    }

    function renderCompetitionScheduleItem(item) {
        const dday = computeDdayBadge(item);
        const periodStr = formatSchedulePeriod(item);
        const statusCls = getBadgeClasses(item.badgeTheme, 'rose-soft');
        const rowOpacity = dday.isPast ? 'opacity-70' : '';

        return `
            <div class="bg-white rounded-xl p-4 border border-stone-200 hover:border-rose-400 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${rowOpacity}">
                <div class="flex items-start sm:items-center gap-3.5 min-w-0">
                    <span class="${dday.cls} text-xs font-black px-3 py-1.5 rounded-lg shrink-0 text-center min-w-[68px]">
                        ${escapeHtml(dday.text)}
                    </span>
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2 mb-0.5">
                            <span class="text-xs font-mono font-bold text-rose-800">${escapeHtml(periodStr)}</span>
                            ${item.competitionName ? `<span class="text-[11px] bg-stone-100 text-stone-600 font-semibold px-2 py-0.5 rounded">${escapeHtml(item.competitionName)}</span>` : ''}
                        </div>
                        <h4 class="text-sm md:text-base font-black text-stone-900 truncate">${escapeHtml(item.title || '')}</h4>
                    </div>
                </div>
                <div class="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pl-[82px] sm:pl-0">
                    ${item.location ? `<span class="text-xs text-stone-500 font-medium">📍 ${escapeHtml(item.location)}</span>` : ''}
                    ${item.status ? `<span class="${statusCls} text-xs font-bold px-2.5 py-1 rounded">${escapeHtml(item.status)}</span>` : ''}
                </div>
            </div>
        `;
    }

    function renderCompetitionCard(comp, opts = {}) {
        const badgeCls = getBadgeClasses(comp.badgeTheme, comp.awardTitle ? 'amber' : 'rose-soft');
        const hasAward = Boolean((comp.awardTitle && comp.awardTitle.trim()) || (comp.certificateImage && comp.certificateImage.trim()));
        const imgSrc = safeImageSrc(comp.certificateImage, opts.resolveImage);
        const isPdf = isPdfPath(comp.certificateImage, imgSrc);

        const certCaptionAttr = escapeHtml(comp.certificateCaption || comp.awardTitle || comp.title || '상장 문서');
        const certTitleAttr = escapeHtml(comp.title || '');
        const certAwardAttr = escapeHtml(comp.awardTitle || '');

        const thumbInnerHtml = isPdf
            ? `<div class="h-full w-full bg-rose-900 text-white flex flex-col items-center justify-center leading-none">
                   <span class="text-base">📄</span>
                   <span class="text-[9px] font-black tracking-wider mt-1">PDF</span>
               </div>`
            : `<img src="${imgSrc}" alt="${certCaptionAttr}" class="h-full w-full object-cover group-hover/cert:scale-105 transition-transform">`;

        const certificateHtml = imgSrc ? `
            <div class="mt-3 pt-3 border-t border-amber-200/70">
                <button type="button"
                    data-cert-src="${imgSrc}"
                    data-cert-type="${isPdf ? 'pdf' : 'image'}"
                    data-cert-title="${certTitleAttr}"
                    data-cert-award="${certAwardAttr}"
                    data-cert-caption="${certCaptionAttr}"
                    onclick="openCertificateFromEl(this)"
                    class="w-full group/cert bg-white rounded-lg p-2.5 border border-amber-200 hover:border-rose-500 transition-all flex items-center gap-3 text-left shadow-sm">
                    <div class="h-14 w-12 rounded bg-stone-100 border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center">
                        ${thumbInnerHtml}
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="text-xs font-black text-stone-800 group-hover/cert:text-rose-800 transition-colors flex items-center gap-1">
                            <span>${isPdf ? '📜 상장 / 증빙 PDF 문서 보기' : '📜 상장 / 증빙 이미지 보기'}</span>
                        </div>
                        <p class="text-[11px] text-stone-500 truncate mt-0.5">${escapeHtml(comp.certificateCaption || (isPdf ? '클릭하여 PDF 뷰어로 열기' : '클릭하여 원본 크기로 확대'))}</p>
                    </div>
                    <span class="text-xs font-bold text-rose-800 bg-rose-50 px-2.5 py-1 rounded-md shrink-0">${isPdf ? '열기 📄' : '확대 🔍'}</span>
                </button>
            </div>
        ` : '';

        const awardSectionHtml = hasAward ? `
            <div class="bg-gradient-to-br from-amber-50 via-amber-50/70 to-rose-50/50 border border-amber-200/90 rounded-xl p-4 mb-4">
                ${comp.awardTitle ? `
                    <div class="text-xs font-bold text-amber-800 uppercase tracking-wider mb-0.5">Award Record</div>
                    <div class="text-base font-black text-stone-900">${escapeHtml(comp.awardTitle)}</div>
                ` : `<div class="text-xs font-bold text-amber-800">📜 등록된 상장 / 대회 기록</div>`}
                ${comp.awardSubtext ? `<div class="text-xs text-stone-600 mt-0.5 font-medium">${escapeHtml(comp.awardSubtext)}</div>` : ''}
                ${certificateHtml}
            </div>
        ` : '';

        const linkHtml = comp.url ? `
            <a href="${safeUrl(comp.url)}" target="_blank" rel="noopener noreferrer" class="w-full text-center py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-lg transition-colors block mt-2">
                🔗 대회 상세 / 관련 자료 보기
            </a>
        ` : '';

        return `
            <div class="competition-card bg-white rounded-2xl p-6 border ${hasAward ? 'border-amber-300/90' : 'border-stone-200'} shadow-sm hover:border-rose-500 transition-all flex flex-col justify-between h-full" data-has-award="${hasAward ? 'true' : 'false'}">
                <div>
                    <div class="flex justify-between items-center gap-2 mb-3">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="bg-stone-900 text-white text-xs font-black px-2.5 py-1 rounded-md shrink-0">${escapeHtml(comp.year || '')}</span>
                            <span class="text-xs font-semibold text-stone-500 truncate">${escapeHtml(comp.organizer || '')}</span>
                        </div>
                        ${comp.statusBadge ? `<span class="${badgeCls} text-xs font-bold px-2.5 py-1 rounded shrink-0">${escapeHtml(comp.statusBadge)}</span>` : ''}
                    </div>
                    <h3 class="text-xl font-black text-stone-900 mb-1.5 leading-snug">${escapeHtml(comp.title || '')}</h3>
                    ${comp.category ? `<p class="text-xs font-mono text-rose-800 bg-rose-50/80 inline-block px-2 py-0.5 rounded mb-3">${escapeHtml(comp.category)}</p>` : ''}
                    <p class="text-sm text-stone-600 leading-relaxed mb-5">${escapeHtml(comp.description || '')}</p>
                </div>
                <div>
                    ${awardSectionHtml}
                    ${linkHtml}
                </div>
            </div>
        `;
    }

    function ensureCertificateLightbox() {
        let modal = document.getElementById('clothoid-cert-lightbox');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'clothoid-cert-lightbox';
        modal.className = 'hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-stone-200" onclick="event.stopPropagation()">
                <div class="px-6 py-4 bg-stone-950 text-white flex justify-between items-center gap-4">
                    <div class="min-w-0">
                        <div id="cert-modal-award" class="text-xs font-bold text-amber-400 truncate"></div>
                        <h3 id="cert-modal-title" class="font-black text-base truncate"></h3>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <a id="cert-modal-open-new" href="#" target="_blank" rel="noopener noreferrer"
                            class="text-xs font-bold bg-stone-800 hover:bg-stone-700 text-stone-200 px-3 py-1.5 rounded-lg border border-stone-700 transition-colors">
                            ↗ 새 탭에서 열기
                        </a>
                        <button type="button" onclick="closeCertificateModal()" class="text-stone-400 hover:text-white text-2xl leading-none px-2">&times;</button>
                    </div>
                </div>
                <div class="p-4 md:p-6 bg-stone-100 flex-1 overflow-auto flex items-center justify-center">
                    <img id="cert-modal-img" src="" alt="상장 이미지" class="max-h-[72vh] w-auto object-contain rounded-lg shadow-md bg-white">
                    <iframe id="cert-modal-pdf" src="about:blank" title="상장 PDF 뷰어" class="hidden w-full h-[72vh] rounded-lg shadow-md bg-white border border-stone-300"></iframe>
                </div>
                <div id="cert-modal-caption" class="px-6 py-3 bg-white border-t border-stone-200 text-xs text-stone-600 text-center font-medium"></div>
            </div>
        `;
        modal.addEventListener('click', () => global.closeCertificateModal());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                global.closeCertificateModal();
            }
        });
        document.body.appendChild(modal);
        return modal;
    }

    global.openCertificateFromEl = function (btnEl) {
        if (!btnEl) return;
        const src = btnEl.getAttribute('data-cert-src') || '';
        if (!src) return;
        const certType = btnEl.getAttribute('data-cert-type') || 'image';
        const title = btnEl.getAttribute('data-cert-title') || '';
        const award = btnEl.getAttribute('data-cert-award') || '';
        const caption = btnEl.getAttribute('data-cert-caption') || '';

        const modal = ensureCertificateLightbox();
        const imgEl = modal.querySelector('#cert-modal-img');
        const pdfEl = modal.querySelector('#cert-modal-pdf');
        const openNewEl = modal.querySelector('#cert-modal-open-new');

        if (openNewEl) openNewEl.href = src;

        if (certType === 'pdf') {
            imgEl.classList.add('hidden');
            imgEl.src = '';
            pdfEl.classList.remove('hidden');
            pdfEl.src = src;
        } else {
            pdfEl.classList.add('hidden');
            pdfEl.src = 'about:blank';
            imgEl.classList.remove('hidden');
            imgEl.src = src;
        }

        modal.querySelector('#cert-modal-title').textContent = title;
        modal.querySelector('#cert-modal-award').textContent = award;
        modal.querySelector('#cert-modal-caption').textContent = caption;
        modal.classList.remove('hidden');
    };

    global.closeCertificateModal = function () {
        const modal = document.getElementById('clothoid-cert-lightbox');
        if (!modal) return;
        modal.classList.add('hidden');
        const pdfEl = modal.querySelector('#cert-modal-pdf');
        if (pdfEl) pdfEl.src = 'about:blank';
    };

    global.ClothoidRender = {
        BADGE_THEMES,
        SENSOR_ACCENT_THEMES,
        escapeHtml,
        safeUrl,
        safeImageSrc,
        isPdfPath,
        formatCohort,
        getBadgeClasses,
        renderRepositoryCard,
        renderCompetitionScheduleItem,
        renderCompetitionCard,
        renderMemberCard,
        renderProjectCard,
        renderMissionCard,
        renderRuleItem,
        renderPlatformBanner,
        renderSensorCard,
        renderTimelineItem
    };
})(window);
