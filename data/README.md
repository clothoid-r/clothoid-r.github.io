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
  "cohort": "5기",
  "name": "홍길동",
  "currentPosition": "",
  "isAlumni": false,
  "divisions": ["perception"],
  "roleBadge": "파트원",
  "badgeTheme": "stone",
  "bio": "3D LiDAR 객체 인식 및 센서 퓨전 알고리즘을 담당합니다.",
  "tags": ["LiDAR", "Sensor_Fusion"],
  "githubUrl": "https://github.com/gildong-hong"
}
```

- `divisions`: 담당 분야 배열 (`"perception"`, `"localization"`, `"planning"`, `"control"`, `"simulator"` 중 복수 선택 가능). 운영진은 `"core"`, 졸업생은 `"alumni"`도 함께 넣음
- `isAlumni`: `true`로 설정하면 '졸업생' 구역에 표시됨 (직책에 `(Alumni)`를 따로 붙이지 않음)
- `roleBadge`: 직책만 입력 (예: `회장`, `3대 회장`, `인지 파트장`, `파트원`). 회장·파트장은 굵게 표시됨. `파트원`은 담당 분야명으로 바뀌어 `인지`, `판단·제어`처럼 표시됨 (분야가 없으면 `파트원`)
- `currentPosition`: 현재 소속 (선택, 졸업생 위주). 비워두면 표시되지 않음
- `tags`: 카드 하단 분야 뱃지 아래에 표시되는 관심 키워드 (`_`는 띄어쓰기로 표시됨)
- `githubUrl`: 입력하면 카드 우상단에 `GitHub ↗` 링크가 표시됨
- 카드 하단 분야 뱃지(Perception / Localization / Planning / Control / Simulator)와 상단 필터는 `divisions` 값에서 자동 표시됨. 인원이 없는 분야의 필터는 숨겨짐
- 홈페이지에서는 `isAlumni` 값에 따라 '현역 크루'와 '졸업생' 구역으로 나뉘어 표시됨
- `badgeTheme`: 멤버 카드에서는 더 이상 사용하지 않음 (다른 카드용). `"amber"`(노랑/골드), `"blue"`(파랑), `"green"`(초록), `"rose"`(버건디/로즈), `"rose-soft"`(연분홍), `"stone"`(기본 회색), `"dark"`(검정/졸업생), `"teal"`(청록)

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
