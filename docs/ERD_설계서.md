> 작성일: 2026-07-05 · 버전: v0.5 (메일함 기능 제거로 MAIL/MAIL_RECIPIENT/MAIL_ATTACHMENT 3테이블 삭제, 조직도 상세는 채팅 연결로 대체) · ERD 다이어그램은 아래 테이블 설계를 바탕으로 직접 작성 예정 (`docs/ERD.mermaid`에 있던 초기 스케치는 현재 실제로 구현된 화면 기준으로 이 문서에서 다시 정리함)
>

# ERD 설계서

## 1. 화면에서 테이블 도출하기

화면 설계서(`docs/화면설계서.md`)와 실제 구현된 `js/*.js` 로직을 보면서

**"이 화면을 동작시키려면 어떤 데이터가 필요한가?"** 를 생각합니다.

| 화면 | 필요한 데이터 | 테이블 |
| --- | --- | --- |
| 로그인, 마이페이지 | 사번, 비밀번호, 이름, 연락처, 이메일, 프로필사진 | EMPLOYEE |
| 조직도 (부서 트리·직급 정렬) | 부서 목록, 직급 목록과 승인 서열 | DEPARTMENT, POSITION |
| 대시보드 출퇴근, 출결 현황, 관리자 출결 관리 | 직원별 날짜별 출근/퇴근 시각, 근태 상태 | ATTENDANCE |
| 공지사항 목록·상세·작성·수정 | 제목, 내용, 고정 여부, 조회수, 작성자 | NOTICE |
| 캘린더 일정 등록·조회 (연차처럼 여러 날짜에 걸친 일정 포함) | 일정 제목, 시작일~종료일, 구분(개인/팀/회사), 등록자 | CALENDAR_EVENT |
| 자료실 - 카테고리(공용/부서제한) | 자료실 이름, 공개 범위, 제한 부서 | REPOSITORY |
| 자료실 - 게시글 목록·상세·작성 | 제목, 본문, 등록자, 등록일, 소속 자료실 | ARCHIVE |
| 자료실 - 첨부파일 (게시글 1건당 여러 개) | 파일명, 경로, 크기 | ARCHIVE_FILE |
| 전자결재 - 서식 선택 | 서식 종류, 필요 결재 단계 수 | APPROVAL_FORM_TYPE |
| 전자결재 - 기안 작성·상세 | 제목, 내용, 휴가 기간, 상태, 기안자 | APPROVAL |
| 전자결재 - 결재선(승인/반려) | 결재 단계별 담당자, 단계 상태, 의견 | APPROVAL_LINE |
| 전자결재 - 참조 문서함 | 참조로 지정된 부서 또는 개별 직원 | APPROVAL_REFERENCE |
| 실시간 채팅 - 채팅방 목록 | 방 종류(1:1/그룹), 그룹방 이름 | CHAT_ROOM |
| 실시간 채팅 - 참여자, 새 대화 시작(부서→직원 선택) | 방에 속한 직원, 마지막으로 읽은 메시지 | CHAT_ROOM_MEMBER |
| 실시간 채팅 - 메시지 스레드 | 발신자, 내용/타입(텍스트·파일·시스템), 시각 | CHAT_MESSAGE |
| 실시간 채팅 - 파일 전송 | 첨부파일명, 경로, 크기 | CHAT_ATTACHMENT |

→ **총 17개 테이블** 도출

> 화면 개수(12개)보다 테이블이 더 많은 이유: 화면 하나가 여러 테이블의 데이터를 조합해서 보여주기도 하고(대시보드), 반대로 화면 하나를 제대로 정규화하려면 테이블이 쪼개지기도 합니다(전자결재 1개 화면 → APPROVAL/APPROVAL_LINE/APPROVAL_REFERENCE 3개 테이블). 아래 2장에서 왜 쪼갰는지 하나씩 설명합니다.
>

> ### ⚠️ v0.1 → v0.2 재검토 메모
>
> 테이블 14개라는 숫자 자체는 문제가 아니지만, 첫 초안을 다시 검토하면서 실제로 데이터가 깨질 수 있는 지점 4곳을 찾아 이번 버전에서 고쳤습니다.
>
> | 문제 | 원인 | 조치 |
> | --- | --- | --- |
> | 관리자 계정이 EMPLOYEE 제약을 못 지킴 | `DEPT_ID`, `POSITION_ID`가 NOT NULL인데 관리자는 실제 부서·직급이 없는 시스템 계정 | 두 컬럼을 NULLABLE로 변경하고, "ADMIN이면 NULL 가능·EMPLOYEE면 필수"를 CHECK로 강제 |
> | `APPROVAL.CURRENT_STEP`이 이중 관리 컬럼 | `APPROVAL_LINE`만으로 유도 가능한 값을 별도 저장 → 결재 처리 시 두 곳을 함께 갱신 안 하면 데이터 불일치 | 컬럼 삭제, `MIN(STEP_NO) WHERE LINE_STATUS='WAIT'`로 조회 시점에 계산 |
> | `APPROVAL_LINE`에 기안자(0단계) 포함 | `APPROVAL.DRAFTER_ID`와 같은 사람 정보를 두 테이블에 중복 저장 | `APPROVAL_LINE`은 실제 승인권자만 담도록 STEP_NO를 1부터 시작 |
> | `CHECK` 제약의 버전 의존성 | MySQL 8.0.16 미만에서는 CHECK가 파싱만 되고 무시됨 | 문서에 명시하고, 애플리케이션(서비스 계층) 검증을 1차 방어선으로 병행하도록 안내 |
>

> ### v0.3 → v0.4 변경 메모
>
> 외부 참고 ERD(TeamBridge)를 검토하며 우리 mock이 기획서보다 축소되어 있던 지점 3곳을 실제 화면·JS와 함께 확장했습니다.
>
> | 변경 | 이유 |
> | --- | --- |
> | `ARCHIVE_FILE` 단일 테이블 → `REPOSITORY` + `ARCHIVE` + `ARCHIVE_FILE` 3분할 | 기획서 3.8 "자료 상세 조회 = **글** + 첨부파일"인데, 기존 설계는 파일명이 곧 게시글이라 본문(제목·내용)을 담을 곳이 없었음. 게시글 1건에 파일 여러 개가 붙는 구조로 정정 |
> | `MAIL_RECIPIENT`에 `IS_STARRED`, `IS_DELETED` 추가 | 기획서 3.4 "추가" 기능(별표, 휴지통)을 실제 반영. 수신자별로 다르게 관리되어야 하므로 `MAIL` 본문이 아닌 `MAIL_RECIPIENT`(수신자별 행)에 저장 |
> | `CALENDAR_EVENT.EVENT_DATE` → `START_DATE`/`END_DATE` 범위형 | 연차·워크숍처럼 여러 날짜에 걸치는 일정을 하루짜리 컬럼 하나로는 표현할 수 없었음. 하루짜리 일정은 `START_DATE = END_DATE`로 표현 |
>

> ### v0.4 → v0.5 변경 메모
>
> 메일함 화면과 로직을 제품에서 완전히 제거하기로 하면서, 메일 전용 테이블도 함께 정리했습니다.
>
> | 변경 | 이유 |
> | --- | --- |
> | `MAIL` / `MAIL_RECIPIENT` / `MAIL_ATTACHMENT` 3테이블 삭제 | 메일함 화면(`mail.html`)과 관련 로직(`js/mail.js`)이 제거되어 더 이상 참조하는 화면이 없음 |
> | 조직도 상세 모달의 "메일 보내기" 버튼 → "채팅하기" 버튼만 유지 | 직원 간 연락 수단을 실시간 채팅(`CHAT_ROOM`/`CHAT_MESSAGE`)으로 일원화 |
>

---

## 2. 테이블 설계

### 2-1. DEPARTMENT — 부서

```
부서 목록(인사팀·기획팀·개발팀·디자인팀·총무팀)을 저장합니다.
직원(EMPLOYEE)과 자료실(ARCHIVE_FILE)이 이 테이블을 참조합니다.
부서명을 EMPLOYEE 테이블에 문자열로 직접 넣지 않고 분리하는 이유는,
"인사팀"이라는 이름이 나중에 "HR팀"으로 바뀌어도 이 테이블 한 줄만 고치면
모든 직원·자료실 데이터에 일괄 반영되기 때문입니다(정규화).
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| DEPT_ID | INT | PK, AUTO_INCREMENT | 부서 고유 번호 |
| DEPT_NAME | VARCHAR(50) | UNIQUE, NOT NULL | 부서명 (예: 개발팀) |

### 2-2. POSITION — 직급

```
직급 목록(사원·대리·과장·팀장·부서장)과 그 서열을 저장합니다.
프론트엔드 org.js에 있던 POSITION_RANK = {'부서장':1,'팀장':2,...} 매핑을
자바스크립트 상수로 하드코딩하지 않고 테이블(POSITION_RANK 컬럼)로 옮겼습니다.
직급 순서가 바뀌거나 새 직급이 추가돼도 코드 배포 없이 데이터만 수정하면 됩니다.
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| POSITION_ID | INT | PK, AUTO_INCREMENT | 직급 고유 번호 |
| POSITION_NAME | VARCHAR(20) | UNIQUE, NOT NULL | 직급명 (사원/대리/과장/팀장/부서장) |
| POSITION_RANK | INT | NOT NULL | 서열 (1=부서장 … 5=사원, 조직도 정렬·전자결재 승인권한 판단에 사용) |

### 2-3. EMPLOYEE — 직원

```
직원 한 명의 기본 정보를 저장합니다.
사번(EMPLOYEE_NO)은 로그인 ID로도 쓰이는 업무상 식별자이지만,
다른 테이블과의 FK 연결에는 정수형 PK(EMPLOYEE_ID)를 씁니다.
VARCHAR PK보다 INT PK가 인덱스 크기가 작고 조인이 빨라서(성능),
그리고 나중에 사번 체계가 바뀌어도 내부 관계가 깨지지 않아서(안정성)입니다.

현재 프론트 mock 데이터는 role 값으로 'user'/'team_leader'/'dept_head'/'admin'을
저장하지만, team_leader·dept_head는 사실 POSITION(팀장/부서장)에서 그대로
계산되는 값이라 중복 저장입니다(정규화 위반). 그래서 EMPLOYEE_ROLE은
"일반 직원인가 시스템 관리자인가"만 구분하고, 결재 승인 권한은 항상
POSITION_ID를 조인해서 실시간으로 판단하도록 설계했습니다.
또한 mock에서는 관리자 계정이 EMPLOYEE 목록에 아예 없이 로그인 시점에
자바스크립트로 하드코딩되어 있는데(login.js), 이 역시 데이터 모델 밖의 예외
처리라 실제 구현에서는 관리자도 EMPLOYEE_ROLE='ADMIN'인 정식 행으로 둡니다.

다만 관리자는 조직도·결재선·자료실 부서 구분 어디에도 등장하지 않는
시스템 계정이라, 진짜 부서·직급을 가진 일반 직원과 달리 DEPT_ID·POSITION_ID가
없어도 되어야 합니다. 그래서 두 컬럼을 NULLABLE로 두고, "일반 직원이면
반드시 부서·직급이 있어야 하고, 관리자면 없어도 된다"는 규칙을 CHECK 제약으로
강제합니다(가짜 부서 "IT기획팀", 가짜 직급 "관리자"를 억지로 만들지 않아도 됨).
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| EMPLOYEE_ID | INT | PK, AUTO_INCREMENT | 내부 식별용 고유 번호 |
| EMPLOYEE_NO | VARCHAR(20) | UNIQUE, NOT NULL | 사번 (로그인 ID 겸용, 예: 20260601) |
| EMPLOYEE_PWD | VARCHAR(300) | NOT NULL | 비밀번호 (해시 저장) |
| EMPLOYEE_NAME | VARCHAR(50) | NOT NULL | 이름 |
| DEPT_ID | INT | FK(DEPARTMENT), NULLABLE | 소속 부서 (관리자 계정은 NULL) |
| POSITION_ID | INT | FK(POSITION), NULLABLE | 직급 (관리자 계정은 NULL) |
| EMPLOYEE_ROLE | VARCHAR(10) | NOT NULL, DEFAULT 'EMPLOYEE' | 시스템 권한 (EMPLOYEE 일반 / ADMIN 관리자) |
| EMPLOYEE_PHONE | VARCHAR(20) | NULLABLE | 연락처 |
| EMPLOYEE_EMAIL | VARCHAR(200) | NULLABLE | 이메일 |
| PROFILE_IMG | VARCHAR(500) | NULLABLE | 프로필 사진 경로 |
| EMPLOYEE_STATUS | VARCHAR(10) | NOT NULL, DEFAULT 'ACTIVE' | 재직 상태 (ACTIVE 재직 / SUSPENDED 정지) |
| HIRE_DATE | DATE | NOT NULL | 입사일 |
| CREATED_AT | DATETIME | NOT NULL, DEFAULT NOW() | 계정 생성일시 |
| — | — | CHECK (EMPLOYEE_ROLE='ADMIN' OR (DEPT_ID IS NOT NULL AND POSITION_ID IS NOT NULL)) | 일반 직원은 부서·직급 필수, 관리자는 예외 허용 |

> **왜 탈퇴(DELETE)가 아니라 정지(SUSPENDED)인가?**
>
> 실제 admin.js에는 회원 삭제 기능이 없고 `toggleUserStatus()`로 상태만 바꿉니다.
> 이미 그 직원이 쓴 공지·결재·채팅·근태 기록이 남아있는데 행을 지워버리면
> FK 제약에 걸리거나(참조 무결성 위반), 억지로 지우면 과거 기록의 작성자 정보가
> 통째로 사라집니다. 그래서 직원은 항상 상태값만 바꾸는 "소프트 삭제" 방식으로
> 설계하고, EMPLOYEE를 참조하는 FK들은 모두 기본 옵션(ON DELETE RESTRICT)으로
> 물리 삭제 자체를 막습니다.
>

### 2-4. ATTENDANCE — 근태 기록

```
직원별·날짜별 출퇴근 기록 1건을 저장합니다.
같은 직원이 같은 날짜에 두 번 출근 처리되지 않도록
UNIQUE(EMPLOYEE_ID, WORK_DATE)로 막습니다.
대시보드의 출근/퇴근 버튼, 출결 현황 페이지, 관리자 출결 관리 페이지가
모두 이 한 테이블을 함께 씁니다.
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| ATTENDANCE_ID | INT | PK, AUTO_INCREMENT | 근태 기록 고유 번호 |
| EMPLOYEE_ID | INT | FK(EMPLOYEE), NOT NULL | 대상 직원 |
| WORK_DATE | DATE | NOT NULL | 근무 일자 |
| CHECK_IN_TIME | TIME | NULLABLE | 출근 시각 |
| CHECK_OUT_TIME | TIME | NULLABLE | 퇴근 시각 |
| ATTENDANCE_STATUS | VARCHAR(10) | NOT NULL | 근태 상태 (NORMAL 정상 / LATE 지각 / LEAVE 휴가) |
| — | — | UNIQUE(EMPLOYEE_ID, WORK_DATE) | 직원 1명당 하루 1건만 허용 |

### 2-5. NOTICE — 공지사항

```
관리자가 작성하는 공지사항을 저장합니다.
WRITER_ID로 작성자를 저장해두면, 화면에는 EMPLOYEE와 조인해서
"인사본부"처럼 부서명을 보여주든 "김영훈 부서장"처럼 이름을 보여주든
자유롭게 표시할 수 있습니다. (mock 데이터는 writer를 "인사본부" 같은
문자열로 직접 저장했는데, 실제 구현에서는 그 문자열을 지우고
작성자의 부서를 조인해서 보여주는 방식으로 바꿉니다.)
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| NOTICE_ID | INT | PK, AUTO_INCREMENT | 공지 고유 번호 |
| WRITER_ID | INT | FK(EMPLOYEE), NOT NULL | 작성자(관리자) |
| NOTICE_TITLE | VARCHAR(200) | NOT NULL | 제목 |
| NOTICE_CONTENT | TEXT | NOT NULL | 본문 |
| IS_PINNED | TINYINT(1) | NOT NULL, DEFAULT 0 | 상단 고정 여부 |
| VIEW_COUNT | INT | NOT NULL, DEFAULT 0 | 조회수 |
| CREATED_AT | DATETIME | NOT NULL, DEFAULT NOW() | 등록일시 |
| UPDATED_AT | DATETIME | NULLABLE | 수정일시 |

### 2-6. CALENDAR_EVENT — 일정

```
개인/팀/회사 일정을 저장합니다.
mock 데이터는 처음에 날짜를 "6월 며칠"이라는 정수 하나(EVENT_DATE)로만
저장했는데, 그러면 연차휴가나 워크숍처럼 여러 날짜에 걸치는 일정을
표현할 수 없습니다. 그래서 START_DATE~END_DATE 범위로 바꾸고,
하루짜리 일정은 START_DATE = END_DATE로 표현합니다.
실제 구현에서는 연·월이 바뀌어도 동작해야 하므로 완전한 DATE 타입으로 저장합니다.
캘린더 화면에서 "이 날짜에 표시할 일정"은
`WHERE :day BETWEEN START_DATE AND END_DATE`로 조회합니다.
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| EVENT_ID | INT | PK, AUTO_INCREMENT | 일정 고유 번호 |
| EMPLOYEE_ID | INT | FK(EMPLOYEE), NOT NULL | 등록자 |
| EVENT_TITLE | VARCHAR(200) | NOT NULL | 일정 제목 |
| START_DATE | DATE | NOT NULL | 일정 시작일 |
| END_DATE | DATE | NOT NULL | 일정 종료일 (하루짜리 일정은 START_DATE와 동일) |
| EVENT_CATEGORY | VARCHAR(10) | NOT NULL | 구분 (PERSONAL 개인 / TEAM 팀 / COMPANY 회사) |
| CREATED_AT | DATETIME | NOT NULL, DEFAULT NOW() | 등록일시 |
| — | — | CHECK (END_DATE >= START_DATE) | 종료일이 시작일보다 빠를 수 없음 |

### 2-7. REPOSITORY — 자료실 카테고리

```
자료실 종류(전사 공용 / 부서 제한)를 저장합니다.
mock의 archive.js는 "부서 제한 자료실"을 folder:'dept' 라는 값 하나로만
표시하고, 실제로는 업로드한 사람의 "현재 부서"로 암묵적으로 필터링합니다.
이 방식은 직원이 부서를 이동하면 예전에 올린 게시글의 접근 범위가
같이 바뀌어버리는 버그가 생깁니다. 그래서 DEPT_ID 컬럼을 따로 두어
"이 자료실이 어느 부서 전용인지"를 자료실 생성 시점 값으로 고정합니다
(전사 공용이면 DEPT_ID는 NULL). 지금은 부서마다 자료실이 1개씩이라
REPOSITORY 행이 몇 개 안 되지만, 나중에 "개발팀 - 프론트/백엔드"처럼
부서 안에 하위 자료실을 더 만들고 싶어져도 이 테이블만 늘리면 됩니다.
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| REPO_ID | INT | PK, AUTO_INCREMENT | 자료실 고유 번호 |
| REPO_NAME | VARCHAR(50) | NOT NULL | 자료실 이름 (예: 전사 공용 자료실) |
| DEPT_ID | INT | FK(DEPARTMENT), NULLABLE | 부서 제한 자료실일 때만 값 존재 (NULL = 전사 공용) |
| CREATED_AT | DATETIME | NOT NULL, DEFAULT NOW() | 생성일시 |

### 2-8. ARCHIVE — 자료실 게시글

```
자료실에 등록된 게시글(제목·본문)을 저장합니다. v0.3까지는 파일명이
곧 게시글이라 "이 자료가 왜 올라왔는지" 설명할 본문 칸이 없었는데,
기획서 3.8은 분명히 "글 + 첨부파일"이라고 정의해서 그 구조를 따라갑니다.
게시글 하나에 파일이 여러 개(archive.js의 files[])일 수 있으므로
파일은 아래 ARCHIVE_FILE로 1:N 분리합니다.
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| ARCHIVE_ID | INT | PK, AUTO_INCREMENT | 게시글 고유 번호 |
| REPO_ID | INT | FK(REPOSITORY), NOT NULL | 소속 자료실 |
| WRITER_ID | INT | FK(EMPLOYEE), NOT NULL | 작성자 |
| ARCHIVE_TITLE | VARCHAR(200) | NOT NULL | 제목 |
| ARCHIVE_CONTENT | TEXT | NOT NULL | 본문 |
| CREATED_AT | DATETIME | NOT NULL, DEFAULT NOW() | 등록일시 |
| UPDATED_AT | DATETIME | NULLABLE | 수정일시 |

### 2-9. ARCHIVE_FILE — 자료실 첨부파일

```
게시글에 첨부된 파일을 저장합니다. 게시글 1건에 파일이 여러 개
붙을 수 있으므로 ARCHIVE : ARCHIVE_FILE은 1:N 관계입니다.
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| FILE_ID | INT | PK, AUTO_INCREMENT | 파일 고유 번호 |
| ARCHIVE_ID | INT | FK(ARCHIVE), NOT NULL | 소속 게시글 |
| FILE_NAME | VARCHAR(300) | NOT NULL | 원본 파일명 |
| FILE_PATH | VARCHAR(500) | NOT NULL | 서버 저장 경로 |
| FILE_SIZE | BIGINT | NOT NULL | 파일 크기(byte, 화면에는 KB/MB로 변환해서 표시) |
| UPLOADED_AT | DATETIME | NOT NULL, DEFAULT NOW() | 업로드 일시 |

### 2-10. APPROVAL_FORM_TYPE — 결재 서식

```
연차휴가신청서 / 지출결의서 / 프로젝트품의서 3종을 저장합니다.
서식마다 결재 단계 수가 다른데(연차=팀장 전결 1단계, 나머지=팀장+부서장 2단계),
이 규칙을 자바스크립트에 if문으로 흩어놓는 대신 테이블 값으로 관리하면
서식이 추가되거나 결재 단계가 바뀌어도 코드 수정 없이 대응할 수 있습니다.
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| FORM_TYPE_ID | INT | PK, AUTO_INCREMENT | 서식 고유 번호 |
| FORM_TYPE_NAME | VARCHAR(50) | UNIQUE, NOT NULL | 서식명 (연차휴가신청서 / 지출결의서 / 프로젝트품의서) |
| APPROVAL_STEP_COUNT | INT | NOT NULL | 필요한 결재 단계 수 (1 또는 2) |

### 2-11. APPROVAL — 결재 문서

```
기안 문서 1건의 공통 정보를 저장합니다.
연차휴가신청서만 쓰는 휴가 시작/종료일은 그 서식일 때만 값이 들어가므로
NULLABLE로 둡니다. 최종 승인되면 이 기간이 ATTENDANCE에
ATTENDANCE_STATUS='LEAVE'로 자동 반영됩니다(approval.js의 실제 로직).
이때 APPROVAL_LINE 갱신과 ATTENDANCE 여러 건 upsert가 한 트랜잭션으로
묶여야, 중간에 실패해도 "승인은 됐는데 휴가는 반영 안 된" 상태가 안 생깁니다.

v0.1 초안에는 "현재 결재 단계"를 CURRENT_STEP 컬럼에 따로 저장했는데,
이 값은 APPROVAL_LINE만 봐도 그대로 구해지는 값입니다
(진행중인 문서라면 `MIN(STEP_NO) WHERE LINE_STATUS='WAIT'`가 곧 현재 단계).
같은 정보를 두 곳에 저장하면 결재 승인 처리 코드에서 APPROVAL_LINE과
APPROVAL을 항상 같이 갱신해야 하고, 하나라도 빠뜨리면 "받은 결재함"
목록이 실제와 어긋나게 됩니다. 그래서 이번 버전에서는 CURRENT_STEP을
빼고 조회 시점에 계산하는 쪽을 택했습니다(정합성 우선, 이후 조회가
느려지면 그때 캐시 컬럼으로 최적화).
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| APPROVAL_ID | INT | PK, AUTO_INCREMENT | 결재 문서 고유 번호 |
| DRAFTER_ID | INT | FK(EMPLOYEE), NOT NULL | 기안자 |
| FORM_TYPE_ID | INT | FK(APPROVAL_FORM_TYPE), NOT NULL | 결재 서식 |
| APPROVAL_TITLE | VARCHAR(200) | NOT NULL | 기안 제목 |
| APPROVAL_CONTENT | TEXT | NOT NULL | 기안 내용 |
| LEAVE_START_DATE | DATE | NULLABLE | 휴가 시작일 (연차휴가신청서 전용) |
| LEAVE_END_DATE | DATE | NULLABLE | 휴가 종료일 (연차휴가신청서 전용) |
| APPROVAL_STATUS | VARCHAR(10) | NOT NULL, DEFAULT 'PROGRESS' | 상태 (PROGRESS 진행중 / APPROVED 승인 / REJECTED 반려) |
| CREATED_AT | DATETIME | NOT NULL, DEFAULT NOW() | 기안일시 |

> 현재 결재 단계가 필요하면 `SELECT MIN(STEP_NO) FROM APPROVAL_LINE WHERE APPROVAL_ID=? AND LINE_STATUS='WAIT'`로 구합니다. "받은 결재함"(내가 지금 승인해야 할 문서 목록)은 `APPROVAL_LINE.APPROVER_ID = :me AND LINE_STATUS='WAIT' AND STEP_NO = (그 문서의 MIN(STEP_NO) WHERE WAIT)` 조건으로 조회합니다.
>

### 2-12. APPROVAL_LINE — 결재선

```
mock 데이터(js/common.js)는 결재선을 signers[], lineStatuses[], comments[]
라는 3개의 배열로 인덱스만 맞춰서 관리합니다. 이건 데이터베이스에 그대로
옮기면 안 되는 전형적인 안티패턴입니다(배열 인덱스로 서로 다른 컬럼을
암묵적으로 짝짓는 구조는 관계형 모델이 아닙니다). 그래서 "결재 문서 1건 :
결재 단계 여러 개"의 1:N 관계로 풀어서 별도 테이블로 분리했습니다.

v0.1 초안은 기안자 본인도 0단계로 APPROVAL_LINE에 넣었는데, 기안자는
이미 APPROVAL.DRAFTER_ID에 저장돼 있으므로 같은 사람을 두 테이블에
중복 기록하는 셈이었습니다. 그래서 APPROVAL_LINE은 실제로 승인·반려를
"결정하는" 사람만 담고, STEP_NO는 1(1차 승인자)부터 시작합니다.
화면에 "기안 → 1차 승인 → 최종 승인" 스테퍼를 그릴 때는
APPROVAL.DRAFTER_ID/CREATED_AT을 0번째 단계처럼 화면단에서 합성해서 보여줍니다.
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| LINE_ID | INT | PK, AUTO_INCREMENT | 결재선 고유 번호 |
| APPROVAL_ID | INT | FK(APPROVAL), NOT NULL | 대상 결재 문서 |
| STEP_NO | INT | NOT NULL | 결재 단계 (1=1차 승인자, 2=최종 승인자 …) |
| APPROVER_ID | INT | FK(EMPLOYEE), NOT NULL | 해당 단계 담당자 |
| LINE_STATUS | VARCHAR(10) | NOT NULL, DEFAULT 'WAIT' | 단계 상태 (WAIT 대기 / APPROVED 승인 / REJECTED 반려) |
| LINE_COMMENT | VARCHAR(500) | NULLABLE | 승인/반려 의견 |
| DECIDED_AT | DATETIME | NULLABLE | 승인/반려 처리 일시 |
| — | — | UNIQUE(APPROVAL_ID, STEP_NO) | 한 문서에 같은 단계 번호 중복 방지 |

### 2-13. APPROVAL_REFERENCE — 결재 참조 대상

```
전자결재 기안 작성 화면의 "조직도에서 선택" 팝업은 부서 단위로도,
개별 직원 단위로도 참조를 지정할 수 있습니다. 그래서 DEPT_ID와
EMPLOYEE_ID를 모두 NULLABLE로 두고 "둘 중 정확히 하나만 채워지도록"
애플리케이션 로직(또는 CHECK 제약)으로 강제합니다. 부서 참조 한 줄이면
해당 부서 전원이, 개인 참조 한 줄이면 그 사람만 참조 문서함에 나타납니다.
CHECK 제약은 MySQL 8.0.16 이상에서만 실제로 검사됩니다. 그보다 낮은
버전이면 조용히 무시되므로, INSERT를 담당하는 서비스 코드에서도
"DEPT_ID·EMPLOYEE_ID 중 정확히 하나만" 규칙을 한 번 더 검증해야 합니다.
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| REF_ID | INT | PK, AUTO_INCREMENT | 참조 지정 고유 번호 |
| APPROVAL_ID | INT | FK(APPROVAL), NOT NULL | 대상 결재 문서 |
| DEPT_ID | INT | FK(DEPARTMENT), NULLABLE | 부서 전체 참조 지정 시 |
| EMPLOYEE_ID | INT | FK(EMPLOYEE), NULLABLE | 개별 직원 참조 지정 시 |

### 2-14. CHAT_ROOM — 채팅방

```
1:1 채팅방과 그룹 채팅방을 같은 테이블에서 관리합니다. ROOM_TYPE으로
구분하고, 1:1방은 화면에 표시할 상대 이름을 그때그때 CHAT_ROOM_MEMBER를
조인해서 계산하므로 ROOM_NAME이 필요 없습니다(NULL). 그룹방만
ROOM_NAME에 실제 값이 들어갑니다.

기획서(3.5)에서 "1:1 채팅부터 구현하고 그룹은 확장"이라고 정했는데,
처음부터 ROOM_TYPE 구분을 넣어두면 그룹 기능을 나중에 추가할 때
테이블 구조를 갈아엎지 않고 CHAT_ROOM_MEMBER 행만 더 넣으면 됩니다.
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| ROOM_ID | INT | PK, AUTO_INCREMENT | 채팅방 고유 번호 |
| ROOM_TYPE | VARCHAR(5) | NOT NULL | 방 종류 (DM 1:1 / GROUP 그룹) |
| ROOM_NAME | VARCHAR(100) | NULLABLE | 그룹방 이름 (DM은 NULL) |
| CREATED_AT | DATETIME | NOT NULL, DEFAULT NOW() | 방 생성일시 |

### 2-15. CHAT_ROOM_MEMBER — 채팅방 참여자

```
어느 직원이 어느 방에 속해 있는지 잇는 접합 테이블(N:M)입니다.
"새 대화 시작" 화면에서 부서 → 직원을 선택해 방을 만들면, 선택된
인원 수만큼 이 테이블에 행이 생깁니다(1명이면 DM 2행, 여러 명이면
GROUP N행).

메시지마다 읽은 사람을 사람 수 × 메시지 수만큼 개별 행으로 기록하면
채팅방은 메시지가 훨씬 많이 쌓이기 때문에 행 수가 감당하기 어렵게
늘어납니다. 그래서 채팅은 카카오톡·슬랙처럼 "내가 마지막으로 읽은
메시지가 몇 번인지"만 LAST_READ_MESSAGE_ID 한 컬럼에 저장하고,
안읽음 개수는 `해당 방의 메시지 중 LAST_READ_MESSAGE_ID보다 뒤에 온 것의 개수`로 계산합니다.
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| MEMBER_ROW_ID | INT | PK, AUTO_INCREMENT | 참여 관계 고유 번호 |
| ROOM_ID | INT | FK(CHAT_ROOM), NOT NULL | 대상 채팅방 |
| EMPLOYEE_ID | INT | FK(EMPLOYEE), NOT NULL | 참여 직원 |
| LAST_READ_MESSAGE_ID | INT | FK(CHAT_MESSAGE), NULLABLE | 마지막으로 읽은 메시지 (아직 하나도 안 읽었으면 NULL) |
| JOINED_AT | DATETIME | NOT NULL, DEFAULT NOW() | 참여(입장) 일시 |
| — | — | UNIQUE(ROOM_ID, EMPLOYEE_ID) | 같은 방에 같은 사람이 중복 참여 방지 |

> LAST_READ_MESSAGE_ID가 CHAT_MESSAGE를 참조하는데 CHAT_MESSAGE는 아직 아래에서 정의되므로, 실제 DDL에서는 CHAT_MESSAGE를 먼저 만든 뒤 이 FK를 나중에 `ALTER TABLE`로 추가합니다(5장 SQL 참고).
>

### 2-16. CHAT_MESSAGE — 채팅 메시지

```
방별 메시지를 시간순으로 저장합니다. MESSAGE_TYPE으로 일반 텍스트,
파일 전송, "OO님이 입장했습니다" 같은 시스템 메시지를 구분합니다.
시스템 메시지는 SENDER_ID가 없으므로(누가 보낸 말이 아니라 방에서
발생한 이벤트) NULLABLE로 둡니다.

다른 화면들은 REST(HTTP 요청-응답)로 데이터를 주고받지만, 채팅은
기획서(1.4, 3.5)의 설계대로 WebSocket(STOMP)으로 실시간 전송됩니다.
다만 저장 방식 자체는 똑같이 테이블에 INSERT하는 것이라, "누가 보냈고
누가 읽었는지"를 DB에 기록하는 원리는 다른 화면과 동일합니다 -
다른 것은 전송 경로(HTTP vs WebSocket)뿐입니다.
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| MESSAGE_ID | INT | PK, AUTO_INCREMENT | 메시지 고유 번호 |
| ROOM_ID | INT | FK(CHAT_ROOM), NOT NULL | 대상 채팅방 |
| SENDER_ID | INT | FK(EMPLOYEE), NULLABLE | 발신자 (시스템 메시지는 NULL) |
| MESSAGE_TYPE | VARCHAR(10) | NOT NULL, DEFAULT 'TEXT' | 종류 (TEXT 텍스트 / FILE 파일 / SYSTEM 시스템 알림) |
| CONTENT | VARCHAR(1000) | NULLABLE | 메시지 본문 (FILE 타입은 NULL, CHAT_ATTACHMENT 참고) |
| SENT_AT | DATETIME | NOT NULL, DEFAULT NOW() | 전송 시각 |

### 2-17. CHAT_ATTACHMENT — 채팅 첨부파일

```
채팅 메시지 하나에 파일 1건이 붙는 구조입니다. ARCHIVE_FILE과
컬럼 구성은 비슷하지만, 메시지 하나당 여러 파일을 동시에 못 올리게
할지(채팅은 보통 파일마다 메시지 1건씩 순차 전송) 정책이 달라서
별도 테이블로 둡니다. 이 프로토타입은 파일 1건 = 메시지 1건 규칙을
따릅니다(js/chat.js의 handleChatFileSelect와 동일).
```

| 컬럼명 | 타입 | 제약조건 | 설명 |
| --- | --- | --- | --- |
| ATTACH_ID | INT | PK, AUTO_INCREMENT | 첨부파일 고유 번호 |
| MESSAGE_ID | INT | FK(CHAT_MESSAGE), NOT NULL, UNIQUE | 대상 메시지 (메시지 1건당 파일 1건) |
| FILE_NAME | VARCHAR(300) | NOT NULL | 원본 파일명 |
| FILE_PATH | VARCHAR(500) | NOT NULL | 서버 저장 경로 |
| FILE_SIZE | BIGINT | NOT NULL | 파일 크기(byte) |

---

## 3. 테이블 간 관계

> **비유**: 팀장 한 명이 여러 팀원의 결재를 승인합니다. 팀원은 자신의 결재를
> 승인할 팀장을 한 명만 지정합니다. 이처럼 **한 쪽이 여러 개를 가질 수 있는
> 관계**를 **1:N(일대다)** 관계라고 합니다.
>
> 채팅방 참여자처럼 **채팅방 하나에 여러 사람이 속하고, 한 사람도 여러
> 채팅방에 속할 수 있는 경우**는 **N:M(다대다)** 관계입니다. N:M은 데이터베이스
> 테이블로 바로 표현할 수 없어서, 중간에 접합 테이블(CHAT_ROOM_MEMBER 같은)을
> 두고 1:N + 1:N 두 개로 쪼개서 표현합니다.
>

| 관계 | 종류 | 설명 |
| --- | --- | --- |
| DEPARTMENT : EMPLOYEE | 1 : N | 한 부서에 여러 직원이 소속 |
| POSITION : EMPLOYEE | 1 : N | 한 직급에 여러 직원이 해당 |
| EMPLOYEE : ATTENDANCE | 1 : N | 한 직원이 여러 날짜의 근태 기록을 가짐 |
| EMPLOYEE : NOTICE | 1 : N | 한 직원(관리자)이 여러 공지를 작성 |
| EMPLOYEE : CALENDAR_EVENT | 1 : N | 한 직원이 여러 일정을 등록 |
| DEPARTMENT : REPOSITORY | 1 : N | 한 부서 제한 자료실은 한 부서에만 속함 (전사 공용은 DEPT_ID NULL) |
| REPOSITORY : ARCHIVE | 1 : N | 한 자료실에 여러 게시글이 등록됨 |
| EMPLOYEE : ARCHIVE | 1 : N | 한 직원이 여러 게시글을 작성 |
| ARCHIVE : ARCHIVE_FILE | 1 : N | 한 게시글에 여러 첨부파일이 붙음 |
| APPROVAL_FORM_TYPE : APPROVAL | 1 : N | 한 서식으로 여러 기안 문서가 작성됨 |
| EMPLOYEE : APPROVAL | 1 : N | 한 직원이 여러 문서를 기안 |
| APPROVAL : APPROVAL_LINE | 1 : N | 한 문서에 여러 결재 단계가 있음 |
| EMPLOYEE : APPROVAL_LINE | 1 : N | 한 직원이 여러 문서의 결재자로 지정됨 |
| APPROVAL : APPROVAL_REFERENCE | 1 : N | 한 문서에 여러 참조 대상이 지정됨 |
| CHAT_ROOM : EMPLOYEE (참여) | N : M | 채팅방 하나에 여러 참여자, 한 직원이 여러 방에 참여 → CHAT_ROOM_MEMBER로 연결 |
| CHAT_ROOM : CHAT_MESSAGE | 1 : N | 한 채팅방에 여러 메시지가 쌓임 |
| EMPLOYEE : CHAT_MESSAGE | 1 : N | 한 직원이 여러 메시지를 발신 |
| CHAT_MESSAGE : CHAT_ATTACHMENT | 1 : 1 | 파일 전송 메시지 한 건에 첨부파일 한 건 |

---

## 4. ERD 다이어그램

![](img/erd.png)

---

## 5. CREATE TABLE SQL

아래 SQL을 MySQL에서 순서대로 실행합니다.

> ⚠️ 주의: FK(외래키)가 참조하는 테이블이 먼저 만들어져 있어야 합니다.
> 반드시 아래 순서대로 실행하세요.
>

```sql
-- 데이터베이스 생성 및 선택
CREATE DATABASE groupware;
USE groupware;

-- ① DEPARTMENT — 다른 테이블이 참조하므로 가장 먼저 생성
CREATE TABLE DEPARTMENT (
    DEPT_ID   INT         AUTO_INCREMENT,
    DEPT_NAME VARCHAR(50) NOT NULL,
    CONSTRAINT PK_DEPARTMENT PRIMARY KEY (DEPT_ID),
    CONSTRAINT UQ_DEPT_NAME  UNIQUE      (DEPT_NAME)
);

-- ② POSITION — 다른 테이블이 참조하므로 가장 먼저 생성
-- POSITION은 MySQL 예약어(POSITION() 함수와 이름이 겹침)라서 백틱으로 감싸야 함
CREATE TABLE `POSITION` (
    POSITION_ID   INT         AUTO_INCREMENT,
    POSITION_NAME VARCHAR(20) NOT NULL,
    POSITION_RANK INT         NOT NULL,   -- 1=부서장 … 5=사원
    CONSTRAINT PK_POSITION      PRIMARY KEY (POSITION_ID),
    CONSTRAINT UQ_POSITION_NAME UNIQUE      (POSITION_NAME)
);

-- ③ EMPLOYEE — DEPARTMENT, POSITION 참조
CREATE TABLE EMPLOYEE (
    EMPLOYEE_ID    INT          AUTO_INCREMENT,
    EMPLOYEE_NO    VARCHAR(20)  NOT NULL,               -- 사번(로그인 ID 겸용)
    EMPLOYEE_PWD   VARCHAR(300) NOT NULL,
    EMPLOYEE_NAME  VARCHAR(50)  NOT NULL,
    DEPT_ID        INT          NULL,        -- 관리자(ADMIN)는 NULL 허용
    POSITION_ID    INT          NULL,        -- 관리자(ADMIN)는 NULL 허용
    EMPLOYEE_ROLE  VARCHAR(10)  NOT NULL DEFAULT 'EMPLOYEE',  -- EMPLOYEE / ADMIN
    EMPLOYEE_PHONE VARCHAR(20)  NULL,
    EMPLOYEE_EMAIL VARCHAR(200) NULL,
    PROFILE_IMG    VARCHAR(500) NULL,
    EMPLOYEE_STATUS VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',    -- ACTIVE / SUSPENDED
    HIRE_DATE      DATE         NOT NULL,
    CREATED_AT     DATETIME     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_EMPLOYEE         PRIMARY KEY (EMPLOYEE_ID),
    CONSTRAINT UQ_EMPLOYEE_NO      UNIQUE      (EMPLOYEE_NO),
    CONSTRAINT FK_EMPLOYEE_DEPT    FOREIGN KEY (DEPT_ID)
                                   REFERENCES  DEPARTMENT(DEPT_ID),
    CONSTRAINT FK_EMPLOYEE_POSITION FOREIGN KEY (POSITION_ID)
                                   REFERENCES  `POSITION`(POSITION_ID),
    -- MySQL 8.0.16 미만에서는 아래 CHECK가 무시되므로, 서비스 계층에서도
    -- 동일 규칙(일반 직원 등록 시 부서·직급 필수)을 반드시 함께 검증할 것
    CONSTRAINT CK_EMPLOYEE_DEPT_POSITION CHECK (
        EMPLOYEE_ROLE = 'ADMIN' OR (DEPT_ID IS NOT NULL AND POSITION_ID IS NOT NULL)
    )
);

-- ④ ATTENDANCE — EMPLOYEE 참조
CREATE TABLE ATTENDANCE (
    ATTENDANCE_ID     INT         AUTO_INCREMENT,
    EMPLOYEE_ID       INT         NOT NULL,
    WORK_DATE         DATE        NOT NULL,
    CHECK_IN_TIME     TIME        NULL,
    CHECK_OUT_TIME    TIME        NULL,
    ATTENDANCE_STATUS VARCHAR(10) NOT NULL,   -- NORMAL / LATE / LEAVE
    CONSTRAINT PK_ATTENDANCE       PRIMARY KEY (ATTENDANCE_ID),
    CONSTRAINT FK_ATTENDANCE_EMP   FOREIGN KEY (EMPLOYEE_ID)
                                   REFERENCES  EMPLOYEE(EMPLOYEE_ID),
    CONSTRAINT UQ_ATTENDANCE_DAY   UNIQUE      (EMPLOYEE_ID, WORK_DATE)
);

-- ⑤ NOTICE — EMPLOYEE 참조
CREATE TABLE NOTICE (
    NOTICE_ID      INT          AUTO_INCREMENT,
    WRITER_ID      INT          NOT NULL,
    NOTICE_TITLE   VARCHAR(200) NOT NULL,
    NOTICE_CONTENT TEXT         NOT NULL,
    IS_PINNED      TINYINT(1)   NOT NULL DEFAULT 0,
    VIEW_COUNT     INT          NOT NULL DEFAULT 0,
    CREATED_AT     DATETIME     NOT NULL DEFAULT NOW(),
    UPDATED_AT     DATETIME     NULL,
    CONSTRAINT PK_NOTICE        PRIMARY KEY (NOTICE_ID),
    CONSTRAINT FK_NOTICE_WRITER FOREIGN KEY (WRITER_ID)
                                REFERENCES  EMPLOYEE(EMPLOYEE_ID)
);

-- ⑥ CALENDAR_EVENT — EMPLOYEE 참조
CREATE TABLE CALENDAR_EVENT (
    EVENT_ID       INT          AUTO_INCREMENT,
    EMPLOYEE_ID    INT          NOT NULL,
    EVENT_TITLE    VARCHAR(200) NOT NULL,
    START_DATE     DATE         NOT NULL,
    END_DATE       DATE         NOT NULL,   -- 하루짜리 일정은 START_DATE와 동일
    EVENT_CATEGORY VARCHAR(10)  NOT NULL,   -- PERSONAL / TEAM / COMPANY
    CREATED_AT     DATETIME     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_CALENDAR_EVENT PRIMARY KEY (EVENT_ID),
    CONSTRAINT FK_EVENT_EMPLOYEE FOREIGN KEY (EMPLOYEE_ID)
                                 REFERENCES  EMPLOYEE(EMPLOYEE_ID),
    CONSTRAINT CK_EVENT_DATE_RANGE CHECK (END_DATE >= START_DATE)
);

-- ⑦ REPOSITORY — DEPARTMENT 참조
CREATE TABLE REPOSITORY (
    REPO_ID    INT         AUTO_INCREMENT,
    REPO_NAME  VARCHAR(50) NOT NULL,
    DEPT_ID    INT         NULL,        -- NULL = 전사 공용
    CREATED_AT DATETIME    NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_REPOSITORY   PRIMARY KEY (REPO_ID),
    CONSTRAINT FK_REPOSITORY_DEPT FOREIGN KEY (DEPT_ID)
                               REFERENCES  DEPARTMENT(DEPT_ID)
);

-- ⑧ ARCHIVE — REPOSITORY, EMPLOYEE 참조
CREATE TABLE ARCHIVE (
    ARCHIVE_ID      INT          AUTO_INCREMENT,
    REPO_ID         INT          NOT NULL,
    WRITER_ID       INT          NOT NULL,
    ARCHIVE_TITLE   VARCHAR(200) NOT NULL,
    ARCHIVE_CONTENT TEXT         NOT NULL,
    CREATED_AT      DATETIME     NOT NULL DEFAULT NOW(),
    UPDATED_AT      DATETIME     NULL,
    CONSTRAINT PK_ARCHIVE         PRIMARY KEY (ARCHIVE_ID),
    CONSTRAINT FK_ARCHIVE_REPO    FOREIGN KEY (REPO_ID)
                                  REFERENCES  REPOSITORY(REPO_ID),
    CONSTRAINT FK_ARCHIVE_WRITER  FOREIGN KEY (WRITER_ID)
                                  REFERENCES  EMPLOYEE(EMPLOYEE_ID)
);

-- ⑨ ARCHIVE_FILE — ARCHIVE 참조
CREATE TABLE ARCHIVE_FILE (
    FILE_ID     INT          AUTO_INCREMENT,
    ARCHIVE_ID  INT          NOT NULL,
    FILE_NAME   VARCHAR(300) NOT NULL,
    FILE_PATH   VARCHAR(500) NOT NULL,
    FILE_SIZE   BIGINT       NOT NULL,
    UPLOADED_AT DATETIME     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_ARCHIVE_FILE    PRIMARY KEY (FILE_ID),
    CONSTRAINT FK_ARCHIVEFILE_ARCHIVE FOREIGN KEY (ARCHIVE_ID)
                                      REFERENCES  ARCHIVE(ARCHIVE_ID)
);

-- ⑩ APPROVAL_FORM_TYPE — 다른 테이블이 참조하므로 먼저 생성
CREATE TABLE APPROVAL_FORM_TYPE (
    FORM_TYPE_ID        INT         AUTO_INCREMENT,
    FORM_TYPE_NAME      VARCHAR(50) NOT NULL,
    APPROVAL_STEP_COUNT INT         NOT NULL,   -- 1 또는 2
    CONSTRAINT PK_APPROVAL_FORM_TYPE PRIMARY KEY (FORM_TYPE_ID),
    CONSTRAINT UQ_FORM_TYPE_NAME     UNIQUE      (FORM_TYPE_NAME)
);

-- ⑪ APPROVAL — EMPLOYEE, APPROVAL_FORM_TYPE 참조
CREATE TABLE APPROVAL (
    APPROVAL_ID       INT          AUTO_INCREMENT,
    DRAFTER_ID        INT          NOT NULL,
    FORM_TYPE_ID      INT          NOT NULL,
    APPROVAL_TITLE    VARCHAR(200) NOT NULL,
    APPROVAL_CONTENT  TEXT         NOT NULL,
    LEAVE_START_DATE  DATE         NULL,
    LEAVE_END_DATE    DATE         NULL,
    APPROVAL_STATUS   VARCHAR(10)  NOT NULL DEFAULT 'PROGRESS',  -- PROGRESS/APPROVED/REJECTED
    CREATED_AT        DATETIME     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_APPROVAL           PRIMARY KEY (APPROVAL_ID),
    CONSTRAINT FK_APPROVAL_DRAFTER   FOREIGN KEY (DRAFTER_ID)
                                     REFERENCES  EMPLOYEE(EMPLOYEE_ID),
    CONSTRAINT FK_APPROVAL_FORMTYPE  FOREIGN KEY (FORM_TYPE_ID)
                                     REFERENCES  APPROVAL_FORM_TYPE(FORM_TYPE_ID)
);

-- ⑫ APPROVAL_LINE — APPROVAL, EMPLOYEE 참조
CREATE TABLE APPROVAL_LINE (
    LINE_ID       INT          AUTO_INCREMENT,
    APPROVAL_ID   INT          NOT NULL,
    STEP_NO       INT          NOT NULL,
    APPROVER_ID   INT          NOT NULL,
    LINE_STATUS   VARCHAR(10)  NOT NULL DEFAULT 'WAIT',  -- WAIT/APPROVED/REJECTED
    LINE_COMMENT  VARCHAR(500) NULL,
    DECIDED_AT    DATETIME     NULL,
    CONSTRAINT PK_APPROVAL_LINE     PRIMARY KEY (LINE_ID),
    CONSTRAINT FK_LINE_APPROVAL     FOREIGN KEY (APPROVAL_ID)
                                    REFERENCES  APPROVAL(APPROVAL_ID),
    CONSTRAINT FK_LINE_APPROVER     FOREIGN KEY (APPROVER_ID)
                                    REFERENCES  EMPLOYEE(EMPLOYEE_ID),
    CONSTRAINT UQ_LINE_APPROVAL_STEP UNIQUE     (APPROVAL_ID, STEP_NO)
);

-- ⑬ APPROVAL_REFERENCE — APPROVAL, DEPARTMENT, EMPLOYEE 참조
CREATE TABLE APPROVAL_REFERENCE (
    REF_ID       INT AUTO_INCREMENT,
    APPROVAL_ID  INT NOT NULL,
    DEPT_ID      INT NULL,
    EMPLOYEE_ID  INT NULL,
    CONSTRAINT PK_APPROVAL_REFERENCE PRIMARY KEY (REF_ID),
    CONSTRAINT FK_REF_APPROVAL       FOREIGN KEY (APPROVAL_ID)
                                     REFERENCES  APPROVAL(APPROVAL_ID),
    CONSTRAINT FK_REF_DEPT           FOREIGN KEY (DEPT_ID)
                                     REFERENCES  DEPARTMENT(DEPT_ID),
    CONSTRAINT FK_REF_EMPLOYEE       FOREIGN KEY (EMPLOYEE_ID)
                                     REFERENCES  EMPLOYEE(EMPLOYEE_ID),
    -- MySQL 8.0.16 미만에서는 무시됨 → 서비스 계층 검증 병행 필수
    CONSTRAINT CK_REF_ONE_TARGET     CHECK (
        (DEPT_ID IS NOT NULL AND EMPLOYEE_ID IS NULL) OR
        (DEPT_ID IS NULL AND EMPLOYEE_ID IS NOT NULL)
    )
);

-- ⑭ CHAT_ROOM — 다른 테이블이 참조하므로 먼저 생성
CREATE TABLE CHAT_ROOM (
    ROOM_ID    INT          AUTO_INCREMENT,
    ROOM_TYPE  VARCHAR(5)   NOT NULL,   -- DM / GROUP
    ROOM_NAME  VARCHAR(100) NULL,       -- GROUP만 값 존재
    CREATED_AT DATETIME     NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_CHAT_ROOM PRIMARY KEY (ROOM_ID)
);

-- ⑮ CHAT_MESSAGE — CHAT_ROOM, EMPLOYEE 참조 (CHAT_ROOM_MEMBER보다 먼저 생성)
CREATE TABLE CHAT_MESSAGE (
    MESSAGE_ID   INT           AUTO_INCREMENT,
    ROOM_ID      INT           NOT NULL,
    SENDER_ID    INT           NULL,        -- 시스템 메시지는 NULL
    MESSAGE_TYPE VARCHAR(10)   NOT NULL DEFAULT 'TEXT',  -- TEXT / FILE / SYSTEM
    CONTENT      VARCHAR(1000) NULL,
    SENT_AT      DATETIME      NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_CHAT_MESSAGE     PRIMARY KEY (MESSAGE_ID),
    CONSTRAINT FK_MESSAGE_ROOM     FOREIGN KEY (ROOM_ID)
                                   REFERENCES  CHAT_ROOM(ROOM_ID),
    CONSTRAINT FK_MESSAGE_SENDER   FOREIGN KEY (SENDER_ID)
                                   REFERENCES  EMPLOYEE(EMPLOYEE_ID)
);

-- ⑯ CHAT_ROOM_MEMBER — CHAT_ROOM, EMPLOYEE, CHAT_MESSAGE 참조
-- (CHAT_MESSAGE를 참조하는 LAST_READ_MESSAGE_ID는 두 테이블이 서로를
--  가리키는 순환 참조이므로, 테이블 생성 후 ALTER TABLE로 추가한다)
CREATE TABLE CHAT_ROOM_MEMBER (
    MEMBER_ROW_ID         INT      AUTO_INCREMENT,
    ROOM_ID               INT      NOT NULL,
    EMPLOYEE_ID            INT      NOT NULL,
    LAST_READ_MESSAGE_ID  INT      NULL,
    JOINED_AT             DATETIME NOT NULL DEFAULT NOW(),
    CONSTRAINT PK_CHAT_ROOM_MEMBER  PRIMARY KEY (MEMBER_ROW_ID),
    CONSTRAINT FK_ROOMMEMBER_ROOM   FOREIGN KEY (ROOM_ID)
                                    REFERENCES  CHAT_ROOM(ROOM_ID),
    CONSTRAINT FK_ROOMMEMBER_EMP    FOREIGN KEY (EMPLOYEE_ID)
                                    REFERENCES  EMPLOYEE(EMPLOYEE_ID),
    CONSTRAINT UQ_ROOMMEMBER_ROOM_EMP UNIQUE    (ROOM_ID, EMPLOYEE_ID)
);

ALTER TABLE CHAT_ROOM_MEMBER
    ADD CONSTRAINT FK_ROOMMEMBER_LASTREAD FOREIGN KEY (LAST_READ_MESSAGE_ID)
        REFERENCES CHAT_MESSAGE(MESSAGE_ID);

-- ⑰ CHAT_ATTACHMENT — CHAT_MESSAGE 참조
CREATE TABLE CHAT_ATTACHMENT (
    ATTACH_ID  INT          AUTO_INCREMENT,
    MESSAGE_ID INT          NOT NULL,
    FILE_NAME  VARCHAR(300) NOT NULL,
    FILE_PATH  VARCHAR(500) NOT NULL,
    FILE_SIZE  BIGINT       NOT NULL,
    CONSTRAINT PK_CHAT_ATTACHMENT   PRIMARY KEY (ATTACH_ID),
    CONSTRAINT FK_CHATATTACH_MESSAGE FOREIGN KEY (MESSAGE_ID)
                                     REFERENCES  CHAT_MESSAGE(MESSAGE_ID),
    CONSTRAINT UQ_CHATATTACH_MESSAGE UNIQUE      (MESSAGE_ID)
);
```

---

## 6. 정리

| 개념 | 의미 |
| --- | --- |
| **ERD** | 테이블 구조와 관계를 표현한 데이터베이스 설계 도면 |
| **정규화** | 같은 데이터를 여러 곳에 중복 저장하지 않도록 테이블을 쪼개는 작업 (예: 자바스크립트 배열 인덱스로 관리하던 결재선을 APPROVAL_LINE 테이블로 분리) |
| **1:N 관계** | 한 행이 다른 테이블의 여러 행과 연결되는 관계 (부서 1개 : 직원 여러 명) |
| **N:M 관계** | 양쪽 모두 여러 개와 연결될 수 있는 관계. 테이블로 직접 표현이 안 돼서 접합 테이블로 1:N 두 개로 쪼갬 (채팅방 : 참여자 → CHAT_ROOM_MEMBER) |
| **FK(외래키)** | 다른 테이블의 PK를 참조해 테이블 간 관계를 연결하는 컬럼 |
| **UNIQUE 제약** | 해당 컬럼(조합)에 중복 값이 들어오지 못하도록 막는 제약 (직원 1명당 하루 근태 1건, 채팅방당 같은 사람 중복 참여 방지 등) |
| **소프트 삭제** | 행을 실제로 지우지 않고 상태 컬럼만 바꿔서 "삭제된 것처럼" 처리하는 방식. 이 프로젝트는 직원을 물리 삭제하지 않고 EMPLOYEE_STATUS='SUSPENDED'로만 바꿈 |
| **CHECK 제약** | 컬럼 값이 특정 조건을 만족할 때만 저장을 허용하는 제약 (APPROVAL_REFERENCE에서 부서·직원 참조 중 정확히 하나만 채워지도록 강제) |
| **읽음 커서(read cursor)** | 메시지마다 읽은 사람을 개별 행으로 기록하는 대신 "마지막으로 읽은 메시지 하나"만 저장해 안읽음 개수를 계산하는 방식. 메시지 양이 많은 채팅에서 메시지별 읽음 기록보다 데이터 양이 훨씬 적음 (CHAT_ROOM_MEMBER.LAST_READ_MESSAGE_ID) |
| **순환 참조(circular reference)** | 두 테이블이 서로를 FK로 가리키는 상황. CHAT_ROOM_MEMBER→CHAT_MESSAGE(마지막으로 읽은 메시지)와 CHAT_MESSAGE→CHAT_ROOM(소속 방)이 서로 얽혀 있어, 두 테이블을 먼저 만든 뒤 `ALTER TABLE`로 나중에 FK를 추가해야 함 |
