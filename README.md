# Wanted Rating Extension (원티드 평점 확장 프로그램)

이 프로젝트는 원티드(Wanted) 채용 사이트에서 기업의 블라인드(Blind) 평점과 재무 정보(매출, 영업이익, 순이익)를 함께 보여주는 크롬 확장 프로그램입니다.

## 📂 파일별 역할 (File Roles)

각 파일이 담당하는 주요 기능은 다음과 같습니다.

### 핵심 로직 (Core Logic)
- **`content.js`**: 확장 프로그램의 진입점(Entry Point)입니다. 페이지 URL 변경을 감지하고, 현재 페이지가 채용 목록(`wdlist`)인지 상세 페이지(`wd`)인지 판단하여 적절한 매니저(`JobScanner` 또는 `DetailManager`)를 실행합니다.
- **`background.js`**: 서비스 워커 스크립트입니다. CORS 문제 해결을 위해 블라인드 및 원티드 API 요청을 대신 수행하고, Google Analytics 이벤트를 처리합니다.
- **`job_scanner.js`**: 채용 목록 페이지에서 동작합니다. 화면에 보이는 채용 공고 카드를 스캔하고, 큐(Queue)를 관리하며 순차적으로 평점 및 재무 정보를 가져옵니다. 캐싱 로직도 포함되어 있습니다.
- **`detail.js`**: 채용 상세 페이지에서 동작합니다. 상세 페이지의 DOM을 분석하여 회사 정보를 찾고, 우측 사이드바에 평점과 재무 정보를 주입합니다.

### UI 및 시각화 (UI & Visualization)
- **`drawer.js`**: 화면 우측에 표시되는 드로어(사이드 패널) UI를 관리합니다. 수집된 회사 목록을 보여주고, 정렬 기능 및 차트 토글 기능을 제공합니다.
- **`ui.js`**: 채용 공고 카드 내에 평점과 재무 정보를 렌더링하는 공통 UI 로직을 담당합니다.
- **`chart.js`**: Chart.js를 사용하여 평점과 순이익의 상관관계를 보여주는 산점도(Scatter Plot)를 그립니다.

### 유틸리티 및 기타 (Utils & Others)
- **`api.js`**: 블라인드 웹페이지의 HTML을 파싱하여 평점을 추출하는 로직을 담고 있습니다.
- **`storage.js`**: `chrome.storage.local`을 사용하기 쉽게 감싼 래퍼(Wrapper) 모듈입니다.
- **`utils.js`**: 회사명 정규화(`extractCompanyName`) 및 `sleep` 함수 등 공통 유틸리티 함수를 포함합니다.
- **`ga.js`**: Google Analytics 4 (GA4) 연동을 위한 모듈입니다.
- **`manifest.json`**: 크롬 확장 프로그램의 설정 파일입니다. 권한, 아이콘, 스크립트 주입 규칙 등을 정의합니다.

---

## 🔄 동작 흐름 (Application Flow)

모든 동작은 **`content.js`** 에서 시작됩니다. URL 변경을 감지하는 `MutationObserver`가 페이지 이동을 추적합니다.

### 1. 채용 목록 페이지 (`/wdlist/...`)
사용자가 채용 목록 페이지에 접속했을 때의 흐름입니다.

1.  **초기화**: `content.js`가 `JobScanner.init(true)`를 호출합니다.
    *   `DrawerManager`가 생성되고 화면에 표시됩니다(`show`).
2.  **스캔**: `JobScanner.scanVisibleCompanies()`가 실행되어 화면에 로드된 채용 공고 카드(`[data-cy="job-card"]`)를 찾습니다.
3.  **큐잉 및 데이터 수집**:
    *   새로운 회사가 발견되면 `DrawerManager` 목록에 추가하고, 작업 큐(Queue)에 넣습니다.
    *   `JobScanner`는 큐를 순차적으로 처리하며 `background.js`를 통해 블라인드 평점과 원티드 재무 정보를 가져옵니다.
4.  **UI 업데이트**:
    *   데이터가 수집되면 `UIManager`를 통해 각 채용 카드에 평점/재무 정보를 표시합니다.
    *   동시에 `DrawerManager`의 목록과 차트 데이터도 업데이트됩니다.

### 2. 채용 상세 페이지 (`/wd/...`)
사용자가 특정 채용 공고를 클릭하여 상세 페이지로 들어갔을 때의 흐름입니다.

1.  **모드 전환**: `content.js`가 `JobScanner.init(false)`를 호출합니다.
    *   `DrawerManager`는 생성되지만, `hideFull()`이 호출되어 버튼과 드로어가 모두 숨겨집니다. (상세 페이지에서는 드로어를 사용하지 않음)
2.  **데이터 수집 및 렌더링**: `DetailManager.fetchAndRender()`가 호출됩니다.
    *   페이지 내의 회사 링크(`a[href^="/company/"]`)를 찾아 회사 ID와 이름을 추출합니다.
    *   `background.js`를 통해 데이터를 가져옵니다.
3.  **UI 주입**:
    *   우측 사이드바(`aside`) 영역에 '블라인드 평점'과 '재무 정보' 박스를 생성하여 삽입합니다.

### 3. 재시도 메커니즘 (Retry Mechanism)
블라인드 평점 수집 실패 시(예: 네트워크 오류, 403 Forbidden)를 대비한 재시도 로직이 구현되어 있습니다.

1.  **실패 감지**: `DrawerManager`는 주기적(60초)으로 드로어 내의 항목 중 평점이 `-3`(Forbidden 오류 코드)인 항목을 검사합니다.
2.  **재시도 트리거**: 해당 항목이 발견되면 `JobScanner.retryCompany(companyName)`를 호출합니다.
3.  **캐시 만료 및 재큐잉**:
    *   `JobScanner`는 해당 회사의 캐시를 강제로 만료(`expired_at: 0`)시킵니다.
    *   회사를 다시 작업 큐에 추가하여 평점을 재수집하도록 유도합니다.
    *   이때, 이미 수집된 재무 정보가 있다면 이를 보존하여 UI가 깜빡이거나 정보가 사라지는 것을 방지합니다.
