// ===================================================================
// dashboard.js - main.html(대시보드) 전용 로직
// ===================================================================

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
