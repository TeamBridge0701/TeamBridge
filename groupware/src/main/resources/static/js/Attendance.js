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
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        try {
            // 백엔드에서 이번 달 출결 리스트 가져오기
            const res = await fetch(`/attendance/monthly?year=${currentYear}&month=${currentMonth}`);
            const monthlyAttendanceList = await res.json();

            // calendar.js에 분리해 둔 공용 폼 생성 함수(generateCalendarGridHtml)를 호출하여 
            // 뼈대를 빌려오고, 날짜별 출결 데이터(뱃지 및 시간)를 매핑해서 렌더링!
            if (typeof generateCalendarGridHtml === 'function') {
                if (document.querySelector('.calendar-controls h2')) {
                    document.querySelector('.calendar-controls h2').textContent = `이번 달 출결 현황 (${currentYear}년 ${currentMonth}월)`;
                }

                document.getElementById('fullCalendarGrid').innerHTML = generateCalendarGridHtml(currentYear, currentMonth, (cellDate) => {
                    const matchData = monthlyAttendanceList.find(item => item.workDate === cellDate);
                    if (!matchData) return '';

                    let badgeClass = 'badge-success';
                    // 2. 서버에서 넘어오는 상태값('LATE', 'WORK', 'ABSENT' 등)에 맞게 매핑
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
});

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
        // 주소에 /api/를 포함해야 합니다!
        const response = await fetch(`/attendance/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (result.success) {
            // 성공 시 서버가 준 nextStatus로 버튼 UI 갱신
            updateButtonUI(result.nextStatus);
         updateAttendanceDisplay(result);
		 const message=action === 'checkIn' ? '출근처리되었습니다':'퇴근처리되었습니다.';
           showToast(message, 'success'); // 기존 토스트 함수 유지
        }
    } catch (error) {
        console.error('통신 오류:', error);
        alert('서버 통신 중 오류가 발생했습니다.');
    }
}

function updateButtonUI(status) {
    const btn = document.getElementById('btnCommute');
    if (!btn) return;

    // 기존 클래스 제거
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

function updateAttendanceDisplay(data) {
    const statusEl = document.getElementById('dashCommuteStatus');
    const checkinEl = document.getElementById('dashCheckinTime');
    const timerEl = document.getElementById('dashWorkTimer');

    if (statusEl) statusEl.innerText = `[${data.attendanceStatus}]`;
    if (checkinEl) checkinEl.innerText = data.checkInTime;
    if (timerEl) timerEl.innerText = data.checkOutTime;
}