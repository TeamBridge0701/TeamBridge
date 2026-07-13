// ===================================================================
// admin.js - admin.html("계정·인사정보 관리") 전용 로직
// 로그인한 사용자의 role이 'admin'일 때만 사이드바에 노출되는 화면이다.
// 전 직원 목록을 보여주고, 등록/수정/계정 정지·복구/비밀번호 초기화를 할 수 있다.
//
// ===================================================================
// 🔧 백엔드 작업 가이드 (순서 3 — docs/기획서.md 8장 3순위: 공지 + 관리자(계정관리))
//   필요 테이블: EMPLOYEE, DEPARTMENT, POSITION (docs/ERD_설계서.md 2-1~2-3)
//   필요 API:   GET /admin/members, POST /admin/member/create,
//               POST /admin/member/reset/{id}, POST /admin/member/suspend/{id},
//               POST /admin/member/restore/{id}, POST /admin/member/update/{id} (docs/기획서.md 5장)
//   ⚠️ 화면 진입 자체를 AdminInterceptor로 막아야 한다(비관리자가 /admin URL을
//      직접 입력해 접근하는 것을 서버단에서 차단, 기획서 4장 참고).
//
// [1] renderAdminPanel() → GET /admin/members?keyword= 로 서버 검색(기획서에는
//     "이름 검색"만 정의돼 있음). dept/position은 지금처럼 문자열이 아니라
//     DEPT_ID/POSITION_ID를 서버가 조인해서 이름으로 내려준다.
//
// [2] toggleUserStatus() → POST /admin/member/suspend/{id} 또는
//     /admin/member/restore/{id} 로 분리 교체. ERD 설계서 2-3에서 설명하듯
//     이 프로젝트는 회원을 물리 삭제하지 않고 EMPLOYEE_STATUS만 바꾸는
//     소프트 삭제 방식이므로, 여기서 하던 "상태값만 변경"하는 개념은 그대로 유지된다.
//
// [3] resetUserPassword() → POST /admin/member/reset/{id}. 초기 비밀번호를
//     사번과 동일하게 해시 저장하고, 프론트에는 "초기화되었습니다"만 응답하면 된다
//     (기획서 3.9 "초기화 후 강제 변경 유도" - 초기 비밀번호로 로그인 시
//     비밀번호 변경 화면으로 강제 이동시키는 로직은 로그인 처리 쪽에 별도 필요).
//
// [4] openCreateUserModal()/openEditUserModal() → 폼은 그대로 두되, 부서/직급
//     select 옵션은 하드코딩 대신 GET /admin/departments, /admin/positions
//     (또는 최초 페이지 로드시 함께 내려줌) 으로 채운다.
//
// [5] positionToRole() → 삭제 대상. ERD 설계서 2-3에서 설명하듯 team_leader/
//     dept_head는 POSITION_ID를 조인해서 실시간으로 판단하는 값이라 EMPLOYEE_ROLE에
//     중복 저장하지 않는다. EMPLOYEE_ROLE은 EMPLOYEE/ADMIN 구분만 남긴다.
//
// [6] submitNewUser() → POST /admin/member/create(신규) 또는
//     /admin/member/update/{id}(수정)로 교체. 사번(EMPLOYEE_NO) 자동 부여는
//     지금처럼 클라이언트에서 "가장 큰 id+1"로 계산하지 말고 서버가 채번
//     규칙(예: 입사연도+순번)에 따라 생성해서 응답으로 내려줘야 한다.
// ===================================================================

let adminSearchQuery = '';      // 이름 검색창에 입력한 검색어
let editingAdminUserId = null;  // 수정 모달을 "수정 모드"로 열었을 때의 대상 사원 id (null이면 신규 등록 모드)

// 이름 검색창(keyup)에 연결. 입력할 때마다 실시간으로 표를 다시 그린다.
function searchAdminUsers(val) {
  adminSearchQuery = val;
  renderAdminPanel();
}

// 사원 목록 표(#adminUserTableBody)를 검색어 기준으로 필터링해서 그린다.
// 🔧 백엔드 3단계 — GET /admin/members?keyword= 로 교체(서버 검색). (상세: [1])
function renderAdminPanel() {
  const filtered = state.users.filter(u => u.name.toLowerCase().includes(adminSearchQuery.toLowerCase()));

  const html = filtered.map(u => {
    const isSuspended = u.status === '정지';
    const actionBtn = isSuspended
      ? `<button class="btn btn-success btn-sm" onclick="toggleUserStatus('${u.id}', '정상')">정지 복구</button>`
      : `<button class="btn btn-danger btn-sm" onclick="toggleUserStatus('${u.id}', '정지')">계정 정지</button>`;

    return `
      <tr>
        <td style="font-family:'Fira Code'; font-size:0.85rem;">${u.id}</td>
        <td><strong>${u.name}</strong></td>
        <td>${u.dept}</td>
        <td><span class="badge badge-primary">${u.position}</span></td>
        <td style="font-family:'Fira Code'; font-size:0.85rem;">${u.phone}</td>
        <td>
          ${u.status === '정상'
            ? '<span class="badge badge-success">재직</span>'
            : '<span class="badge badge-danger">정지됨</span>'}
        </td>
        <td style="text-align:center;">
          <div style="display:flex; gap:0.25rem; justify-content:center;">
            <button class="btn btn-secondary btn-sm" onclick="openEditUserModal('${u.id}')">수정</button>
            ${actionBtn}
            <button class="btn btn-secondary btn-sm" onclick="resetUserPassword('${u.id}')">PW 리셋</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('adminUserTableBody').innerHTML = html.length ? html : `
    <tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">검색 결과가 없습니다.</td></tr>
  `;
}

// "계정 정지"/"정지 복구" 버튼에 연결. 사원의 status 값만 바꾼다
// (정지된 계정도 데이터는 남아있고 로그인 등에서 상태만 체크하는 방식).
// 🔧 백엔드 3단계 — POST /admin/member/suspend/{id} 또는 /restore/{id} 로 분리 교체. (상세: [2])
function toggleUserStatus(id, newStatus) {
  const user = state.users.find(u => u.id === id);
  if (user) {
    user.status = newStatus;
    saveState();
    renderAdminPanel();
    showToast(`[${user.name}] 임직원 계정이 [${newStatus}] 상태로 수정되었습니다.`, 'success');
  }
}

// "PW 리셋" 버튼에 연결. 실제 비밀번호 저장/변경 기능은 없는
// 프로토타입이라, 토스트 알림만 보여주는 가짜(mock) 동작이다.
// 🔧 백엔드 3단계 — POST /admin/member/reset/{id} 로 교체. 초기 비밀번호=사번으로 해시 저장. (상세: [3])
function resetUserPassword(id) {
  const user = state.users.find(u => u.id === id);
  if (user) {
    showToast(`[${user.name}] 사원의 비밀번호가 초기값(사번 동일)으로 강제 초기화 완료되었습니다.`, 'warning');
  }
}

// "신규 사원 등록" 버튼에 연결. 입력칸을 기본값으로 비워서 신규
// 등록 모드로 사원 등록/수정 모달을 연다.
// 🔧 백엔드 3단계 — 부서/직급 select 옵션을 하드코딩 대신 서버가 내려주는 목록으로 채운다. (상세: [4])
function openCreateUserModal() {
  editingAdminUserId = null;
  document.getElementById('adminModalTitle').innerText = '신규 사원 등록';
  document.getElementById('adminSubmitBtn').innerText = '등록하기';
  document.getElementById('adminUserName').value = '';
  document.getElementById('adminUserDept').value = '인사팀';
  document.getElementById('adminUserPos').value = '사원';
  document.getElementById('adminUserPhone').value = '010-';
  openModal('modal-admin-user');
}

// 표의 "수정" 버튼에 연결. 기존 정보를 입력칸에 채우고 editingAdminUserId를
// 지정해 "수정 모드"로 모달을 연다.
// 🔧 백엔드 3단계 — 위와 동일(부서/직급 옵션은 서버 목록 재사용). (상세: [4])
function openEditUserModal(id) {
  const user = state.users.find(u => u.id === id);
  if (!user) return;

  editingAdminUserId = id;
  document.getElementById('adminModalTitle').innerText = '인사정보 수정';
  document.getElementById('adminSubmitBtn').innerText = '저장하기';
  document.getElementById('adminUserName').value = user.name;
  document.getElementById('adminUserDept').value = user.dept;
  document.getElementById('adminUserPos').value = user.position;
  document.getElementById('adminUserPhone').value = user.phone;
  openModal('modal-admin-user');
}

// 직급 문자열을 role 코드로 변환한다. state.users의 role 값은
// 헤더의 관리자 메뉴 노출 여부나 결재선 후보 판단(approval.js) 등에 쓰인다.
// 🔧 백엔드 3단계 — 이 함수 자체가 삭제 대상. role은 POSITION 조인으로 서버가 실시간 판단. (상세: [5])
function positionToRole(position) {
  if (position === '팀장') return 'team_leader';
  if (position === '부서장') return 'dept_head';
  return 'user';
}

// 사원 등록/수정 모달의 폼 submit(등록하기·저장하기)에 연결.
// editingAdminUserId가 있으면 "수정", 없으면 "신규 등록"으로 분기한다.
// 🔧 백엔드 3단계 — POST /admin/member/create(신규) 또는 /admin/member/update/{id}(수정)로 교체.
//    사번 자동채번(nextId 계산)은 클라이언트가 아니라 서버 채번 규칙으로 이동. (상세: [6])
function submitNewUser(event) {
  event.preventDefault();
  const name = document.getElementById('adminUserName').value.trim();
  const dept = document.getElementById('adminUserDept').value;
  const position = document.getElementById('adminUserPos').value;
  const phone = document.getElementById('adminUserPhone').value.trim();

  if (editingAdminUserId) {
    const user = state.users.find(u => u.id === editingAdminUserId);
    if (user) {
      user.name = name;
      user.dept = dept;
      user.position = position;
      user.phone = phone;
      user.role = positionToRole(position);
    }
    saveState();
    closeModal();
    renderAdminPanel();
    showToast(`[${name}] 사원의 인사정보가 수정되었습니다.`, 'success');
    editingAdminUserId = null;
    return;
  }

  // 2026xxxx 형식의 순번 ID 자동 생성
  const existingIds = state.users.map(u => parseInt(u.id)).filter(id => !isNaN(id));
  const nextId = String(Math.max(...existingIds) + 1);

  state.users.push({
    id: nextId,
    name,
    dept,
    position,
    phone,
    email: `${nextId}@corporation.com`,
    status: '정상',
    role: positionToRole(position)
  });

  saveState();
  closeModal();
  renderAdminPanel();
  showToast(`신규 사원 [${name}] 계정이 등록되었습니다. (부여사번: ${nextId})`, 'success');
}

// 초기화
window.addEventListener('DOMContentLoaded', () => {
  if (!initPage('admin')) return;
  renderAdminPanel();
});
