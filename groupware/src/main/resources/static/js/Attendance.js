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

// 출결 현황 달력 배지에 쓸 한글 라벨 - ATTENDANCE_STATUS는 NORMAL/LATE/LEAVE 셋만
// 허용되므로(ERD_설계서.md 2-4 확정, "조퇴" 같은 값은 아예 없음) 이 셋만 매핑해두면 됨.
// 대시보드 상태 라벨(COMMUTE_STATUS_LABEL)과 같은 방식 - 원본 영문 상태값을 화면엔 그대로
// 노출하지 않고, 여기서 한 번 한글로 바꿔서 보여준다.
const ATTENDANCE_STATUS_LABEL = { NORMAL: '정상출근', LATE: '지각', LEAVE: '휴가' };

// 데이터를 불러와서 그려주는 공용 함수
async function loadAttendanceData(year, month) {
    try {
        // 백엔드에서 해당 월 출결 데이터(원본 레코드 + 근무일 기준 집계) + 캘린더 일정
        // (공휴일 표시용) 같이 가져오기. 정상/지각/연차 집계는 예전엔 여기서 원본 레코드를
        // 받아 클라이언트가 직접 다시 셌는데, 그러면 주말/공휴일 필터링이 안 돼서 대시보드
        // 카드 숫자와 어긋났다 - 이제 AttendanceController가 AttendanceService.getAttendanceSummary
        // (대시보드와 동일 로직)로 미리 집계해서 내려주는 값을 그대로 쓴다(2026-07-22).
        const [attRes, eventRes] = await Promise.all([
            fetch(`/attendance/monthly?year=${year}&month=${month}`),
            fetch(`/calendar/events?year=${year}&month=${month}`)
        ]);
        const attData = await attRes.json();
        const monthlyAttendanceList = attData.records;
        const monthlyEvents = eventRes.ok ? await eventRes.json() : [];
        const holidayDates = typeof extractHolidayDates === 'function' ? extractHolidayDates(monthlyEvents) : new Set();

        const presentEl = document.getElementById('attPresentDays');
        const lateEl = document.getElementById('attLateDays');
        const leaveEl = document.getElementById('attLeaveDays');

        if (presentEl) presentEl.textContent = attData.presentDays;
        if (lateEl) lateEl.textContent = attData.lateCount;
        if (leaveEl) leaveEl.textContent = attData.leaveCount;

        // calendar.js에 분리해 둔 공용 폼 생성 함수(generateCalendarGridHtml) 호출
        if (typeof generateCalendarGridHtml === 'function') {
            const yearEl = document.getElementById('calendarYear');
            const monthEl = document.getElementById('calendarMonth');
            if (yearEl) yearEl.textContent = year;
            if (monthEl) monthEl.textContent = month;

            document.getElementById('fullCalendarGrid').innerHTML = generateCalendarGridHtml(year, month, (cellDate) => {
                const matchData = monthlyAttendanceList.find(item => item.workDate === cellDate);
                if (!matchData) return '';

                // 예전엔 EARLY_LEAVE(조퇴)/VACATION(휴가)/ABSENT(결근)까지 검사했는데, 이건
                // ERD가 최종 확정되기 전(스키마 작업 초반)에 미리 짜둔 코드가 안 지워지고 남은
                // 것으로 보임 - 실제 ATTENDANCE_STATUS는 NORMAL/LATE/LEAVE 셋뿐이라
                // (ERD_설계서.md 2-4 확정 사항) 저 값들은 DB에 절대 안 들어와서 죽은 코드였음.
                // "결근"은 별도 상태값이 아니라 "그 날짜에 레코드 자체가 없음"으로 표현하는
                // 방식으로 최종 확정됨(2026-07-21 정리).
                // 공용 .badge-*(공지/결재 등과 같이 씀) 대신 진하게 채워진 출결현황 전용
                // 배지(style.css의 .attendance-badge-*)를 씀 - 오늘 칸 배경과 겹쳐도 잘 보이게
                const badgeClassMap = { NORMAL: 'attendance-badge-normal', LATE: 'attendance-badge-late', LEAVE: 'attendance-badge-leave' };
                const badgeClass = badgeClassMap[matchData.attendanceStatus] || 'attendance-badge-normal';
                // 화면엔 영문 상태값(NORMAL/LATE/LEAVE)을 그대로 노출하지 않고, 위에서 정의한
                // ATTENDANCE_STATUS_LABEL로 한글로 바꿔서 보여줌(대시보드 상태 라벨과 같은 방식)
                const statusLabel = ATTENDANCE_STATUS_LABEL[matchData.attendanceStatus] || matchData.attendanceStatus;

                const checkIn = matchData.checkInTime ? matchData.checkInTime.substring(0, 5) : '-';
                const checkOut = matchData.checkOutTime ? matchData.checkOutTime.substring(0, 5) : '-';

                return `
                    <div style="font-size:0.65rem; line-height:1.5; margin-top:4px;">
                        <span class="attendance-badge ${badgeClass}" style="font-size:0.6rem;">${statusLabel}</span>
                        <div>출근 ${checkIn}</div>
                        <div>퇴근 ${checkOut}</div>
                    </div>
                `;
            }, holidayDates);
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
    } else if (status === 'LEAVE') {
        // 연차 승인된 날 - 출근 기록 자체가 없어서(insertLeaveRecord가 시각을 안 채움) 눌러도
        // 의미가 없으니 비활성화. 휴가중에도 출근하는 케이스 지원은 나중에 별도로 다룸
        btn.innerText = '휴가중';
        btn.classList.add('btn', 'btn-secondary');
        btn.disabled = true;
    } else {
        btn.innerText = '업무 종료';
        btn.classList.add('btn', 'btn-secondary');
        btn.disabled = true;
    }
}

// data.attendanceStatus(그날 지각/정상/연차)가 아니라 data.nextStatus(지금 출근했는지 여부:
// NONE/WORKING/DONE/LEAVE)를 한글 라벨로 보여줌 - AttendanceService.getCommuteStatusLabel()과 같은 기준
const COMMUTE_STATUS_LABEL = { NONE: '미출근', WORKING: '근무중', DONE: '퇴근완료', LEAVE: '휴가중' };

function updateAttendanceDisplay(data) {
    const statusEl = document.getElementById('dashCommuteStatus');
    const checkinEl = document.getElementById('dashCheckinTime');
    const timerEl = document.getElementById('dashWorkTimer');

    if (statusEl) statusEl.innerText = `[${COMMUTE_STATUS_LABEL[data.nextStatus] || data.nextStatus}]`;
    if (checkinEl) checkinEl.innerText = data.checkInTime;
    if (timerEl) timerEl.innerText = data.checkOutTime;

    // "월간 근태 요약" 카드 - AttendanceController.getAttendanceData()가 이제
    // presentDays/lateCount/leaveCount/attendanceRate도 같이 응답에 실어보내므로,
    // 출근/퇴근 버튼을 누른 직후 새로고침 없이 이 카드까지 같이 갱신한다(2026-07-22)
    const presentEl = document.getElementById('dashPresentDays');
    const lateCountEl = document.getElementById('dashLateCount');
    const leaveCountEl = document.getElementById('dashLeaveCount');
    const rateRingEl = document.getElementById('dashAttendanceRateRing');
    const rateTextEl = document.getElementById('dashAttendanceRateText');

    if (presentEl && data.presentDays !== undefined) presentEl.innerText = `${data.presentDays}일`;
    if (lateCountEl && data.lateCount !== undefined) lateCountEl.innerText = `${data.lateCount}회`;
    if (leaveCountEl && data.leaveCount !== undefined) leaveCountEl.innerText = `${data.leaveCount}일`;
    if (rateTextEl && data.attendanceRate !== undefined) rateTextEl.innerText = `${data.attendanceRate}%`;
    // 도넛 차트는 main.html이 처음 그릴 때와 똑같은 conic-gradient 문자열을 JS에서 다시 만들어서
    // style을 통째로 교체(퍼센트 숫자만 다른 CSS를 서버가 아니라 JS가 직접 조립하는 방식)
    if (rateRingEl && data.attendanceRate !== undefined) {
        rateRingEl.style.background =
            `conic-gradient(var(--color-primary) 0% ${data.attendanceRate}%, var(--bg-tertiary) ${data.attendanceRate}% 100%)`;
    }
}