// admin-attendance.html("직원 출결 관리") 전용 로직
// /admin/**은 SecurityConfig가 ROLE_ADMIN만 통과시키므로 로그인/권한 체크는
// 여기서 따로 하지 않는다.

let currentAttendanceList = [];   // 최근 조회 결과 캐시 - 이름 검색은 재조회 없이 여기서 필터링

// 상태(정상/지각/휴가)는 더 이상 관리자가 select로 직접 고르지 않는다 - 출근 시간을
// 기준으로 서버(AttendanceService.saveAttendanceByAdmin)가 자동 계산해서 저장한다
// (배포전_수정사항.md 1번 "출근 시간 수정 시 상태 자동 재계산"). 여기 남은 맵은 표시 전용.
const STATUS_LABELS = { NORMAL: '정상', LATE: '지각', LEAVE: '휴가' };
const STATUS_BADGE_CLASS = { NORMAL: 'badge-success', LATE: 'badge-warning', LEAVE: 'badge-primary' };

// 날짜 select(input[type=date])가 바뀔 때마다 호출됨
function renderAdminAttendance() {
    const date = document.getElementById('adminAttDate').value;
    if (!date) return;

    fetch(`/admin/attendance/list?date=${date}`)
        .then(res => res.json())
        .then(list => {
            currentAttendanceList = list;
            renderAttendanceTable(list);
        });
}

// 이름 검색창(keyup)에 연결 - 서버 재조회 없이 캐시된 목록에서 필터링
function searchAdminAttendance(keyword) {
    const filtered = keyword
        ? currentAttendanceList.filter(a => a.employeeName.includes(keyword))
        : currentAttendanceList;
    renderAttendanceTable(filtered);
}

function renderAttendanceTable(list) {
    const date = document.getElementById('adminAttDate').value;

    const html = list.map(a => {
        const status = a.attendanceStatus ?? 'NORMAL'; // 기록 없는 직원은 화면상 기본값만 "정상"으로 보여줌(저장 전까진 DB엔 반영 안 됨)

        return `
      <tr>
        <td style="font-family:'Fira Code'; font-size:0.85rem;">${a.employeeNo}</td>
        <td><strong>${a.employeeName}</strong></td>
        <td>${a.deptName ?? '-'}</td>
        <td><span class="badge badge-primary">${a.positionName ?? '-'}</span></td>
        <td><input type="text" class="form-control" id="attIn-${a.employeeId}"
                    value="${a.checkInTime ? a.checkInTime.substring(0, 5) : ''}"
                    placeholder="09:00" style="font-size:0.85rem;"></td>
        <td><input type="text" class="form-control" id="attOut-${a.employeeId}"
                    value="${a.checkOutTime ? a.checkOutTime.substring(0, 5) : ''}"
                    placeholder="18:00" style="font-size:0.85rem;"></td>
        <td style="text-align:center;">
          <span class="badge ${STATUS_BADGE_CLASS[status] || 'badge-success'}" id="attStatusBadge-${a.employeeId}">${STATUS_LABELS[status] || status}</span>
        </td>
        <td style="text-align:center;">
          <button class="btn btn-primary btn-sm" onclick="saveEmployeeAttendance(${a.employeeId}, '${date}')">저장</button>
        </td>
      </tr>
    `;
    }).join('');

    document.getElementById('adminAttendanceTableBody').innerHTML = html.length ? html : `
    <tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">해당 조건의 직원이 없습니다.</td></tr>
  `;
}

// 행의 "저장" 버튼에 연결 - 관리자가 직원 출퇴근 기록을 직접 덮어쓰는 기능이라
// admin.js의 계정 정지/복구와 같은 이유로 실행 전 확인창을 거친다(배포전_수정사항.md 1번)
function saveEmployeeAttendance(employeeId, workDate) {
    if (!confirm(`${workDate} 출결 기록을 저장하시겠습니까?`)) return;

    const checkInTime = document.getElementById(`attIn-${employeeId}`).value.trim();
    const checkOutTime = document.getElementById(`attOut-${employeeId}`).value.trim();

    const formData = new FormData();
    formData.append('workDate', workDate);
    formData.append('checkInTime', checkInTime);
    formData.append('checkOutTime', checkOutTime);

    fetch(`/admin/attendance/${employeeId}`, { method: 'POST', body: formData })
        .then(res => res.text().then(message => {
            showToast(message, res.ok ? 'success' : 'danger');
            // 서버가 계산한 최신 상태(정상/지각/휴가)를 배지에 반영하려고 목록을 다시 불러온다
            if (res.ok) renderAdminAttendance();
        }));
}

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('adminAttDate').value = new Date().toISOString().slice(0, 10); // 오늘 날짜 기본값
    renderAdminAttendance();
});