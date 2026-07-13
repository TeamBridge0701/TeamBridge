// ===================================================================
// attendance.js - attendance.html("출결 현황") 전용 로직
// 로그인한 사용자 "본인"의 이번 달 출퇴근 기록만 달력 형태로 보여준다.
// 여러 직원을 한 번에 관리하는 화면은 admin-attendance.js가 따로 담당한다.
//
// ===================================================================
// 🔧 백엔드 작업 가이드 (순서 2 — docs/기획서.md 8장 2순위: 메인 대시보드 + 출퇴근과 함께 진행)
//   필요 테이블: ATTENDANCE (docs/ERD_설계서.md 2-4)
//   필요 API:   화면설계서 10번 화면 전용 API가 기획서 5장에는 명시돼 있지 않음 →
//               GET /attendance/records?year=&month= 형태로 신설 필요 (팀 논의 필요, 아래 질문 참고)
//
// [1] renderAttendanceStatus() → 지금은 state.attendanceRecords 전체(모든 직원 몫)를
//     받아둔 뒤 클라이언트에서 본인 것만 filter()하지만, 실제로는 처음부터
//     "로그인한 본인 것만" 서버가 필터링해서 내려줘야 한다(다른 직원 근태를
//     내려주면 정보 노출). WHERE EMPLOYEE_ID=:me AND WORK_DATE 이번달로 조회.
//
// [2] 출근일수/지각/휴가 집계(presentDays/lateDays/leaveDays)도 서버에서
//     GROUP BY로 미리 계산해서 내려주는 편이 낫다(지금처럼 달력 30칸을 순회하며
//     클라이언트가 세는 방식은 프로토타입이라 괜찮지만, 실제로는 월이 바뀌면
//     날짜 수가 달라지므로 서버 쿼리로 처리하는 게 안전).
//
// [3] "6월 한 달 고정"으로 짜여 있는 하드코딩(1~30일, 오늘=30일)은 실제 구현에서
//     ?year=&month= 파라미터를 받아 해당 월의 실제 날짜 수만큼 그리도록 고쳐야 한다.
// ===================================================================

// 상단 통계(출근일수/지각/휴가)와 달력을 함께 그리는 메인 함수.
// 🔧 백엔드 2단계 — GET /attendance/records?year=&month= 로 교체(본인 것만 서버가 필터링해서
//    내려줌). 출근일수/지각/휴가 집계도 서버 GROUP BY로 미리 계산해서 받는 걸 권장. (상세: [1][2][3])
function renderAttendanceStatus() {
  // dashboard.js의 commute()가 오늘(30일) 기록도 attendanceRecords에
  // 함께 기록해 두므로, 이 페이지는 그냥 로그인한 사용자 본인의 기록을
  // 매일 동일한 방식으로 읽으면 된다 - 오늘 날짜라고 별도 처리하지 않는다.
  const dayMap = {};
  state.attendanceRecords
    .filter(r => r.userId === state.currentUser.id)
    .forEach(r => { dayMap[r.date] = r; });

  let presentDays = 0;
  let lateDays = 0;
  let leaveDays = 0;

  let html = `
    <div class="mini-cal-day-header" style="padding:0.75rem 0;">일</div>
    <div class="mini-cal-day-header" style="padding:0.75rem 0;">월</div>
    <div class="mini-cal-day-header" style="padding:0.75rem 0;">화</div>
    <div class="mini-cal-day-header" style="padding:0.75rem 0;">수</div>
    <div class="mini-cal-day-header" style="padding:0.75rem 0;">목</div>
    <div class="mini-cal-day-header" style="padding:0.75rem 0;">금</div>
    <div class="mini-cal-day-header" style="padding:0.75rem 0;">토</div>
    <div class="cal-cell other-month">
      <div class="cal-cell-header"><span class="cal-day-num">31</span></div>
    </div>
  `;

  for (let d = 1; d <= 30; d++) {
    const dow = d % 7; // 0=일, 6=토 (2026-06-01이 월요일 기준)
    const isWeekend = (dow === 0 || dow === 6);
    const isToday = (d === 30);
    const rec = dayMap[d];

    let cellClass = 'cal-cell';
    if (isToday) cellClass += ' today';

    let bodyHtml = '';
    if (rec && rec.status === '휴가') {
      leaveDays++;
      bodyHtml = `<div class="cal-event-bar" style="background-color: var(--color-primary);">휴가</div>`;
    } else if (isWeekend) {
      bodyHtml = `<div style="font-size:0.7rem; color:var(--text-muted);">주말</div>`;
    } else if (rec && rec.checkin) {
      presentDays++;
      if (rec.status === '지각') lateDays++;
      const badgeClass = rec.status === '지각' ? 'badge-warning' : 'badge-success';
      bodyHtml = `
        <div style="font-size:0.65rem; line-height:1.5;">
          <span class="badge ${badgeClass}" style="font-size:0.6rem;">${rec.status}</span>
          <div>출근 ${rec.checkin}</div>
          ${rec.checkout ? `<div>퇴근 ${rec.checkout}</div>` : ''}
        </div>
      `;
    } else if (isToday) {
      bodyHtml = `<div style="font-size:0.7rem; color:var(--text-muted);">미출근</div>`;
    }

    html += `
      <div class="${cellClass}">
        <div class="cal-cell-header"><span class="cal-day-num">${d}</span></div>
        ${bodyHtml}
      </div>
    `;
  }

  document.getElementById('attendanceCalendarGrid').innerHTML = html;
  document.getElementById('attPresentDays').innerText = presentDays;
  document.getElementById('attLateDays').innerText = lateDays;
  document.getElementById('attLeaveDays').innerText = leaveDays;
}

// 초기화
window.addEventListener('DOMContentLoaded', () => {
  if (!initPage('attendance')) return;
  renderAttendanceStatus();
});
