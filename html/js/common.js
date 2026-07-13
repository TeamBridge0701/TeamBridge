// ===================================================================
// common.js - 모든 화면(html)에서 공통으로 불러 쓰는 파일
//
// 여기에는 다음 것들이 들어있다:
//   A. 목업 데이터베이스 역할을 하는 전역 state 객체
//   B. state를 브라우저 localStorage에 저장/복원하는 함수
//   C. 로그인 사용자 정보를 localStorage에 저장/복원하는 함수 (로그인 자체를
//      막는 차단 로직은 없음 - 아래 initPage() 설명 참고)
//   D. 페이지 이동(사이드바 클릭 등) 관련 함수
//   F. 아바타(프로필 사진/이니셜) 렌더링 함수
//   G. 상단 헤더(로그인한 사용자 정보, 안읽은 채팅 수 등) 초기화 함수
//   I. 모달(팝업) 열고 닫는 함수
//   J. 우측 하단 토스트 알림 함수
//   L. 각 화면(html)이 로드될 때 공통으로 실행하는 초기화 함수(initPage)
//
// 실제 서비스라면 A의 state가 DB에서 오고, B의 저장은 서버 API 호출이 되겠지만
// 지금은 백엔드가 없는 프로토타입이라 전부 브라우저 localStorage로 흉내낸다.
//
// 참고 - 헤더/사이드바(네비게이션)와 로그인 차단 로직은 이 파일에 없다:
//   - 헤더(<header class="header">)와 사이드바(<aside class="sidebar">)는
//     더 이상 이 파일에서 HTML로 생성해 주입하지 않는다. 각 화면 html
//     파일(main.html 등)에 직접 정적 HTML로 들어있고, 나중에는 layout.html을
//     타임리프 조각(fragment)으로 연결해서 쓸 예정이다.
//   - "로그인 안 했으면 접근을 막고 로그인 페이지로 돌려보내는" 차단 로직도
//     지금은 없다. 추후 STS(스프링) 백엔드 작업 시 Spring Security 등으로
//     서버단에서 처리할 예정이라, 지금은 일부러 비워 두었다.
//
// ===================================================================
// 🔧 백엔드 작업 가이드 (순서 0 — 모든 화면의 전제, docs/기획서.md 8장 1순위)
//   전체 작업 순서·API 목록은 docs/백엔드_작업_흐름.md 에 모아뒀다. 이 파일은
//   그중 "공통 인프라" 담당이라 제일 먼저 끝내야 나머지 화면 작업이 가능하다.
//
// [1] state.users, state.notices 등 A섹션의 배열 전체를
//     → 삭제하고, 각 화면 js가 fetch()로 서버 API를 호출해 그때그때 받아오도록 바꾼다.
//     (지금처럼 페이지 로드시 "전체 데이터를 미리 다 갖고 있는" 구조가 아니라,
//      화면에 필요한 만큼만 서버에 요청하는 구조로 바뀐다는 뜻)
//
// [2] loadState()/saveState() (B섹션) → 통째로 삭제 대상.
//     localStorage 대신 매번 서버 API를 호출하므로 "전체 상태 저장/복원"이 필요 없다.
//
// [3] checkAuth()/saveCurrentUser()/doLogout() (C섹션) → Spring Security 세션 기반으로 교체.
//     - checkAuth(): 지금은 localStorage 확인이 전부라 "로그인 안 해도 접근 가능".
//       실제로는 LoginInterceptor가 세션 없는 요청을 /login 으로 리다이렉트하게 만들고,
//       화면단에서는 Thymeleaf가 세션의 로그인 사용자 정보를 미리 렌더링해주므로
//       이 함수 자체가 필요 없어질 가능성이 높다.
//     - doLogout(): GET /logout 호출로 교체 (서버가 세션 무효화 후 /login 리다이렉트)
//
// [4] getAttendanceRecord()/upsertAttendanceRecord() (근태 헬퍼) →
//     각각 GET /attendance/... 조회 API, POST /attendance/checkin|checkout 호출로 대체.
//     이 두 함수를 쓰는 곳(dashboard.js, attendance.js, admin-attendance.js, org.js,
//     approval.js)도 전부 함께 손봐야 한다.
//
// [5] avatarMarkup()/showToast()/openModal()/closeModal() (F,I,J섹션) → 순수 화면단
//     유틸리티라 그대로 유지 가능. 다만 avatarMarkup의 user.photo 경로는 서버가
//     내려주는 실제 업로드 파일 경로(PROFILE_IMG)로 채워지게 된다.
//
// [6] initApplicationHeader()의 안읽은 채팅 수 계산(G섹션) → 클라이언트에서
//     state.chatMessages 전체를 뒤지는 대신 GET /chat/unread-count 같은 집계 API로 교체.
//     (채팅 메시지는 방대해질 수 있어 브라우저에서 전량 순회하면 안 됨)
// ===================================================================

// -----------------------------------------------------------
// A. 공유 상태 모델 (미리 채워진 목업 데이터)
// 이 state 객체 하나가 "가짜 데이터베이스" 역할을 한다.
// 각 화면의 js 파일(notice.js, chat.js 등)은 모두 이 state를 읽고 고쳐서
// 화면을 다시 그리고, 마지막에 saveState()로 localStorage에 저장한다.
// -----------------------------------------------------------
let state = {
  // currentUser: 현재 로그인한 사용자 정보. 로그인 전에는 null이며,
  // login.js의 doLogin()이 로그인 성공 시 이 값을 채운다.
  currentUser: null,

  // 아래 active* 값들은 "지금 어떤 탭/필터/폴더를 보고 있는지"를 기억해 두는
  // 값이다. 예를 들어 activeFolder는 archive.js가 자료실의 공용/부서 폴더 중
  // 어떤 걸 보여줄지 판단할 때 쓴다.
  activeFolder: 'public',
  activeOrgDept: 'all',
  activeMailTab: 'received',
  activeAppTab: 'write',
  activeChatFilter: 'all',
  activeChatRoomId: 1,

  // users: 전체 임직원 목록. 로그인(login.js), 조직도(org.js), 관리자
  // 화면(admin.js) 등 사원 정보가 필요한 모든 곳에서 이 배열을 사용한다.
  users: [
    { id: '20260601', name: '홍길동', dept: '개발팀', position: '사원', phone: '010-1234-5678', email: 'hong@corporation.com', status: '정상', role: 'user' },
    { id: '20260102', name: '김우주', dept: '개발팀', position: '팀장', phone: '010-9876-5432', email: 'space@corporation.com', status: '정상', role: 'team_leader' },
    { id: '20260010', name: '김영훈', dept: '기획팀', position: '부서장', phone: '010-1111-2222', email: 'ceo@corporation.com', status: '정상', role: 'dept_head' },
    { id: '20260901', name: '이다니엘', dept: '인사팀', position: '팀장', phone: '010-3333-4444', email: 'daniel@corporation.com', status: '정상', role: 'team_leader' },
    { id: '20260803', name: '정진국', dept: '디자인팀', position: '사원', phone: '010-5555-6666', email: 'cook@corporation.com', status: '정상', role: 'user' }
  ],
  notices: [
    { id: 1, title: '[전사] 2026년 하반기 전사 조직 개편 및 인사 발령 안내', content: "안녕하십니까. 경영지원본부입니다.\n2026년 하반기를 맞이하여 다음과 같이 조직 개편 및 보직 인사를 공지합니다.\n\n[부서 개편 안내]\n- 기획본부 산하 전략 기획팀 확대 재편\n- 연구 개발본부 산하 모바일 서비스 개발셀 신설\n\n[주요 인사 발령]\n- 김영훈 부서장 (기획팀 총괄 겸임)\n- 김우주 팀장 (개발 1팀 기술 총괄)\n\n상기 발령 사항은 2026년 7월 1일부로 효력이 발생하오니 임직원 여러분은 참고하시기 바랍니다.", writer: '인사본부', date: '2026-06-30', views: 42, pinned: true },
    { id: 2, title: '[안내] 신규 통합 그룹웨어 정식 오픈 및 피드백 요청', content: "임직원 여러분,\n오랫동안 준비해 온 신규 사내 통합 그룹웨어 시스템이 오늘 정식 오픈하였습니다!\n본 시스템은 근태 체크, 결재 프로세스, 자료 관리 및 캘린더 일정을 통합하여 업무 효율을 높이기 위해 개발되었습니다.\n\n시스템을 사용하시면서 발견되는 버그나 불편 사항, 기능 건의 사항 등은 [개발팀] 또는 마이페이지 피드백 채널을 통해 언제든 연락해 주시기 바랍니다.\n\n감사합니다.", writer: '인사본부', date: '2026-06-30', views: 28, pinned: false },
    { id: 3, title: '[필독] 하절기 에너지 절약 및 사내 냉방 온도 규칙 준수 안내', content: "전력 사용량이 증가하는 여름철을 맞아 사내 에너지 절약 실천에 동참해 주시기를 부탁드립니다.\n\n[실천 가이드라인]\n- 냉방 실내 적정 온도(26℃) 준수\n- 장시간 자리 비움 시 모니터 및 개인 전열기구 전원 차단\n- 퇴근 시 반드시 소등 및 에어컨 전원 확인\n\n지속 가능한 업무 환경 조성을 위해 사소한 것부터 실천해 주시면 감사하겠습니다.", writer: '총무팀', date: '2026-06-29', views: 56, pinned: false },
    { id: 4, title: '[교육] 사내 정보보안 교육 이수 안내 (전 직원 필수)', content: "전 직원 대상 정보보안 의무 교육 안내드립니다.\n기한: 2026년 6월 25일 ~ 6월 30일\n방법: 사내 교육 포털 온라인 수강 후 퀴즈 통과\n미이수자는 인사고과에 반영될 수 있으니 기한 내 반드시 완료해 주시기 바랍니다.", writer: '총무팀', date: '2026-06-24', views: 37, pinned: false },
    { id: 5, title: '[복지] 하계 휴가비 지급 및 신청 방법 안내', content: "2026년 하계 휴가비가 지급됩니다.\n대상: 재직 6개월 이상 전 직원\n지급일: 2026년 6월 급여일\n연차 사용 계획서는 팀장 승인 후 인사팀에 제출해 주세요.", writer: '인사본부', date: '2026-06-20', views: 61, pinned: false },
    { id: 6, title: '[안내] 사내 네트워크 점검으로 인한 일시 접속 제한 공지', content: "서버 안정화 작업으로 인해 아래 시간 동안 사내망 접속이 제한됩니다.\n일시: 2026년 6월 22일(월) 00:00 ~ 02:00\n영향: VPN, 그룹웨어, 사내 메일 접속 불가\n업무에 참고 부탁드립니다.", writer: '개발팀', date: '2026-06-19', views: 33, pinned: false },
    { id: 7, title: '[모집] 사내 동호회 신규 회원 모집 안내', content: "2026년 하반기 사내 동호회 신규 회원을 모집합니다.\n등산, 풋살, 독서, 보드게임 총 4개 동호회 운영 중이며 관심 있는 분들은 총무팀으로 신청해 주세요.", writer: '총무팀', date: '2026-06-17', views: 45, pinned: false },
    { id: 8, title: '[필독] 사옥 주차장 이용 규정 개정 안내', content: "주차 공간 부족 문제 개선을 위해 주차 규정이 개정됩니다.\n- 등록 차량 1인 1대로 제한\n- 방문객 주차는 사전 예약제로 전환\n적용일: 2026년 7월 1일부터", writer: '총무팀', date: '2026-06-15', views: 29, pinned: false },
    { id: 9, title: '[안내] 2분기 실적 공유회 개최 안내', content: "2분기 부서별 실적 공유회를 아래와 같이 진행합니다.\n일시: 2026년 6월 24일(수) 15:00\n장소: 대회의실 / 온라인 동시 진행\n전 부서장 및 팀장은 필참 부탁드립니다.", writer: '기획팀', date: '2026-06-12', views: 51, pinned: false },
    { id: 10, title: '[채용] 개발팀 경력직 채용 공고 안내 (내부 추천 가능)', content: "개발팀 백엔드/프론트엔드 경력직을 채용합니다.\n내부 추천 시 소정의 추천 포상금이 지급되니 주변에 좋은 인재가 있다면 인사팀으로 문의해 주세요.", writer: '인사본부', date: '2026-06-10', views: 39, pinned: false },
    { id: 11, title: '[안내] 사내 카페테리아 여름 메뉴 리뉴얼 공지', content: "무더운 여름을 맞아 사내 카페테리아 메뉴가 리뉴얼됩니다.\n냉면, 콩국수 등 여름 별미 메뉴가 추가되며 7월 첫째 주부터 적용됩니다.", writer: '총무팀', date: '2026-06-08', views: 24, pinned: false },
    { id: 12, title: '[필독] 개인정보보호법 개정에 따른 사내 정책 변경 안내', content: "개인정보보호법 개정에 따라 사내 개인정보 취급 방침이 일부 변경됩니다.\n변경된 정책은 사내 규정집 3장을 참고해 주시고, 담당 업무에 개인정보가 포함된 경우 반드시 숙지해 주시기 바랍니다.", writer: '경영지원본부', date: '2026-06-05', views: 47, pinned: false }
  ],
  // calendarEvents: 연차·워크숍처럼 여러 날에 걸치는 일정을 표현하기 위해 단일 date 대신
  // startDate~endDate 범위로 저장한다. 하루짜리 일정은 startDate === endDate.
  calendarEvents: [
    { id: 1, title: '개발팀 주간 정기회의', startDate: 3, endDate: 3, category: 'team' },
    { id: 2, title: '김철수 대리 연차휴가', startDate: 10, endDate: 12, category: 'personal' },
    { id: 3, title: '프로젝트 마감 워크숍', startDate: 18, endDate: 19, category: 'company' },
    { id: 4, title: '사내 급여일', startDate: 25, endDate: 25, category: 'company' },
    { id: 5, title: '그룹웨어 화면 검토', startDate: 30, endDate: 30, category: 'team' }
  ],
  // approvals: 전자결재 문서함(approval.html/js)에서 쓰는 기안 문서 목록.
  // signers는 결재선(승인자 id를 순서대로 나열), step은 "지금 몇 번째
  // 결재자 차례인지"를 가리키는 인덱스, lineStatuses는 각 결재 단계별
  // 승인/반려/대기 상태를 signers와 같은 순서로 나열한 배열이다.
  approvals: [
    { id: 1001, title: '하반기 휴가 연차원 기안', drafterId: '20260102', type: '연차휴가신청서', content: '하반기 개인 사정으로 인한 연차 휴가를 신청합니다.\n기간: 2026년 7월 5일 ~ 7월 8일 (총 4일)\n인수인계 대행자: 정진국 사원', date: '2026-06-30', status: '진행중', step: 1, signers: ['20260102', '20260010'], lineStatuses: ['승인', '대기'], comments: ['', ''], refDepts: ['인사팀'] },
    { id: 1002, title: '도서구입 지출결의서 (인쇄출판비)', drafterId: '20260601', type: '지출결의서', content: '개발 업무 참고 서적 구입 건\n1. 모던 웹 자바스크립트 가이드 2권: 60,000원\n2. 스프링 부트 핵심 원리: 42,000원\n총액: 102,000원', date: '2026-06-29', status: '진행중', step: 1, signers: ['20260102', '20260010'], lineStatuses: ['승인', '대기'], comments: ['업무 관련 확인', ''], refDepts: ['총무팀'] },
    { id: 1003, title: '기획팀 워크숍 경비 기안서', drafterId: '20260010', type: '프로젝트품의서', content: '기획팀 단합 워크숍 실경비 청구\n일시: 2026년 6월 26일\n장소: 대부도 펜션 타운\n참가 인원: 4명\n실 집행 정산 경비 합계: 450,000원 (상세 내역 첨부)', date: '2026-06-28', status: '승인', step: 2, signers: ['20260010'], lineStatuses: ['승인'], comments: ['최종 승인 완료'], refDepts: ['총무팀', '인사팀'] }
  ],
  // archivePosts: 자료실은 "게시글 + 첨부파일(여러 개 가능)" 구조다. 예전 files[] 배열은
  // 파일명이 곧 게시글이었는데, 기획서 3.8("자료 상세 조회 = 글 + 첨부파일")에 맞춰
  // 제목/본문을 가진 게시글 아래에 파일이 1개 이상 달리는 구조로 바꿨다.
  archivePosts: [
    { id: 1, title: '2026년 사내 복지제도 가이드북 안내', content: '2026년 개편된 사내 복지제도 전체 내용을 정리한 가이드북입니다.\n경조사비, 건강검진, 동호회 지원 항목이 새로 추가되었으니 참고해 주세요.', uploader: '인사본부', date: '2026-06-15', folder: 'public', files: [{ name: '2026년_사내_복지제도_가이드북.pdf', size: '1.2 MB' }] },
    { id: 2, title: 'Spring Boot + MyBatis 개발표준 규격서 공유', content: '그룹웨어 백엔드 개발 시 공통으로 따를 코딩 컨벤션과 패키지 구조를 정리했습니다.\n신규 모듈 개발 전에 꼭 한 번 읽어주세요.', uploader: '김우주', date: '2026-06-25', folder: 'public', files: [{ name: 'Spring_Boot_MyBatis_개발표준_규격서.docx', size: '840 KB' }] },
    { id: 3, title: '개발팀 하반기 서버인프라 구매리스트', content: '하반기 증설 예정인 서버 인프라 및 라이선스 구매 목록입니다.\n예산 승인 후 순차 발주 예정입니다.', uploader: '홍길동', date: '2026-06-30', folder: 'dept', files: [{ name: '개발팀_하반기_서버인프라_구매리스트.xlsx', size: '3.4 MB' }] },
    { id: 4, title: '정보보안 교육 이수 안내문 배포', content: '전 직원 대상 정보보안 의무 교육 관련 상세 안내문입니다.\n이수 기한과 방법을 꼭 확인해 주세요.', uploader: '총무팀', date: '2026-06-24', folder: 'public', files: [{ name: '정보보안_교육_이수_안내문.pdf', size: '410 KB' }] },
    { id: 5, title: '2분기 실적공유회 발표자료 공유', content: '지난주 진행된 2분기 부서별 실적공유회 발표 자료입니다.\n불참하신 분들은 참고 부탁드립니다.', uploader: '김영훈', date: '2026-06-24', folder: 'public', files: [{ name: '2분기_실적공유회_발표자료.pptx', size: '4.5 MB' }] },
    { id: 6, title: '로그인 화면 리뉴얼 디자인 시안 및 UI 가이드', content: '로그인 화면 리뉴얼 디자인 시안 v2와, 함께 참고할 사내 공통 UI 컴포넌트 가이드를 같이 첨부합니다.\n화면 작업 시 참고 부탁드려요.', uploader: '정진국', date: '2026-06-27', folder: 'dept', files: [{ name: '로그인화면_디자인_시안_v2.png', size: '1.1 MB' }, { name: 'UI_컴포넌트_공통_가이드.pdf', size: '2.0 MB' }] },
    { id: 7, title: '전자결재 모듈 코드리뷰 체크리스트', content: '전자결재 모듈 PR 리뷰 시 확인할 체크리스트입니다.\n결재선·참조 로직 리뷰할 때 활용해 주세요.', uploader: '김우주', date: '2026-06-26', folder: 'dept', files: [{ name: '전자결재_모듈_코드리뷰_체크리스트.docx', size: '260 KB' }] },
    { id: 8, title: '하계 휴가비 지급 기준 안내', content: '2026년 하계 휴가비 지급 대상 및 기준을 정리했습니다.\n재직 6개월 이상 전 직원이 대상입니다.', uploader: '인사본부', date: '2026-06-20', folder: 'public', files: [{ name: '하계_휴가비_지급_기준_안내.pdf', size: '320 KB' }] },
    { id: 9, title: '신규 입사자 온보딩 체크리스트', content: '신규 입사자 온보딩 시 인사팀·현업 부서가 확인할 항목을 정리한 체크리스트입니다.', uploader: '이다니엘', date: '2026-06-28', folder: 'public', files: [{ name: '신규_입사자_온보딩_체크리스트.xlsx', size: '180 KB' }] },
    { id: 10, title: '서버증설 예산안 초안 공유', content: '개발팀에서 요청한 서버 증설 관련 예산안 초안입니다.\n검토 의견 부탁드립니다.', uploader: '김영훈', date: '2026-06-30', folder: 'dept', files: [{ name: '서버증설_예산안_초안.xlsx', size: '220 KB' }] },
    { id: 11, title: '사내 주차장 이용규정 개정안 공지', content: '주차 공간 부족 문제 개선을 위해 개정된 사내 주차장 이용규정입니다.\n7월 1일부터 적용됩니다.', uploader: '총무팀', date: '2026-06-15', folder: 'public', files: [{ name: '사내_주차장_이용규정_개정안.pdf', size: '150 KB' }] },
    { id: 12, title: '기획팀 워크숍 경비정산 내역서', content: '지난 기획팀 워크숍 실 집행 경비 정산 내역서입니다.\n영수증 원본은 총무팀에 별도 제출했습니다.', uploader: '김영훈', date: '2026-06-28', folder: 'dept', files: [{ name: '기획팀_워크숍_경비정산_내역서.xlsx', size: '390 KB' }] },
    { id: 13, title: '개인정보보호 정책 변경 안내서 배포', content: '개인정보보호법 개정에 따라 변경된 사내 개인정보 취급 방침 안내서입니다.\n담당 업무에 개인정보가 포함된 경우 꼭 숙지해 주세요.', uploader: '경영지원본부', date: '2026-06-05', folder: 'public', files: [{ name: '개인정보보호_정책_변경_안내서.pdf', size: '500 KB' }] }
  ],
  // attendance: "오늘(6/30)" 하루치 출퇴근 상태만 담는 값. dashboard.js의
  // commute() 버튼(출근하기/퇴근하기)을 누르면 이 값이 바뀌고, 동시에
  // 아래 attendanceRecords에도 오늘 날짜 기록 하나가 추가/갱신된다.
  attendance: {
    checkin: null,
    checkout: null,
    status: '미출근',
    late: false
  },

  // Mock 출결 기록 - 사용자별·날짜별 {userId, date, checkin, checkout, status}.
  // 1~29일: 평일만, 사용자별로 지각 며칠 + 홍길동은 22~23일 휴가로 고정.
  // 30일(오늘): 조직도 데모용으로 홍길동 본인만 비워두고(대시보드에서 실제
  // 출근해야 생김) 나머지 4명은 근무중/퇴근/휴가/미출근 상태를 미리 심어둠.
  attendanceRecords: (() => {
    const records = [];
    const userIds = ['20260601', '20260102', '20260010', '20260901', '20260803'];

    userIds.forEach((userId, idx) => {
      for (let d = 1; d <= 29; d++) {
        const dow = d % 7; // 0=일, 6=토 (2026-06-01이 월요일 기준)
        if (dow === 0 || dow === 6) continue;
        if (userId === '20260601' && (d === 22 || d === 23)) {
          records.push({ userId, date: d, checkin: null, checkout: null, status: '휴가' });
          continue;
        }
        const late = (d % 12 === (idx * 3 + 2) % 12);
        records.push({
          userId,
          date: d,
          checkin: late ? '09:22' : '08:57',
          checkout: '18:04',
          status: late ? '지각' : '정상'
        });
      }
    });

    // 오늘(30일) 데모: 홍길동(본인)은 비워두고 나머지 4명 상태를 다양하게.
    records.push({ userId: '20260102', date: 30, checkin: '08:55', checkout: null, status: '정상' });
    records.push({ userId: '20260010', date: 30, checkin: '08:50', checkout: '18:10', status: '정상' });
    records.push({ userId: '20260901', date: 30, checkin: null, checkout: null, status: '휴가' });
    // 정진국은 오늘 기록 없음 = 미출근

    return records;
  })(),

  // 실시간 채팅 - 채팅방 목록 (1:1 dm / group). memberIds에는 본인(홍길동)도 포함.
  chatRooms: [
    { id: 1, type: 'dm', name: null, memberIds: ['20260601', '20260102'] },
    { id: 2, type: 'group', name: '그룹웨어 개편 프로젝트 TF', memberIds: ['20260601', '20260102', '20260803', '20260901'] },
    { id: 3, type: 'dm', name: null, memberIds: ['20260601', '20260901'] },
    { id: 4, type: 'group', name: '신규 프로젝트 TF', memberIds: ['20260601', '20260102', '20260010', '20260901', '20260803'] },
    { id: 5, type: 'dm', name: null, memberIds: ['20260601', '20260010'] }
  ],

  // 실시간 채팅 - 메시지. type: 'text' / 'file' / 'system'. readBy는 발신자를 제외한
  // 열람자 id 목록(실제 구현에서는 방마다 메시지가 매우 많아지므로 메시지별 읽음 배열
  // 대신 "마지막으로 읽은 메시지" 커서 방식을 쓴다 - docs/ERD_설계서.md 참고).
  chatMessages: [
    { id: 1, roomId: 1, senderId: '20260102', type: 'text', content: '오늘 오후 미팅 자료 준비되셨나요?', time: '2026-07-01 14:32', readBy: ['20260601'] },
    { id: 2, roomId: 1, senderId: '20260601', type: 'text', content: '네 팀장님, 지금 마무리 중입니다. 30분 내로 공유드릴게요!', time: '2026-07-01 14:35', readBy: ['20260102'] },
    { id: 3, roomId: 1, senderId: '20260601', type: 'file', content: null, fileName: '3분기_기획안_v2.pptx', fileSize: '4.2 MB', time: '2026-07-01 14:36', readBy: ['20260102'] },
    { id: 4, roomId: 1, senderId: '20260102', type: 'text', content: '좋습니다, 확인해볼게요 👍', time: '2026-07-01 14:40', readBy: [] },
    { id: 5, roomId: 1, senderId: '20260102', type: 'text', content: '네, 확인하고 회신드릴게요!', time: '2026-07-01 14:41', readBy: [] },

    { id: 6, roomId: 2, senderId: null, type: 'system', content: '이다니엘님이 대화방에 참여했습니다', time: '2026-07-01 13:00', readBy: [] },
    { id: 7, roomId: 2, senderId: '20260803', type: 'text', content: '로그인 화면 시안 v2 공유드렸습니다, 확인 부탁드려요.', time: '2026-07-01 12:50', readBy: ['20260601', '20260102'] },
    { id: 8, roomId: 2, senderId: '20260901', type: 'text', content: '회의는 3시에 진행할게요', time: '2026-07-01 13:05', readBy: ['20260601', '20260102', '20260803'] },

    { id: 9, roomId: 3, senderId: '20260601', type: 'text', content: '온보딩 체크리스트 자료 보내드립니다.', time: '2026-06-30 16:10', readBy: ['20260901'] },
    { id: 10, roomId: 3, senderId: '20260901', type: 'text', content: '자료 잘 받았습니다 감사해요', time: '2026-06-30 16:22', readBy: ['20260601'] },

    { id: 11, roomId: 4, senderId: '20260102', type: 'text', content: '이번 주 개발 진행 상황 공유드립니다.', time: '2026-06-30 10:00', readBy: ['20260601'] },
    { id: 12, roomId: 4, senderId: '20260010', type: 'text', content: '기획서 파일 업로드했습니다, 검토 부탁드려요.', time: '2026-06-30 15:40', readBy: [] },
    { id: 13, roomId: 4, senderId: '20260803', type: 'text', content: '와이어프레임 초안도 같이 올려두었습니다.', time: '2026-06-30 15:52', readBy: [] },

    { id: 14, roomId: 5, senderId: '20260010', type: 'text', content: '결재 검토 부탁드립니다.', time: '2026-06-29 11:15', readBy: ['20260601'] }
  ]
};

// -----------------------------------------------------------
// 출결 기록 헬퍼 함수 (dashboard.js, attendance.js,
// admin-attendance.js, org.js, approval.js에서 사용)
// -----------------------------------------------------------

// 특정 사원(userId)의 특정 날짜(date, 6월 며칠인지 숫자) 출결 기록 1건을 찾는다.
// 없으면 undefined를 반환한다.
// 🔧 백엔드 0단계 — 이 함수를 호출하는 모든 화면에서 GET /attendance/... 조회 API 호출로 교체. (상세: [4])
function getAttendanceRecord(userId, date) {
  return state.attendanceRecords.find(r => r.userId === userId && r.date === date);
}

// 출결 기록이 있으면 fields 내용으로 덮어쓰고, 없으면 새로 만들어서 추가한다.
// (있으면 UPDATE, 없으면 INSERT라는 뜻에서 "upsert"라고 이름 붙였다)
// 🔧 백엔드 0단계 — 이 함수를 호출하는 모든 화면에서 POST /attendance/checkin·checkout
//    또는 POST /admin/attendance/{employeeId} 호출로 교체. (상세: [4])
function upsertAttendanceRecord(userId, date, fields) {
  let rec = getAttendanceRecord(userId, date);
  if (!rec) {
    rec = { userId, date };
    state.attendanceRecords.push(rec);
  }
  Object.assign(rec, fields);
  return rec;
}

// -----------------------------------------------------------
// B. 로컬스토리지 영속화
// 새로고침해도 데이터가 날아가지 않도록, state를 JSON 문자열로 바꿔
// 브라우저 localStorage에 저장해두고 다음 로드 때 다시 불러온다.
// (실제 서비스에서는 이 부분이 서버 DB 조회/저장으로 바뀔 자리)
// -----------------------------------------------------------

// 페이지가 열릴 때 가장 먼저 호출된다. localStorage에 저장된 값이 있으면
// 그 값으로 state의 각 항목을 덮어써서, 이전에 변경한 내용을 이어서 보여준다.
// 🔧 백엔드 0단계 — 통째로 삭제 대상. 화면마다 필요한 데이터만 fetch로 그때그때 받아온다. (상세: [2])
function loadState() {
  const saved = localStorage.getItem('groupware_state_prototype');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.notices = parsed.notices || state.notices;
      state.calendarEvents = parsed.calendarEvents || state.calendarEvents;
      state.approvals = parsed.approvals || state.approvals;
      state.archivePosts = parsed.archivePosts || state.archivePosts;
      state.users = parsed.users || state.users;
      state.attendanceRecords = parsed.attendanceRecords || state.attendanceRecords;
      state.chatRooms = parsed.chatRooms || state.chatRooms;
      state.chatMessages = parsed.chatMessages || state.chatMessages;
      if (parsed.attendance) {
        state.attendance.status = parsed.attendance.status;
        state.attendance.checkin = parsed.attendance.checkin;
        state.attendance.checkout = parsed.attendance.checkout;
        state.attendance.late = parsed.attendance.late;
      }
    } catch (e) {
      console.error("Failed to restore storage state", e);
    }
  }
}

// 데이터가 하나라도 바뀔 때마다(공지 등록, 메시지 전송 등) 각 js 파일이
// 이 함수를 호출해서 현재 state 전체를 localStorage에 다시 저장한다.
// 🔧 백엔드 0단계 — 통째로 삭제 대상. 각 화면의 저장 동작이 곧바로 POST/PUT API 호출이 된다. (상세: [2])
function saveState() {
  localStorage.setItem('groupware_state_prototype', JSON.stringify(state));
}

// -----------------------------------------------------------
// C. 로그인 사용자 정보 저장/복원
// 여기 있는 건 "로그인 상태를 기억해 두는" 기능일 뿐, 로그인 안 한
// 사람의 접근을 막는 차단 로직은 없다(그 차단은 추후 STS 백엔드에서
// Spring Security 등으로 서버단에 구현할 예정).
// -----------------------------------------------------------

// localStorage에 저장된 로그인 사용자 정보가 있으면 state.currentUser에
// 채워 넣고 true, 없으면 false를 반환한다. initPage()가 페이지 로드 시
// 호출해서 "누가 로그인한 상태인지"만 파악하는 용도로 쓰고, 이 값이
// false라고 해서 페이지 접근을 막지는 않는다.
// 🔧 백엔드 0단계 — LoginInterceptor + 세션으로 교체. 접근 차단은 서버가 하므로
//    이 함수(및 localStorage 확인)가 아예 필요 없어질 가능성이 높다. (상세: [3])
function checkAuth() {
  const savedUser = localStorage.getItem('groupware_current_user');
  if (savedUser) {
    try {
      state.currentUser = JSON.parse(savedUser);
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

// 로그인 성공 시 login.js가 호출해서, 로그인한 사용자 정보를
// localStorage에 저장해 다른 페이지에서도 로그인 상태가 유지되게 한다.
// 🔧 백엔드 0단계 — 삭제 대상. 로그인 상태 유지는 서버 세션(쿠키)이 대신한다. (상세: [3])
function saveCurrentUser() {
  localStorage.setItem('groupware_current_user', JSON.stringify(state.currentUser));
}

// 헤더의 로그아웃 버튼(fa-right-from-bracket 아이콘)을 누르면 호출된다.
// 로그인 정보를 지우고 로그인 화면으로 돌려보낸다.
// 🔧 백엔드 1단계 — GET /logout 호출로 교체(서버가 세션 무효화 후 /login 리다이렉트). (상세: [3])
function doLogout() {
  state.currentUser = null;
  localStorage.removeItem('groupware_current_user');
  window.location.href = 'login.html';
}

// -----------------------------------------------------------
// D. 내비게이션
// 사이드바 메뉴 id(예: 'notice')와 실제 html 파일명을 이어주는 부분.
// -----------------------------------------------------------

// 사이드바 메뉴 id → 실제 이동할 html 파일 경로
const pageMap = {
  'dashboard': 'main.html',
  'calendar': 'calendar.html',
  'notice': 'notice.html',
  'archive': 'archive.html',
  'approval': 'approval.html',
  'org': 'org.html',
  'chat': 'chat.html',
  'attendance': 'attendance.html',
  'mypage': 'mypage.html',
  'admin': 'admin.html',
  'adminAttendance': 'admin-attendance.html'
};

// 사이드바 메뉴나 버튼의 onclick="navigateTo('notice')" 처럼, 화면 이동이
// 필요한 곳에서는 전부 이 함수를 통해 실제 페이지(html)로 이동한다.
function navigateTo(screenId) {
  const page = pageMap[screenId];
  if (page) {
    window.location.href = page;
  }
}

// 반대로, 지금 열려 있는 html 파일명을 보고 "사이드바에서 어떤 메뉴를
// 강조 표시해야 하는지" 알아내는 함수. initApplicationHeader()가
// 사이드바의 현재 메뉴에 active 클래스를 넣을 때 사용한다.
function getCurrentPage() {
  const path = window.location.pathname;
  const filename = path.substring(path.lastIndexOf('/') + 1).replace('.html', '');
  // 파일명을 메뉴 ID로 매핑
  const map = {
    'main': 'dashboard',
    'calendar': 'calendar',
    'notice': 'notice',
    'archive': 'archive',
    'approval': 'approval',
    'org': 'org',
    'chat': 'chat',
    'attendance': 'attendance',
    'mypage': 'mypage',
    'admin': 'admin',
    'admin-attendance': 'adminAttendance'
  };
  return map[filename] || 'dashboard';
}

// -----------------------------------------------------------
// F. 아바타 렌더링 (사진 업로드 또는 이니셜 대체)
// -----------------------------------------------------------

// 사용자의 프로필 사진이 있으면 <img> 태그를, 없으면 이름 첫 글자를
// 반환한다. 헤더, 사이드바, 대시보드, 조직도, 채팅 등 "동그란 아바타"가
// 나오는 모든 곳에서 이 함수 하나로 통일해서 사용한다.
function avatarMarkup(user) {
  if (user && user.photo) {
    return `<img src="${user.photo}" alt="${user.name || ''}" style="width:100%; height:100%; object-fit:cover;">`;
  }
  return (user && user.name) ? user.name.charAt(0) : '?';
}

// -----------------------------------------------------------
// G. 헤더 초기화
// initPage()가 페이지 로드 시 자동으로 호출하지만, 로그인한 사용자의
// 이름/아바타/안읽은 채팅 수처럼 자주 바뀌는 값은 데이터가 바뀔 때마다
// (예: 채팅 메시지를 읽었을 때) 다시 호출해서 새로고침한다.
// -----------------------------------------------------------
// 🔧 백엔드 0단계 — 이름/부서/아바타는 세션(로그인 사용자) 정보로 그대로 두되,
//    안읽은 채팅 수(아래 unreadChatCount 계산부)만 GET /chat/unread-count 같은
//    집계 API로 교체. state.chatMessages 전체 순회는 삭제. (상세: [6])
function initApplicationHeader() {
  const user = state.currentUser;
  if (!user) return;

  document.getElementById('headerAvatar').innerHTML = avatarMarkup(user);
  document.getElementById('headerName').innerText = user.name;
  document.getElementById('headerDept').innerText = `${user.dept} · ${user.position}`;

  // 관리자 메뉴 표시 여부 토글
  const adminDisplay = (user.role === 'admin') ? 'block' : 'none';
  ['adminGroupLabel', 'menu-admin', 'menu-adminAttendance'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = adminDisplay;
  });

  // Unread chat message count badge (내가 속한 모든 채팅방에서, 남이 보낸 메시지 중 내가 아직 안 읽은 것)
  const unreadChatCount = state.chatMessages.filter(m =>
    m.senderId && m.senderId !== user.id &&
    !(m.readBy || []).includes(user.id) &&
    state.chatRooms.some(r => r.id === m.roomId && r.memberIds.includes(user.id))
  ).length;
  const headerChatBadge = document.getElementById('headerChatBadge');
  if (headerChatBadge) {
    if (unreadChatCount > 0) {
      headerChatBadge.style.display = 'flex';
      headerChatBadge.innerText = unreadChatCount;
    } else {
      headerChatBadge.style.display = 'none';
    }
  }

  // 현재 사이드바 항목 강조
  const currentPage = getCurrentPage();
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.classList.remove('active');
  });
  const targetMenu = document.getElementById(`menu-${currentPage}`);
  if (targetMenu) targetMenu.classList.add('active');
}

// -----------------------------------------------------------
// I. 모달 매니저
// 각 html 파일에는 여러 개의 모달(.modal-content)이 #modalOverlay 안에
// 미리 다 만들어져 있고, 평소엔 style="display:none"으로 숨겨져 있다.
// 즉 "새로 만들어서 띄우는" 게 아니라 "이미 있는 것 중 하나만 보여주는" 방식.
// -----------------------------------------------------------

// modalId로 지정한 모달만 보이게 하고 나머지는 다시 숨긴다.
function openModal(modalId) {
  document.getElementById('modalOverlay').classList.add('active');
  document.querySelectorAll('.modal-content').forEach(content => {
    content.style.display = 'none';
  });
  document.getElementById(modalId).style.display = 'block';
}

// 배경 오버레이를 꺼서 모든 모달을 닫는다.
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

// -----------------------------------------------------------
// J. 토스트 알림
// 화면 우측 하단에 잠깐 나타났다 사라지는 알림 메시지.
// type에 따라 아이콘과 색이 달라진다: primary(기본, 파랑) / success(초록) /
// danger(빨강) / warning(노랑).
// -----------------------------------------------------------

// 사용 예: showToast('저장되었습니다.', 'success')
function showToast(message, type = 'primary') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = '<i class="fa-solid fa-circle-info"></i>';
  if (type === 'success') icon = '<i class="fa-solid fa-circle-check" style="color:var(--color-success)"></i>';
  else if (type === 'danger') icon = '<i class="fa-solid fa-circle-xmark" style="color:var(--color-danger)"></i>';
  else if (type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--color-warning)"></i>';

  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    });
  }, 3000);
}

// -----------------------------------------------------------
// K. 공통 HTML 생성기
// 헤더/사이드바를 만들어주던 getHeaderHTML()/getSidebarHTML()는 삭제했다.
// 이제 각 화면 html 파일이 헤더/사이드바 마크업을 직접 갖고 있다
// (나중에 layout.html을 타임리프 조각으로 연결할 예정 - layout.html 참고).
// -----------------------------------------------------------

// <head> 안에 들어가는 공통 태그(폰트, 아이콘, 스타일시트 등)를 문자열로
// 만들어주는 함수. 참고: 현재는 각 html 파일이 <head>를 직접 갖고 있어서
// 이 함수는 실제로 호출되는 곳이 없다(추후 공통화할 때 쓰기 위해 남겨둠).
function getCommonHead(title) {
  return `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - 통합 사내 그룹웨어</title>
  <meta name="description" content="사내 그룹웨어 시스템 - ${title}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="css/style.css">
  `;
}

// -----------------------------------------------------------
// L. 페이지 초기화 헬퍼
// 모든 화면(html)의 js 파일 맨 아래 DOMContentLoaded 리스너에서
// 제일 먼저 `if (!initPage('notice')) return;` 형태로 호출한다.
// 즉, 이 함수가 사실상 모든 페이지의 공통 시작점이다:
//   1) localStorage에서 state 복원
//   2) localStorage에 저장된 로그인 사용자 정보가 있으면 불러오기
//      (없다고 해서 페이지 접근을 막지는 않는다 - 로그인 차단은 추후
//      STS 백엔드에서 Spring Security 등으로 서버단에 구현할 예정)
//   3) 헤더에 로그인 사용자 정보 채우기 (헤더/사이드바 자체는 각 html에
//      이미 정적으로 들어있고, 여기서는 그 안의 동적인 값만 채운다)
// -----------------------------------------------------------
function initPage(pageName) {
  loadState();
  checkAuth();

  initApplicationHeader();
  return true;
}
