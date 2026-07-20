// ===================================================================
// calendar.js - calendar.html(일정 캘린더) 전용 로직
//
// 이 프로토타입은 "2026년 6월" 한 달만 다룬다(이전/다음 달 이동은 아직
// 미구현). 2026-06-01이 월요일이라서, 달력을 그릴 때 맨 앞에 "지난달
// 31일" 칸 하나를 끼워 넣어야 요일 위치가 딱 맞아떨어진다.
//
// 여러 날짜에 걸친 일정(예: 3일짜리 연차)은 하루 칸마다 막대를 반복해서
// 그리지 않고, 그 주(週) 안에서는 하나로 이어진 막대 하나로 그린다.
// 일정이 이번 주를 넘어가면 다음 주 행에서 새 막대가 이어서 시작된다
// (renderCalendarGrid의 "주 단위로 나눠서 그리기" 로직 참고).
//
// ===================================================================
// 🔧 백엔드 작업 가이드 (순서 6 — docs/기획서.md 8장 6순위: 캘린더, 공휴일 API)
//   필요 테이블: CALENDAR_EVENT (docs/ERD_설계서.md 2-6)
//   필요 API:   GET /calendar/events?year=&month=, POST /calendar/event,
//               POST /calendar/event/update/{id}, POST /calendar/event/delete/{id} (docs/기획서.md 5장)
//
// [1] CAL_WEEKS 하드코딩(2026년 6월 고정 배열, 23~29번째 줄) → 삭제 대상.
//     실제로는 ?year=&month= 파라미터로 받은 달의 1일 요일을 계산해
//     주(週) 배열을 자바스크립트에서 동적으로 생성해야 한다(이전/다음 달 이동 버튼도
//     이때 함께 구현). CALENDAR_EVENT 조회도 그 달 범위로 GET /calendar/events?year=&month=.
//
// [2] renderCalendarGrid()/renderCalendarWeek() → START_DATE/END_DATE가 이제
//     "몇 월 며칠"이 아니라 완전한 DATE 타입이므로, 정수 day 비교
//     (e.startDate <= weekLastDay 등)를 실제 Date 비교로 바꿔야 한다.
//     겹치는 일정을 레인으로 나눠 쌓는 로직 자체는 그대로 재사용 가능.
//
// [3] submitCalendarEvent() → POST /calendar/event(신규) 또는
//     /calendar/event/update/{id}(수정)로 교체. "본인만 수정 가능"(기획서 3.6)이므로
//     서버에서 EMPLOYEE_ID(등록자)가 로그인 사용자와 같은지 재검증해야 한다.
//     newId 클라이언트 계산 부분은 삭제(AUTO_INCREMENT).
//
// [4] deleteCalendarEvent() → POST /calendar/event/delete/{id}. 여기도
//     "작성자 본인만" 권한을 서버에서 다시 확인.
//
// [5] 공휴일 표시(기획서 3.6) → **외부 API 연동 없이 관리자가 캘린더에서 직접
//     일정 등록하는 방식으로 확정**(2026-07-08, 최초 계획이던 특일정보 API
//     연동은 폐기). 즉 공휴일도 그냥 CALENDAR_EVENT 1건(EVENT_CATEGORY='COMPANY')
//     이라 테이블·API 추가가 전혀 없다 — submitCalendarEvent()가 그대로
//     POST /calendar/event 로 바뀌기만 하면 공휴일 등록도 함께 해결된다.
//     ⚠️ 다만 지금 calendar.html의 "일정 구분" select는 로그인만 하면 누구나
//     "회사 일정(전사 노출)"을 선택할 수 있게 되어 있는데, 기획서 4장 권한표는
//     "공휴일·기념일 등록은 관리자만"이라고 못박아 뒀다. 그러므로 서버(POST
//     /calendar/event)에서 EVENT_CATEGORY='COMPANY'로 등록하려는 요청은
//     로그인 사용자의 EMPLOYEE_ROLE='ADMIN' 여부를 반드시 재검증해야 한다
//     (일반 직원은 PERSONAL/TEAM만 등록 가능). 팀 일정 공유는 아직 이
//     프로토타입에 없음 — CALENDAR_EVENT에 TEAM_ID 등 팀 범위를 식별할
//     컬럼이 필요한지 추가 논의 필요.
// ===================================================================

// ===================================================================
// calendar.js - calendar.html(일정 캘린더) 전용 로직
// ===================================================================
let currentYear = new Date().getFullYear(), currentMonth = new Date().getMonth() + 1, currentEvents = [], editingScheduleId = null;

const $ = id => document.getElementById(id);
const toggleModal = (id, open) => open ? window.openModal?.(id) : window.closeModal?.();

document.addEventListener('DOMContentLoaded', () => {
  // 이벤트 연결 (Optional Chaining으로 깔끔하게 한 줄 처리)
  $('scheduleForm')?.addEventListener('submit', submitScheduleForm);
  $('addScheduleBtn')?.addEventListener('click', () => openScheduleModal(defaultScheduleDate()));
  $('calendarPrevBtn')?.addEventListener('click', () => moveCalendarMonth(-1));
  $('calendarNextBtn')?.addEventListener('click', () => moveCalendarMonth(1));
  $('scheduleModalCloseBtn')?.addEventListener('click', closeScheduleModal);
  $('scheduleCancelBtn')?.addEventListener('click', closeScheduleModal);
  $('cEventDeleteBtn')?.addEventListener('click', deleteCalendarEvent);

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
function generateCalendarGridHtml(year, month, customCellRenderer) {
  const first = new Date(year, month - 1, 1), lastDate = new Date(year, month, 0).getDate();
  const prevLast = new Date(year, month - 1, 0).getDate(), startDay = first.getDay();
  const totalCells = Math.ceil((startDay + lastDate) / 7) * 7, today = new Date().toISOString().slice(0, 10);

  // 요일 헤더 생성
  const headers = ['일', '월', '화', '수', '목', '금', '토']
    .map(d => `<div class="calendar-day-header" style="text-align:center; font-weight:bold; padding:0.5rem 0;">${d}</div>`)
    .join('');

  // 날짜 셀 그리드 생성
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startDay + 1;
    const isOther = dayNum < 1 || dayNum > lastDate;
    const label = dayNum < 1 ? prevLast + dayNum : dayNum > lastDate ? dayNum - lastDate : dayNum;
    
    let cellDate = '';
    if (dayNum < 1) {
        cellDate = `${year}-${String(month - 1).padStart(2, '0')}-${String(label).padStart(2, '0')}`;
    } else if (dayNum > lastDate) {
        cellDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(label).padStart(2, '0')}`;
    } else {
        cellDate = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    }

    // 각 날짜 칸 내부 영역에 들어갈 커스텀 HTML 주입
    const innerContent = customCellRenderer ? customCellRenderer(cellDate) : '';

    return `
      <div class="calendar-day cal-cell${isOther ? ' other-month' : ''}${cellDate === today ? ' today' : ''}" data-date="${cellDate}">
        <div class="cal-cell-header"><span class="day-number cal-day-num">${label}</span>${cellDate === today ? '<span style="font-size:0.6rem; color:var(--color-primary); font-weight:bold; margin-left:4px;">오늘</span>' : ''}</div>
        <div class="event-list">${innerContent}</div>
      </div>`;
  });

  return headers + cells.join('');
}

// ===================================================================
// 기존 일정 캘린더(calendar.html) 전용 렌더링 로직
// ===================================================================
async function renderCalendar(year, month) {
  currentYear = year; currentMonth = month;
  try {
    currentEvents = await apiFetch(`/calendar/events?year=${year}&month=${month}`);
    renderCalendarGrid(year, month);
  } catch (err) { showToast(err.message, 'error'); }
}
//attendance 및 calendar 공통 폼(캘린더 폼)
function renderCalendarGrid(year, month) {
  const container = $('fullCalendarGrid');
  if (!container) return;
  if ($('.calendar-controls h2')) $('.calendar-controls h2').textContent = `${year}년 ${month}월`;

  // 공용 폼 생성 함수를 호출하여 일정 바(버튼)를 각 날짜 칸에 렌더링
  container.innerHTML = generateCalendarGridHtml(year, month, (cellDate) => {
    const matchedEvents = currentEvents.filter(e => {
      // 시작일과 종료일 사이에 속하는 일정인지 체크
      return cellDate >= e.startDate && cellDate <= e.endDate;
    });

    return matchedEvents.map(e => `
      <button type="button" class="event-bar ${String(e.scheduleType || '').toLowerCase()}" 
              title="${e.title} (${{PERSONAL:'개인', TEAM:'팀', COMPANY:'회사'}[e.scheduleType] || e.scheduleType} 일정)"
              onclick="event.stopPropagation(); openEditScheduleModal('${e.scheduleId}')">
        ${e.title}
      </button>
    `).join('');
  });
  
  // 날짜 클릭 이벤트 바인딩
  container.querySelectorAll('.calendar-day').forEach(c => c.addEventListener('click', () => openScheduleModal(c.dataset.date)));
}

// [등록/수정] 일정 폼 제출
async function submitScheduleForm(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  
  if (!payload.title || !payload.startDate || !payload.endDate) return showToast('필수 항목을 입력하세요.', 'error');
  if (payload.endDate < payload.startDate) return showToast('종료일이 시작일보다 빠를 수 없습니다.', 'error');

  try {
    const url = editingScheduleId ? `/api/calendar/events/${editingScheduleId}` : '/api/calendar/events';
    await apiFetch(url, { method: 'POST', body: JSON.stringify(payload) });
    closeScheduleModal(); await renderCalendar(currentYear, currentMonth);
    showToast('일정이 저장되었습니다.', 'success');
  } catch (error) { showToast(error.message, 'error'); }
}

// [삭제] 특정 일정 삭제
async function deleteCalendarEvent() {
  if (!editingScheduleId) return;
  try {
    await apiFetch(`/api/calendar/events/${editingScheduleId}`, { method: 'DELETE' });
    closeScheduleModal(); await renderCalendar(currentYear, currentMonth);
    showToast('일정이 삭제되었습니다.', 'success');
  } catch (error) { showToast(error.message, 'error'); }
}

// 모달창 UI 제어
function openScheduleModal(date = new Date().toISOString().slice(0, 10)) {
  editingScheduleId = null;
  $('calendarModalTitle').textContent = '새 일정 등록'; $('cEventSubmitBtn').textContent = '등록';
  $('scheduleStartDate').value = $('scheduleEndDate').value = date;
  $('scheduleTitle').value = ''; $('scheduleType').value = 'PERSONAL';
  if ($('cEventDeleteBtn')) $('cEventDeleteBtn').style.display = 'none';
  toggleModal('modal-calendar-write', true);
}

function closeScheduleModal() { editingScheduleId = null; toggleModal('modal-calendar-write', false); }

function openEditScheduleModal(id) {
  const e = currentEvents.find(item => Number(item.scheduleId) === Number(id));
  if (!e) return;
  editingScheduleId = e.scheduleId;
  $('calendarModalTitle').textContent = '일정 수정'; $('cEventSubmitBtn').textContent = '수정';
  $('scheduleStartDate').value = e.startDate; $('scheduleEndDate').value = e.endDate;
  $('scheduleTitle').value = e.title; $('scheduleType').value = e.scheduleType;
  if ($('cEventDeleteBtn')) $('cEventDeleteBtn').style.display = '';
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
