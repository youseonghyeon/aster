# Aster icons

승인된 전용 SVG 원본은 이 디렉토리의 루트에 두고 Git으로 관리합니다. 같은 용도는 같은 파일을 import하며 `catalog.json`은 사용 영역과 적용 상태를 기록합니다. `proposals/outline-01`은 이전 시안입니다.

- 24×24 viewBox, currentColor, 기준 선 굵기 1.8. 변환된 기존 도형의 scale은 실제 선 굵기가 같도록 보정합니다.
- 앱은 `AssetIcon`과 메뉴의 CSS mask로 원본을 사용합니다. 컨트롤의 표시 크기·상태 색상은 기존 CSS가 소유합니다.
- 이름 복사와 최근 문서 시계는 승인 에셋으로 보관합니다. 현재 아이콘을 표시하지 않는 메뉴·탭에 새 그림을 임의 추가하지 않습니다.
- 새 디자인은 기존 전체 목록과 비교하고 승인 후 앱에 연결합니다. 파일 규격 검사는 시각 검토를 대신하지 않습니다.

## 재현 명령

- `node scripts/check-icon-assets.mjs`: 공통 속성, 파일, 중복 용도 연결 확인.
- `node scripts/build-icon-catalog.mjs /absolute/docs/design/aster-icons.html`: 전체 목록과 헤더·파일·검색·미리보기/패널·메뉴의 하위 페이지. HTML은 원본에서 생성하는 로컬 문서입니다.
- `node scripts/render-icon-review.mjs /tmp/aster-icon-review`: 원본의 밝은/어두운 SVG 비교 시트. macOS에서는 Quick Look PNG도 생성합니다. 썸네일 배율은 환경 영향을 받으므로 HTML 실제 표시 크기와 구분합니다.

전체 목록의 선 끝·접합·크기·광학적 중심을 실제 렌더링으로 보고, 적용 시 각 소비자의 크기·정렬·상태 색상을 확인합니다.
