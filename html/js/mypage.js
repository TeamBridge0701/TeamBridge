// ===================================================================
// mypage.js - mypage.html(마이페이지) 전용 로직
// 로그인한 "본인"의 프로필 사진/연락처/이메일을 보고 수정하는 화면.
// 비밀번호 변경은 실제 인증 로직이 없어 화면상으로만 동작하는 흉내다.
//
// ===================================================================
// 🔧 백엔드 작업 가이드 (순서 1 — docs/기획서.md 8장 1순위: 로그인·회원·권한)
//   필요 테이블: EMPLOYEE (docs/ERD_설계서.md 2-3)
//   필요 API:   GET /mypage , POST /mypage/update , POST /mypage/password (docs/기획서.md 5장)
//
// [1] loadMyPage() → 서버 세션(로그인 사용자)의 EMPLOYEE 정보를 Thymeleaf가
//     미리 렌더링하거나, 최소한 GET /mypage(JSON)으로 받아와 채운다.
//     roleText 계산은 EMPLOYEE_ROLE + POSITION을 조인해서 서버가 내려주는 편이
//     ERD 설계서 2-3의 "결재 권한은 항상 POSITION_ID로 실시간 판단" 원칙에 맞다.
//
// [2] handleProfilePhotoSelect()의 base64 미리보기 자체는 유지 가능(그대로 화면
//     미리보기 용도)하지만, saveMyInfo()에서 실제 저장은 FormData(multipart)로
//     POST /mypage/update 에 파일까지 함께 전송해야 한다. 서버는 파일을
//     서버 로컬 저장소에 저장하고 PROFILE_IMG 컬럼에 경로만 저장한다.
//
// [3] saveMyInfo() → 지금은 state.currentUser와 state.users 두 곳을 동시에 고치고
//     saveCurrentUser()로 localStorage까지 갱신하지만, 실제로는 서버에 1번만
//     저장하면 되고(POST /mypage/update), 성공 응답을 받은 뒤 화면만 다시 그리면 된다.
//     이름/사번/부서/직급 변경은 여기서 하지 않는다 - 기획서 4장 권한 매트릭스상
//     "조직정보 수정은 관리자만" 이므로 서버 API도 전화번호·이메일·사진만 받아야 한다.
//
// [4] changeMyPassword() → POST /mypage/password 로 교체. 현재 비밀번호를
//     서버에서 재확인(해시 비교)한 뒤에만 변경을 허용해야 한다(기획서 3.1).
// ===================================================================

let selectedProfilePhoto = null; // 새로 고른 프로필 사진(base64 data URL). 저장 전까지 임시 보관.

// 화면이 열릴 때 로그인 사용자 정보로 좌측 프로필과 우측 입력칸을 채운다.
// 🔧 백엔드 1단계 — GET /mypage(또는 Thymeleaf 모델)로 EMPLOYEE 정보를 받아와 채운다.
//    roleText(45~48번째 줄)는 서버가 EMPLOYEE_ROLE+POSITION 조인해서 내려주는 값으로 대체. (상세: [1])
function loadMyPage() {
  const user = state.currentUser;
  if (!user) return;

  selectedProfilePhoto = null;
  document.getElementById('myAvatar').innerHTML = avatarMarkup(user);
  document.getElementById('myName').innerText = user.name;
  document.getElementById('myDeptPosition').innerText = `${user.dept} · ${user.position}`;
  document.getElementById('myId').innerText = user.id;
  document.getElementById('myJoin').innerText = user.id === 'admin' ? '2026-01-01' : '2026-06-01';

  let roleText = '일반 임직원';
  if (user.role === 'admin') roleText = '시스템 관리자 (Admin)';
  if (user.role === 'team_leader') roleText = '중간 결재 승인권자 (팀장)';
  if (user.role === 'dept_head') roleText = '최종 결재 승인권자 (부서장)';
  document.getElementById('myRole').innerText = roleText;

  document.getElementById('myPhone').value = user.phone || '010-1234-5678';
  document.getElementById('myEmail').value = user.email || 'user@corporation.com';
}

// "프로필 사진 변경" 버튼 → 숨겨진 <input type=file>에서 사진을 고르면 실행.
// FileReader로 이미지를 base64 문자열(data URL)로 바꿔서 바로 미리보기에
// 반영한다. 실제 저장은 "정보 저장" 버튼(saveMyInfo)을 눌러야 이뤄진다.
// 🔧 백엔드 1단계 — 미리보기 로직 자체는 그대로 유지. 실제 파일 전송은 saveMyInfo()에서 처리. (상세: [2])
function handleProfilePhotoSelect(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    selectedProfilePhoto = e.target.result;
    document.getElementById('myAvatar').innerHTML =
      `<img src="${selectedProfilePhoto}" alt="${state.currentUser.name}" style="width:100%; height:100%; object-fit:cover;">`;
  };
  reader.readAsDataURL(file);
}

// "개인 정보 수정" 폼의 submit("정보 저장" 버튼)에 연결. 연락처/이메일/
// (고른 경우) 프로필 사진을 state.currentUser와 state.users 목록 양쪽에
// 반영한다 - 두 곳 다 갱신해야 다른 페이지(조직도 등)에서도 바뀐 정보가 보인다.
// 🔧 백엔드 1단계 — FormData(multipart)로 POST /mypage/update 1번 호출로 교체. state.users
//    동시 갱신·saveState()·saveCurrentUser()는 전부 삭제, 응답 성공 후 화면만 다시 그림. (상세: [3])
function saveMyInfo(event) {
  event.preventDefault();
  const user = state.currentUser;

  user.phone = document.getElementById('myPhone').value.trim();
  user.email = document.getElementById('myEmail').value.trim();
  if (selectedProfilePhoto) {
    user.photo = selectedProfilePhoto;
  }

  // 목록에서 일치하는 레코드도 함께 갱신
  const record = state.users.find(u => u.id === user.id);
  if (record) {
    record.phone = user.phone;
    record.email = user.email;
    if (selectedProfilePhoto) record.photo = selectedProfilePhoto;
  }

  saveState();
  // 멀티 페이지 대응: app.js는 SPA 세션 동안 state.currentUser를 메모리에 유지하지만,
  // 여기서는 페이지마다 checkAuth()로 로컬스토리지에서 다시 불러오므로,
  // 수정한 프로필도 그곳에 함께 저장해야 페이지 이동 시 되돌아가지 않는다.
  saveCurrentUser();
  initApplicationHeader();
  loadMyPage();
  showToast('개인 정보가 안전하게 변경 저장되었습니다.', 'success');
}

// "비밀번호 변경" 폼의 submit에 연결. 실제 비밀번호를 저장/검증하는
// 로직은 없고(백엔드가 없으므로), 입력칸을 비우고 성공 토스트만 보여준다.
// 🔧 백엔드 1단계 — POST /mypage/password 로 교체. 서버가 현재 비밀번호 해시 비교 후에만 변경. (상세: [4])
function changeMyPassword(event) {
  event.preventDefault();
  document.getElementById('currentPw').value = '';
  document.getElementById('newPw').value = '';
  showToast('비밀번호가 성공적으로 변경되었습니다. 다음 로그인부터 적용됩니다.', 'success');
}

// 초기화
window.addEventListener('DOMContentLoaded', () => {
  if (!initPage('mypage')) return;
  loadMyPage();
});
