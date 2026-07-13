// ===================================================================
// org.js - org.html(조직도) 전용 로직
//
// 좌측 부서 트리에서 부서를 클릭하면 우측 표가 그 부서 소속 직원만
// 보여주도록 필터링된다. 표의 한 줄을 클릭하면 그 직원의 연락처 등
// 상세 정보를 모달로 보여준다.
//
// ===================================================================
// 🔧 백엔드 작업 가이드 (순서 4 — docs/기획서.md 8장 4순위: 조직도)
//   필요 테이블: EMPLOYEE, DEPARTMENT, POSITION, ATTENDANCE (docs/ERD_설계서.md 2-1~2-4)
//   필요 API:   GET /org?deptId= , GET /org/member/{id} (docs/기획서.md 5장)
//
// [1] filterOrg()/renderOrgChart() → GET /org?deptId= 로 서버에서 이미
//     부서로 필터링 + 직급 서열(POSITION.POSITION_RANK) 순 정렬까지 끝낸 목록을
//     받아온다. 지금 org.js에 하드코딩된 POSITION_RANK 상수(23번째 줄)는
//     ERD 설계서 2-2에서 설명하듯 삭제 대상 — 이 값은 POSITION 테이블 컬럼으로
//     이미 옮겨졌으므로, 직급 추가/서열 변경 시 코드 배포 없이 데이터만 고치면 된다.
//     또한 화면설계서 07 "정지 계정은 조직도에서 제외"를 서버 쿼리
//     WHERE EMPLOYEE_STATUS='ACTIVE' 로 반드시 반영할 것(지금 org.js는 이 필터가 없음).
//
// [2] statusBadge() → 현재는 클라이언트가 getAttendanceRecord()로 오늘자
//     ATTENDANCE를 직접 찾아 상태를 계산하지만, 실제로는 서버가 "오늘 근태
//     상태"까지 조인해서 GET /org 응답에 함께 내려주는 편이 좋다(N명을 표로
//     그릴 때 N번 오늘 근태를 따로 조회하지 않도록).
//
// [3] viewOrgMemberDetail() → GET /org/member/{id}로 교체. 직원 상세(연락처·
//     이메일·재직상태)는 "전 직원 공개"로 확정됐으므로(기획서 9장), 권한 검사는
//     "로그인 여부"만 있으면 되고 부서가 다르다고 정보를 가리는 로직은 불필요.
//
// [4] "채팅하기" 버튼의 chat.html?chatWith=... 이동 자체는 그대로 유지 가능.
//     다만 chat.js 쪽에서 이 파라미터를 받아 1:1방을 여는 로직이
//     POST /chat/room (없으면 생성, 있으면 재사용)으로 바뀐다(chat.js TODO 참고).
// ===================================================================

// 좌측 트리에서 부서(또는 "전체")를 클릭하면 실행. 선택된 부서를
// 강조 표시하고 우측 직원 표를 그 부서 기준으로 다시 그린다.
// 🔧 백엔드 4단계 — GET /org?deptId= 로 교체(서버가 필터링+정렬까지 끝낸 목록을 반환). (상세: [1])
function filterOrg(dept) {
  state.activeOrgDept = dept;
  document.querySelectorAll('[id^="org-"]').forEach(item => item.classList.remove('active'));
  document.getElementById(`org-${dept}`).classList.add('active');

  document.getElementById('orgTitle').innerText =
    dept === 'all' ? '임직원 목록 (전체)' : `임직원 목록 (${dept})`;

  renderOrgChart();
}

// 직급별 정렬 순서(숫자가 작을수록 표에서 위쪽에 나온다)
const POSITION_RANK = { '부서장': 1, '팀장': 2, '과장': 3, '대리': 4, '사원': 5 };

// 우측 직원 표(#orgMemberTableBody)를 현재 선택된 부서 기준으로 필터링하고,
// 직급이 높은 순서로 정렬해서 그린다.
// 🔧 백엔드 4단계 — GET /org 응답을 그대로 그린다. POSITION_RANK 하드코딩 상수(23번째 줄)는
//    삭제하고 서버가 POSITION 테이블로 정렬해서 내려준 순서를 그대로 신뢰. (상세: [1])
function renderOrgChart() {
  const filtered = state.activeOrgDept === 'all'
    ? state.users
    : state.users.filter(u => u.dept === state.activeOrgDept);

  const sorted = [...filtered].sort((a, b) =>
    (POSITION_RANK[a.position] || 99) - (POSITION_RANK[b.position] || 99));

  const html = sorted.map(u => `
    <tr class="clickable" onclick="viewOrgMemberDetail('${u.id}')">
      <td><div class="user-avatar" style="width:24px; height:24px; font-size:0.7rem;">${avatarMarkup(u)}</div></td>
      <td><strong>${u.name}</strong></td>
      <td>${u.dept}</td>
      <td><span class="badge badge-primary">${u.position}</span></td>
      <td>${statusBadge(u)}</td>
    </tr>
  `).join('');

  document.getElementById('orgMemberTableBody').innerHTML = html;
}

// 정지된 계정은 그대로 정지 상태를 표시하고, 재직 중인 직원은 실시간 출결 상태를
// 대신 보여준다 (로그인한 본인의 행은 state.attendance를 반영하고,
// 나머지는 미리 심어둔 attendanceStatus 값을 사용한다).
// 🔧 백엔드 4단계 — 서버가 GET /org 응답에 오늘 근태 상태까지 조인해서 내려주면
//    클라이언트에서 getAttendanceRecord()를 N번 호출할 필요가 없어진다. (상세: [2])
function statusBadge(u) {
  if (u.status !== '정상') {
    return '<span class="badge badge-danger">정지</span>';
  }

  const rec = getAttendanceRecord(u.id, 30);
  if (!rec) return '<span class="badge badge-warning">미출근</span>';
  if (rec.status === '휴가') return '<span class="badge badge-primary">휴가</span>';
  if (rec.checkin && rec.checkout) return '<span class="badge badge-muted">퇴근</span>';
  if (rec.checkin) return '<span class="badge badge-success">출근 (근무중)</span>';
  return '<span class="badge badge-warning">미출근</span>';
}

// 직원 표의 한 줄을 클릭하면 실행. 상세 모달에 연락처 등을 채우고,
// 본인이 아닌 경우에만 "채팅하기" 버튼을 보여준다.
// 🔧 백엔드 4단계 — GET /org/member/{id} 로 교체. 전화·이메일 공개는 확정됐으므로
//    로그인 여부만 검사하면 됨. "채팅하기" 이동 로직 자체는 그대로 유지. (상세: [3][4])
function viewOrgMemberDetail(userId) {
  const u = state.users.find(user => user.id === userId);
  if (!u) return;

  document.getElementById('mOrgAvatar').innerHTML = avatarMarkup(u);
  document.getElementById('mOrgName').innerText = `${u.name} ${u.position}`;
  document.getElementById('mOrgDept').innerText = `${u.dept} · 사번 ${u.id}`;
  document.getElementById('mOrgPhone').innerText = u.phone;
  document.getElementById('mOrgEmail').innerText = u.email;
  document.getElementById('mOrgStatus').innerText = u.status === '정상' ? '재직 중' : '계정 정지됨';

  const chatBtn = document.getElementById('mOrgChatBtn');
  if (u.id !== state.currentUser.id) {
    chatBtn.style.display = 'block';
    // org.html은 chat.html과 별개의 페이지이므로, 대상 사용자는
    // 쿼리 파라미터로 넘겨서 chat.js가 로드 시점에 읽어가도록 한다.
    chatBtn.onclick = function() {
      window.location.href = `chat.html?chatWith=${encodeURIComponent(u.id)}`;
    };
  } else {
    chatBtn.style.display = 'none';
  }

  openModal('modal-org-member');
}

// 초기화
window.addEventListener('DOMContentLoaded', () => {
  if (!initPage('org')) return;
  renderOrgChart();
});
