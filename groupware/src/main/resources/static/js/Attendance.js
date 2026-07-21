document.addEventListener('DOMContentLoaded', async () => {
    const btn = document.getElementById('btnCommute');

    // 1. 페이지 로드 시 현재 상태 조회
    try {
        const response = await fetch('/attendance/status');
        const data = await response.json();
        updateButtonUI(data.nextStatus);
        updateAttendanceDisplay(data);
    } catch (e) {
        console.error("상태 조회 실패", e);
    }

    // 2. 버튼에 클릭 이벤트 직접 연결 - btn 있을때만 처리 -> main 전용
    if (btn) {
        btn.addEventListener('click', commute);
    }

    // 3. [근태 페이지 전용] 캘린더 그리드 및 출결 데이터 연동
    if (document.getElementById('fullCalendarGrid')) {
        // 클로저 형태로 현재 연도/월 상태를 안전하게 관리
        let pageYear = new Date().getFullYear();
        let pageMonth = new Date().getMonth() + 1;

        // 최초 진입 시 데이터 로드 실행
        loadAttendanceData(pageYear, pageMonth);

        // 이전 달 / 다음 달 버튼 이벤트 연결
        const prevBtn = document.getElementById('prevMonthBtn');
        const nextBtn = document.getElementById('nextMonthBtn');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                pageMonth--;
                if (pageMonth < 1) {
                    pageMonth = 12;
                    pageYear--;
                }
                loadAttendanceData(pageYear, pageMonth);
            });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                pageMonth++;
                if (pageMonth > 12) {
                    pageMonth = 1;
                    pageYear++;
                }
                loadAttendanceData(pageYear, pageMonth);
            });
        }
    }
});

// 데이터를 불러와서 그려주는 공용 함수
async function loadAttendanceData(year, month) {
    try {
        // 백엔드에서 해당 월 출결 리스트 가져오기
        const res = await fetch(`/attendance/monthly?year=${year}&month=${month}`);
        const monthlyAttendanceList = await res.json();

        // status별 카운트 및 총 출근일수 계산 (정상+지각+휴가 합산)
        let normalCount = 0;
        let lateCount = 0;
        let leaveCount = 0;

        monthlyAttendanceList.forEach(item => {
            const status = item.attendanceStatus;
            if (status === 'NORMAL') normalCount++;
            else if (status === 'LATE') lateCount++;
            else if (status === 'LEAVE') leaveCount++;
        });

        const totalPresentDays = normalCount + lateCount + leaveCount;

        const presentEl = document.getElementById('attPresentDays');
        const lateEl = document.getElementById('attLateDays');
        const leaveEl = document.getElementById('attLeaveDays');

        if (presentEl) presentEl.textContent = totalPresentDays;
        if (lateEl) lateEl.textContent = lateCount;
        if (leaveEl) leaveEl.textContent = leaveCount;

        // calendar.js에 분리해 둔 공용 폼 생성 함수(generateCalendarGridHtml) 호출
        if (typeof generateCalendarGridHtml === 'function') {
            const yearEl = document.getElementById('calendarYear');
            const monthEl = document.getElementById('calendarMonth');
            if (yearEl) yearEl.textContent = year;
            if (monthEl) monthEl.textContent = month;

            document.getElementById('fullCalendarGrid').innerHTML = generateCalendarGridHtml(year, month, (cellDate) => {
                const matchData = monthlyAttendanceList.find(item => item.workDate === cellDate);
                if (!matchData) return '';

                let badgeClass = 'badge-success';
                if (matchData.attendanceStatus === 'LATE') badgeClass = 'badge-warning';
                else if (matchData.attendanceStatus === 'EARLY_LEAVE' || matchData.attendanceStatus === 'VACATION') badgeClass = 'badge-primary';
                else if (matchData.attendanceStatus === 'ABSENT') badgeClass = 'badge-danger';

                const checkIn = matchData.checkInTime ? matchData.checkInTime.substring(0, 5) : '-';
                const checkOut = matchData.checkOutTime ? matchData.checkOutTime.substring(0, 5) : '-';

                return `
                    <div style="font-size:0.65rem; line-height:1.5; margin-top:4px;">
                        <span class="badge ${badgeClass}" style="font-size:0.6rem;">${matchData.attendanceStatus}</span>
                        <div>출근 ${checkIn}</div>
                        <div>퇴근 ${checkOut}</div>
                    </div>
                `;
            });
        }
    } catch (err) {
        console.error("출결 캘린더 데이터 로드 실패", err);
    }
}

async function commute() {
    const btn = document.getElementById('btnCommute');

    // 현재 버튼의 상태를 판단 (클래스 기반)
    let action = '';
    if (btn.classList.contains('btn-primary')) {
        action = 'checkIn';
    } else if (btn.classList.contains('btn-danger')) {
        action = 'checkOut';
    } else {
        return; // 이미 종료된 상태면 동작 안 함
    }

    try {
        const response = await fetch(`/attendance/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (result.success) {
            updateButtonUI(result.nextStatus);
            updateAttendanceDisplay(result);
            const message = action === 'checkIn' ? '출근처리되었습니다.' : '퇴근처리되었습니다.';
            showToast(message, 'success');
        }
    } catch (error) {
        console.error('통신 오류:', error);
        alert('서버 통신 중 오류가 발생했습니다.');
    }
}

function updateButtonUI(status) {
    const btn = document.getElementById('btnCommute');
    if (!btn) return;

    btn.classList.remove('btn-primary', 'btn-danger', 'btn-secondary');

    if (status === 'NONE') {
        btn.innerText = '출근하기';
        btn.classList.add('btn', 'btn-primary');
        btn.disabled = false;
    } else if (status === 'WORKING') {
        btn.innerText = '퇴근하기';
        btn.classList.add('btn', 'btn-danger');
        btn.disabled = false;
    } else {
        btn.innerText = '업무 종료';
        btn.classList.add('btn', 'btn-secondary');
        btn.disabled = true;
    }
}

// data.attendanceStatus(그날 지각/정상/연차)가 아니라 data.nextStatus(지금 출근했는지 여부:
// NONE/WORKING/DONE)를 한글 라벨로 보여줌 - AttendanceService.getCommuteStatusLabel()과 같은 기준
const COMMUTE_STATUS_LABEL = { NONE: '미출근', WORKING: '근무중', DONE: '퇴근완료' };

function updateAttendanceDisplay(data) {
    const statusEl = document.getElementById('dashCommuteStatus');
    const checkinEl = document.getElementById('dashCheckinTime');
    const timerEl = document.getElementById('dashWorkTimer');

    if (statusEl) statusEl.innerText = `[${COMMUTE_STATUS_LABEL[data.nextStatus] || data.nextStatus}]`;
    if (checkinEl) checkinEl.innerText = data.checkInTime;
    if (timerEl) timerEl.innerText = data.checkOutTime;
}