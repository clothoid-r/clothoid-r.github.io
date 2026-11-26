(function () {
    'use strict';

    const R = window.ClothoidRender;

    const DATA_FILES = [
        { key: 'members', filename: 'members.json', label: '크루 & 졸업생' },
        { key: 'repositories', filename: 'repositories.json', label: 'GitHub 리소스 카드' },
        { key: 'competitions', filename: 'competitions.json', label: '참가 대회 & 수상경력' },
        { key: 'calendar', filename: 'calendar.json', label: '전체 일정 캘린더' },
        { key: 'projects', filename: 'projects.json', label: '활성 프로젝트 카드' },
        { key: 'challenge', filename: 'challenge.json', label: '신입부원 대시보드' }
    ];

    const STORAGE_KEY = 'clothoid_admin_session_v1';

    let authState = {
        mode: null, // 'github' | 'local'
        repo: 'clothoid-r/clothoid-r.github.io',
        branch: 'main',
        token: '',
        userLogin: ''
    };

    let db = {
        members: null,
        repositories: null,
        competitions: null,
        calendar: null,
        projects: null,
        challenge: null
    };

    let originalSnapshots = {
        members: '',
        repositories: '',
        competitions: '',
        calendar: '',
        projects: '',
        challenge: ''
    };

    // 커밋 대기 중인 업로드 이미지 보관 (repoPath -> { repoPath, filename, base64, dataUrl })
    let pendingImageUploads = {};

    let uiState = {
        activeTab: 'members',
        selectedMemberIdx: 0,
        memberSearch: '',
        memberFilter: 'all',
        selectedRepoIdx: 0,
        compSubTab: 'cards', // 'cards' | 'schedule'
        selectedCompIdx: 0,
        selectedCompSchedIdx: 0,
        selectedCalendarIdx: 0,
        selectedProjectIdx: 0,
        challengeSubTab: 'missions', // 'missions' | 'roles' | 'rules' | 'sensors' | 'schedule'
        selectedRoleIdx: 0,
        selectedSensorIdx: 0
    };

    // ---------------------------------------------------------
    // Utilities
    // ---------------------------------------------------------
    function notify(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const colors = {
            info: 'bg-stone-900 text-white border-stone-700',
            success: 'bg-emerald-900 text-white border-emerald-700',
            error: 'bg-red-900 text-white border-red-700'
        };
        const toast = document.createElement('div');
        toast.className = `${colors[type] || colors.info} border px-4 py-3 rounded-xl shadow-xl text-xs font-semibold leading-relaxed transition-all`;
        toast.innerHTML = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4200);
    }

    function snapshotOf(obj) {
        return JSON.stringify(obj, null, 2);
    }

    function getDirtyFiles() {
        return DATA_FILES.filter(f => db[f.key] && snapshotOf(db[f.key]) !== originalSnapshots[f.key]);
    }

    function updateDirtyIndicators() {
        const dirty = getDirtyFiles();
        const pendingImgs = typeof getReferencedPendingImages === 'function' ? getReferencedPendingImages() : [];
        DATA_FILES.forEach(f => {
            const dot = document.getElementById(`dirty-dot-${f.key}`);
            if (dot) {
                const isFileDirty = dirty.some(d => d.key === f.key) || (f.key === 'competitions' && pendingImgs.length > 0);
                dot.classList.toggle('hidden', !isFileDirty);
            }
        });

        const badge = document.getElementById('dirty-indicator');
        if (badge) {
            if (dirty.length > 0 || pendingImgs.length > 0) {
                const imgText = pendingImgs.length > 0 ? ` · 이미지 ${pendingImgs.length}장` : '';
                badge.textContent = `수정됨 ${dirty.length}개 파일${imgText}`;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    }

    function decodeBase64Utf8(base64Str) {
        const cleaned = base64Str.replace(/\s/g, '');
        const binary = atob(cleaned);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
    }

    function isLocalEnvironment() {
        const h = window.location.hostname;
        return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || window.location.protocol === 'file:';
    }

    function themeSelectOptions(selectedKey) {
        return Object.entries(R.BADGE_THEMES).map(([key, info]) => {
            const sel = key === selectedKey ? 'selected' : '';
            return `<option value="${R.escapeHtml(key)}" ${sel}>${R.escapeHtml(info.label)}</option>`;
        }).join('');
    }

    function sensorAccentOptions(selectedKey) {
        return Object.entries(R.SENSOR_ACCENT_THEMES).map(([key, info]) => {
            const sel = key === selectedKey ? 'selected' : '';
            return `<option value="${R.escapeHtml(key)}" ${sel}>${R.escapeHtml(info.label)}</option>`;
        }).join('');
    }

    // ---------------------------------------------------------
    // Authentication & Data Loading
    // ---------------------------------------------------------
    window.toggleTokenGuide = function () {
        const box = document.getElementById('token-guide-box');
        if (box) box.classList.toggle('hidden');
    };

    window.toggleTokenVisibility = function () {
        const input = document.getElementById('auth-token');
        const btn = document.getElementById('token-vis-btn');
        if (!input || !btn) return;
        if (input.type === 'password') {
            input.type = 'text';
            btn.textContent = '숨김';
        } else {
            input.type = 'password';
            btn.textContent = '표시';
        }
    };

    async function githubApi(endpoint, token, options = {}) {
        const res = await fetch(`https://api.github.com${endpoint}`, {
            ...options,
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28',
                ...(options.headers || {})
            }
        });
        if (!res.ok) {
            let detail = '';
            try {
                const errJson = await res.json();
                detail = errJson.message || '';
            } catch (_) { /* ignore */ }
            throw new Error(`GitHub API 오류 (${res.status}): ${detail || res.statusText}`);
        }
        return res.json();
    }

    async function authenticateWithGitHub(repo, branch, token, remember) {
        const cleanRepo = repo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
        const cleanBranch = branch.trim() || 'main';
        const cleanToken = token.trim();

        const [userInfo, repoInfo] = await Promise.all([
            githubApi('/user', cleanToken),
            githubApi(`/repos/${cleanRepo}`, cleanToken)
        ]);

        const perms = repoInfo.permissions || {};
        if (!perms.push) {
            throw new Error(
                `계정(@${userInfo.login})의 토큰에 '${cleanRepo}' 쓰기 권한이 확인되지 않습니다. ` +
                `① Fine-grained 토큰 발급 시 Resource owner를 개인 계정이 아닌 'clothoid-r' 조직으로 선택했는지, ` +
                `② 조직 Settings → Personal access tokens에서 토큰이 허용(Approve)되었는지 확인해 주세요. ` +
                `(가장 간단한 방법: Tokens (classic)으로 발급 후 'repo' 권한 체크)`
            );
        }

        // 저장소 실제 역할(Role) 조회: 일반 Write 부원은 차단하고 Admin / Maintain 등급 운영진만 허용
        let roleName = perms.admin ? 'admin' : (perms.maintain ? 'maintain' : 'write');
        try {
            const collabInfo = await githubApi(
                `/repos/${cleanRepo}/collaborators/${encodeURIComponent(userInfo.login)}/permission`,
                cleanToken
            );
            if (collabInfo && (collabInfo.role_name || collabInfo.permission)) {
                roleName = String(collabInfo.role_name || collabInfo.permission).toLowerCase();
            }
        } catch (_) {
            // Fine-grained PAT 환경 등에서 보조 조회 실패 시 repoInfo.permissions 기준으로 판별
        }

        const isAdminOrMaintainer = roleName === 'admin' || roleName === 'maintain' || Boolean(perms.admin) || Boolean(perms.maintain);
        if (!isAdminOrMaintainer) {
            throw new Error(`인증된 계정(@${userInfo.login})의 현재 저장소 역할은 '${roleName}'입니다. 관리자 콘솔은 저장소 Admin 또는 Maintain 등급이 부여된 운영진만 접속할 수 있습니다.`);
        }

        // Load all 4 JSON files directly from GitHub Contents API (if not yet pushed to GitHub, fallback to local data/*.json)
        let initializedFromLocal = false;
        const loadedEntries = await Promise.all(
            DATA_FILES.map(async f => {
                try {
                    const fileResp = await githubApi(`/repos/${cleanRepo}/contents/data/${f.filename}?ref=${encodeURIComponent(cleanBranch)}`, cleanToken);
                    const text = decodeBase64Utf8(fileResp.content);
                    return { key: f.key, parsed: JSON.parse(text), existedOnGitHub: true };
                } catch (err) {
                    if (String(err.message).includes('404')) {
                        const localRes = await fetch(`data/${f.filename}`, { cache: 'no-cache' });
                        if (!localRes.ok) {
                            throw new Error(`GitHub '${cleanBranch}' 브랜치에 아직 'data/${f.filename}' 파일이 업로드되지 않았습니다. 먼저 로컬 변경사항을 GitHub에 git push 해주세요.`);
                        }
                        initializedFromLocal = true;
                        const localJson = await localRes.json();
                        return { key: f.key, parsed: localJson, existedOnGitHub: false };
                    }
                    throw err;
                }
            })
        );

        loadedEntries.forEach(({ key, parsed, existedOnGitHub }) => {
            db[key] = parsed;
            originalSnapshots[key] = existedOnGitHub ? snapshotOf(parsed) : '';
        });

        authState = {
            mode: 'github',
            repo: cleanRepo,
            branch: cleanBranch,
            token: cleanToken,
            userLogin: userInfo.login
        };

        const payload = JSON.stringify({ repo: cleanRepo, branch: cleanBranch, token: cleanToken });
        if (remember) {
            localStorage.setItem(STORAGE_KEY, payload);
            sessionStorage.removeItem(STORAGE_KEY);
        } else {
            sessionStorage.setItem(STORAGE_KEY, payload);
            localStorage.removeItem(STORAGE_KEY);
        }

        openWorkspace();
        if (initializedFromLocal) {
            notify(`✅ @${R.escapeHtml(userInfo.login)} 인증 완료! GitHub에 아직 data/ 폴더가 없어 로컬 초기 데이터를 불러왔습니다.`, 'success');
        } else {
            notify(`✅ @${R.escapeHtml(userInfo.login)} 운영진 권한이 확인되었습니다.`, 'success');
        }
    }

    window.enterLocalDevMode = async function () {
        if (!isLocalEnvironment()) {
            notify('로컬 개발 모드는 localhost에서만 허용됩니다.', 'error');
            return;
        }
        try {
            const loadedEntries = await Promise.all(
                DATA_FILES.map(async f => {
                    const res = await fetch(`data/${f.filename}`, { cache: 'no-cache' });
                    if (!res.ok) throw new Error(`data/${f.filename} 로드 실패 (${res.status})`);
                    const json = await res.json();
                    return [f.key, json];
                })
            );
            loadedEntries.forEach(([key, parsed]) => {
                db[key] = parsed;
                originalSnapshots[key] = snapshotOf(parsed);
            });
            authState = {
                mode: 'local',
                repo: 'clothoid-r/clothoid-r.github.io',
                branch: 'main',
                token: '',
                userLogin: 'localhost-dev'
            };
            openWorkspace();
            notify('🧪 로컬 개발 편집 모드로 열렸습니다. 상단에서 언제든 JSON 저장 또는 GitHub 로그인 후 커밋이 가능합니다.', 'info');
        } catch (err) {
            const errBox = document.getElementById('auth-error-box');
            if (errBox) {
                errBox.textContent = `로컬 파일 로드 실패: ${err.message}. 로컬 웹 서버(예: python -m http.server 8080)에서 실행 중인지 확인하세요.`;
                errBox.classList.remove('hidden');
            }
        }
    };

    function openWorkspace() {
        document.getElementById('auth-gate').classList.add('hidden');
        document.getElementById('admin-workspace').classList.remove('hidden');

        const statusBadge = document.getElementById('auth-status-badge');
        if (statusBadge) {
            if (authState.mode === 'github') {
                statusBadge.innerHTML = `🟢 <strong>@${R.escapeHtml(authState.userLogin)}</strong> · ${R.escapeHtml(authState.repo)} (${R.escapeHtml(authState.branch)})`;
            } else {
                statusBadge.innerHTML = `🧪 로컬 개발 모드 (GitHub 커밋 시 토큰 입력)`;
            }
        }

        const localSaveBtn = document.getElementById('local-save-btn');
        if (localSaveBtn && 'showSaveFilePicker' in window) {
            localSaveBtn.classList.remove('hidden');
        }

        updateDirtyIndicators();
        renderActiveTab();
    }

    window.logoutAdmin = function () {
        if (getDirtyFiles().length > 0) {
            if (!confirm('아직 커밋하거나 저장하지 않은 수정사항이 있습니다. 정말 로그아웃하시겠습니까?')) {
                return;
            }
        }
        sessionStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY);
        authState = { mode: null, repo: 'clothoid-r/clothoid-r.github.io', branch: 'main', token: '', userLogin: '' };
        document.getElementById('admin-workspace').classList.add('hidden');
        document.getElementById('auth-gate').classList.remove('hidden');
        const tokenInput = document.getElementById('auth-token');
        if (tokenInput) tokenInput.value = '';
    };

    // ---------------------------------------------------------
    // Save / Export / GitHub Direct Commit
    // ---------------------------------------------------------
    window.downloadCurrentJson = function () {
        const currentFile = DATA_FILES.find(f => f.key === uiState.activeTab);
        if (!currentFile || !db[currentFile.key]) return;
        const jsonText = JSON.stringify(db[currentFile.key], null, 2) + '\n';
        const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentFile.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        notify(`💾 <strong>${currentFile.filename}</strong> 파일이 다운로드되었습니다. <code>data/</code> 폴더에 덮어쓰세요.`, 'success');
    };

    window.saveCurrentToLocalFile = async function () {
        const currentFile = DATA_FILES.find(f => f.key === uiState.activeTab);
        if (!currentFile || !db[currentFile.key] || !('showSaveFilePicker' in window)) return;
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: currentFile.filename,
                types: [{ description: 'JSON Data File', accept: { 'application/json': ['.json'] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(JSON.stringify(db[currentFile.key], null, 2) + '\n');
            await writable.close();
            if (authState.mode === 'local') {
                originalSnapshots[currentFile.key] = snapshotOf(db[currentFile.key]);
                updateDirtyIndicators();
            }
            notify(`📂 <strong>${currentFile.filename}</strong> 로컬 파일에 직접 저장했습니다!`, 'success');
        } catch (err) {
            if (err && err.name !== 'AbortError') {
                notify(`파일 저장 오류: ${R.escapeHtml(err.message)}`, 'error');
            }
        }
    };

    function getReferencedPendingImages() {
        if (!db.competitions || !Array.isArray(db.competitions.competitions)) return [];
        const usedPaths = new Set(
            db.competitions.competitions
                .map(c => (c.certificateImage || '').trim())
                .filter(Boolean)
        );
        return Object.values(pendingImageUploads).filter(item => usedPaths.has(item.repoPath));
    }

    function resolveAdminImage(src) {
        if (!src) return '';
        const trimmed = String(src).trim();
        if (pendingImageUploads[trimmed]) {
            return pendingImageUploads[trimmed].dataUrl;
        }
        // PDF는 GitHub Pages 동일 도메인 경로로 열어야 브라우저 내장 PDF 뷰어가 정상 동작함
        if (/\.pdf(\?|#|$)/i.test(trimmed)) {
            return R.escapeHtml(trimmed);
        }
        if (authState.mode === 'github' && /^image\//i.test(trimmed) && !isLocalEnvironment()) {
            return `https://raw.githubusercontent.com/${authState.repo}/${encodeURIComponent(authState.branch)}/${trimmed}`;
        }
        return R.escapeHtml(trimmed);
    }

    window.openCommitModal = function () {
        if (authState.mode !== 'github' || !authState.token) {
            notify('GitHub 바로 커밋을 사용하려면 먼저 GitHub 운영진 토큰으로 로그인해 주세요. (로그아웃 후 토큰 입력)', 'info');
            return;
        }
        const dirty = getDirtyFiles();
        const pendingImgs = getReferencedPendingImages();
        if (dirty.length === 0 && pendingImgs.length === 0) {
            notify('변경된 데이터가 없습니다. 카드를 수정한 뒤 커밋해 주세요.', 'info');
            return;
        }

        const listEl = document.getElementById('commit-file-list');
        const jsonItemsHtml = dirty.map(f => `<li>📝 data/${R.escapeHtml(f.filename)} <span class="text-stone-400">(${R.escapeHtml(f.label)})</span></li>`);
        const imgItemsHtml = pendingImgs.map(img => `<li>🖼️ ${R.escapeHtml(img.repoPath)} <span class="text-amber-700">(상장 이미지 업로드)</span></li>`);
        listEl.innerHTML = [...jsonItemsHtml, ...imgItemsHtml].join('');

        const msgInput = document.getElementById('commit-message-input');
        const names = dirty.map(f => f.label).join(', ') || '상장 이미지';
        msgInput.value = `chore(data): ${names} 정보 업데이트`;

        const targetLabel = document.getElementById('commit-target-label');
        targetLabel.textContent = `${authState.repo}@${authState.branch}`;

        document.getElementById('commit-modal').classList.remove('hidden');
    };

    window.closeCommitModal = function () {
        document.getElementById('commit-modal').classList.add('hidden');
    };

    window.executeGitHubCommit = async function () {
        const dirty = getDirtyFiles();
        const pendingImgs = getReferencedPendingImages();
        if (dirty.length === 0 && pendingImgs.length === 0) {
            window.closeCommitModal();
            return;
        }

        const btn = document.getElementById('confirm-commit-btn');
        const msgInput = document.getElementById('commit-message-input');
        const commitMsg = (msgInput.value || '').trim() || 'chore(data): 홈페이지 데이터 업데이트';

        btn.disabled = true;
        btn.textContent = '커밋 전송 중...';

        try {
            const { repo, branch, token } = authState;

            // 1. Get latest branch commit SHA
            const refData = await githubApi(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token);
            const latestCommitSha = refData.object.sha;

            // 2. Get base tree SHA
            const commitData = await githubApi(`/repos/${repo}/git/commits/${latestCommitSha}`, token);
            const baseTreeSha = commitData.tree.sha;

            // 3. Upload any pending binary certificate images as Git Blobs
            const imageTreeItems = await Promise.all(
                pendingImgs.map(async img => {
                    const blobResp = await githubApi(`/repos/${repo}/git/blobs`, token, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content: img.base64,
                            encoding: 'base64'
                        })
                    });
                    return {
                        path: img.repoPath,
                        mode: '100644',
                        type: 'blob',
                        sha: blobResp.sha
                    };
                })
            );

            // 4. Create new tree with all modified data/*.json files + uploaded images in one atomic commit
            const jsonTreeItems = dirty.map(f => ({
                path: `data/${f.filename}`,
                mode: '100644',
                type: 'blob',
                content: JSON.stringify(db[f.key], null, 2) + '\n'
            }));

            const newTree = await githubApi(`/repos/${repo}/git/trees`, token, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    base_tree: baseTreeSha,
                    tree: [...imageTreeItems, ...jsonTreeItems]
                })
            });

            // 5. Create commit
            const newCommit = await githubApi(`/repos/${repo}/git/commits`, token, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: commitMsg,
                    tree: newTree.sha,
                    parents: [latestCommitSha]
                })
            });

            // 6. Update branch reference
            await githubApi(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sha: newCommit.sha })
            });

            dirty.forEach(f => {
                originalSnapshots[f.key] = snapshotOf(db[f.key]);
            });
            pendingImgs.forEach(img => {
                delete pendingImageUploads[img.repoPath];
            });
            updateDirtyIndicators();
            window.closeCommitModal();

            const shortSha = newCommit.sha.slice(0, 7);
            const commitUrl = `https://github.com/${repo}/commit/${newCommit.sha}`;
            notify(`🎉 GitHub 커밋 완료! (<a href="${R.safeUrl(commitUrl)}" target="_blank" class="underline font-mono">${shortSha}</a>) 잠시 후 홈페이지에 자동 배포됩니다.`, 'success');
        } catch (err) {
            notify(`❌ 커밋 실패: ${R.escapeHtml(err.message)}`, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '지금 커밋 및 배포하기';
        }
    };

    // ---------------------------------------------------------
    // Tab Switching & Render Dispatch
    // ---------------------------------------------------------
    window.switchAdminTab = function (tabKey) {
        uiState.activeTab = tabKey;
        document.querySelectorAll('.admin-tab').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`tab-btn-${tabKey}`);
        if (activeBtn) activeBtn.classList.add('active');
        renderActiveTab();
    };

    window.switchView = function (viewName) {
        notify(`👀 미리보기 동작: 실제 홈페이지에서는 '${R.escapeHtml(viewName)}' 탭으로 이동합니다.`, 'info');
    };

    function renderActiveTab() {
        const root = document.getElementById('editor-root');
        if (!root) return;

        if (uiState.activeTab === 'members') {
            renderMembersEditor(root);
        } else if (uiState.activeTab === 'repositories') {
            renderRepositoriesEditor(root);
        } else if (uiState.activeTab === 'competitions') {
            renderCompetitionsEditor(root);
        } else if (uiState.activeTab === 'calendar') {
            renderCalendarEditor(root);
        } else if (uiState.activeTab === 'projects') {
            renderProjectsEditor(root);
        } else if (uiState.activeTab === 'challenge') {
            renderChallengeEditor(root);
        }
    }

    // ---------------------------------------------------------
    // TAB: 전체 일정 캘린더 (calendar.json)
    // ---------------------------------------------------------
    function renderCalendarEditor(root) {
        const Cal = window.ClothoidCalendar;
        if (!db.calendar) db.calendar = { events: [] };
        if (!Array.isArray(db.calendar.events)) db.calendar.events = [];
        const events = db.calendar.events;

        if (uiState.selectedCalendarIdx >= events.length) {
            uiState.selectedCalendarIdx = Math.max(0, events.length - 1);
        }
        const cur = events[uiState.selectedCalendarIdx] || null;
        const catEntries = Object.entries(Cal.CALENDAR_CATEGORIES);

        root.innerHTML = `
            <div class="space-y-4">
                <div class="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl px-4 py-3 text-xs leading-relaxed">
                    💡 <strong>안내:</strong> <code>🏆 참가 대회 & 수상경력</code> 탭에 등록한 대회 참가 일정은 <strong>전체 일정 달력에 자동으로 함께 표시</strong>됩니다. 이곳에서는 정기 세미나, 총회, 리크루팅, 해커톤 등 동아리 전반의 일정을 자유롭게 추가하세요!
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div class="lg:col-span-4 bg-white rounded-2xl border border-stone-200 shadow-sm p-4 space-y-3">
                        <div class="flex justify-between items-center">
                            <h2 class="font-black text-base text-stone-900">📅 동아리 일정 (${events.length}건)</h2>
                            <button onclick="addCalendarEvent()" class="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors">
                                + 새 일정 추가
                            </button>
                        </div>

                        <div class="space-y-2 max-h-[62vh] overflow-y-auto pr-1">
                            ${events.length === 0 ? `<p class="text-xs text-stone-400 text-center py-8">등록된 일정이 없습니다.</p>` : ''}
                            ${events.map((ev, idx) => {
                                const cat = Cal.getCategoryInfo(ev.category);
                                return `
                                    <div onclick="selectCalendarEvent(${idx})" class="item-row ${idx === uiState.selectedCalendarIdx ? 'selected' : ''} cursor-pointer p-3 rounded-xl border border-stone-200 hover:border-rose-400 transition-all flex justify-between items-center gap-2">
                                        <div class="min-w-0">
                                            <div class="flex items-center gap-1.5 mb-0.5">
                                                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${cat.badgeCls}">${R.escapeHtml(cat.shortLabel)}</span>
                                                <span class="text-[11px] font-mono font-bold text-stone-500">${R.escapeHtml(ev.date || '')}</span>
                                            </div>
                                            <div class="font-bold text-sm text-stone-900 truncate">${R.escapeHtml(ev.title || '(제목 없음)')}</div>
                                        </div>
                                        <div class="flex items-center gap-1 shrink-0" onclick="event.stopPropagation()">
                                            <button onclick="moveCalendarEvent(${idx}, -1)" class="px-1.5 py-1 text-xs text-stone-500 hover:bg-stone-200 rounded">↑</button>
                                            <button onclick="moveCalendarEvent(${idx}, 1)" class="px-1.5 py-1 text-xs text-stone-500 hover:bg-stone-200 rounded">↓</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <div class="lg:col-span-8">
                        ${cur ? `
                        <div class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                            <div class="xl:col-span-7 bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
                                <div class="flex justify-between items-center border-b border-stone-100 pb-3">
                                    <h3 class="font-black text-base text-stone-900">✏️ 캘린더 일정 편집</h3>
                                    <button onclick="deleteCalendarEvent(${uiState.selectedCalendarIdx})" class="px-2.5 py-1 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-700 rounded-lg">삭제</button>
                                </div>

                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label class="block text-xs font-bold text-stone-700 mb-1">일정 분류 (달력 색상)</label>
                                        <select onchange="updateCalendarEventField('category', this.value)" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white">
                                            ${catEntries.map(([k, v]) => `<option value="${R.escapeHtml(k)}" ${cur.category === k ? 'selected' : ''}>${R.escapeHtml(v.label)}</option>`).join('')}
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-stone-700 mb-1">시간 표기 (선택)</label>
                                        <input type="text" value="${R.escapeHtml(cur.time || '')}" oninput="updateCalendarEventField('time', this.value)"
                                            placeholder="예: 19:00 ~ 21:00 / 종일" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">
                                    </div>
                                </div>

                                <div class="grid grid-cols-2 gap-3">
                                    <div>
                                        <label class="block text-xs font-bold text-stone-700 mb-1">시작일 *</label>
                                        <input type="date" value="${R.escapeHtml(cur.date || '')}" oninput="updateCalendarEventField('date', this.value)"
                                            class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-stone-700 mb-1">종료일 (연속 일정일 때만 선택)</label>
                                        <input type="date" value="${R.escapeHtml(cur.endDate || '')}" oninput="updateCalendarEventField('endDate', this.value)"
                                            class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">
                                    </div>
                                </div>

                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">일정 제목 *</label>
                                    <input type="text" value="${R.escapeHtml(cur.title || '')}" oninput="updateCalendarEventField('title', this.value)"
                                        placeholder="예: 정기 자율주행 세미나 / 개강 총회" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">
                                </div>

                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">장소</label>
                                    <input type="text" value="${R.escapeHtml(cur.location || '')}" oninput="updateCalendarEventField('location', this.value)"
                                        placeholder="예: 동아리방 / 공학관 302호" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">
                                </div>

                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">세부 내용 메모</label>
                                    <textarea rows="3" oninput="updateCalendarEventField('description', this.value)"
                                        placeholder="참석 대상이나 준비물, 세부 안내사항을 입력하세요."
                                        class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">${R.escapeHtml(cur.description || '')}</textarea>
                                </div>
                            </div>

                            <div class="xl:col-span-5 sticky top-32 space-y-3">
                                <span class="text-xs font-black uppercase tracking-wider text-stone-500 block">👀 달력 선택일 상세 카드 미리보기</span>
                                <div id="calendar-live-preview">
                                    ${Cal.renderEventDetailCard(cur)}
                                </div>
                            </div>
                        </div>
                        ` : `<div class="bg-white rounded-2xl p-12 text-center text-stone-400 border border-stone-200">새 일정을 추가해 주세요.</div>`}
                    </div>
                </div>
            </div>
        `;
    }

    window.selectCalendarEvent = function (idx) {
        uiState.selectedCalendarIdx = idx;
        renderActiveTab();
    };
    window.updateCalendarEventField = function (field, value) {
        const cur = db.calendar.events[uiState.selectedCalendarIdx];
        if (!cur) return;
        cur[field] = value;
        updateDirtyIndicators();
        const preview = document.getElementById('calendar-live-preview');
        if (preview && window.ClothoidCalendar) {
            preview.innerHTML = window.ClothoidCalendar.renderEventDetailCard(cur);
        }
        if (field === 'category') renderActiveTab();
    };
    window.addCalendarEvent = function () {
        if (!db.calendar) db.calendar = { events: [] };
        const todayStr = new Date().toISOString().slice(0, 10);
        db.calendar.events.push({
            id: `cal-${Date.now()}`,
            category: 'seminar',
            date: todayStr,
            endDate: '',
            time: '19:00',
            title: '신규 동아리 일정',
            location: '동아리 연구실',
            description: '일정에 대한 상세 안내를 입력하세요.'
        });
        uiState.selectedCalendarIdx = db.calendar.events.length - 1;
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.deleteCalendarEvent = function (idx) {
        const cur = db.calendar.events[idx];
        if (!cur || !confirm(`'${cur.title}' 일정을 삭제하시겠습니까?`)) return;
        db.calendar.events.splice(idx, 1);
        uiState.selectedCalendarIdx = Math.max(0, idx - 1);
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.moveCalendarEvent = function (idx, delta) {
        const arr = db.calendar.events;
        const next = idx + delta;
        if (next < 0 || next >= arr.length) return;
        const [moved] = arr.splice(idx, 1);
        arr.splice(next, 0, moved);
        uiState.selectedCalendarIdx = next;
        updateDirtyIndicators();
        renderActiveTab();
    };

    // ---------------------------------------------------------
    // TAB 1: 크루 & 졸업생 (members.json)
    // ---------------------------------------------------------
    function renderMembersEditor(root) {
        const members = db.members.members || [];
        if (uiState.selectedMemberIdx >= members.length) {
            uiState.selectedMemberIdx = Math.max(0, members.length - 1);
        }

        const filteredIndices = members
            .map((m, idx) => ({ m, idx }))
            .filter(({ m }) => {
                if (uiState.memberFilter !== 'all') {
                    const divs = new Set(m.divisions || []);
                    if (m.isAlumni) divs.add('alumni');
                    if (!divs.has(uiState.memberFilter)) return false;
                }
                if (uiState.memberSearch.trim()) {
                    const q = uiState.memberSearch.trim().toLowerCase();
                    const hay = `${m.cohort || ''} ${m.name || ''} ${m.subtitle || ''} ${m.roleBadge || ''} ${m.specialty || ''} ${(m.tags || []).join(' ')}`.toLowerCase();
                    return hay.includes(q);
                }
                return true;
            });

        const current = members[uiState.selectedMemberIdx] || null;
        const divisionOptions = (db.members.filters || []).filter(f => f.id !== 'all');

        root.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <!-- 좌측: 멤버 목록 -->
                <div class="lg:col-span-4 bg-white rounded-2xl border border-stone-200 shadow-sm p-4 space-y-3">
                    <div class="flex justify-between items-center">
                        <h2 class="font-black text-base text-stone-900">👥 등록된 인원 (${members.length}명)</h2>
                        <button onclick="addMember()" class="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors">
                            + 새 인원 추가
                        </button>
                    </div>

                    <div class="flex gap-2">
                        <input type="text" placeholder="이름, 파트, 태그 검색..." value="${R.escapeHtml(uiState.memberSearch)}"
                            oninput="setMemberSearch(this.value)"
                            class="flex-1 px-3 py-2 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-rose-700">
                        <select onchange="setMemberFilter(this.value)" class="px-2.5 py-2 text-xs rounded-lg border border-stone-300 bg-stone-50 font-semibold">
                            ${(db.members.filters || []).map(f => `<option value="${R.escapeHtml(f.id)}" ${uiState.memberFilter === f.id ? 'selected' : ''}>${R.escapeHtml(f.label)}</option>`).join('')}
                        </select>
                    </div>

                    <div id="member-admin-list" class="space-y-2 max-h-[62vh] overflow-y-auto pr-1">
                        ${filteredIndices.length === 0 ? `<p class="text-xs text-stone-400 text-center py-8">검색 조건에 맞는 인원이 없습니다.</p>` : ''}
                        ${filteredIndices.map(({ m, idx }) => `
                            <div onclick="selectMember(${idx})" class="item-row ${idx === uiState.selectedMemberIdx ? 'selected' : ''} cursor-pointer p-3 rounded-xl border border-stone-200 hover:border-rose-400 transition-all flex justify-between items-center gap-2">
                                <div class="min-w-0">
                                    <div class="flex items-center gap-1.5">
                                        ${m.cohort ? `<span class="text-[10px] px-1.5 py-0.5 rounded font-black bg-rose-900 text-white">${R.escapeHtml(R.formatCohort(m.cohort))}</span>` : ''}
                                        <span class="font-bold text-sm text-stone-900 truncate">${R.escapeHtml(m.name || '(이름 없음)')}</span>
                                        <span class="text-[10px] px-1.5 py-0.5 rounded font-bold ${R.getBadgeClasses(m.badgeTheme, m.isAlumni ? 'dark' : 'stone')}">${R.escapeHtml(m.roleBadge || '')}</span>
                                    </div>
                                    <p class="text-xs text-stone-500 truncate mt-0.5">${R.escapeHtml(m.specialty || '')} · ${R.escapeHtml(m.subtitle || '')}</p>
                                </div>
                                <div class="flex items-center gap-1 shrink-0" onclick="event.stopPropagation()">
                                    <button onclick="moveMember(${idx}, -1)" title="위로 이동" class="px-1.5 py-1 text-xs text-stone-500 hover:bg-stone-200 rounded">↑</button>
                                    <button onclick="moveMember(${idx}, 1)" title="아래로 이동" class="px-1.5 py-1 text-xs text-stone-500 hover:bg-stone-200 rounded">↓</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- 우측: 상세 양식 + 실시간 미리보기 -->
                <div class="lg:col-span-8 space-y-6">
                    ${current ? `
                    <div class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                        <!-- 편집 폼 -->
                        <div class="xl:col-span-7 bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
                            <div class="flex justify-between items-center border-b border-stone-100 pb-3">
                                <h3 class="font-black text-base text-stone-900">✏️ 프로필 양식 편집</h3>
                                <div class="flex gap-2">
                                    <button onclick="duplicateMember(${uiState.selectedMemberIdx})" class="px-2.5 py-1 text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg">복제</button>
                                    <button onclick="deleteMember(${uiState.selectedMemberIdx})" class="px-2.5 py-1 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-700 rounded-lg">삭제</button>
                                </div>
                            </div>

                            <!-- 현역 / 졸업생 구분 -->
                            <div class="bg-stone-50 p-3 rounded-xl border border-stone-200 flex items-center justify-between">
                                <div>
                                    <span class="text-xs font-bold text-stone-800 block">🎓 졸업생(명예의 전당) 카드 스타일 적용</span>
                                    <span class="text-[11px] text-stone-500">켜면 졸업생 전용 배경색 및 로즈 강조 테마가 적용됩니다.</span>
                                </div>
                                <input type="checkbox" ${current.isAlumni ? 'checked' : ''} onchange="updateMemberField('isAlumni', this.checked)"
                                    class="h-5 w-5 rounded text-rose-800 focus:ring-rose-700 cursor-pointer">
                            </div>

                            <div class="grid grid-cols-12 gap-3">
                                <div class="col-span-3">
                                    <label class="block text-xs font-bold text-stone-700 mb-1">기수 *</label>
                                    <input type="text" value="${R.escapeHtml(current.cohort || '')}" oninput="updateMemberField('cohort', this.value)"
                                        placeholder="예: 3기" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                </div>
                                <div class="col-span-4">
                                    <label class="block text-xs font-bold text-stone-700 mb-1">이름 *</label>
                                    <input type="text" value="${R.escapeHtml(current.name || '')}" oninput="updateMemberField('name', this.value)"
                                        placeholder="예: 홍길동" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                </div>
                                <div class="col-span-5">
                                    <label class="block text-xs font-bold text-stone-700 mb-1">아이디 또는 현 소속 (부제)</label>
                                    <input type="text" value="${R.escapeHtml(current.subtitle || '')}" oninput="updateMemberField('subtitle', this.value)"
                                        placeholder="예: ttaehyun / 현 현대자동차" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">좌측 상단 직책/기수 뱃지</label>
                                    <input type="text" value="${R.escapeHtml(current.roleBadge || '')}" oninput="updateMemberField('roleBadge', this.value)"
                                        placeholder="예: 파트원 (Member) / 1기 회장" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">뱃지 색상 테마</label>
                                    <select onchange="updateMemberField('badgeTheme', this.value)" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                        ${themeSelectOptions(current.badgeTheme)}
                                    </select>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">우측 상단 전문분야 / 기업명</label>
                                    <input type="text" value="${R.escapeHtml(current.specialty || '')}" oninput="updateMemberField('specialty', this.value)"
                                        placeholder="예: Perception / SLAM" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">GitHub / 개인 링크 (선택)</label>
                                    <input type="url" value="${R.escapeHtml(current.githubUrl || '')}" oninput="updateMemberField('githubUrl', this.value)"
                                        placeholder="https://github.com/..." class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 font-mono focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-stone-700 mb-1.5">필터 탭 노출 카테고리 (복수 선택 가능)</label>
                                <div class="flex flex-wrap gap-2">
                                    ${divisionOptions.map(opt => {
                                        const checked = (current.divisions || []).includes(opt.id);
                                        return `
                                            <label class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer select-none ${checked ? 'bg-rose-50 border-rose-400 text-rose-900' : 'bg-stone-50 border-stone-200 text-stone-600'}">
                                                <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleMemberDivision('${R.escapeHtml(opt.id)}', this.checked)" class="rounded text-rose-800">
                                                <span>${R.escapeHtml(opt.label)}</span>
                                            </label>
                                        `;
                                    }).join('')}
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-stone-700 mb-1">자기소개 / 담당 연구 설명</label>
                                <textarea rows="3" oninput="updateMemberField('bio', this.value)"
                                    placeholder="담당 파트 및 주요 활동 내용을 적어주세요."
                                    class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">${R.escapeHtml(current.bio || '')}</textarea>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-stone-700 mb-1">하단 해시태그 (쉼표 <code>,</code> 로 구분)</label>
                                <input type="text" value="${R.escapeHtml((current.tags || []).join(', '))}" oninput="updateMemberTags(this.value)"
                                    placeholder="예: LiDAR_3D, OpenCV, ROS2" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                            </div>
                        </div>

                        <!-- 실시간 카드 미리보기 -->
                        <div class="xl:col-span-5 sticky top-32 space-y-3">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-black uppercase tracking-wider text-stone-500">👀 실제 홈페이지 카드 미리보기</span>
                                <span class="text-[11px] text-rose-700 font-semibold">실시간 반영</span>
                            </div>
                            <div id="member-live-preview">
                                ${R.renderMemberCard(current)}
                            </div>
                        </div>
                    </div>
                    ` : `<div class="bg-white rounded-2xl p-12 text-center text-stone-400 border border-stone-200">인원을 선택하거나 새로 추가해 주세요.</div>`}
                </div>
            </div>
        `;
    }

    window.setMemberSearch = function (val) {
        uiState.memberSearch = val;
        renderActiveTab();
    };
    window.setMemberFilter = function (val) {
        uiState.memberFilter = val;
        renderActiveTab();
    };
    window.selectMember = function (idx) {
        uiState.selectedMemberIdx = idx;
        renderActiveTab();
    };
    window.updateMemberField = function (field, value) {
        const current = db.members.members[uiState.selectedMemberIdx];
        if (!current) return;
        current[field] = value;
        if (field === 'isAlumni') {
            if (value) {
                current.badgeTheme = 'dark';
                if (!current.divisions.includes('alumni')) current.divisions.push('alumni');
            } else {
                current.divisions = current.divisions.filter(d => d !== 'alumni');
                if (current.badgeTheme === 'dark') current.badgeTheme = 'stone';
            }
            updateDirtyIndicators();
            renderActiveTab();
            return;
        }
        updateDirtyIndicators();
        const preview = document.getElementById('member-live-preview');
        if (preview) preview.innerHTML = R.renderMemberCard(current);
        if (field === 'badgeTheme') renderActiveTab();
    };
    window.toggleMemberDivision = function (divId, checked) {
        const current = db.members.members[uiState.selectedMemberIdx];
        if (!current) return;
        const set = new Set(current.divisions || []);
        if (checked) set.add(divId);
        else set.delete(divId);
        current.divisions = Array.from(set);
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.updateMemberTags = function (raw) {
        const current = db.members.members[uiState.selectedMemberIdx];
        if (!current) return;
        current.tags = raw.split(',').map(s => s.trim().replace(/^#+/, '')).filter(Boolean);
        updateDirtyIndicators();
        const preview = document.getElementById('member-live-preview');
        if (preview) preview.innerHTML = R.renderMemberCard(current);
    };
    window.addMember = function () {
        const newMember = {
            id: `member-${Date.now()}`,
            cohort: '3기',
            name: '신규 부원',
            subtitle: 'github-id',
            isAlumni: false,
            divisions: ['perception'],
            roleBadge: '파트원 (Member)',
            badgeTheme: 'stone',
            specialty: 'Perception / ROS 2',
            bio: '담당 연구 분야 및 간단한 자기소개를 입력해 주세요.',
            tags: ['ROS2', 'Autonomous_Driving'],
            githubUrl: ''
        };
        db.members.members.push(newMember);
        uiState.selectedMemberIdx = db.members.members.length - 1;
        uiState.memberFilter = 'all';
        uiState.memberSearch = '';
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.duplicateMember = function (idx) {
        const orig = db.members.members[idx];
        if (!orig) return;
        const copy = JSON.parse(JSON.stringify(orig));
        copy.id = `${orig.id || 'member'}-copy-${Date.now()}`;
        copy.name = `${orig.name} (복사본)`;
        db.members.members.splice(idx + 1, 0, copy);
        uiState.selectedMemberIdx = idx + 1;
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.deleteMember = function (idx) {
        const target = db.members.members[idx];
        if (!target) return;
        if (!confirm(`'${target.name}' 프로필 카드를 삭제하시겠습니까?`)) return;
        db.members.members.splice(idx, 1);
        uiState.selectedMemberIdx = Math.max(0, idx - 1);
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.moveMember = function (idx, delta) {
        const arr = db.members.members;
        const next = idx + delta;
        if (next < 0 || next >= arr.length) return;
        const [moved] = arr.splice(idx, 1);
        arr.splice(next, 0, moved);
        uiState.selectedMemberIdx = next;
        updateDirtyIndicators();
        renderActiveTab();
    };

    // ---------------------------------------------------------
    // TAB 2: GitHub 리소스 카드 (repositories.json)
    // ---------------------------------------------------------
    function renderRepositoriesEditor(root) {
        const repos = db.repositories.repositories || [];
        if (uiState.selectedRepoIdx >= repos.length) {
            uiState.selectedRepoIdx = Math.max(0, repos.length - 1);
        }
        const current = repos[uiState.selectedRepoIdx] || null;
        const quickEmojis = ['🏎️', '📚', '💻', '🚀', '🤖', '📡', '🛠️', '📦', '🧠', '⚙️'];

        root.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <!-- 좌측: 카드 리스트 -->
                <div class="lg:col-span-4 bg-white rounded-2xl border border-stone-200 shadow-sm p-4 space-y-3">
                    <div class="flex justify-between items-center">
                        <h2 class="font-black text-base text-stone-900">📦 GitHub 리소스 카드 (${repos.length}개)</h2>
                        <button onclick="addRepoCard()" class="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors">
                            + 새 카드 추가
                        </button>
                    </div>
                    <p class="text-xs text-stone-500">홈 화면 'Clothoid-R 개발 및 교육 리소스' 섹션에 표시되는 카드들입니다.</p>

                    <div class="space-y-2">
                        ${repos.map((r, idx) => `
                            <div onclick="selectRepoCard(${idx})" class="item-row ${idx === uiState.selectedRepoIdx ? 'selected' : ''} cursor-pointer p-3.5 rounded-xl border border-stone-200 hover:border-rose-400 transition-all flex justify-between items-center gap-2">
                                <div class="flex items-center gap-3 min-w-0">
                                    <span class="text-2xl">${R.escapeHtml(r.icon || '📦')}</span>
                                    <div class="min-w-0">
                                        <div class="font-bold text-sm text-stone-900 truncate">${R.escapeHtml(r.title || '(제목 없음)')}</div>
                                        <div class="text-xs text-stone-500 font-mono truncate">${R.escapeHtml(r.repoPath || '')}</div>
                                    </div>
                                </div>
                                <div class="flex items-center gap-1 shrink-0" onclick="event.stopPropagation()">
                                    <button onclick="moveRepoCard(${idx}, -1)" class="px-1.5 py-1 text-xs text-stone-500 hover:bg-stone-200 rounded">↑</button>
                                    <button onclick="moveRepoCard(${idx}, 1)" class="px-1.5 py-1 text-xs text-stone-500 hover:bg-stone-200 rounded">↓</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- 우측: 편집 폼 + 실시간 미리보기 -->
                <div class="lg:col-span-8">
                    ${current ? `
                    <div class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                        <div class="xl:col-span-7 bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
                            <div class="flex justify-between items-center border-b border-stone-100 pb-3">
                                <h3 class="font-black text-base text-stone-900">✏️ 리소스 카드 상세 편집</h3>
                                <div class="flex gap-2">
                                    <button onclick="duplicateRepoCard(${uiState.selectedRepoIdx})" class="px-2.5 py-1 text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg">복제</button>
                                    <button onclick="deleteRepoCard(${uiState.selectedRepoIdx})" class="px-2.5 py-1 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-700 rounded-lg">삭제</button>
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-stone-700 mb-1">좌측 상단 아이콘 (이모지)</label>
                                <div class="flex items-center gap-2 flex-wrap">
                                    <input id="repo-icon-input" type="text" value="${R.escapeHtml(current.icon || '')}" oninput="updateRepoField('icon', this.value)"
                                        class="w-20 px-3 py-2 text-center text-lg rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                    <div class="flex flex-wrap gap-1">
                                        ${quickEmojis.map(em => `<button type="button" onclick="pickRepoEmoji('${em}')" class="px-2 py-1 text-base bg-stone-100 hover:bg-rose-100 rounded-lg border border-stone-200">${em}</button>`).join('')}
                                    </div>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">우측 상단 뱃지 문구</label>
                                    <input type="text" value="${R.escapeHtml(current.badgeText || '')}" oninput="updateRepoField('badgeText', this.value)"
                                        placeholder="예: 대회 메인 / 교육 자료" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">뱃지 색상 테마</label>
                                    <select onchange="updateRepoField('badgeTheme', this.value)" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                        ${themeSelectOptions(current.badgeTheme)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-stone-700 mb-1">카드 제목 *</label>
                                <input type="text" value="${R.escapeHtml(current.title || '')}" oninput="updateRepoField('title', this.value)"
                                    placeholder="예: Clothoid-R Main System" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-stone-700 mb-1">저장소 경로 표기 (부제)</label>
                                <input type="text" value="${R.escapeHtml(current.repoPath || '')}" oninput="updateRepoField('repoPath', this.value)"
                                    placeholder="예: clothoid-r / Clothoid-R" class="w-full px-3 py-2 text-sm font-mono rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-stone-700 mb-1">카드 본문 설명</label>
                                <textarea rows="4" oninput="updateRepoField('description', this.value)"
                                    class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">${R.escapeHtml(current.description || '')}</textarea>
                            </div>

                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">하단 버튼 문구</label>
                                    <input type="text" value="${R.escapeHtml(current.buttonText || '')}" oninput="updateRepoField('buttonText', this.value)"
                                        placeholder="예: 📦 소스코드 탐색하기" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">이동할 URL 링크</label>
                                    <input type="url" value="${R.escapeHtml(current.url || '')}" oninput="updateRepoField('url', this.value)"
                                        placeholder="https://github.com/..." class="w-full px-3 py-2 text-sm font-mono rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                </div>
                            </div>
                        </div>

                        <div class="xl:col-span-5 sticky top-32 space-y-3">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-black uppercase tracking-wider text-stone-500">👀 실제 홈페이지 카드 미리보기</span>
                                <span class="text-[11px] text-rose-700 font-semibold">실시간 반영</span>
                            </div>
                            <div id="repo-live-preview">
                                ${R.renderRepositoryCard(current)}
                            </div>
                        </div>
                    </div>
                    ` : `<div class="bg-white rounded-2xl p-12 text-center text-stone-400 border border-stone-200">리소스 카드를 추가해 주세요.</div>`}
                </div>
            </div>
        `;
    }

    window.selectRepoCard = function (idx) {
        uiState.selectedRepoIdx = idx;
        renderActiveTab();
    };
    window.pickRepoEmoji = function (emoji) {
        const input = document.getElementById('repo-icon-input');
        if (input) input.value = emoji;
        window.updateRepoField('icon', emoji);
    };
    window.updateRepoField = function (field, value) {
        const current = db.repositories.repositories[uiState.selectedRepoIdx];
        if (!current) return;
        current[field] = value;
        updateDirtyIndicators();
        const preview = document.getElementById('repo-live-preview');
        if (preview) preview.innerHTML = R.renderRepositoryCard(current);
    };
    window.addRepoCard = function () {
        db.repositories.repositories.push({
            id: `repo-${Date.now()}`,
            icon: '🚀',
            badgeText: '신규 리소스',
            badgeTheme: 'rose-soft',
            title: 'New Repository Title',
            repoPath: 'clothoid-r / repository-name',
            description: '저장소의 핵심 기능과 활용 방법을 소개하는 설명을 입력하세요.',
            buttonText: '📦 소스코드 탐색하기',
            url: 'https://github.com/clothoid-r'
        });
        uiState.selectedRepoIdx = db.repositories.repositories.length - 1;
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.duplicateRepoCard = function (idx) {
        const orig = db.repositories.repositories[idx];
        if (!orig) return;
        const copy = JSON.parse(JSON.stringify(orig));
        copy.id = `repo-${Date.now()}`;
        copy.title = `${orig.title} (복사본)`;
        db.repositories.repositories.splice(idx + 1, 0, copy);
        uiState.selectedRepoIdx = idx + 1;
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.deleteRepoCard = function (idx) {
        const orig = db.repositories.repositories[idx];
        if (!orig) return;
        if (!confirm(`'${orig.title}' 카드를 삭제하시겠습니까?`)) return;
        db.repositories.repositories.splice(idx, 1);
        uiState.selectedRepoIdx = Math.max(0, idx - 1);
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.moveRepoCard = function (idx, delta) {
        const arr = db.repositories.repositories;
        const next = idx + delta;
        if (next < 0 || next >= arr.length) return;
        const [moved] = arr.splice(idx, 1);
        arr.splice(next, 0, moved);
        uiState.selectedRepoIdx = next;
        updateDirtyIndicators();
        renderActiveTab();
    };

    // ---------------------------------------------------------
    // TAB 2.5: 참가 대회 & 수상경력 (competitions.json)
    // ---------------------------------------------------------
    function renderCompetitionsEditor(root) {
        if (!db.competitions) db.competitions = { schedule: [], competitions: [] };
        if (!Array.isArray(db.competitions.schedule)) db.competitions.schedule = [];
        if (!Array.isArray(db.competitions.competitions)) db.competitions.competitions = [];

        const comps = db.competitions.competitions;
        const scheds = db.competitions.schedule;

        const subTabHeader = `
            <div class="flex flex-wrap gap-2 mb-5">
                <button onclick="switchCompSubTab('cards')" class="sub-tab ${uiState.compSubTab === 'cards' ? 'active' : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'} px-4 py-2 rounded-xl text-xs font-bold transition-colors">
                    🏆 참가 대회 & 수상·상장 카드 (${comps.length}개)
                </button>
                <button onclick="switchCompSubTab('schedule')" class="sub-tab ${uiState.compSubTab === 'schedule' ? 'active' : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'} px-4 py-2 rounded-xl text-xs font-bold transition-colors">
                    📅 주요 대회 참가 일정 & D-Day (${scheds.length}개)
                </button>
            </div>
        `;

        if (uiState.compSubTab === 'schedule') {
            if (uiState.selectedCompSchedIdx >= scheds.length) {
                uiState.selectedCompSchedIdx = Math.max(0, scheds.length - 1);
            }
            const curSched = scheds[uiState.selectedCompSchedIdx] || null;

            root.innerHTML = `
                ${subTabHeader}
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div class="lg:col-span-4 bg-white rounded-2xl border border-stone-200 shadow-sm p-4 space-y-3">
                        <div class="flex justify-between items-center">
                            <h2 class="font-black text-base text-stone-900">📅 대회 일정 (${scheds.length}건)</h2>
                            <button onclick="addCompSched()" class="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors">
                                + 새 일정 추가
                            </button>
                        </div>
                        <p class="text-xs text-stone-500">시작 날짜를 지정하면 홈페이지에서 오늘 날짜 기준으로 <strong>D-Day / 진행 중 / 종료</strong>가 자동 표시됩니다.</p>

                        <div class="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                            ${scheds.length === 0 ? `<p class="text-xs text-stone-400 text-center py-8">등록된 대회 일정이 없습니다.</p>` : ''}
                            ${scheds.map((s, idx) => `
                                <div onclick="selectCompSched(${idx})" class="item-row ${idx === uiState.selectedCompSchedIdx ? 'selected' : ''} cursor-pointer p-3 rounded-xl border border-stone-200 hover:border-rose-400 transition-all flex justify-between items-center gap-2">
                                    <div class="min-w-0">
                                        <div class="text-[11px] font-mono font-bold text-rose-800">${R.escapeHtml(s.dateLabel || s.date || '일정 미정')}</div>
                                        <div class="font-bold text-sm text-stone-900 truncate">${R.escapeHtml(s.title || '(일정명 없음)')}</div>
                                        <div class="text-xs text-stone-500 truncate">${R.escapeHtml(s.location || '')}</div>
                                    </div>
                                    <div class="flex items-center gap-1 shrink-0" onclick="event.stopPropagation()">
                                        <button onclick="moveCompSched(${idx}, -1)" class="px-1.5 py-1 text-xs text-stone-500 hover:bg-stone-200 rounded">↑</button>
                                        <button onclick="moveCompSched(${idx}, 1)" class="px-1.5 py-1 text-xs text-stone-500 hover:bg-stone-200 rounded">↓</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="lg:col-span-8 space-y-6">
                        ${curSched ? `
                        <div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
                            <div class="flex justify-between items-center border-b border-stone-100 pb-3">
                                <h3 class="font-black text-base text-stone-900">✏️ 대회 일정 상세 편집</h3>
                                <button onclick="deleteCompSched(${uiState.selectedCompSchedIdx})" class="px-2.5 py-1 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-700 rounded-lg">삭제</button>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">시작일 (D-Day 기준)</label>
                                    <input type="date" value="${R.escapeHtml(curSched.date || '')}" oninput="updateCompSchedField('date', this.value)"
                                        class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">종료일 (다일 행사 시 선택)</label>
                                    <input type="date" value="${R.escapeHtml(curSched.endDate || '')}" oninput="updateCompSchedField('endDate', this.value)"
                                        class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">날짜 직접 표기 (미정 시)</label>
                                    <input type="text" value="${R.escapeHtml(curSched.dateLabel || '')}" oninput="updateCompSchedField('dateLabel', this.value)"
                                        placeholder="비워두면 날짜 자동 표기" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-stone-700 mb-1">일정 제목 *</label>
                                <input type="text" value="${R.escapeHtml(curSched.title || '')}" oninput="updateCompSchedField('title', this.value)"
                                    placeholder="예: 2026 대학생 자작자동차대회 본선 주행" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">대회 분류 라벨</label>
                                    <input type="text" value="${R.escapeHtml(curSched.competitionName || '')}" oninput="updateCompSchedField('competitionName', this.value)"
                                        placeholder="예: KSAE 자율주행 부문" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">개최 장소</label>
                                    <input type="text" value="${R.escapeHtml(curSched.location || '')}" oninput="updateCompSchedField('location', this.value)"
                                        placeholder="예: 군산 새만금자동차경주장" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">우측 상태 뱃지 문구</label>
                                    <input type="text" value="${R.escapeHtml(curSched.status || '')}" oninput="updateCompSchedField('status', this.value)"
                                        placeholder="예: 주요 출전 / 접수 예정 / 준비 중 🔥" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">상태 뱃지 색상 테마</label>
                                    <select onchange="updateCompSchedField('badgeTheme', this.value)" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white">
                                        ${themeSelectOptions(curSched.badgeTheme)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="space-y-2">
                            <span class="text-xs font-black uppercase tracking-wider text-stone-500 block">👀 실제 홈페이지 일정 보드 미리보기</span>
                            <div id="comp-sched-live-preview" class="bg-stone-100/80 border border-stone-200 rounded-2xl p-5 space-y-2.5">
                                ${scheds.map(R.renderCompetitionScheduleItem).join('')}
                            </div>
                        </div>
                        ` : `<div class="bg-white rounded-2xl p-12 text-center text-stone-400 border border-stone-200">새 대회 일정을 추가해 주세요.</div>`}
                    </div>
                </div>
            `;
            return;
        }

        if (uiState.selectedCompIdx >= comps.length) {
            uiState.selectedCompIdx = Math.max(0, comps.length - 1);
        }
        const current = comps[uiState.selectedCompIdx] || null;
        const pendingImg = current && current.certificateImage ? pendingImageUploads[current.certificateImage] : null;
        const previewImgSrc = current && current.certificateImage ? resolveAdminImage(current.certificateImage) : '';

        root.innerHTML = `
            ${subTabHeader}
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <!-- 좌측: 대회 목록 -->
                <div class="lg:col-span-4 bg-white rounded-2xl border border-stone-200 shadow-sm p-4 space-y-3">
                    <div class="flex justify-between items-center">
                        <h2 class="font-black text-base text-stone-900">🏆 참가 대회 (${comps.length}개)</h2>
                        <button onclick="addCompCard()" class="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors">
                            + 새 대회 추가
                        </button>
                    </div>
                    <p class="text-xs text-stone-500">출전 대회 정보와 수상 내역, 상장 이미지를 한 카드 안에서 함께 관리합니다.</p>

                    <div class="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
                        ${comps.length === 0 ? `<p class="text-xs text-stone-400 text-center py-8">등록된 대회가 없습니다.</p>` : ''}
                        ${comps.map((c, idx) => `
                            <div onclick="selectCompCard(${idx})" class="item-row ${idx === uiState.selectedCompIdx ? 'selected' : ''} cursor-pointer p-3.5 rounded-xl border border-stone-200 hover:border-rose-400 transition-all flex justify-between items-center gap-2">
                                <div class="min-w-0">
                                    <div class="flex items-center gap-1.5 mb-0.5">
                                        <span class="bg-stone-900 text-white text-[10px] font-black px-1.5 py-0.5 rounded">${R.escapeHtml(c.year || '')}</span>
                                        ${c.awardTitle ? `<span class="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">🏆 수상</span>` : ''}
                                        ${c.certificateImage ? `<span class="text-[10px] bg-rose-50 text-rose-800 font-bold px-1.5 py-0.5 rounded">📜 상장</span>` : ''}
                                    </div>
                                    <div class="font-bold text-sm text-stone-900 truncate">${R.escapeHtml(c.title || '(대회명 없음)')}</div>
                                    <div class="text-xs text-stone-500 truncate">${R.escapeHtml(c.awardTitle || c.organizer || '')}</div>
                                </div>
                                <div class="flex items-center gap-1 shrink-0" onclick="event.stopPropagation()">
                                    <button onclick="moveCompCard(${idx}, -1)" class="px-1.5 py-1 text-xs text-stone-500 hover:bg-stone-200 rounded">↑</button>
                                    <button onclick="moveCompCard(${idx}, 1)" class="px-1.5 py-1 text-xs text-stone-500 hover:bg-stone-200 rounded">↓</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- 우측: 대회/수상/상장 편집 + 실시간 미리보기 -->
                <div class="lg:col-span-8">
                    ${current ? `
                    <div class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                        <div class="xl:col-span-7 bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
                            <div class="flex justify-between items-center border-b border-stone-100 pb-3">
                                <h3 class="font-black text-base text-stone-900">✏️ 대회 및 수상경력 편집</h3>
                                <div class="flex gap-2">
                                    <button onclick="duplicateCompCard(${uiState.selectedCompIdx})" class="px-2.5 py-1 text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg">복제</button>
                                    <button onclick="deleteCompCard(${uiState.selectedCompIdx})" class="px-2.5 py-1 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-700 rounded-lg">삭제</button>
                                </div>
                            </div>

                            <div class="grid grid-cols-3 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">개최 연도 / 시기</label>
                                    <input type="text" value="${R.escapeHtml(current.year || '')}" oninput="updateCompField('year', this.value)"
                                        placeholder="예: 2025" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">우측 상태 뱃지</label>
                                    <input type="text" value="${R.escapeHtml(current.statusBadge || '')}" oninput="updateCompField('statusBadge', this.value)"
                                        placeholder="예: 수상 달성 / 본선 진출" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">뱃지 색상 테마</label>
                                    <select onchange="updateCompField('badgeTheme', this.value)" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                        ${themeSelectOptions(current.badgeTheme)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-stone-700 mb-1">대회명 *</label>
                                <input type="text" value="${R.escapeHtml(current.title || '')}" oninput="updateCompField('title', this.value)"
                                    placeholder="예: 대학생 자작자동차대회 자율주행 부문" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                            </div>

                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">주최 / 주관 기관</label>
                                    <input type="text" value="${R.escapeHtml(current.organizer || '')}" oninput="updateCompField('organizer', this.value)"
                                        placeholder="예: 한국자동차공학회 (KSAE)" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">출전 부문 / 플랫폼</label>
                                    <input type="text" value="${R.escapeHtml(current.category || '')}" oninput="updateCompField('category', this.value)"
                                        placeholder="예: ERP-42 실차 플랫폼" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-stone-700 mb-1">대회 소개 및 동아리 출전 내용</label>
                                <textarea rows="3" oninput="updateCompField('description', this.value)"
                                    placeholder="대회 미션 구성 및 동아리에서 적용한 주요 기술·성과를 작성해 주세요."
                                    class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">${R.escapeHtml(current.description || '')}</textarea>
                            </div>

                            <!-- 수상경력 & 상장 이미지 전용 박스 -->
                            <div class="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 space-y-3">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-black text-amber-900">🏅 수상경력 및 상장 이미지 (선택 입력)</span>
                                    <span class="text-[11px] text-amber-700">참가 예정 대회는 비워두셔도 됩니다</span>
                                </div>

                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label class="block text-xs font-bold text-stone-700 mb-1">수상 실적명 (수상경력 칸)</label>
                                        <input type="text" value="${R.escapeHtml(current.awardTitle || '')}" oninput="updateCompField('awardTitle', this.value)"
                                            placeholder="예: 🏆 대상 / 최우수상 / 장려상" class="w-full px-3 py-2 text-sm rounded-lg border border-amber-300 bg-white focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-stone-700 mb-1">수상 세부 내역 / 팀명</label>
                                        <input type="text" value="${R.escapeHtml(current.awardSubtext || '')}" oninput="updateCompField('awardSubtext', this.value)"
                                            placeholder="예: 자율주행 종합 2위 · Clothoid-R 팀" class="w-full px-3 py-2 text-sm rounded-lg border border-amber-300 bg-white focus:ring-2 focus:ring-rose-700 focus:outline-none">
                                    </div>
                                </div>

                                <div class="pt-1 space-y-2">
                                    <label class="block text-xs font-bold text-stone-700">📜 상장 / 증빙 파일 첨부 (이미지 또는 PDF)</label>
                                    <div class="flex flex-wrap items-center gap-2">
                                        <label class="cursor-pointer px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1.5">
                                            <span>📎 내 PC에서 상장 파일 선택 (이미지 / PDF)</span>
                                            <input type="file" accept="image/*,application/pdf,.pdf" onchange="handleCertificateUpload(this)" class="hidden">
                                        </label>
                                        ${current.certificateImage ? `
                                            <button type="button" onclick="clearCertificateImage()" class="px-3 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 text-xs font-bold rounded-lg">
                                                첨부 제거
                                            </button>
                                        ` : ''}
                                        ${pendingImg ? `
                                            <button type="button" onclick="downloadPendingCertImage()" class="px-3 py-2 bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 text-xs font-semibold rounded-lg">
                                                💾 첨부 파일 다운로드
                                            </button>
                                        ` : ''}
                                    </div>

                                    ${previewImgSrc ? `
                                        <div class="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-amber-200 mt-2">
                                            ${R.isPdfPath(current.certificateImage, previewImgSrc)
                                                ? `<div class="h-16 w-14 rounded border border-stone-200 bg-rose-900 text-white flex flex-col items-center justify-center shrink-0">
                                                       <span class="text-lg">📄</span>
                                                       <span class="text-[10px] font-black mt-0.5">PDF</span>
                                                   </div>`
                                                : `<img src="${previewImgSrc}" alt="상장 미리보기" class="h-16 w-14 object-cover rounded border border-stone-200 bg-stone-50 shrink-0">`
                                            }
                                            <div class="min-w-0 flex-1 text-xs">
                                                <div class="font-mono text-stone-700 truncate">${R.escapeHtml(current.certificateImage)}</div>
                                                <div class="text-emerald-700 font-semibold mt-0.5">
                                                    ${pendingImg ? '✨ 커밋 시 GitHub image/awards/ 폴더에 함께 업로드됩니다!' : '등록된 상장 파일 경로'}
                                                </div>
                                            </div>
                                        </div>
                                    ` : ''}

                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                                        <div>
                                            <label class="block text-[11px] font-semibold text-stone-600 mb-1">상장 설명 문구 (캡션)</label>
                                            <input type="text" value="${R.escapeHtml(current.certificateCaption || '')}" oninput="updateCompField('certificateCaption', this.value)"
                                                placeholder="예: 2025 KSAE 대학생 자작자동차대회 우수상 상장" class="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 bg-white">
                                        </div>
                                        <div>
                                            <label class="block text-[11px] font-semibold text-stone-600 mb-1">파일 경로 또는 외부 URL 직접 입력</label>
                                            <input type="text" value="${R.escapeHtml(current.certificateImage || '')}" oninput="updateCompField('certificateImage', this.value)"
                                                placeholder="image/awards/....pdf / .jpg 또는 https://..." class="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-stone-300 bg-white">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-stone-700 mb-1">대회 관련 외부 링크 (선택 - 기사/영상/공식사이트)</label>
                                <input type="url" value="${R.escapeHtml(current.url || '')}" oninput="updateCompField('url', this.value)"
                                    placeholder="https://..." class="w-full px-3 py-2 text-sm font-mono rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                            </div>
                        </div>

                        <!-- 우측 실시간 카드 미리보기 -->
                        <div class="xl:col-span-5 sticky top-32 space-y-3">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-black uppercase tracking-wider text-stone-500">👀 실제 홈페이지 카드 미리보기</span>
                                <span class="text-[11px] text-rose-700 font-semibold">상장 클릭 시 확대 테스트 가능</span>
                            </div>
                            <div id="comp-live-preview">
                                ${R.renderCompetitionCard(current, { resolveImage: resolveAdminImage })}
                            </div>
                        </div>
                    </div>
                    ` : `<div class="bg-white rounded-2xl p-12 text-center text-stone-400 border border-stone-200">참가 대회를 추가해 주세요.</div>`}
                </div>
            </div>
        `;
    }

    window.switchCompSubTab = function (sub) {
        uiState.compSubTab = sub;
        renderActiveTab();
    };
    window.selectCompSched = function (idx) {
        uiState.selectedCompSchedIdx = idx;
        renderActiveTab();
    };
    window.updateCompSchedField = function (field, value) {
        const cur = db.competitions.schedule[uiState.selectedCompSchedIdx];
        if (!cur) return;
        cur[field] = value;
        updateDirtyIndicators();
        const preview = document.getElementById('comp-sched-live-preview');
        if (preview) {
            preview.innerHTML = db.competitions.schedule.map(R.renderCompetitionScheduleItem).join('');
        }
        if (field === 'badgeTheme') renderActiveTab();
    };
    window.addCompSched = function () {
        if (!Array.isArray(db.competitions.schedule)) db.competitions.schedule = [];
        const todayStr = new Date().toISOString().slice(0, 10);
        db.competitions.schedule.push({
            id: `sched-${Date.now()}`,
            date: todayStr,
            endDate: '',
            dateLabel: '',
            title: '신규 대회 참가 일정',
            competitionName: '자율주행 대회',
            location: '장소 입력',
            status: '예정',
            badgeTheme: 'rose-soft'
        });
        uiState.selectedCompSchedIdx = db.competitions.schedule.length - 1;
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.deleteCompSched = function (idx) {
        const cur = db.competitions.schedule[idx];
        if (!cur || !confirm(`'${cur.title}' 일정을 삭제하시겠습니까?`)) return;
        db.competitions.schedule.splice(idx, 1);
        uiState.selectedCompSchedIdx = Math.max(0, idx - 1);
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.moveCompSched = function (idx, delta) {
        const arr = db.competitions.schedule;
        const next = idx + delta;
        if (next < 0 || next >= arr.length) return;
        const [moved] = arr.splice(idx, 1);
        arr.splice(next, 0, moved);
        uiState.selectedCompSchedIdx = next;
        updateDirtyIndicators();
        renderActiveTab();
    };

    window.selectCompCard = function (idx) {
        uiState.selectedCompIdx = idx;
        renderActiveTab();
    };
    window.updateCompField = function (field, value) {
        const current = db.competitions.competitions[uiState.selectedCompIdx];
        if (!current) return;
        current[field] = value;
        updateDirtyIndicators();
        const preview = document.getElementById('comp-live-preview');
        if (preview) {
            preview.innerHTML = R.renderCompetitionCard(current, { resolveImage: resolveAdminImage });
        }
        if (field === 'badgeTheme') renderActiveTab();
    };
    window.addCompCard = function () {
        if (!db.competitions) db.competitions = { competitions: [] };
        db.competitions.competitions.unshift({
            id: `comp-${Date.now()}`,
            year: String(new Date().getFullYear()),
            statusBadge: '수상 달성',
            badgeTheme: 'amber',
            organizer: '주최 기관명',
            title: '신규 참가 대회명',
            category: '자율주행 부문',
            description: '대회 미션과 동아리 참가 활동 내용을 입력해 주세요.',
            awardTitle: '🏆 우수상',
            awardSubtext: 'Clothoid-R 팀',
            certificateImage: '',
            certificateCaption: '',
            url: ''
        });
        uiState.selectedCompIdx = 0;
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.duplicateCompCard = function (idx) {
        const orig = db.competitions.competitions[idx];
        if (!orig) return;
        const copy = JSON.parse(JSON.stringify(orig));
        copy.id = `comp-${Date.now()}`;
        copy.title = `${orig.title} (복사본)`;
        db.competitions.competitions.splice(idx + 1, 0, copy);
        uiState.selectedCompIdx = idx + 1;
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.deleteCompCard = function (idx) {
        const orig = db.competitions.competitions[idx];
        if (!orig) return;
        if (!confirm(`'${orig.title}' 대회 카드를 삭제하시겠습니까?`)) return;
        db.competitions.competitions.splice(idx, 1);
        uiState.selectedCompIdx = Math.max(0, idx - 1);
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.moveCompCard = function (idx, delta) {
        const arr = db.competitions.competitions;
        const next = idx + delta;
        if (next < 0 || next >= arr.length) return;
        const [moved] = arr.splice(idx, 1);
        arr.splice(next, 0, moved);
        uiState.selectedCompIdx = next;
        updateDirtyIndicators();
        renderActiveTab();
    };

    function compressOrReadImage(file, maxDim = 1800) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
            reader.onload = () => {
                const rawDataUrl = reader.result;
                const img = new Image();
                img.onerror = () => reject(new Error('올바른 이미지 형식이 아닙니다.'));
                img.onload = () => {
                    const isPng = file.type === 'image/png' && file.size <= 1200 * 1024;
                    let w = img.width;
                    let h = img.height;
                    if (w <= maxDim && h <= maxDim && file.size <= 1500 * 1024) {
                        const base64 = String(rawDataUrl).split(',')[1] || '';
                        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
                        resolve({ dataUrl: rawDataUrl, base64, ext });
                        return;
                    }
                    if (w > maxDim || h > maxDim) {
                        const ratio = Math.min(maxDim / w, maxDim / h);
                        w = Math.round(w * ratio);
                        h = Math.round(h * ratio);
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    if (!isPng) {
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, w, h);
                    }
                    ctx.drawImage(img, 0, 0, w, h);
                    const mime = isPng ? 'image/png' : 'image/jpeg';
                    const ext = isPng ? 'png' : 'jpg';
                    const outDataUrl = canvas.toDataURL(mime, 0.88);
                    const base64 = outDataUrl.split(',')[1] || '';
                    resolve({ dataUrl: outDataUrl, base64, ext });
                };
                img.src = rawDataUrl;
            };
            reader.readAsDataURL(file);
        });
    }

    function readPdfFile(file) {
        return new Promise((resolve, reject) => {
            if (file.size > 25 * 1024 * 1024) {
                reject(new Error('PDF 파일 크기는 25MB 이하로 업로드해 주세요.'));
                return;
            }
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('PDF 파일을 읽지 못했습니다.'));
            reader.onload = () => {
                const rawDataUrl = String(reader.result || '');
                const base64 = rawDataUrl.split(',')[1] || '';
                const blobUrl = URL.createObjectURL(file);
                resolve({ dataUrl: blobUrl, base64, ext: 'pdf', isPdf: true });
            };
            reader.readAsDataURL(file);
        });
    }

    window.handleCertificateUpload = async function (inputEl) {
        const file = inputEl && inputEl.files && inputEl.files[0];
        if (!file) return;
        const current = db.competitions.competitions[uiState.selectedCompIdx];
        if (!current) return;

        try {
            const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
            const { dataUrl, base64, ext } = isPdf
                ? await readPdfFile(file)
                : await compressOrReadImage(file);
            const yearPrefix = String(current.year || new Date().getFullYear()).replace(/[^0-9a-zA-Z_-]/g, '') || 'award';
            const baseStem = file.name.replace(/\.[^.]+$/, '').replace(/[^0-9a-zA-Z가-힣_-]/g, '-').slice(0, 30) || 'certificate';
            const stamp = String(Date.now()).slice(-5);
            const filename = `${yearPrefix}-${baseStem}-${stamp}.${ext}`;
            const repoPath = `image/awards/${filename}`;

            pendingImageUploads[repoPath] = {
                repoPath,
                filename,
                base64,
                dataUrl,
                isPdf
            };

            current.certificateImage = repoPath;
            if (!current.certificateCaption) {
                current.certificateCaption = `${current.title || ''} ${current.awardTitle || '상장'}`.trim();
            }

            updateDirtyIndicators();
            renderActiveTab();
            notify(`📜 상장 ${isPdf ? 'PDF 문서' : '이미지'}가 첨부되었습니다! 우측 미리보기에서 클릭해 바로 열어볼 수 있으며, GitHub 커밋 시 함께 업로드됩니다.`, 'success');
        } catch (err) {
            notify(`❌ 파일 처리 오류: ${R.escapeHtml(err.message)}`, 'error');
        } finally {
            inputEl.value = '';
        }
    };

    window.clearCertificateImage = function () {
        const current = db.competitions.competitions[uiState.selectedCompIdx];
        if (!current) return;
        if (current.certificateImage && pendingImageUploads[current.certificateImage]) {
            delete pendingImageUploads[current.certificateImage];
        }
        current.certificateImage = '';
        updateDirtyIndicators();
        renderActiveTab();
    };

    window.downloadPendingCertImage = function () {
        const current = db.competitions.competitions[uiState.selectedCompIdx];
        if (!current || !current.certificateImage) return;
        const pending = pendingImageUploads[current.certificateImage];
        if (!pending) return;
        const a = document.createElement('a');
        a.href = pending.dataUrl;
        a.download = pending.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        notify(`💾 <strong>${R.escapeHtml(pending.filename)}</strong> 이미지를 다운로드했습니다. 로컬 테스트 시 <code>image/awards/</code> 폴더에 넣어주세요.`, 'info');
    };

    // ---------------------------------------------------------
    // TAB 3: 활성 프로젝트 카드 (projects.json)
    // ---------------------------------------------------------
    function renderProjectsEditor(root) {
        const projects = db.projects.projects || [];
        if (uiState.selectedProjectIdx >= projects.length) {
            uiState.selectedProjectIdx = Math.max(0, projects.length - 1);
        }
        const current = projects[uiState.selectedProjectIdx] || null;

        root.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div class="lg:col-span-4 bg-white rounded-2xl border border-stone-200 shadow-sm p-4 space-y-3">
                    <div class="flex justify-between items-center">
                        <h2 class="font-black text-base text-stone-900">🚀 활성 프로젝트 (${projects.length}개)</h2>
                        <button onclick="addProjectCard()" class="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors">
                            + 새 프로젝트 추가
                        </button>
                    </div>
                    <div class="space-y-2">
                        ${projects.map((p, idx) => `
                            <div onclick="selectProjectCard(${idx})" class="item-row ${idx === uiState.selectedProjectIdx ? 'selected' : ''} cursor-pointer p-3.5 rounded-xl border border-stone-200 hover:border-rose-400 transition-all flex justify-between items-center gap-2">
                                <div class="min-w-0">
                                    <div class="flex items-center gap-1.5">
                                        <span class="text-[10px] font-bold px-2 py-0.5 rounded ${p.featured ? 'bg-rose-800 text-white' : 'bg-stone-200 text-stone-700'}">${p.featured ? '배너형(2칸)' : '일반(1칸)'}</span>
                                        <span class="font-bold text-sm text-stone-900 truncate">${R.escapeHtml(p.title || '')}</span>
                                    </div>
                                </div>
                                <div class="flex items-center gap-1 shrink-0" onclick="event.stopPropagation()">
                                    <button onclick="moveProjectCard(${idx}, -1)" class="px-1.5 py-1 text-xs text-stone-500 hover:bg-stone-200 rounded">↑</button>
                                    <button onclick="moveProjectCard(${idx}, 1)" class="px-1.5 py-1 text-xs text-stone-500 hover:bg-stone-200 rounded">↓</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="lg:col-span-8 space-y-6">
                    ${current ? `
                    <div class="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
                        <div class="flex justify-between items-center border-b border-stone-100 pb-3">
                            <h3 class="font-black text-base text-stone-900">✏️ 프로젝트 카드 편집</h3>
                            <button onclick="deleteProjectCard(${uiState.selectedProjectIdx})" class="px-2.5 py-1 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-700 rounded-lg">삭제</button>
                        </div>

                        <div class="bg-stone-50 p-3 rounded-xl border border-stone-200 flex items-center justify-between">
                            <div>
                                <span class="text-xs font-bold text-stone-800 block">🌟 메인 하이라이트 배너형 카드 (2칸 넓이 + 우측 다크로즈 강조 박스)</span>
                                <span class="text-[11px] text-stone-500">끄면 일반 연구과제 카드(1칸 넓이)로 표시됩니다.</span>
                            </div>
                            <input type="checkbox" ${current.featured ? 'checked' : ''} onchange="toggleProjectFeatured(this.checked)"
                                class="h-5 w-5 rounded text-rose-800 cursor-pointer">
                        </div>

                        <div>
                            <div class="flex justify-between items-center mb-1.5">
                                <label class="text-xs font-bold text-stone-700">상단 뱃지 목록</label>
                                <button type="button" onclick="addProjectBadge()" class="text-xs text-rose-800 font-bold hover:underline">+ 뱃지 추가</button>
                            </div>
                            <div class="space-y-2">
                                ${(current.badges || []).map((b, bIdx) => `
                                    <div class="flex gap-2 items-center">
                                        <input type="text" value="${R.escapeHtml(b.text || '')}" oninput="updateProjectBadge(${bIdx}, 'text', this.value)"
                                            placeholder="뱃지 문구" class="flex-1 px-3 py-1.5 text-xs rounded-lg border border-stone-300">
                                        <select onchange="updateProjectBadge(${bIdx}, 'theme', this.value)" class="px-2.5 py-1.5 text-xs rounded-lg border border-stone-300 bg-white">
                                            ${themeSelectOptions(b.theme)}
                                        </select>
                                        <button type="button" onclick="removeProjectBadge(${bIdx})" class="text-xs text-red-600 px-2 py-1 hover:bg-red-50 rounded">삭제</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-stone-700 mb-1">프로젝트 제목</label>
                            <input type="text" value="${R.escapeHtml(current.title || '')}" oninput="updateProjectField('title', this.value)"
                                class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-stone-700 mb-1">프로젝트 설명</label>
                            <textarea rows="3" oninput="updateProjectField('description', this.value)"
                                class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 focus:ring-2 focus:ring-rose-700 focus:outline-none">${R.escapeHtml(current.description || '')}</textarea>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-bold text-stone-700 mb-1">클릭 시 동작 방식</label>
                                <select onchange="changeProjectActionType(this.value)" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white">
                                    <option value="view" ${current.actionType === 'view' ? 'selected' : ''}>홈페이지 내부 탭 이동 (예: project)</option>
                                    <option value="url" ${current.actionType === 'url' ? 'selected' : ''}>외부 링크(URL) 새 창 열기</option>
                                    <option value="none" ${(!current.actionType || current.actionType === 'none') ? 'selected' : ''}>클릭 동작 없음</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-stone-700 mb-1">이동 대상 (뷰 이름 또는 URL)</label>
                                <input type="text" value="${R.escapeHtml(current.actionTarget || '')}" oninput="updateProjectField('actionTarget', this.value)"
                                    placeholder="project 또는 https://..." class="w-full px-3 py-2 text-sm font-mono rounded-lg border border-stone-300">
                            </div>
                        </div>

                        ${current.featured ? `
                        <div class="border-t border-stone-100 pt-4 space-y-3">
                            <div>
                                <label class="block text-xs font-bold text-stone-700 mb-1">하단 안내 링크 문구 (CTA)</label>
                                <input type="text" value="${R.escapeHtml(current.ctaText || '')}" oninput="updateProjectField('ctaText', this.value)"
                                    class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">
                            </div>
                            <div class="grid grid-cols-3 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">우측 박스 아이콘</label>
                                    <input type="text" value="${R.escapeHtml((current.sideHighlight && current.sideHighlight.icon) || '')}" oninput="updateProjectSide('icon', this.value)"
                                        class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 text-center">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">우측 박스 소제목</label>
                                    <input type="text" value="${R.escapeHtml((current.sideHighlight && current.sideHighlight.caption) || '')}" oninput="updateProjectSide('caption', this.value)"
                                        class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">우측 핵심 문구 (줄바꿈 가능)</label>
                                    <textarea rows="2" oninput="updateProjectSide('headline', this.value)"
                                        class="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300">${R.escapeHtml((current.sideHighlight && current.sideHighlight.headline) || '')}</textarea>
                                </div>
                            </div>
                        </div>
                        ` : `
                        <div>
                            <label class="block text-xs font-bold text-stone-700 mb-1">하단 진행 상태 문구</label>
                            <input type="text" value="${R.escapeHtml(current.statusText || '')}" oninput="updateProjectField('statusText', this.value)"
                                placeholder="예: 진행 중 (Q3 배포 예정)" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">
                        </div>
                        `}
                    </div>

                    <div class="space-y-3">
                        <span class="text-xs font-black uppercase tracking-wider text-stone-500 block">👀 실제 홈페이지 카드 미리보기</span>
                        <div id="project-live-preview" class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            ${R.renderProjectCard(current)}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    window.selectProjectCard = function (idx) {
        uiState.selectedProjectIdx = idx;
        renderActiveTab();
    };
    window.toggleProjectFeatured = function (checked) {
        const current = db.projects.projects[uiState.selectedProjectIdx];
        if (!current) return;
        current.featured = checked;
        if (checked && !current.sideHighlight) {
            current.sideHighlight = { icon: '⏱️', caption: '핵심 포인트', headline: '핵심 목표' };
        }
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.updateProjectField = function (field, value) {
        const current = db.projects.projects[uiState.selectedProjectIdx];
        if (!current) return;
        current[field] = value;
        updateDirtyIndicators();
        const preview = document.getElementById('project-live-preview');
        if (preview) preview.innerHTML = R.renderProjectCard(current);
    };
    window.changeProjectActionType = function (val) {
        const current = db.projects.projects[uiState.selectedProjectIdx];
        if (!current) return;
        current.actionType = val;
        if (val === 'view' && !current.actionTarget) current.actionTarget = 'project';
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.updateProjectSide = function (field, value) {
        const current = db.projects.projects[uiState.selectedProjectIdx];
        if (!current) return;
        if (!current.sideHighlight) current.sideHighlight = {};
        current.sideHighlight[field] = value;
        updateDirtyIndicators();
        const preview = document.getElementById('project-live-preview');
        if (preview) preview.innerHTML = R.renderProjectCard(current);
    };
    window.addProjectBadge = function () {
        const current = db.projects.projects[uiState.selectedProjectIdx];
        if (!current) return;
        if (!Array.isArray(current.badges)) current.badges = [];
        current.badges.push({ text: '새 뱃지', theme: 'stone-solid' });
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.updateProjectBadge = function (bIdx, field, val) {
        const current = db.projects.projects[uiState.selectedProjectIdx];
        if (!current || !current.badges[bIdx]) return;
        current.badges[bIdx][field] = val;
        updateDirtyIndicators();
        const preview = document.getElementById('project-live-preview');
        if (preview) preview.innerHTML = R.renderProjectCard(current);
    };
    window.removeProjectBadge = function (bIdx) {
        const current = db.projects.projects[uiState.selectedProjectIdx];
        if (!current) return;
        current.badges.splice(bIdx, 1);
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.addProjectCard = function () {
        db.projects.projects.push({
            id: `proj-${Date.now()}`,
            featured: false,
            badges: [{ text: '신규 과제', theme: 'stone-solid' }],
            title: '새로운 연구 프로젝트 제목',
            description: '진행 중인 연구 또는 챌린지에 대한 설명을 작성하세요.',
            statusText: '진행 중',
            actionType: 'none',
            actionTarget: ''
        });
        uiState.selectedProjectIdx = db.projects.projects.length - 1;
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.deleteProjectCard = function (idx) {
        const target = db.projects.projects[idx];
        if (!target) return;
        if (!confirm(`'${target.title}' 프로젝트를 삭제하시겠습니까?`)) return;
        db.projects.projects.splice(idx, 1);
        uiState.selectedProjectIdx = Math.max(0, idx - 1);
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.moveProjectCard = function (idx, delta) {
        const arr = db.projects.projects;
        const next = idx + delta;
        if (next < 0 || next >= arr.length) return;
        const [moved] = arr.splice(idx, 1);
        arr.splice(next, 0, moved);
        uiState.selectedProjectIdx = next;
        updateDirtyIndicators();
        renderActiveTab();
    };

    // ---------------------------------------------------------
    // TAB 4: 신입부원 대시보드 (challenge.json)
    // ---------------------------------------------------------
    function renderChallengeEditor(root) {
        const subTabs = [
            { id: 'missions', label: '🎯 개요 & 3대 미션' },
            { id: 'roles', label: '🧠 파트별 역할 & 역량 차트' },
            { id: 'sensors', label: '📡 센서 토픽 카드' },
            { id: 'schedule', label: '📅 전체 일정 타임라인' },
            { id: 'rules', label: '🏆 대회 규칙 & 페널티' }
        ];

        let subContent = '';
        if (uiState.challengeSubTab === 'missions') {
            const ov = db.challenge.overview;
            subContent = `
                <div class="bg-white rounded-2xl border border-stone-200 p-6 space-y-5">
                    <div>
                        <label class="block text-xs font-bold text-stone-700 mb-1">대시보드 메인 제목</label>
                        <input type="text" value="${R.escapeHtml(ov.title || '')}" oninput="updateOverviewField('title', this.value)"
                            class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-stone-700 mb-1">환영 및 개요 설명문</label>
                        <textarea rows="3" oninput="updateOverviewField('description', this.value)"
                            class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">${R.escapeHtml(ov.description || '')}</textarea>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                        ${(ov.missions || []).map((m, idx) => `
                            <div class="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-2">
                                <div class="flex gap-2">
                                    <input type="text" value="${R.escapeHtml(m.icon || '')}" oninput="updateMission(${idx}, 'icon', this.value)"
                                        class="w-14 px-2 py-1.5 text-center text-lg rounded border border-stone-300 bg-white">
                                    <input type="text" value="${R.escapeHtml(m.title || '')}" oninput="updateMission(${idx}, 'title', this.value)"
                                        class="flex-1 px-3 py-1.5 text-sm font-bold rounded border border-stone-300 bg-white">
                                </div>
                                <textarea rows="3" oninput="updateMission(${idx}, 'description', this.value)"
                                    class="w-full px-3 py-1.5 text-xs rounded border border-stone-300 bg-white">${R.escapeHtml(m.description || '')}</textarea>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else if (uiState.challengeSubTab === 'roles') {
            const roles = db.challenge.roles.items || [];
            const labels = db.challenge.roles.chartLabels || [];
            const rIdx = Math.min(uiState.selectedRoleIdx, Math.max(0, roles.length - 1));
            const curRole = roles[rIdx];
            subContent = `
                <div class="bg-white rounded-2xl border border-stone-200 p-6 space-y-5">
                    <div class="flex flex-wrap gap-2 border-b border-stone-100 pb-4">
                        ${roles.map((r, idx) => `
                            <button onclick="selectChallengeRole(${idx})" class="px-4 py-2 rounded-lg text-xs font-bold border ${idx === rIdx ? 'bg-rose-800 text-white border-rose-800' : 'bg-stone-50 text-stone-700 border-stone-200'}">
                                ${R.escapeHtml(r.buttonLabel)}
                            </button>
                        `).join('')}
                    </div>
                    ${curRole ? `
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div class="space-y-4">
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">탭 버튼 문구</label>
                                    <input type="text" value="${R.escapeHtml(curRole.buttonLabel || '')}" oninput="updateRoleMeta(${rIdx}, 'buttonLabel', this.value)"
                                        class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">임무 박스 제목</label>
                                    <input type="text" value="${R.escapeHtml(curRole.title || '')}" oninput="updateRoleMeta(${rIdx}, 'title', this.value)"
                                        class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">
                                </div>
                            </div>
                            <div class="space-y-2">
                                <div class="flex justify-between items-center">
                                    <label class="text-xs font-bold text-stone-700">주요 임무 항목</label>
                                    <button onclick="addRoleTask(${rIdx})" class="text-xs text-rose-800 font-bold hover:underline">+ 항목 추가</button>
                                </div>
                                ${(curRole.tasks || []).map((t, tIdx) => `
                                    <div class="bg-stone-50 p-3 rounded-xl border border-stone-200 space-y-1.5">
                                        <div class="flex gap-2">
                                            <input type="text" value="${R.escapeHtml(t.label || '')}" oninput="updateRoleTask(${rIdx}, ${tIdx}, 'label', this.value)"
                                                placeholder="소제목 (예: 3D LiDAR 데이터 처리)" class="flex-1 px-2.5 py-1 text-xs font-bold rounded border border-stone-300 bg-white">
                                            <button onclick="removeRoleTask(${rIdx}, ${tIdx})" class="text-xs text-red-600 px-2">삭제</button>
                                        </div>
                                        <input type="text" value="${R.escapeHtml(t.detail || '')}" oninput="updateRoleTask(${rIdx}, ${tIdx}, 'detail', this.value)"
                                            placeholder="세부 설명" class="w-full px-2.5 py-1 text-xs rounded border border-stone-300 bg-white">
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div class="bg-stone-50 p-5 rounded-xl border border-stone-200 space-y-4">
                            <h4 class="font-bold text-sm text-stone-800">📊 역량 레이더 차트 비중 (0 ~ 100)</h4>
                            ${labels.map((lb, sIdx) => `
                                <div>
                                    <div class="flex justify-between text-xs font-semibold mb-1">
                                        <span>${R.escapeHtml(lb)}</span>
                                        <span id="score-val-${sIdx}" class="text-rose-800 font-bold">${curRole.scores[sIdx] ?? 50}</span>
                                    </div>
                                    <input type="range" min="0" max="100" step="5" value="${curRole.scores[sIdx] ?? 50}"
                                        oninput="updateRoleScore(${rIdx}, ${sIdx}, Number(this.value))"
                                        class="w-full accent-rose-800 cursor-pointer">
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
        } else if (uiState.challengeSubTab === 'sensors') {
            const sensors = db.challenge.infra.sensors || [];
            if (uiState.selectedSensorIdx >= sensors.length) uiState.selectedSensorIdx = Math.max(0, sensors.length - 1);
            const curSensor = sensors[uiState.selectedSensorIdx];
            subContent = `
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div class="lg:col-span-4 bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
                        <div class="flex justify-between items-center">
                            <h3 class="font-black text-sm">📡 ROS 2 토픽 카드 (${sensors.length}개)</h3>
                            <button onclick="addSensorCard()" class="px-3 py-1.5 bg-rose-800 text-white text-xs font-bold rounded-lg">+ 토픽 추가</button>
                        </div>
                        <div class="space-y-2">
                            ${sensors.map((s, idx) => `
                                <div onclick="selectSensorCard(${idx})" class="item-row ${idx === uiState.selectedSensorIdx ? 'selected' : ''} cursor-pointer p-3 rounded-xl border border-stone-200 flex justify-between items-center">
                                    <div>
                                        <div class="font-bold text-sm">${R.escapeHtml(s.name)}</div>
                                        <div class="text-xs font-mono text-stone-500">${R.escapeHtml(s.topic)}</div>
                                    </div>
                                    <span class="text-[10px] px-2 py-0.5 rounded bg-stone-100 font-semibold">${R.escapeHtml(s.direction)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="lg:col-span-8 space-y-4">
                        ${curSensor ? `
                        <div class="bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
                            <div class="flex justify-between items-center border-b border-stone-100 pb-3">
                                <h4 class="font-black text-sm">✏️ 센서/제어 토픽 편집</h4>
                                <button onclick="deleteSensorCard(${uiState.selectedSensorIdx})" class="text-xs text-red-600 font-bold px-2.5 py-1 bg-red-50 rounded-lg">삭제</button>
                            </div>
                            <div class="grid grid-cols-3 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">센서/모듈 이름</label>
                                    <input type="text" value="${R.escapeHtml(curSensor.name || '')}" oninput="updateSensorField('name', this.value)"
                                        class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">입출력 구분</label>
                                    <select onchange="changeSensorDirection(this.value)" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white">
                                        <option value="input" ${curSensor.directionTheme !== 'teal' ? 'selected' : ''}>입력(Input)</option>
                                        <option value="output" ${curSensor.directionTheme === 'teal' ? 'selected' : ''}>출력(Output)</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">좌측 포인트 색상</label>
                                    <select onchange="updateSensorField('accentTheme', this.value)" class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white">
                                        ${sensorAccentOptions(curSensor.accentTheme)}
                                    </select>
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">ROS 2 Topic 경로</label>
                                    <input type="text" value="${R.escapeHtml(curSensor.topic || '')}" oninput="updateSensorField('topic', this.value)"
                                        class="w-full px-3 py-2 text-sm font-mono rounded-lg border border-stone-300">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-stone-700 mb-1">메시지 타입 (Type)</label>
                                    <input type="text" value="${R.escapeHtml(curSensor.msgType || '')}" oninput="updateSensorField('msgType', this.value)"
                                        class="w-full px-3 py-2 text-sm font-mono rounded-lg border border-stone-300">
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-stone-700 mb-1">설명</label>
                                <textarea rows="2" oninput="updateSensorField('description', this.value)"
                                    class="w-full px-3 py-2 text-sm rounded-lg border border-stone-300">${R.escapeHtml(curSensor.description || '')}</textarea>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <span class="text-xs font-black uppercase tracking-wider text-stone-500 block">👀 실시간 센서 카드 미리보기</span>
                            <div id="sensor-live-preview">${R.renderSensorCard(curSensor)}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        } else if (uiState.challengeSubTab === 'schedule') {
            const sched = db.challenge.schedule || [];
            subContent = `
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div class="lg:col-span-7 bg-white rounded-2xl border border-stone-200 p-6 space-y-3">
                        <div class="flex justify-between items-center mb-2">
                            <h3 class="font-black text-base">📅 일정 단계 편집</h3>
                            <button onclick="addScheduleStep()" class="px-3 py-1.5 bg-rose-800 text-white text-xs font-bold rounded-lg">+ 단계 추가</button>
                        </div>
                        ${sched.map((st, idx) => `
                            <div class="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-2">
                                <div class="flex justify-between items-center gap-2">
                                    <input type="text" value="${R.escapeHtml(st.stepTitle || '')}" oninput="updateScheduleStep(${idx}, 'stepTitle', this.value)"
                                        class="flex-1 px-3 py-1.5 text-sm font-bold rounded-lg border border-stone-300 bg-white">
                                    <label class="text-xs flex items-center gap-1 font-semibold text-amber-700 shrink-0">
                                        <input type="checkbox" ${st.isFinal ? 'checked' : ''} onchange="updateScheduleStep(${idx}, 'isFinal', this.checked)">
                                        최종 하이라이트
                                    </label>
                                    <button onclick="moveScheduleStep(${idx}, -1)" class="px-1.5 py-1 text-xs bg-white border rounded">↑</button>
                                    <button onclick="moveScheduleStep(${idx}, 1)" class="px-1.5 py-1 text-xs bg-white border rounded">↓</button>
                                    <button onclick="removeScheduleStep(${idx})" class="px-2 py-1 text-xs text-red-600">삭제</button>
                                </div>
                                <input type="text" value="${R.escapeHtml(st.description || '')}" oninput="updateScheduleStep(${idx}, 'description', this.value)"
                                    class="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 bg-white">
                            </div>
                        `).join('')}
                    </div>
                    <div class="lg:col-span-5 bg-white rounded-2xl border border-stone-200 p-6">
                        <span class="text-xs font-black uppercase tracking-wider text-stone-500 block mb-6">👀 타임라인 미리보기</span>
                        <div id="schedule-live-preview" class="relative border-l-2 border-stone-200 pl-8 space-y-8">
                            ${sched.map(R.renderTimelineItem).join('')}
                        </div>
                    </div>
                </div>
            `;
        } else if (uiState.challengeSubTab === 'rules') {
            const rules = db.challenge.rules.items || [];
            subContent = `
                <div class="bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
                    <div class="flex justify-between items-center">
                        <h3 class="font-black text-base">🏆 대회 규칙 및 페널티 항목</h3>
                        <button onclick="addRuleItem()" class="px-3 py-1.5 bg-rose-800 text-white text-xs font-bold rounded-lg">+ 규칙 추가</button>
                    </div>
                    <div class="space-y-3">
                        ${rules.map((rl, idx) => `
                            <div class="bg-stone-50 p-4 rounded-xl border border-stone-200 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                                <input type="text" value="${R.escapeHtml(rl.icon || '')}" oninput="updateRuleField(${idx}, 'icon', this.value)"
                                    class="md:col-span-1 px-2 py-1.5 text-center rounded border border-stone-300 bg-white">
                                <input type="text" value="${R.escapeHtml(rl.title || '')}" oninput="updateRuleField(${idx}, 'title', this.value)"
                                    placeholder="규칙 제목" class="md:col-span-3 px-3 py-1.5 text-xs font-bold rounded border border-stone-300 bg-white">
                                <input type="text" value="${R.escapeHtml(rl.description || '')}" oninput="updateRuleField(${idx}, 'description', this.value)"
                                    placeholder="설명 앞부분" class="md:col-span-4 px-3 py-1.5 text-xs rounded border border-stone-300 bg-white">
                                <input type="text" value="${R.escapeHtml(rl.highlight || '')}" oninput="updateRuleField(${idx}, 'highlight', this.value)"
                                    placeholder="강조 (예: +5초)" class="md:col-span-2 px-3 py-1.5 text-xs font-bold text-red-600 rounded border border-stone-300 bg-white">
                                <div class="md:col-span-2 flex gap-1">
                                    <input type="text" value="${R.escapeHtml(rl.suffix || '')}" oninput="updateRuleField(${idx}, 'suffix', this.value)"
                                        placeholder="뒷말" class="w-full px-2 py-1.5 text-xs rounded border border-stone-300 bg-white">
                                    <button onclick="removeRuleItem(${idx})" class="text-xs text-red-600 px-2 shrink-0">삭제</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        root.innerHTML = `
            <div class="space-y-5">
                <div class="flex flex-wrap gap-2">
                    ${subTabs.map(st => `
                        <button onclick="switchChallengeSubTab('${st.id}')" class="sub-tab ${uiState.challengeSubTab === st.id ? 'active' : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'} px-4 py-2 rounded-xl text-xs font-bold transition-colors">
                            ${st.label}
                        </button>
                    `).join('')}
                </div>
                ${subContent}
            </div>
        `;
    }

    window.switchChallengeSubTab = function (subId) {
        uiState.challengeSubTab = subId;
        renderActiveTab();
    };
    window.updateOverviewField = function (field, val) {
        db.challenge.overview[field] = val;
        updateDirtyIndicators();
    };
    window.updateMission = function (idx, field, val) {
        db.challenge.overview.missions[idx][field] = val;
        updateDirtyIndicators();
    };
    window.selectChallengeRole = function (idx) {
        uiState.selectedRoleIdx = idx;
        renderActiveTab();
    };
    window.updateRoleMeta = function (rIdx, field, val) {
        db.challenge.roles.items[rIdx][field] = val;
        updateDirtyIndicators();
    };
    window.updateRoleTask = function (rIdx, tIdx, field, val) {
        db.challenge.roles.items[rIdx].tasks[tIdx][field] = val;
        updateDirtyIndicators();
    };
    window.addRoleTask = function (rIdx) {
        db.challenge.roles.items[rIdx].tasks.push({ label: '새 주요 임무', detail: '세부 내용을 입력하세요' });
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.removeRoleTask = function (rIdx, tIdx) {
        db.challenge.roles.items[rIdx].tasks.splice(tIdx, 1);
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.updateRoleScore = function (rIdx, sIdx, val) {
        db.challenge.roles.items[rIdx].scores[sIdx] = val;
        const label = document.getElementById(`score-val-${sIdx}`);
        if (label) label.textContent = String(val);
        updateDirtyIndicators();
    };
    window.selectSensorCard = function (idx) {
        uiState.selectedSensorIdx = idx;
        renderActiveTab();
    };
    window.changeSensorDirection = function (mode) {
        const cur = db.challenge.infra.sensors[uiState.selectedSensorIdx];
        if (!cur) return;
        if (mode === 'output') {
            cur.direction = '출력(Output)';
            cur.directionTheme = 'teal';
        } else {
            cur.direction = '입력(Input)';
            cur.directionTheme = 'stone';
        }
        updateDirtyIndicators();
        const preview = document.getElementById('sensor-live-preview');
        if (preview) preview.innerHTML = R.renderSensorCard(cur);
    };
    window.updateSensorField = function (field, val) {
        const cur = db.challenge.infra.sensors[uiState.selectedSensorIdx];
        if (!cur) return;
        cur[field] = val;
        updateDirtyIndicators();
        const preview = document.getElementById('sensor-live-preview');
        if (preview) preview.innerHTML = R.renderSensorCard(cur);
    };
    window.addSensorCard = function () {
        db.challenge.infra.sensors.push({
            id: `sensor-${Date.now()}`,
            name: 'New Sensor',
            direction: '입력(Input)',
            directionTheme: 'stone',
            accentTheme: 'blue',
            topic: '/car1/new_topic',
            msgType: 'std_msgs/msg/String',
            description: '센서 또는 제어 토픽에 대한 설명을 입력하세요.'
        });
        uiState.selectedSensorIdx = db.challenge.infra.sensors.length - 1;
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.deleteSensorCard = function (idx) {
        const target = db.challenge.infra.sensors[idx];
        if (!target || !confirm(`'${target.name}' 토픽 카드를 삭제하시겠습니까?`)) return;
        db.challenge.infra.sensors.splice(idx, 1);
        uiState.selectedSensorIdx = Math.max(0, idx - 1);
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.updateScheduleStep = function (idx, field, val) {
        db.challenge.schedule[idx][field] = val;
        updateDirtyIndicators();
        const preview = document.getElementById('schedule-live-preview');
        if (preview) preview.innerHTML = db.challenge.schedule.map(R.renderTimelineItem).join('');
    };
    window.addScheduleStep = function () {
        db.challenge.schedule.push({
            stepTitle: '새 단계: 제목 입력',
            description: '단계별 세부 일정을 입력하세요.',
            isFinal: false
        });
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.removeScheduleStep = function (idx) {
        db.challenge.schedule.splice(idx, 1);
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.moveScheduleStep = function (idx, delta) {
        const arr = db.challenge.schedule;
        const next = idx + delta;
        if (next < 0 || next >= arr.length) return;
        const [moved] = arr.splice(idx, 1);
        arr.splice(next, 0, moved);
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.updateRuleField = function (idx, field, val) {
        db.challenge.rules.items[idx][field] = val;
        updateDirtyIndicators();
    };
    window.addRuleItem = function () {
        db.challenge.rules.items.push({
            icon: '⚠️',
            title: '신규 페널티 항목',
            description: '페널티 조건 설명',
            highlight: '+N초',
            suffix: '가산'
        });
        updateDirtyIndicators();
        renderActiveTab();
    };
    window.removeRuleItem = function (idx) {
        db.challenge.rules.items.splice(idx, 1);
        updateDirtyIndicators();
        renderActiveTab();
    };

    // ---------------------------------------------------------
    // Bootstrapping
    // ---------------------------------------------------------
    async function initAdmin() {
        if (isLocalEnvironment()) {
            const bypass = document.getElementById('localhost-bypass-wrap');
            if (bypass) bypass.classList.remove('hidden');
        }

        const loginForm = document.getElementById('github-login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const errBox = document.getElementById('auth-error-box');
                const submitBtn = document.getElementById('auth-submit-btn');
                errBox.classList.add('hidden');

                const repo = document.getElementById('auth-repo').value;
                const branch = document.getElementById('auth-branch').value;
                const token = document.getElementById('auth-token').value;
                const remember = document.getElementById('auth-remember').checked;

                submitBtn.disabled = true;
                submitBtn.textContent = '권한 확인 및 데이터 불러오는 중...';
                try {
                    await authenticateWithGitHub(repo, branch, token, remember);
                } catch (err) {
                    errBox.textContent = err.message || String(err);
                    errBox.classList.remove('hidden');
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.textContent = '🔓 운영진 권한 확인 및 콘솔 접속';
                }
            });
        }

        // Restore saved session if present
        const savedRaw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
        if (savedRaw) {
            try {
                const saved = JSON.parse(savedRaw);
                if (saved && saved.repo && saved.token) {
                    document.getElementById('auth-repo').value = saved.repo;
                    document.getElementById('auth-branch').value = saved.branch || 'main';
                    document.getElementById('auth-token').value = saved.token;
                    document.getElementById('auth-remember').checked = Boolean(localStorage.getItem(STORAGE_KEY));
                    await authenticateWithGitHub(saved.repo, saved.branch || 'main', saved.token, Boolean(localStorage.getItem(STORAGE_KEY)));
                }
            } catch (_) {
                sessionStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem(STORAGE_KEY);
            }
        }
    }

    window.addEventListener('beforeunload', (e) => {
        if (getDirtyFiles().length > 0) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAdmin);
    } else {
        initAdmin();
    }
})();
