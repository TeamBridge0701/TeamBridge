// admin-attendance.html("직원 출결 관리") 전용 로직
// /admin/**은 SecurityConfig가 ROLE_ADMIN만 통과시키므로 로그인/권한 체크는
// 여기서 따로 하지 않는다.

let currentAttendanceList = [];   // 최근 조회 결과 캐시 - 이름 검색은 재조회 없이 여기서 필터링

// 한글 표시 ↔ DB 저장값 변환 (백엔드는 항상 NORMAL/LATE/LEAVE만 주고받음, 팀 컨벤션)
const LABEL_TO_STATUS = { '정상': 'NORMAL', '지각': 'LATE', '휴가': 'LEAVE' };

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
        <td>
          <select class="form-control" id="attStatus-${a.employeeId}" style="font-size:0.85rem;">
            <option value="정상" ${status === 'NORMAL' ? 'selected' : ''}>정상</option>
            <option value="지각" ${status === 'LATE' ? 'selected' : ''}>지각</option>
            <option value="휴가" ${status === 'LEAVE' ? 'selected' : ''}>휴가</option>
          </select>
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

// 행의 "저장" 버튼에 연결
function saveEmployeeAttendance(employeeId, workDate) {
    const checkInTime = document.getElementById(`attIn-${employeeId}`).value.trim();
    const checkOutTime = document.getElementById(`attOut-${employeeId}`).value.trim();
    const statusLabel = document.getElementById(`attStatus-${employeeId}`).value;

    const formData = new FormData();
    formData.append('workDate', workDate);
    formData.append('checkInTime', checkInTime);
    formData.append('checkOutTime', checkOutTime);
    formData.append('status', LABEL_TO_STATUS[statusLabel]);

    fetch(`/admin/attendance/${employeeId}`, { method: 'POST', body: formData })
        .then(res => res.text().then(message => {
            showToast(message, res.ok ? 'success' : 'danger');
        }));
}

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('adminAttDate').value = new Date().toISOString().slice(0, 10); // 오늘 날짜 기본값
    renderAdminAttendance();
});