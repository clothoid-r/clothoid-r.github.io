// 멤버 데이터 정의
const members = [
    {
        name: "김태현",
        id: "ttaehyun",
        role: "회장 (President)",
        roleClass: "bg-amber-100 text-amber-800",
        subRole: "Control / Integration",
        description: "자체 레이싱 시뮬레이터 개발 및 전체 시스템 파이프라인 통합을 담당합니다. 부드러운 전이 곡선 주행 최적화에 힘쓰고 있습니다.",
        tags: ["#System_Integration", "#Pure_Pursuit"],
        divisions: ["all", "core", "control"]
    },
    {
        name: "이민준",
        id: "minjun-lee",
        role: "인지 파트장 (Lead)",
        roleClass: "bg-blue-100 text-blue-800",
        subRole: "Perception / Vision",
        description: "3D LiDAR 점군(Point Cloud) 정밀 클러스터링 및 실시간 카메라 오브젝트 트래킹을 통한 전방 장애물 식별 시스템을 책임집니다.",
        tags: ["#LiDAR_3D", "#OpenCV"],
        divisions: ["all", "core", "perception"]
    },
    {
        name: "박서연",
        id: "seoyeon-p",
        role: "판단 파트장 (Lead)",
        roleClass: "bg-green-100 text-green-800",
        subRole: "Planning / Localization",
        description: "GPS와 전역 경로 노드 오차 보정, 실시간 충돌 가능 영역(Costmap)을 기반으로 한 Dynamic Path Optimization 연구를 이끌고 있습니다.",
        tags: ["#Dijkstra", "#GPS_NavSat"],
        divisions: ["all", "core", "planning"]
    },
    // ... 추가 멤버들 동일한 형식으로 배열에 추가 가능
    {
        name: "박재범",
        id: "현 현대자동차 자율주행개발센터 연구원",
        role: "1기 회장 (Alumni)",
        roleClass: "bg-stone-800 text-white",
        subRole: "Hyundai Motors",
        description: "학부 시절 Clothoid-R의 기틀을 닦았으며, Pure Pursuit 및 PID 제어 기반 조향 시스템 프로토타입 설계를 완료했습니다.",
        tags: ["#Founding_President", "#Control_Expert"],
        divisions: ["all", "alumni"]
    }
];

const roleData = {
    perception: {
        title: '인지 파트 주요 임무',
        items: [
            '<strong>3D LiDAR 데이터 처리:</strong> Point Cloud 데이터 필터링 및 지면 제거 알고리즘 구현',
            '<strong>객체 군집화(Clustering):</strong> 장애물의 3D 공간상 바운딩 박스 생성 및 위치(X,Y,Z) 추출',
            '<strong>카메라 이미지 처리:</strong> OpenCV 기반 차선 인식 또는 딥러닝 객체 인지'
        ],
        chart: [90, 60, 40, 95, 75]
    },
    planning: {
        title: '판단 파트 주요 임무',
        items: [
            '<strong>로컬 경로 생성:</strong> 인지에서 전달받은 정보 기반 실시간 회피 경로 설계',
            '<strong>위치 추정(Localization):</strong> GPS 기반 맵 위 전역 위치 매핑 및 현재 위치 보정'
        ],
        chart: [60, 90, 70, 50, 95]
    },
    control: {
        title: '제어 파트 주요 임무',
        items: [
            '<strong>경로 추종(Path Tracking):</strong> 전달받은 경로점(Waypoint)을 오차 없이 따르기 위한 조향 제어',
            '<strong>종방향 제어:</strong> 목표 속도 도달을 위한 가속/감속 PID 제어기 설계 및 튜닝'
        ],
        chart: [70, 70, 95, 30, 80]
    }
};

let currentView = 'home';
let chartsInitialized = false;
let roleRadarChart;

// 화면 전환 함수
window.switchView = function(viewName) {
    currentView = viewName;
    document.querySelectorAll('.view-section').forEach(view => view.classList.add('hidden'));
    document.getElementById(`view-${viewName}`).classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (viewName === 'project' && !chartsInitialized) {
        setTimeout(initCharts, 50);
    }
    
    if (viewName === 'members') {
        renderMembers();
    }
};

// 섹션 스크롤 함수 (홈이 아닐 경우 홈으로 이동 후 스크롤)
window.scrollToSection = function(sectionId) {
    if (currentView !== 'home') {
        switchView('home');
        setTimeout(() => {
            const element = document.getElementById(sectionId);
            if (element) element.scrollIntoView({ behavior: 'smooth' });
        }, 150);
    } else {
        const element = document.getElementById(sectionId);
        if (element) element.scrollIntoView({ behavior: 'smooth' });
    }
};

// 멤버 카드 렌더링 함수
function renderMembers() {
    const grid = document.getElementById('member-grid');
    if (!grid) return;
    
    grid.innerHTML = members.map(m => `
        <div class="member-card bg-white rounded-xl p-6 border border-stone-200 shadow-sm flex flex-col justify-between" data-divisions="${m.divisions.join(' ')}">
            <div>
                <div class="flex justify-between items-center mb-4">
                    <span class="text-xs font-black tracking-widest ${m.roleClass} px-2.5 py-1 rounded">${m.role}</span>
                    <span class="text-xs font-semibold text-stone-400">${m.subRole}</span>
                </div>
                <h3 class="text-xl font-black text-stone-900 mb-1">${m.name}</h3>
                <p class="text-xs text-stone-500 mb-4">${m.id}</p>
                <p class="text-sm text-stone-600 leading-relaxed mb-6">${m.description}</p>
            </div>
            <div class="flex gap-2 text-xs border-t border-stone-100 pt-4 text-stone-500">
                ${m.tags.map(t => `<span class="bg-stone-100 px-2 py-1 rounded">${t}</span>`).join('')}
            </div>
        </div>
    `).join('');
}

// 멤버 필터링 함수
window.filterMembers = function(division) {
    const filterButtons = document.querySelectorAll('#member-filters button');
    filterButtons.forEach(btn => btn.className = 'px-5 py-2.5 rounded-full text-sm font-bold bg-white text-stone-600 border border-stone-200 hover:bg-stone-100 transition-all');
    
    event.target.className = 'px-5 py-2.5 rounded-full text-sm font-bold bg-rose-800 text-white transition-all shadow-sm';

    const cards = document.querySelectorAll('#member-grid .member-card');
    cards.forEach(card => {
        const cardDivs = card.getAttribute('data-divisions').split(' ');
        if (cardDivs.includes(division)) {
            card.classList.remove('hidden-filter');
        } else {
            card.classList.add('hidden-filter');
        }
    });
};

// 차트 초기화 함수
function initCharts() {
    if (chartsInitialized) return;
    const ctxRadar = document.getElementById('roleChart').getContext('2d');
    roleRadarChart = new Chart(ctxRadar, {
        type: 'radar',
        data: {
            labels: ['센서/비전', '알고리즘', '동역학/수학', 'ROS 2 활용', 'C++/Python'],
            datasets: [{
                data: roleData.perception.chart,
                backgroundColor: 'rgba(159, 18, 57, 0.2)',
                borderColor: 'rgba(159, 18, 57, 1)',
                borderWidth: 2
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    const ctxBar = document.getElementById('penaltyChart').getContext('2d');
    new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['완벽 주행', '콘 1회 충돌', '콘 충돌 + 코스 이탈'],
            datasets: [
                { label: '순수 랩타임', data: [60, 60, 60], backgroundColor: '#9f1239' },
                { label: '콘 충돌 페널티', data: [0, 5, 5], backgroundColor: '#f59e0b' },
                { label: '코스 이탈 페널티', data: [0, 0, 15], backgroundColor: '#ef4444' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { stacked: true }, y: { stacked: true } } }
    });
    chartsInitialized = true;
}

window.updateRoleView = function(role) {
    const data = roleData[role];
    document.getElementById('role-title').innerText = data.title;
    document.getElementById('role-list').innerHTML = data.items.map(i => `<li>${i}</li>`).join('');
    if (chartsInitialized && roleRadarChart) {
        roleRadarChart.data.datasets[0].data = data.chart;
        roleRadarChart.update();
    }
};

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    switchView('home');
});