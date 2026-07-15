// ===================================================================
// notice.js - notice.html(공지사항 목록) 전용 로직
//
// 목록/검색/페이지 이동은 GET /notice/list 재요청(SSR)으로 처리하므로
// 여기 없다. 상세/작성/수정 모달만 fetch로 처리하고, 저장 후에는
// 목록이 SSR이라 페이지를 새로고침해야 바뀐 내용이 반영된다.
// ===================================================================

let activeNoticeId = null;   // 지금 상세 모달에 열려 있는 공지 id (수정 모달을 열 때 필요)
let editingNoticeId = null;  // 작성/수정 모달이 "수정 모드"일 때의 대상 id (null이면 신규 등록)

// 목록에서 공지 한 줄을 클릭하면 호출된다. GET /notice/detail/{id}로
// 조회수 +1이 반영된 최신 데이터를 받아와 모달에 채워 넣는다.
function viewNotice(id) {
  fetch(`/notice/detail/${id}`)
    .then(res => {
      if (!res.ok) throw new Error('공지를 불러오지 못했습니다.');
      return res.json();
    })
    .then(notice => {
      activeNoticeId = id;
      document.getElementById('mNoticeTitle').innerText = notice.noticeTitle;
      document.getElementById('mNoticeWriter').innerText = notice.writerDeptName
        ? `${notice.writerName} (${notice.writerDeptName})`
        : notice.writerName;
      document.getElementById('mNoticeDate').innerText = notice.createdAt ? notice.createdAt.substring(0, 10) : '';
      document.getElementById('mNoticeContent').innerText = notice.noticeContent;

      // 수정/삭제는 작성(canManageNotice)과 기준이 다르다: 관리자는 전체,
      // 팀장/부서장은 본인이 쓴 글만 (실제 차단은 서버가 다시 검증 - 이건 버튼 노출용 UI 판단)
      const canModifyThis = isAdmin || (canManageNotice && currentEmployeeId === notice.writerId);
      document.getElementById('mNoticeEditBtn').style.display = canModifyThis ? 'inline-flex' : 'none';
      document.getElementById('mNoticeDeleteBtn').style.display = canModifyThis ? 'inline-flex' : 'none';

      openModal('modal-notice-detail');
    })
    .catch(() => showToast('공지를 불러오지 못했습니다.', 'danger'));
}

// "공지 작성" 버튼(권한 있는 사람만 보임)을 누르면 실행. 입력칸을 비워서
// 신규 등록 모드로 작성 모달을 연다. (editingNoticeId를 null로 두는 게 핵심)
function openCreateNoticeModal() {
  editingNoticeId = null;
  document.getElementById('noticeWriteModalTitle').innerText = '공지사항 신규 등록';
  document.getElementById('nWriteSubmitBtn').innerText = '등록하기';
  document.getElementById('nWriteTitle').value = '';
  document.getElementById('nWriteContent').value = '';
  document.getElementById('nWritePin').checked = false;
  openModal('modal-notice-write');
}

// 상세 모달의 "수정" 버튼을 누르면 실행. GET /notice/update/{id}(권한 재검증 포함)로
// 기존 값을 받아와 입력칸에 채우고 editingNoticeId를 지정해 "수정 모드"로 연다.
function openEditNoticeModal() {
  fetch(`/notice/update/${activeNoticeId}`)
    .then(res => {
      if (!res.ok) throw new Error('수정 권한이 없거나 공지를 찾을 수 없습니다.');
      return res.json();
    })
    .then(notice => {
      editingNoticeId = activeNoticeId;
      document.getElementById('noticeWriteModalTitle').innerText = '공지사항 수정';
      document.getElementById('nWriteSubmitBtn').innerText = '수정하기';
      document.getElementById('nWriteTitle').value = notice.noticeTitle;
      document.getElementById('nWriteContent').value = notice.noticeContent;
      document.getElementById('nWritePin').checked = notice.pinned;
      openModal('modal-notice-write');
    })
    .catch(err => showToast(err.message, 'danger'));
}

// 상세 모달의 "삭제" 버튼을 누르면 실행. confirm()으로 한 번 더 확인한 뒤
// 삭제 처리하고, 목록이 SSR이라 새로고침해서 반영한다.
function deleteNotice() {
  if (!confirm('이 공지를 삭제하시겠습니까?')) return;

  fetch(`/notice/delete/${activeNoticeId}`, { method: 'POST' })
    .then(res => res.text().then(text => {
      if (!res.ok) throw new Error(text);
      return text;
    }))
    .then(message => {
      showToast(message, 'danger');
      closeModal();
      setTimeout(() => window.location.reload(), 600);
    })
    .catch(err => showToast(err.message, 'danger'));
}

// 작성/수정 모달 폼 submit에 연결. editingNoticeId 유무로 등록/수정을 분기한다.
// 목록이 SSR이라 저장 후 새로고침해야 방금 등록/수정한 내용이 보이므로,
// 토스트를 잠깐 보여준 뒤 페이지를 새로고침한다.
function submitNotice(event) {
  event.preventDefault();
  const noticeTitle = document.getElementById('nWriteTitle').value.trim();
  const noticeContent = document.getElementById('nWriteContent').value.trim();
  const isPinned = document.getElementById('nWritePin').checked;

  const body = new URLSearchParams({ noticeTitle, noticeContent, isPinned: isPinned ? 'true' : 'false' });
  const url = editingNoticeId ? `/notice/update/${editingNoticeId}` : '/notice/write';

  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    .then(res => res.text().then(text => {
      if (!res.ok) throw new Error(text);
      return text;
    }))
    .then(message => {
      showToast(message, 'success');
      closeModal();
      setTimeout(() => window.location.reload(), 600);
    })
    .catch(err => showToast(err.message, 'danger'));
}
