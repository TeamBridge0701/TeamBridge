// ===================================================================
// dashboard.js - main.html(대시보드/홈 화면) 전용 로직
//
// main.html에 있는 여러 위젯(오늘 일정, 최근 공지, 결재 현황, 미니 캘린더,
// 출퇴근 버튼)을 이 파일 하나가 전부 채워 넣는다. 큰 흐름은:
//   1) renderDashboard()가 페이지 로드 시 한 번 호출되어 모든 위젯을 그린다.
//   2) 출근/퇴근 버튼(commute)을 누르면 상태가 바뀌고 화면 일부만 다시 그린다.
//
// ===================================================================
// 🔧 백엔드 작업 가이드 (순서 2 — docs/기획서.md 8장 2순위: 메인 대시보드 + 출퇴근)
//   필요 테이블: EMPLOYEE, ATTENDANCE, NOTICE, APPROVAL/APPROVAL_LINE, CALENDAR_EVENT
//   필요 API:   GET /main , POST /attendance/checkin , POST /attendance/checkout (docs/기획서.md 5장)
//
// [1] renderDashboard() → 지금처럼 클라이언트가 state.notices/approvals/
//     calendarEvents 전체를 필터링/정렬하지 말고, 서버가 이미 가공해서 내려주는
//     "대시보드 요약 응답 1건"(GET /main, 또는 Thymeleaf 모델)을 그대로 채워 넣는
//     방식으로 바꾼다. 특히 아래는 반드시 서버 쿼리로 옮길 것 (클라이언트에 원본
//     데이터를 다 내려주면 안 되는 것들):
//       - dashNotices: 최신 3건 → `ORDER BY IS_PINNED DESC, NOTICE_ID DESC LIMIT 3`
//       - pendingApprovalCount: "내가 지금 승인할 차례인 문서 수" →
//         APPROVAL_LINE.APPROVER_ID=:me AND LINE_STATUS='WAIT' AND STEP_NO=해당 문서의 MIN(STEP_NO)
//         (docs/ERD_설계서.md 2-11 계산 규칙 참고, signers[step] 배열 인덱스 방식은 폐기)
//       - progressingApprovalCount: DRAFTER_ID=:me AND STATUS='PROGRESS' COUNT
//       - userApprovals: 기안자/결재자/참조자 조건을 하나의 서버 쿼리로 처리
//       - todayEvents: CALENDAR_EVENT에서 `:오늘 BETWEEN START_DATE AND END_DATE`
//
// [2] commute() → 가장 중요한 AJAX 지점. 지금은 브라우저에서 시각을 계산해
//     state에 바로 쓰지만, 실제로는:
//       - 출근: POST /attendance/checkin (JSON) → 서버가 현재 시각 기준으로
//         CHECK_IN_TIME 저장 + 09:00 초과 시 ATTENDANCE_STATUS='LATE' 판정
//         (지금 여기 있는 "09시 정각 초과 = 지각" 규칙 자체는 2026-07-08 팀
//         확정사항이라 그대로 유지하면 되지만, 판정 기준 시각은 클라이언트
//         Date가 아니라 반드시 서버 시각이어야 한다 — 클라이언트 시계 조작으로
//         지각을 회피하는 것을 막기 위함)
//       - 퇴근: POST /attendance/checkout (JSON) → CHECK_OUT_TIME 저장
//       - 둘 다 UNIQUE(EMPLOYEE_ID, WORK_DATE) 제약이 있으므로 서버에서
//         "오늘 이미 출근/퇴근 처리됐는지" 재검증 후 처리(update-or-insert)
//     성공 응답을 받은 뒤에만 화면(statusLabel 등)을 갱신하도록 순서를 바꿀 것.
//
// [3] viewNotice() → GET /notice/detail/{id}로 교체(조회수 +1은 서버가 처리).
// ===================================================================

// 대시보드에 보이는 모든 위젯을 state 데이터로 채워 넣는 메인 함수.
// 아래에서 프로필, 출퇴근 상태, 공지, 결재, 미니 캘린더, 오늘 일정 순서로 그린다.
// 🔧 백엔드 2단계 — GET /main 응답(요약 1건)으로 전체 교체. 공지3건·결재건수·오늘일정은
//    전부 서버 쿼리로 옮기고 클라이언트 filter/sort는 삭제. (상세: [1])
function renderDashboard() {
  const user = state.currentUser;
  if (!user) return;

  // --- 좌측 프로필 카드 ---
  document.getElementById('dashAvatar').innerHTML = avatarMarkup(user);
  document.getElementById('dashName').innerText = user.name;
  document.getElementById('dashRoleDept').innerText = `${user.dept} · ${user.position}`;
  document.getElementById('dashGreetingName').innerText = `${user.name} ${user.position}`;

  // 로컬스토리지에서 복원한 출결 상태와 출퇴근 위젯을 동기화한다
  // (commute() 함수 자체는 DOM만 실시간으로 갱신하므로, 새로고침 시에는 이 작업이 필요하다)
  const statusLabel = document.getElementById('dashCommuteStatus');
  const checkinTimeLabel = document.getElementById('dashCheckinTime');
  const checkoutTimeLabel = document.getElementById('dashWorkTimer');
  if (state.attendance.status === '근무중') {
    statusLabel.innerText = '근무중';
    statusLabel.style.color = 'var(--color-success)';
    checkinTimeLabel.innerText = state.attendance.checkin;
    checkoutTimeLabel.innerText = '-';
  } else if (state.attendance.status === '퇴근') {
    statusLabel.innerText = '퇴근';
    statusLabel.style.color = 'var(--color-danger)';
    checkinTimeLabel.innerText = state.attendance.checkin;
    checkoutTimeLabel.innerText = state.attendance.checkout;
  }
  updateCommuteButton();

  // 1. 대시보드 공지사항 (최근 3건) - 공지 id가 클수록 최신이라고 보고 내림차순 정렬
  const dashNotices = [...state.notices].sort((a,b) => b.id - a.id).slice(0,3);
  const noticeHtml = dashNotices.map(notice => `
    <tr class="clickable" onclick="viewNotice(${notice.id})">
      <td>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          ${notice.pinned ? '<span class="badge badge-danger">중요</span>' : '<span class="badge badge-muted">일반</span>'}
          <span class="notice-link">${notice.title}</span>
        </div>
      </td>
      <td style="font-size:0.8rem; color:var(--text-muted); text-align:right;">${notice.date}</td>
    </tr>
  `).join('');
  document.getElementById('dashNoticeList').innerHTML = noticeHtml;

  // 2. 결재 현황 통계
  // "결재 대기 문서" = 진행중인 결재 중, 지금 내 차례(signers[step] === 나)인 것의 개수
  const pendingApprovalCount = state.approvals.filter(a => {
    if (a.status !== '진행중') return false;
    const currentSignerId = a.signers[a.step];
    return currentSignerId === user.id;
  }).length;
  document.getElementById('dashWaitCount').innerText = pendingApprovalCount;

  // "기안 진행 문서" = 내가 올린(기안한) 문서 중 아직 진행중인 것의 개수
  const progressingApprovalCount = state.approvals.filter(a => {
    return a.drafterId === user.id && a.status === '진행중';
  }).length;
  document.getElementById('dashProgressCount').innerText = progressingApprovalCount;

  const userApprovals = state.approvals.filter(a => {
    return a.drafterId === user.id || a.signers.includes(user.id) || a.refDepts.includes(user.dept);
  }).sort((a,b) => b.id - a.id).slice(0,3);

  const approvalHtml = userApprovals.map(app => {
    let statusBadge = `<span class="badge badge-warning">진행중</span>`;
    if (app.status === '승인') statusBadge = `<span class="badge badge-success">승인완료</span>`;
    if (app.status === '반려') statusBadge = `<span class="badge badge-danger">반려됨</span>`;
    
    const drafter = state.users.find(u => u.id === app.drafterId);
    const drafterText = drafter ? `${drafter.name} ${drafter.position}` : '알수없음';

    // app.js는 결재 상세 모달을 직접 여는 방식(viewApprovalDetail(id))을 쓰지만,
    // 그 모달은 approval.html에만 존재하므로 이 페이지에서는 해당 페이지로 링크만 건다.
    return `
      <tr class="clickable" onclick="navigateTo('approval')">
        <td><strong>${app.title}</strong></td>
        <td>${drafterText}</td>
        <td style="font-family:'Fira Code'; font-size:0.8rem;">${app.date}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
  document.getElementById('dashApprovalList').innerHTML = approvalHtml;

  // 3. 우측 미니 캘린더 위젯 (2026년 6월 한 달 치를 달력 모양 grid로 그림)
  // 2026-06-01이 월요일이라, 맨 앞에 "지난달 31일" 칸 하나를 채워두고
  // 시작해야 요일 위치가 딱 맞는다. (calendar.js의 전체 달력도 같은 방식)
  const currentMonthEvents = state.calendarEvents;
  let miniCalHtml = `
    <div class="mini-cal-grid">
      <div class="mini-cal-day-header">일</div>
      <div class="mini-cal-day-header">월</div>
      <div class="mini-cal-day-header">화</div>
      <div class="mini-cal-day-header">수</div>
      <div class="mini-cal-day-header">목</div>
      <div class="mini-cal-day-header">금</div>
      <div class="mini-cal-day-header">토</div>
  `;
  
  miniCalHtml += `<div class="mini-cal-day other-month">31</div>`;
  
  for (let i = 1; i <= 30; i++) {
    const hasEvent = currentMonthEvents.some(e => i >= e.startDate && i <= e.endDate);
    const isToday = (i === 30);
    
    let cellClass = 'mini-cal-day';
    if (isToday) cellClass += ' today';
    if (hasEvent) cellClass += ' has-event';
    
    const eventText = hasEvent ? currentMonthEvents.filter(e => i >= e.startDate && i <= e.endDate).map(e => e.title).join(', ') : '';
    const clickAttr = hasEvent ? `onclick="showToast('${i}일 일정: ${eventText}', 'primary')"` : '';
    
    miniCalHtml += `<div class="${cellClass}" ${clickAttr}>${i}</div>`;
  }
  miniCalHtml += `<div class="mini-cal-day other-month">1</div>`;
  miniCalHtml += `<div class="mini-cal-day other-month">2</div>`;
  miniCalHtml += `<div class="mini-cal-day other-month">3</div>`;
  miniCalHtml += `<div class="mini-cal-day other-month">4</div>`;
  miniCalHtml += `</div>`;
  
  document.getElementById('dashMiniCalendar').innerHTML = miniCalHtml;

  // 4. 오늘 일정 카드 (day 30 = "오늘". 미니 캘린더의 isToday와 같은 규칙)
  const todayEvents = state.calendarEvents.filter(e => 30 >= e.startDate && 30 <= e.endDate);
  const scheduleHtml = todayEvents.map(e => {
    let color = 'var(--color-primary)';
    if (e.category === 'team') color = 'var(--color-accent)';
    if (e.category === 'company') color = 'var(--color-success)';
    return `
      <div style="display:flex; align-items:center; gap:0.6rem; padding:0.5rem 0; border-bottom:1px dashed var(--border-color);">
        <span style="width:8px; height:8px; border-radius:50%; background:${color}; flex-shrink:0;"></span>
        <span style="flex:1; font-size:0.85rem;">${e.title}</span>
      </div>
    `;
  }).join('');
  document.getElementById('dashTodaySchedule').innerHTML = scheduleHtml ||
    '<div style="text-align:center; color:var(--text-muted); padding:1rem; font-size:0.85rem;">오늘 등록된 일정이 없습니다.</div>';
}

// 출결 - 출근/퇴근 버튼을 분리하면 사용자가 잘못 누를 수 있으므로,
// 현재 상태에 따라 하나의 버튼이 출근과 퇴근을 모두 처리하도록 한다.
// 🔧 백엔드 2단계 — 순수 화면 갱신 함수라 그대로 유지. commute()의 서버 응답 이후에만 호출.
function updateCommuteButton() {
  const btn = document.getElementById('btnCommute');
  if (state.attendance.status === '근무중') {
    btn.innerText = '퇴근하기';
    btn.className = 'btn btn-primary';
    btn.disabled = false;
  } else if (state.attendance.status === '퇴근') {
    btn.innerText = '출근 완료';
    btn.className = 'btn btn-secondary';
    btn.disabled = true;
  } else {
    btn.innerText = '출근하기';
    btn.className = 'btn btn-primary';
    btn.disabled = false;
  }
}

// 대시보드의 "출근하기 / 퇴근하기" 버튼 하나가 이 함수를 호출한다.
// state.attendance.status 값("미출근" → "근무중" → "퇴근")에 따라
// 이번 클릭이 출근인지 퇴근인지를 스스로 판단해서 처리한다.
// 🔧 백엔드 2단계 — 가장 중요한 AJAX 지점. POST /attendance/checkin·checkout으로 교체하고,
//    서버 응답을 받은 뒤에만 화면을 갱신하도록 순서를 바꾼다. 지각 판정은 서버 시각 기준. (상세: [2])
function commute() {
  const statusLabel = document.getElementById('dashCommuteStatus');
  const checkinTimeLabel = document.getElementById('dashCheckinTime');

  if (state.attendance.status === '퇴근') {
    showToast('오늘은 이미 퇴근 처리되었습니다. 내일 다시 출근해 주세요.', 'warning');
    return;
  }

  // 이미 "근무중"이면 이번 클릭은 퇴근 처리
  if (state.attendance.status === '근무중') {
    state.attendance.status = '퇴근';
    state.attendance.checkout = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    statusLabel.innerText = '퇴근';
    statusLabel.style.color = 'var(--color-danger)';
    document.getElementById('dashWorkTimer').innerText = state.attendance.checkout;

    upsertAttendanceRecord(state.currentUser.id, 30, { checkout: state.attendance.checkout });
    saveState();
    updateCommuteButton();
    showToast('퇴근이 기록되었습니다. 오늘 하루도 고생하셨습니다!', 'success');
    return;
  }

  // 여기까지 왔다면 "미출근" 상태 → 이번 클릭은 출근 처리
  state.attendance.status = '근무중';
  const now = new Date();
  state.attendance.checkin = now.toLocaleTimeString('ko-KR', { hour12: false });
  // 9시 정각을 넘겨서 출근하면 지각으로 표시
  state.attendance.late = (now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 0));

  statusLabel.innerText = '근무중';
  statusLabel.style.color = 'var(--color-success)';
  checkinTimeLabel.innerText = state.attendance.checkin;
  document.getElementById('dashWorkTimer').innerText = '-';

  upsertAttendanceRecord(state.currentUser.id, 30, {
    checkin: state.attendance.checkin,
    status: state.attendance.late ? '지각' : '정상'
  });
  saveState();
  updateCommuteButton();
  showToast('출근이 안전하게 등록되었습니다.', 'success');
}

// 대시보드에서 뜨는 간단 공지 팝업.
// notice.js의 viewNotice()와 이름·동작은 같지만, app.js에서 호출하는
// renderNotices()는 없다 — 이 페이지에는 #noticeTableBody가 없기 때문.
// 🔧 백엔드 2단계 — GET /notice/detail/{id} 로 교체(조회수 +1은 서버가 처리). (상세: [3])
function viewNotice(id) {
  const notice = state.notices.find(n => n.id === id);
  if (!notice) return;

  notice.views++;
  saveState();

  document.getElementById('mNoticeTitle').innerText = notice.title;
  document.getElementById('mNoticeWriter').innerText = notice.writer;
  document.getElementById('mNoticeDate').innerText = notice.date;
  document.getElementById('mNoticeContent').innerText = notice.content;

  openModal('modal-notice-detail');
}

// 초기화
window.addEventListener('DOMContentLoaded', () => {
  if (!initPage('dashboard')) return;
  renderDashboard();
});
