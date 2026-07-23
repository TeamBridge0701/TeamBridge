// ===================================================================
// dashboard.js - main.html(대시보드) 전용 로직
// ===================================================================

// 우측 상단 실시간 시계 - 서버 통신 없이 브라우저 자체 시계(new Date())만 쓰고,
// 1초마다 화면 텍스트만 갱신한다(서버 부담 0). main.html 전용이라 여기 둠(2026-07-22)
function updateDashboardClock() {
  const dateEl = document.getElementById('dashClockDate');
  const timeEl = document.getElementById('dashClockTime');
  if (!dateEl || !timeEl) return; // 이 위젯이 없는 페이지에서도 안전하게(다른 화면과 공유 안 하지만 방어적으로)

  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const now = new Date();
  const pad = n => String(n).padStart(2, '0'); // 한 자리 숫자 앞에 0 붙이기(9 -> 09)

  dateEl.textContent = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
  timeEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

document.addEventListener('DOMContentLoaded', () => {
  updateDashboardClock(); // 1초 기다리지 않고 페이지 열리자마자 바로 표시
  setInterval(updateDashboardClock, 1000); // 이후 1초마다 갱신
});

// 최신 공지 3건 중 하나를 클릭하면 호출됨. GET /notice/detail/{id}는
// notice.html의 상세 모달과 같은 API(조회수 +1 포함)를 그대로 재사용한다.
// 다만 이 페이지의 모달(#modal-notice-detail)에는 수정/삭제 버튼이 없어서
// notice.js의 viewNotice()와 달리 그 부분은 뺀 간단한 버전으로 둔다.
function viewNotice(id) {
  fetch(`/notice/detail/${id}`)
    .then(res => {
      if (!res.ok) throw new Error('공지를 불러오지 못했습니다.');
      return res.json();
    })
    .then(notice => {
      document.getElementById('mNoticeTitle').innerText = notice.noticeTitle;
      document.getElementById('mNoticeWriter').innerText = notice.writerDeptName
        ? `${notice.writerName} (${notice.writerDeptName})`
        : notice.writerName;
      document.getElementById('mNoticeDate').innerText = notice.createdAt ? notice.createdAt.substring(0, 10) : '';
      document.getElementById('mNoticeContent').innerText = notice.noticeContent;
      openModal('modal-notice-detail');
    })
    .catch(() => showToast('공지를 불러오지 못했습니다.', 'danger'));
}
