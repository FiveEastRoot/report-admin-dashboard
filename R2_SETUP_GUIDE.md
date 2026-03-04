# Cloudflare R2 및 이미지 업로드 서버 세팅 가이드

이 문서는 데일리 리포트 어드민 대시보드에서 사용하는 **이미지 업로드 기능**을 위해 Cloudflare R2 버킷과 Worker를 세팅하는 방법을 안내합니다. 추후 운영 주체나 클라우드플레어 계정이 변경될 때 아래 절차를 따라 새롭게 세팅해 주시기 바랍니다.

---

## 1. Cloudflare R2 버킷 생성 및 공개 도메인 설정

가장 먼저 이미지가 물리적으로 저장될 R2 버킷을 만들고, 웹에서 이미지를 볼 수 있도록 외부 공개 설정을 해야 합니다.

1. **Cloudflare 대시보드**에 로그인한 뒤 좌측 메뉴에서 **`R2`**를 클릭합니다.
2. 우측 상단의 **[Create bucket]** 버튼을 눌러 새 버킷을 생성합니다. (예: `report-images`)
3. 생성된 버킷 이름을 클릭하여 버킷 상세 페이지로 진입합니다.
4. 상단 탭에서 **`설정(Settings)`**을 클릭합니다.
5. 화면 중앙 쯤에 있는 **`Public Access (퍼블릭 액세스)`** 섹션을 찾습니다.
6. 다음 두 가지 방법 중 하나로 외부 접근을 허용합니다:
   - **사용자 지정 도메인 연결(Custom Domains):** (권장) 보유하고 있는 도메인의 서브도메인을 연결합니다. (예: `assets.your-company.com`)
   - **r2.dev 서브도메인 허용:** 임시로 사용할 경우 퍼블릭 r2.dev URL 접근을 활성화합니다. 활성화하면 `https://pub-xxxxx.r2.dev` 형태의 주소를 발급받게 됩니다.
7. 여기서 발급/연결된 **퍼블릭 도메인 주소**를 복사해서 메모장에 기록해 둡니다.

---

## 2. Cloudflare Worker 배포 (업로드용 징검다리 서버)

프론트엔드 대시보드는 보안 상 R2에 직접 업로드 기능을 수행하지 않습니다. 대신 Cloudflare Worker를 통해 브라우저에서 보낸 이미지를 받아 R2 버킷에 대신 업로드해 주고 발급된 퍼블릭 URL을 반환해 줍니다. 

1. 프로젝트 소스 코드 내 최상단에 있는 `cf-r2-worker.js` 파일을 엽니다.
2. 36번째 줄 쯤에 있는 아래 부분을 찾아 **1단계에서 메모해 둔 퍼블릭 도메인 주소**로 바꿉니다.
   ```javascript
   // 수정 전 (예시)
   const publicUrl = `https://<본인의.R2.공용.도메인.com>/${fileName}`;
   
   // 수정 후 (예시)
   const publicUrl = `https://pub-a1b2c3d4.r2.dev/${fileName}`;
   ```
3. Cloudflare 대시보드 좌측 메뉴에서 **`Workers & Pages` → `Overview`**로 이동합니다.
4. **[Create application]** 버튼을 누른 뒤 **[Create Worker]**를 클릭하여 새 워커를 생성합니다. (이름 예시: `dashboard-image-upload`)
5. 워커 생성이 완료되면 워커 페이지 우측 상단의 **[Edit code(코드 편집)]** 버튼을 클릭합니다.
6. 왼쪽 코드 에디터 창에 적힌 내용을 모두 지우고, 주소를 미리 수정해 둔 **`cf-r2-worker.js` 코드 전체를 복사하여 붙여넣습니다.**
7. 우측 상단 **[Deploy(배포)]** 버튼을 눌러 코드를 저장합니다.

---

## 3. Worker에 R2 버킷 권한 연결 (Binding)

현재 만들어진 Worker는 코드는 가지고 있지만 R2 버킷에 접근할 권한이 없습니다. 이를 연결해 주어야 합니다.

1. 방금 생성한 Worker 관리 페이지로 다시 돌아옵니다. (`Workers & Pages` → 내가 만든 워커 클릭)
2. 상단 탭에서 **`설정(Settings)`** → **`변수(Variables) 또는 Bindings(바인딩)`** 메뉴로 이동합니다.
3. 스크롤을 내려 **`R2 Bucket Bindings(R2 버킷 바인딩)`** 항목을 찾고 **[Add binding(추가)]**을 누릅니다.
4. 아래와 같이 설정합니다:
   - **Variable name(변수 이름):** `MY_BUCKET` *(※ 반드시 대문자로 정확히 입력해야 합니다. 코드 상에 `env.MY_BUCKET`으로 하드코딩 되어 있습니다.)*
   - **R2 버킷:** 1단계에서 생성했던 R2 버킷(예: `report-images`)을 목록에서 선택합니다.
5. 설정을 저장합니다.

---

## 4. 프론트엔드 대시보드 환경설정 연동 (app.js)

이제 마지막으로 관리자 대시보드(프론트엔드)에서 방금 만든 Worker를 향해 이미지를 쏘도록 주소를 적어줍니다.

1. 3단계가 완료된 Worker의 요약 페이지 우측 메뉴를 보면 **`Preview URL` 혹은 실제 접근 가능한 `Routes` 주소**가 나와 있습니다.
   - 예시: `https://dashboard-image-upload.xxxx.workers.dev/`
2. 이 주소를 복사합니다.
3. 프로젝트 내 `app.js` 코드를 열고, **18번째 줄 쯤에 있는 `CONFIG.R2_UPLOAD_URL`** 변수의 값을 방금 복사한 Worker 주소로 변경해 줍니다.
   ```javascript
   const CONFIG = {
     // ...
     R2_UPLOAD_URL: 'https://dashboard-image-upload.xxxx.workers.dev/', 
     // ...
   };
   ```
4. 코드를 저장한 후 프로젝트를 Github 등에 푸시/배포하면 모든 과정이 종료됩니다. 
5. 대시보드에서 기사 작성 중 [이미지 업로드 칸]을 눌러 파일을 첨부했을 때 정상적으로 썸네일과 경로가 들어오는지 테스트합니다.
