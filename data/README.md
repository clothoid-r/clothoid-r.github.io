# Clothoid-R 홈페이지 데이터 관리 가이드 (`data/`)

이 폴더는 Clothoid-R 공식 홈페이지(`index.html`)에 표시되는 동아리원, GitHub 리소스 카드, 프로젝트, 신입 부원 대시보드 데이터를 코드와 분리하여 관리하는 공간입니다.

## 가장 쉬운 수정 방법: 웹 관리자 콘솔 (`/admin.html`)

코드를 직접 수정하지 않아도 **`/admin.html`** 페이지에 접속하여 GitHub 저장소 쓰기 권한이 있는 운영진 계정 토큰으로 로그인하면:
- 실시간 카드 미리보기를 보며 항목 추가·수정·순서 변경·삭제가 가능하고,
- **[🚀 GitHub에 바로 커밋]** 버튼 하나로 이 폴더의 JSON 파일들을 자동 업데이트할 수 있습니다.

---

## 파일 구성

| 파일명 | 설명 |
| --- | --- |
| `members.json` | 크루 & 졸업생 명예의 전당 프로필 카드 및 상단 필터 탭 |
| `repositories.json` | 홈 화면 'Clothoid-R 개발 및 교육 리소스' GitHub 카드 |
| `competitions.json` | 홈 화면 '참가 대회 & 수상 실적' 카드 및 상장 이미지 정보 |
| `projects.json` | 홈 화면 '진행 중인 활성 프로젝트' 카드 |
| `challenge.json` | '신입 부원 프로젝트 🏁' 대시보드의 미션, 파트 역할, 규칙, 센서 토픽, 일정 |

---

## 수동 편집용 템플릿

### 1. 동아리원 추가 양식 (`members.json` -> `members` 배열에 추가)

```json
{
  "id": "gildong-hong",
  "name": "홍길동",
  "subtitle": "gildong-hong",
  "isAlumni": false,
  "divisions": ["perception"],
  "roleBadge": "파트원 (Member)",
  "badgeTheme": "stone",
  "specialty": "Perception / LiDAR",
  "bio": "3D LiDAR 객체 인식 및 센서 퓨전 알고리즘을 연구하고 있습니다.",
  "tags": ["ROS2", "PointCloud"],
  "githubUrl": "https://github.com/gildong-hong"
}
```

- `divisions`: 필터링될 카테고리 배열 (`"core"`, `"perception"`, `"planning"`, `"control"`, `"alumni"` 중 복수 선택 가능. 전체보기(`"all"`)에는 자동 포함됨)
- `isAlumni`: `true`로 설정하면 졸업생 전용 카드 배경/강조 디자인이 자동 적용됨
- `badgeTheme`: `"amber"`(노랑/골드), `"blue"`(파랑), `"green"`(초록), `"rose"`(버건디/로즈), `"rose-soft"`(연분홍), `"stone"`(기본 회색), `"dark"`(검정/졸업생), `"teal"`(청록)

### 2. GitHub 리소스 카드 양식 (`repositories.json` -> `repositories` 배열에 추가)

```json
{
  "id": "new-repo",
  "icon": "🚀",
  "badgeText": "신규 패키지",
  "badgeTheme": "rose-soft",
  "title": "저장소 카드 제목",
  "repoPath": "clothoid-r / repo-name",
  "description": "저장소에 대한 간단한 소개 설명을 작성합니다.",
  "buttonText": "📦 소스코드 탐색하기",
  "url": "https://github.com/clothoid-r/repo-name"
}
```
