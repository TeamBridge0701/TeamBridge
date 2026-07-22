// ===================================================================
// calendar.js - calendar.html(일정 캘린더) 전용 로직
//
// 여러 날짜에 걸친 일정(예: 3일짜리 연차)은 날짜 칸마다 막대를 각각
// 독립적으로 반복해서 그린다(연속된 하나의 막대로 이어붙이는 방식은
// 아직 미구현 - renderCalendarGrid 참고).
//
// 카테고리(PERSONAL/TEAM/COMPANY)별 등록·수정·삭제 권한, 조회 범위는
// 서버(CalendarService)가 최종 판단한다 - 여기 있는 canModifyEventClient()
// 등은 UX용(잠긴 걸 미리 보여주는 용도)이고 실제 차단은 항상 서버가 함.
// ===================================================================
let currentYear = new Date().getFullYear(), currentMonth = new Date().getMonth() + 1, currentEvents = [], editingScheduleId = null;

const $ = id => document.getElementById(id);
const toggleModal = (id, open) => open ? window.openModal?.(id) : window.closeModal?.();

// CalendarService.canModifyEvent()와 동일한 기준으로 삭제 버튼 노출 여부를 판단
// (calendar.html의 th:data-*로 내려받은 로그인 사용자 정보 사용)
function canModifyEventClient(event) {
  const viewer = $('scheduleForm')?.dataset;
  if (!viewer) return false;
  const isAdmin = viewer.employeeRole === 'ADMIN';
  if (event.eventCategory === 'COMPANY') return isAdmin;
  if (event.eventCategory === 'TEAM') {
    if (isAdmin) return false;
    return Number(viewer.deptId) === Number(event.deptId);
  }
  return Number(viewer.employeeId) === Number(event.employeeId);
}

document.addEventListener('DOMContentLoaded', () => {
  // 이벤트 연결 (Optional Chaining으로 깔끔하게 한 줄 처리)
  $('scheduleForm')?.addEventListener('submit', submitScheduleForm);
  $('addScheduleBtn')?.addEventListener('click', () => openScheduleModal(defaultScheduleDate()));
  $('calendarPrevBtn')?.addEventListener('click', () => moveCalendarMonth(-1));
  $('calendarNextBtn')?.addEventListener('click', () => moveCalendarMonth(1));
  $('scheduleModalCloseBtn')?.addEventListener('click', closeScheduleModal);
  $('scheduleCancelBtn')?.addEventListener('click', closeScheduleModal);
  $('cEventDeleteBtn')?.addEventListener('click', deleteCalendarEvent);
  // "일정 구분"을 바꿀 때마다 공휴일 체크박스를 보였다 숨겼다 함(COMPANY일 때만 의미 있음)
  $('scheduleType')?.addEventListener('change', toggleHolidayCheckboxVisibility);

  // ⭐️ [중요] 일반 일정 관리 페이지(calendar.html)일 때만 자체 일정 데이터를 불러와 렌더링
  // 출결 현황 페이지(attendance.html)에서는 attendance.js가 이 폼 함수를 가져다 쓰므로 충돌하지 않음!
  if ($('fullCalendarGrid') && document.getElementById('scheduleForm')) {
    renderCalendar(currentYear, currentMonth);
  }
});

// ===================================================================
// ⭐️ [핵심 공용 함수] 캘린더 격자 폼 생성기
// - attendance.js 등 다른 페이지에서도 이 함수를 호출하여 폼을 재사용할 수 있습니다.
// - customCellRenderer 함수를 넘겨주면, 날짜 칸 내부(event-list 영역)를 입맛대로 채울 수 있습니다.
// ===================================================================
// holidayDates: 공휴일로 지정된 "yyyy-MM-dd" 문자열들의 Set(선택 - 안 넘기면 그냥 빈 Set).
// attendance.js가 출결현황 페이지에서 이 함수를 부를 때 같이 넘겨서, 그 날짜에 출근 기록이
// 있어도 "왜 출근율에는 안 들어갔지?"를 날짜 색만 보고 바로 알 수 있게 함(제목까지는 안
// 보여줌 - 공휴일 목록/이름은 캘린더 페이지에서 보면 되고, 여기선 날짜 강조만 필요, 2026-07-22).
function generateCalendarGridHtml(year, month, customCellRenderer, holidayDates = new Set()) {
  const first = new Date(year, month - 1, 1), lastDate = new Date(year, month, 0).getDate();
  const prevLast = new Date(year, month - 1, 0).getDate(), startDay = first.getDay();
  const totalCells = Math.ceil((startDay + lastDate) / 7) * 7, today = new Date().toISOString().slice(0, 10);

  // 요일 헤더 생성 - 일요일(0번째)은 빨간색, 토요일(6번째)은 파란색 글씨로 구분
  const headers = ['일', '월', '화', '수', '목', '금', '토']
    .map((d, idx) => {
      const weekendClass = idx === 0 ? ' sunday' : idx === 6 ? ' saturday' : '';
      return `<div class="calendar-day-header${weekendClass}" style="text-align:center; font-weight:bold; padding:0.5rem 0;">${d}</div>`;
    })
    .join('');

  // 날짜 셀 그리드 생성
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startDay + 1;
    const isOther = dayNum < 1 || dayNum > lastDate;
    const label = dayNum < 1 ? prevLast + dayNum : dayNum > lastDate ? dayNum - lastDate : dayNum;
    // 이번 칸이 무슨 요일인지(i는 항상 일요일=0부터 시작하는 배치라 7로 나눈 나머지가 곧 요일)
    const dayOfWeek = i % 7;

    let cellDate = '';
    if (dayNum < 1) {
        cellDate = `${year}-${String(month - 1).padStart(2, '0')}-${String(label).padStart(2, '0')}`;
    } else if (dayNum > lastDate) {
        cellDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(label).padStart(2, '0')}`;
    } else {
        cellDate = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    }

    // 공휴일이면 원래 요일 색과 상관없이 빨간색(.sunday)으로 통일 - renderCalendarGrid와 동일 기준
    const weekendNumClass = holidayDates.has(cellDate) ? ' sunday'
      : dayOfWeek === 0 ? ' sunday' : dayOfWeek === 6 ? ' saturday' : '';

    // 각 날짜 칸 내부 영역에 들어갈 커스텀 HTML 주입
    const innerContent = customCellRenderer ? customCellRenderer(cellDate) : '';

    return `
      <div class="calendar-day cal-cell${isOther ? ' other-month' : ''}${cellDate === today ? ' today' : ''}" data-date="${cellDate}">
        <div class="cal-cell-header"><span class="day-number cal-day-num${weekendNumClass}">${label}</span>${cellDate === today ? '<span style="font-size:0.6rem; color:var(--color-primary); font-weight:bold; margin-left:4px;">오늘</span>' : ''}</div>
        <div class="event-list">${innerContent}</div>
      </div>`;
  });

  return headers + cells.join('');
}

// 일정 목록(events, /calendar/events 응답 형식)에서 공휴일(COMPANY + isHoliday)로
// 지정된 날짜만 뽑아 "yyyy-MM-dd" 문자열 Set으로 펼친다. calendar.html(renderCalendarGrid)과
// attendance.html(attendance.js의 loadAttendanceData → generateCalendarGridHtml) 둘 다
// "이 날짜가 공휴일이라 출근율에서 빠졌다"를 화면에 빨간 글씨로 보여줘야 해서 공용으로 뺌(2026-07-22).
// "yyyy-MM-dd" 문자열을 new Date(str)로 바로 파싱하면 UTC로 해석돼 타임존에 따라 하루
// 밀릴 수 있어서(자정 근처 오차), 다른 함수들처럼 연/월/일을 쪼개 숫자로 넘긴다.
function extractHolidayDates(events) {
  const holidayDates = new Set();
  events.filter(e => e.eventCategory === 'COMPANY' && e.isHoliday).forEach(e => {
    const [sy, sm, sd] = e.startDate.split('-').map(Number);
    for (let d = new Date(sy, sm - 1, sd); formatDate(d) <= e.endDate; d.setDate(d.getDate() + 1)) {
      holidayDates.add(formatDate(d));
    }
  });
  return holidayDates;
}

// ===================================================================
// 기존 일정 캘린더(calendar.html) 전용 렌더링 로직
// ===================================================================
async function renderCalendar(year, month) {
  currentYear = year; currentMonth = month;
  try {
    const res = await fetch(`/calendar/events?year=${year}&month=${month}`);
    if (!res.ok) throw new Error('일정을 불러오지 못했습니다.');
    currentEvents = await res.json();
    renderCalendarGrid(year, month);
  } catch (err) { showToast(err.message, 'error'); }
}
// 그 달을 감싸는 주(週) 단위 날짜 배열을 만든다(요일 맞추려고 앞뒤로 낀
// 이전/다음 달 날짜 포함). attendance.js와 공유하는 generateCalendarGridHtml()은
// 42개 칸을 평평하게 펼치는 방식이라, "한 주씩 묶어서" 그 위에 이어붙은 막대를
// 겹쳐 그려야 하는 여기서는 쓸 수 없어서 별도로 계산한다.
function buildCalendarWeeks(year, month) {
  const startDay = new Date(year, month - 1, 1).getDay();     // 1일이 무슨 요일인지(0=일)
  const lastDate = new Date(year, month, 0).getDate();        // 이 달 마지막 날짜
  const totalCells = Math.ceil((startDay + lastDate) / 7) * 7; // 7의 배수로 맞춘 전체 칸 수
  const gridFirst = new Date(year, month - 1, 1 - startDay);   // 그리드 맨 첫 칸(이전 달일 수 있음)

  const weeks = [];
  for (let w = 0; w < totalCells / 7; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(gridFirst);
      dt.setDate(gridFirst.getDate() + w * 7 + d);
      week.push(dt);
    }
    weeks.push(week); // week = [일요일 Date, 월요일 Date, ..., 토요일 Date]
  }
  return weeks;
}

// attendance 페이지와 공유하는 generateCalendarGridHtml() 대신, 여러 날짜짜리
// 일정을 진짜로 이어붙은 막대 하나로 그리기 위한 캘린더 전용 렌더링.
// 구조: .cal-month > (.cal-weekday-row 요일 헤더) + 주(週)마다 .cal-week
//       (날짜 칸 7개 + 그 위에 겹쳐진 .cal-event-layer 막대 레이어)
function renderCalendarGrid(year, month) {
  const container = $('fullCalendarGrid');
  if (!container) return;
  if ($('calendarYear')) $('calendarYear').textContent = year;
  if ($('calendarMonth')) $('calendarMonth').textContent = month;

  const weeks = buildCalendarWeeks(year, month);
  // 화면에 실제로 그려지는 첫/마지막 날짜(이전·다음 달 여백 칸 포함) - 일정의
  // 진짜 시작일이 이보다 훨씬 전이어도, 여기 안에서 제목이 한 번은 보이게 하기 위해 필요
  const gridStart = formatDate(weeks[0][0]);
  const gridEnd = formatDate(weeks[weeks.length - 1][6]);
  const todayStr = formatDate(new Date());
  const categoryLabel = { PERSONAL: '개인', TEAM: '팀', COMPANY: '회사' };

  const headerHtml = ['일', '월', '화', '수', '목', '금', '토']
    .map((d, idx) => {
      const weekendClass = idx === 0 ? ' sunday' : idx === 6 ? ' saturday' : '';
      return `<div class="calendar-day-header${weekendClass}" style="text-align:center; font-weight:bold; padding:0.5rem 0;">${d}</div>`;
    })
    .join('');

  // 공휴일 날짜 집합 - attendance.js도 같은 로직이 필요해서(출결현황 캘린더에도 공휴일
  // 표시) extractHolidayDates()로 뽑아 공용 함수로 만들고 여기선 호출만 한다(2026-07-22)
  const holidayDates = extractHolidayDates(currentEvents);

  const weeksHtml = weeks.map(week => {
    const weekDates = week.map(formatDate);
    const weekStart = weekDates[0], weekEnd = weekDates[6];

    // 이 주(週)와 하루라도 겹치는 일정만 추림
    const weekEvents = currentEvents.filter(e => e.startDate <= weekEnd && e.endDate >= weekStart);

    // 겹치는 일정끼리 같은 줄에서 부딪히지 않게 레인(줄)을 배정하는 간단한 그리디 알고리즘:
    // 시작일이 빠른 순으로 보면서, 이미 끝난 일정이 있는 레인이면 그 레인을 재사용하고
    // 없으면 새 레인을 만든다(레인 = 세로로 몇 번째 줄에 그릴지)
    const sorted = [...weekEvents].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const laneLastEnd = []; // 레인별로 마지막에 배정된 일정의 이번 주 안 종료일
    const placed = sorted.map(e => {
      const spanStart = e.startDate > weekStart ? e.startDate : weekStart; // 이번 주 기준으로 자른 시작
      const spanEnd = e.endDate < weekEnd ? e.endDate : weekEnd;           // 이번 주 기준으로 자른 끝
      let lane = laneLastEnd.findIndex(end => end < spanStart); // 이미 끝난 레인 찾기
      if (lane === -1) { lane = laneLastEnd.length; laneLastEnd.push(spanEnd); } // 없으면 새 레인
      else { laneLastEnd[lane] = spanEnd; }
      return { e, spanStart, spanEnd, lane };
    });
    const laneCount = laneLastEnd.length;

    const eventBarsHtml = placed.map(({ e, spanStart, spanEnd, lane }) => {
      // 요일 인덱스(0~6)를 grid-column으로 변환 - 끝 컬럼은 exclusive라 +2
      const colStart = weekDates.indexOf(spanStart) + 1;
      const colEnd = weekDates.indexOf(spanEnd) + 2;
      // 화면에 처음 보이는 칸에서만 제목 표시(진짜 시작일이 화면 밖이어도 제목이
      // 아예 안 보이는 일이 없도록 - 지난달부터 이어지는 일정 케이스)
      const visibleStart = e.startDate > gridStart ? e.startDate : gridStart;
      const showTitle = spanStart === visibleStart;
      // 이번 주(또는 화면) 이전/이후로 계속 이어지는 구간이면 그쪽 모서리를 각지게
      // 만들어서 "잘려서 계속된다"는 느낌을 줌(style.css의 continues-prev/next)
      const continuesPrev = spanStart !== e.startDate ? ' continues-prev' : '';
      const continuesNext = spanEnd !== e.endDate ? ' continues-next' : '';
      const category = String(e.eventCategory || '').toLowerCase();
      // 공휴일로 지정된 회사 일정만 별도 색(.holiday, CSS에서 빨강)으로 구분 -
      // 일반 회사 일정(주황)과 섞이면 "이날 쉬는 날"인지 눈으로 구별이 안 됨
      const holidayClass = e.eventCategory === 'COMPANY' && e.isHoliday ? ' holiday' : '';

      return `
        <button type="button" class="cal-event-bar ${category}${holidayClass}${continuesPrev}${continuesNext}"
                style="grid-column:${colStart} / ${colEnd}; grid-row:${lane + 1};"
                title="${e.eventTitle} (${categoryLabel[e.eventCategory] || e.eventCategory} 일정)"
                onclick="event.stopPropagation(); openEditScheduleModal('${e.eventId}')">
          ${showTitle ? e.eventTitle : ''}
        </button>`;
    }).join('');

    const cellsHtml = week.map((dt, idx) => {
      const dateStr = formatDate(dt);
      const inMonth = dt.getMonth() === month - 1;
      const isToday = dateStr === todayStr;
      // 공휴일이면 원래 요일 색(토=파랑 등)과 상관없이 빨간색(.sunday)으로 통일 -
      // 평일에 지정된 공휴일도 "쉬는 날"이라는 게 한눈에 보여야 하므로
      const numClass = holidayDates.has(dateStr) ? ' sunday' : idx === 0 ? ' sunday' : idx === 6 ? ' saturday' : '';
      return `
        <div class="calendar-day cal-cell${!inMonth ? ' other-month' : ''}${isToday ? ' today' : ''}" data-date="${dateStr}">
          <div class="cal-cell-header"><span class="day-number cal-day-num${numClass}">${dt.getDate()}</span>${isToday ? '<span style="font-size:0.6rem; color:var(--color-primary); font-weight:bold; margin-left:4px;">오늘</span>' : ''}</div>
        </div>`;
    }).join('');

    // 일정 레인이 많아질수록 이 주(週)의 높이를 늘려서 막대가 다음 주 칸을 침범하지 않게 함
    const weekMinHeight = Math.max(100, 30 + laneCount * 23);

    return `
      <div class="cal-week" style="min-height:${weekMinHeight}px;">
        ${cellsHtml}
        <div class="cal-event-layer" style="grid-template-rows:repeat(${Math.max(laneCount, 1)}, 20px);">
          ${eventBarsHtml}
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `<div class="cal-weekday-row">${headerHtml}</div>${weeksHtml}`;

  // 빈 날짜 칸 클릭 → 새 일정 등록 모달(막대 클릭은 onclick에서 stopPropagation해서
  // 여기까지 안 올라오고 openEditScheduleModal만 실행됨)
  container.querySelectorAll('.calendar-day').forEach(c => c.addEventListener('click', () => openScheduleModal(c.dataset.date)));
}

// 관리자한테만 있는 요소라(calendar.html에서 th:if로 아예 안 만들어질 수도 있음) 없을 때는
// 조용히 아무 것도 안 함. "일정 구분"이 COMPANY일 때만 체크박스를 보여주고, COMPANY가
// 아니게 바뀌면 체크도 같이 풀어서(숨겨진 채로 체크만 남아있는 상태 방지) 제출 시 실수로
// isHoliday=true가 같이 나가는 일이 없게 함
function toggleHolidayCheckboxVisibility() {
  const group = $('scheduleHolidayGroup');
  if (!group) return;
  const isCompany = $('scheduleType')?.value === 'COMPANY';
  group.style.display = isCompany ? '' : 'none';
  if (!isCompany && $('scheduleIsHoliday')) $('scheduleIsHoliday').checked = false;
}

// [등록/수정] 일정 폼 제출
async function submitScheduleForm(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  // 체크박스는 체크 안 하면 FormData에 키 자체가 안 들어오고, 체크하면 값이 문자열 "on"으로
  // 들어온다 - 서버(CalendarEventDTO.isHoliday)는 true/false를 기대하니 명시적으로 채워줌
  payload.isHoliday = $('scheduleIsHoliday')?.checked || false;

  if (!payload.eventTitle || !payload.startDate || !payload.endDate) return showToast('필수 항목을 입력하세요.', 'error');
  if (payload.endDate < payload.startDate) return showToast('종료일이 시작일보다 빠를 수 없습니다.', 'error');

  try {
    const url = editingScheduleId ? `/calendar/events/${editingScheduleId}` : '/calendar/events';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('일정 저장에 실패했습니다.');
    closeScheduleModal(); await renderCalendar(currentYear, currentMonth);
    showToast('일정이 저장되었습니다.', 'success');
  } catch (error) { showToast(error.message, 'error'); }
}

// [삭제] 특정 일정 삭제
async function deleteCalendarEvent() {
  if (!editingScheduleId) return;
  try {
    const res = await fetch(`/calendar/events/${editingScheduleId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('일정 삭제에 실패했습니다.');
    closeScheduleModal(); await renderCalendar(currentYear, currentMonth);
    showToast('일정이 삭제되었습니다.', 'success');
  } catch (error) { showToast(error.message, 'error'); }
}

// 조회는 되지만 수정 권한은 없는 일정(예: 관리자가 아닌 사람이 연 COMPANY 일정)을 열었을 때
// 입력칸/구분 드롭다운/저장버튼을 통째로 잠가서, "고칠 수 있다"거나 "구분을 팀/개인으로
// 바꿀 수 있다"는 착각이 안 들게 함(실제 차단은 서버 canModifyEvent가 재검증)
function setScheduleFormEditable(editable) {
  ['scheduleStartDate', 'scheduleEndDate', 'scheduleTitle', 'scheduleType'].forEach(id => {
    if ($(id)) $(id).disabled = !editable;
  });
  if ($('cEventSubmitBtn')) $('cEventSubmitBtn').style.display = editable ? '' : 'none';
}

// 모달창 UI 제어
function openScheduleModal(date = new Date().toISOString().slice(0, 10)) {
  editingScheduleId = null;
  $('calendarModalTitle').textContent = '새 일정 등록'; $('cEventSubmitBtn').textContent = '등록';
  $('scheduleStartDate').value = $('scheduleEndDate').value = date;
  $('scheduleTitle').value = ''; $('scheduleType').value = 'PERSONAL';
  toggleHolidayCheckboxVisibility(); // 기본값 PERSONAL이니 숨김 + 체크 해제
  if ($('cEventDeleteBtn')) $('cEventDeleteBtn').style.display = 'none';
  setScheduleFormEditable(true); // 새로 등록하는 것이므로 항상 입력 가능하게 초기화
  toggleModal('modal-calendar-write', true);
}

function closeScheduleModal() { editingScheduleId = null; toggleModal('modal-calendar-write', false); }

function openEditScheduleModal(id) {
  const e = currentEvents.find(item => Number(item.eventId) === Number(id));
  if (!e) return;
  editingScheduleId = e.eventId;
  $('calendarModalTitle').textContent = '일정 수정'; $('cEventSubmitBtn').textContent = '수정';
  $('scheduleStartDate').value = e.startDate; $('scheduleEndDate').value = e.endDate;
  $('scheduleTitle').value = e.eventTitle; $('scheduleType').value = e.eventCategory;
  toggleHolidayCheckboxVisibility(); // 카테고리에 맞춰 체크박스 보이기/숨기기
  // COMPANY 일정이면 기존 공휴일 지정 여부를 그대로 보여줌(toggle 호출 이후에 값을 세팅해야,
  // COMPANY가 아닐 때 toggle이 강제로 꺼버리는 것과 순서가 안 꼬임)
  if ($('scheduleIsHoliday')) $('scheduleIsHoliday').checked = !!e.isHoliday;
  // 삭제 버튼과 같은 기준(canModifyEventClient)으로 폼 전체(입력칸+구분 드롭다운+저장버튼)도
  // 잠금 - 서버(canModifyEvent)도 동일 기준으로 재검증하므로 이건 UX용, 실제 차단은 서버가 함
  const canModify = canModifyEventClient(e);
  if ($('cEventDeleteBtn')) $('cEventDeleteBtn').style.display = canModify ? '' : 'none';
  setScheduleFormEditable(canModify);
  toggleModal('modal-calendar-write', true);
}

// 월 이동 유틸리티
async function moveCalendarMonth(delta) {
  const moved = new Date(currentYear, currentMonth - 1 + delta, 1);
  await renderCalendar(moved.getFullYear(), moved.getMonth() + 1);
}

const defaultScheduleDate = () => new Date().getFullYear() === currentYear && new Date().getMonth() + 1 === currentMonth ? formatDate(new Date()) : `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
const formatDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// 다른 스크립트나 인라인 HTML에서 호출할 수 있도록 윈도우 객체에 등록
Object.assign(window, { closeScheduleModal, deleteCalendarEvent, moveCalendarMonth, openEditScheduleModal, generateCalendarGridHtml });
