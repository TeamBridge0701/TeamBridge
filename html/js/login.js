// ===================================================================
// login.js - login.html 전용 로직
//
// 이 프로토타입에는 실제 서버 인증(비밀번호 검사, 세션 발급 등)이 없다.
// "사번(아이디)이 state.users 목록에 있는지"만 확인하는 아주 단순한
// 흉내만 낸다. 비밀번호 입력칸은 있지만 값 검사는 하지 않는다.
//
// ===================================================================
// 🔧 백엔드 작업 가이드 (순서 1 — docs/기획서.md 8장 1순위: 로그인·회원·권한)
//   필요 테이블: EMPLOYEE (docs/ERD_설계서.md 2-3)
//   필요 API:   POST /login , GET /logout (docs/기획서.md 5장)
//
// [1] doLogin() → state.users.find()로 클라이언트에서 아이디만 확인하는 지금 로직을
//     삭제하고, <form method="post" action="/login"> 형태의 실제 폼 제출(또는
//     fetch POST /login)로 교체한다. 서버(Spring Security)가 EMPLOYEE_NO +
//     EMPLOYEE_PWD(해시 비교)를 검증하고, 성공 시 세션을 만든 뒤 /main으로 리다이렉트.
//     - EMPLOYEE_STATUS='SUSPENDED'(정지 계정)면 로그인 자체를 거부해야 한다
//       (기획서 3.1 "정지 계정 차단").
//     - admin 계정도 이제 EMPLOYEE 테이블의 정식 행(EMPLOYEE_ROLE='ADMIN')이므로,
//       userId === 'admin' 하드코딩 분기(19번째 줄)는 통째로 삭제 대상.
//
// [2] 로그인 실패 시 showToast()로 보여주던 "존재하지 않는 아이디입니다"도
//     서버가 던지는 에러 메시지(아이디 없음/비밀번호 불일치/정지 계정 등 구분)로 교체.
//
// [3] DOMContentLoaded의 checkAuth() 자동 리다이렉트 → 서버 인터셉터가
//     "이미 로그인된 세션이면 /login 접근 시 /main으로 리다이렉트"를 대신 처리하게 되면
//     이 블록은 삭제 가능.
// ===================================================================

// 로그인 폼(#loginForm)의 submit 이벤트에 연결되어 있다 (login.html 참고).
// 🔧 백엔드 1단계 — 이 함수 전체를 POST /login 폼 제출로 교체. 아래 로직(state.users.find,
//    admin 하드코딩, showToast 에러)은 전부 삭제하고 서버(Spring Security)가 EMPLOYEE_NO+
//    EMPLOYEE_PWD 검증 → 세션 발급 → /main 리다이렉트까지 처리하게 한다. (상세: 파일 상단 [1][2])
function doLogin(event) {
  if (event) event.preventDefault(); // 폼 기본 제출(새로고침) 막기

  const userId = document.getElementById('loginUser').value.trim();
  // common.js의 state.users 배열에서 입력한 사번과 일치하는 사원을 찾는다.
  let userObj = state.users.find(u => u.id === userId);

  // 'admin'이라고 입력하면 목록에 없는 특별한 관리자 계정으로 로그인된다.
  if (userId === 'admin') {
    userObj = { id: 'admin', name: '최고관리자', dept: 'IT기획팀', position: '관리자', role: 'admin' };
  }

  if (!userObj) {
    showToast('존재하지 않는 아이디입니다.', 'danger');
    return;
  }

  // 찾은 사용자 정보를 로그인 사용자로 저장하고 대시보드로 이동한다.
  state.currentUser = userObj;
  saveCurrentUser();

  // 헤더 갱신/토스트/렌더링은 main.html 로드 시 initPage()가 처리
  window.location.href = 'main.html';
}

// 초기화 - 로그인 화면이 열리자마자 실행된다.
// 🔧 백엔드 1단계 — checkAuth() 자동 리다이렉트는 서버 인터셉터가 대신하게 되면 삭제 가능. (상세: [3])
window.addEventListener('DOMContentLoaded', () => {
  loadState();

  // 이미 로그인되어 있으면(localStorage에 사용자 정보가 남아있으면)
  // 로그인 화면을 보여줄 필요 없이 바로 대시보드로 이동
  if (checkAuth()) {
    window.location.href = 'main.html';
  }
});
