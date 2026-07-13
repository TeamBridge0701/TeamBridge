// ===================================================================
// admin-attendance.js - admin-attendance.html("직원 출결 관리") 전용 로직
// attendance.js가 "내 출결"만 보여주는 것과 달리, 이 화면은 관리자가
// 날짜를 골라 전 직원의 출퇴근 시간/상태를 직접 조회·수정할 수 있다.
//
// ===================================================================
// 🔧 백엔드 작업 가이드 (순서 3 — docs/기획서.md 8장 3순위: 공지 + 관리자 관리 화면과 함께 진행)
//   필요 테이블: ATTENDANCE, EMPLOYEE (docs/ERD_설계서.md 2-4, 2-3)
//   필요 API:   기획서 5장에 전용 엔드포인트가 없음 → 신설 필요, 예)
//               GET  /admin/attendance?date=YYYY-MM-DD&keyword=
//               POST /admin/attendance/{employeeId}  (해당 날짜 출퇴근시각·상태 저장)
//   ⚠️ /admin 하위이므로 AdminInterceptor로 서버단 접근 차단 필수(admin.js와 동일 원칙).
//
// [1] renderAdminAttendance()/populateAdminAttDateOptions() → "6월 1~30일"
//     하드코딩을 날짜 선택 input[type=date] 등으로 바꾸고, 선택된 날짜로
//     GET /admin/attendance?date= 호출해 전 직원 출결을 받아온다. 검색어(keyword)도
//     서버 파라미터로 함께 넘긴다.
//
// [2] saveEmployeeAttendance() → 지금은 upsertAttendanceRecord()로 브라우저
//     메모리만 바꾸지만, 실제로는 POST /admin/attendance/{employeeId}로 해당 날짜의
//     CHECK_IN_TIME/CHECK_OUT_TIME/ATTENDANCE_STATUS를 서버에 저장(UNIQUE(EMPLOYEE_ID,
//     WORK_DATE) 기준 upsert)한다. 시간 입력값(text input)은 "09:00" 형식 검증을
//     서버에서도 한 번 더 해야 한다(잘못된 문자열이 저장되는 것 방지).
// ===================================================================

let adminAttendanceSearchQuery = ''; // 이름 검색창에 입력한 검색어

// 이름 검색창(keyup)에 연결. 입력할 때마다 표를 다시 그린다.
function searchAdminAttendance(val) {
  adminAttendanceSearchQuery = val;
  renderAdminAttendance();
}

// 날짜 선택 드롭다운(#adminAttDate)에 1~30일 옵션을 채운다.
// 이미 옵션이 있으면(=한 번 채워졌으면) 다시 채우지 않아, 관리자가
// 골라둔 날짜 선택값이 renderAdminAttendance() 재호출로 초기화되지 않게 한다.
// 🔧 백엔드 3단계 — "6월 1~30일" 하드코딩을 input[type=date] 등으로 교체. (상세: [1])
function populateAdminAttDateOptions() {
  const select = document.getElementById('adminAttDate');
  if (select.options.length) return; // 이미 채워져 있으므로 사용자가 선택한 값을 유지
  let options = '';
  for (let d = 1; d <= 30; d++) {
    options += `<option value="${d}" ${d === 30 ? 'selected' : ''}>6월 ${d}일${d === 30 ? ' (오늘)' : ''}</option>`;
  }
  select.innerHTML = options;
}

// 선택된 날짜 + 검색어 기준으로 전 직원 출결 표(#adminAttendanceTableBody)를 그린다.
// 각 행은 출근/퇴근 시간을 직접 입력할 수 있는 input과 상태 select로 되어 있다.
// 🔧 백엔드 3단계 — GET /admin/attendance?date=&keyword= 로 교체. (상세: [1])
function renderAdminAttendance() {
  populateAdminAttDateOptions();
  const date = parseInt(document.getElementById('adminAttDate').value);
  const filtered = state.users.filter(u => u.name.toLowerCase().includes(adminAttendanceSearchQuery.toLowerCase()));

  const html = filtered.map(u => {
    const rec = getAttendanceRecord(u.id, date) || {};
    return `
      <tr>
        <td style="font-family:'Fira Code'; font-size:0.85rem;">${u.id}</td>
        <td><strong>${u.name}</strong></td>
        <td>${u.dept}</td>
        <td><span class="badge badge-primary">${u.position}</span></td>
        <td><input type="text" class="form-control" id="attIn-${u.id}" value="${rec.checkin || ''}" placeholder="09:00" style="font-size:0.85rem;"></td>
        <td><input type="text" class="form-control" id="attOut-${u.id}" value="${rec.checkout || ''}" placeholder="18:00" style="font-size:0.85rem;"></td>
        <td>
          <select class="form-control" id="attStatus-${u.id}" style="font-size:0.85rem;">
            <option value="정상" ${rec.status === '정상' ? 'selected' : ''}>정상</option>
            <option value="지각" ${rec.status === '지각' ? 'selected' : ''}>지각</option>
            <option value="휴가" ${rec.status === '휴가' ? 'selected' : ''}>휴가</option>
          </select>
        </td>
        <td style="text-align:center;">
          <button class="btn btn-primary btn-sm" onclick="saveEmployeeAttendance('${u.id}')">저장</button>
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('adminAttendanceTableBody').innerHTML = html.length ? html : `
    <tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">검색 결과가 없습니다.</td></tr>
  `;
}

// 표의 각 행에 있는 "저장" 버튼에 연결. 그 행의 출근/퇴근 시간, 상태
// 입력값을 읽어 선택된 날짜의 출결 기록으로 저장(없으면 새로 생성)한다.
// 🔧 백엔드 3단계 — POST /admin/attendance/{employeeId} 로 교체(UNIQUE(EMPLOYEE_ID,
//    WORK_DATE) 기준 upsert). 시간 형식("09:00") 검증도 서버에서 한 번 더. (상세: [2])
function saveEmployeeAttendance(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;

  const date = parseInt(document.getElementById('adminAttDate').value);
  const checkin = document.getElementById(`attIn-${userId}`).value.trim();
  const checkout = document.getElementById(`attOut-${userId}`).value.trim();
  const status = document.getElementById(`attStatus-${userId}`).value;

  upsertAttendanceRecord(userId, date, {
    checkin: checkin || null,
    checkout: checkout || null,
    status
  });

  saveState();
  renderAdminAttendance();
  showToast(`[${user.name}] 6월 ${date}일 출결 기록이 저장되었습니다.`, 'success');
}

// 초기화
window.addEventListener('DOMContentLoaded', () => {
  if (!initPage('adminAttendance')) return;
  renderAdminAttendance();
});
