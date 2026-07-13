// ===================================================================
// notice.js - notice.html(공지사항 목록) 전용 로직
//
// 목록 렌더링(renderNotices) → 상세보기(viewNotice) → 작성/수정 모달 열기
// (openCreateNoticeModal/openEditNoticeModal) → 저장(submitNotice) →
// 삭제(deleteNotice) 순서로 읽으면 전체 흐름을 이해하기 쉽다.
//
// ===================================================================
// 🔧 백엔드 작업 가이드 (순서 3 — docs/기획서.md 8장 3순위: 공지 + 관리자, CRUD 기본기)
//   필요 테이블: NOTICE (docs/ERD_설계서.md 2-5)
//   필요 API:   GET /notice/list, GET /notice/detail/{id}, GET|POST /notice/write,
//               GET|POST /notice/update/{id}, POST /notice/delete/{id} (docs/기획서.md 5장)
//   ※ 이 화면은 CRUD 기본기라 다른 게시판형 화면(archive.js)의 참고 모델이 된다.
//
// [1] renderNotices() → 검색어 필터링(title/content.includes)을 클라이언트에서
//     하지 말고 GET /notice/list?keyword=&page= 로 서버에 위임(제목 검색 + 페이징,
//     기획서 3.5). 관리자 작성 버튼 노출 여부(state.currentUser.role)는 그대로
//     화면단 판단으로 둬도 되지만, 실제 작성/수정/삭제 요청은 서버에서도
//     반드시 다시 권한 검사해야 한다(기획서 4장 ⚠️ 참고).
//
// [2] viewNotice() → GET /notice/detail/{id} 로 교체. "조회수 증가"는
//     지금처럼 클라이언트가 notice.views++ 하는 게 아니라 서버가
//     UPDATE NOTICE SET VIEW_COUNT = VIEW_COUNT + 1 로 원자적으로 처리해야
//     동시 조회 시에도 정확하다.
//
// [3] openCreateNoticeModal()/openEditNoticeModal() → 폼 자체는 유지, 다만
//     수정 모드일 때 초기값은 GET /notice/update/{id}(수정 폼) 응답으로 채운다.
//
// [4] submitNotice() → editingNoticeId 유무로 분기하는 구조는 그대로 두되,
//     실제 저장은 POST /notice/write(신규) 또는 POST /notice/update/{id}(수정)로 교체.
//     newId를 `Math.max(...)+1`로 클라이언트가 만드는 부분은 삭제 —
//     NOTICE_ID는 AUTO_INCREMENT라 서버가 생성한다.
//
// [5] deleteNotice() → POST /notice/delete/{id}. confirm() 확인창은 유지 가능.
// ===================================================================

let noticeSearchQuery = '';   // 검색창에 입력한 검색어 (실시간 필터링용)
let activeNoticeId = null;    // 지금 상세보기 모달에 열려 있는 공지 id
let editingNoticeId = null;   // 수정 모달을 "수정 모드"로 열었을 때의 대상 공지 id (null이면 신규 등록 모드)

// 공지사항 표(#noticeTableBody)를 검색어/고정(pinned) 여부를 반영해 다시 그린다.
// 검색이나 등록/수정/삭제 등 데이터가 바뀔 때마다 이 함수를 다시 호출한다.
// 🔧 백엔드 3단계 — GET /notice/list?keyword=&page= 로 교체. 검색·페이징을 서버에 위임. (상세: [1])
function renderNotices() {
  const filtered = state.notices.filter(n => {
    return n.title.toLowerCase().includes(noticeSearchQuery.toLowerCase()) || 
           n.content.toLowerCase().includes(noticeSearchQuery.toLowerCase());
  });

  // 고정(pinned) 공지를 항상 맨 위로, 그 다음은 최신순(id가 클수록 최신)으로 정렬
  const sorted = [...filtered].sort((a,b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.id - a.id;
  });

  // 관리자에게만 작성 버튼 노출
  const btnCreate = document.getElementById('btnCreateNotice');
  if (btnCreate && state.currentUser) {
    btnCreate.style.display = (state.currentUser.role === 'admin') ? 'inline-flex' : 'none';
  }

  const html = sorted.map((n, idx) => `
    <tr class="clickable" onclick="viewNotice(${n.id})">
      <td>${n.pinned ? '<i class="fa-solid fa-thumbtack" style="color:var(--color-danger)"></i> PIN' : n.id}</td>
      <td>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          ${n.pinned ? '<span class="badge badge-danger">중요</span>' : ''}
          <strong>${n.title}</strong>
        </div>
      </td>
      <td>${n.writer}</td>
      <td style="font-family:'Fira Code'; font-size:0.85rem;">${n.date}</td>
      <td style="font-family:'Fira Code'; text-align:center;">${n.views}</td>
    </tr>
  `).join('');
  document.getElementById('noticeTableBody').innerHTML = html;
}

// 검색창(id="noticeSearch")의 keyup 이벤트에 연결되어 있다. 입력할 때마다
// 바로바로 목록을 다시 그려서 실시간 검색처럼 보이게 한다.
function searchNotices(val) {
  noticeSearchQuery = val;
  renderNotices();
}

// 목록에서 공지 한 줄을 클릭하면 호출된다. 상세 모달(#modal-notice-detail)에
// 내용을 채우고 조회수를 1 올린 뒤 모달을 연다.
// 🔧 백엔드 3단계 — GET /notice/detail/{id} 로 교체. 조회수 +1은 서버가 원자적 UPDATE로 처리. (상세: [2])
function viewNotice(id) {
  const notice = state.notices.find(n => n.id === id);
  if (!notice) return;

  activeNoticeId = id;
  notice.views++;
  saveState();

  document.getElementById('mNoticeTitle').innerText = notice.title;
  document.getElementById('mNoticeWriter').innerText = notice.writer;
  document.getElementById('mNoticeDate').innerText = notice.date;
  document.getElementById('mNoticeContent').innerText = notice.content;

  const isAdmin = state.currentUser && state.currentUser.role === 'admin';
  document.getElementById('mNoticeEditBtn').style.display = isAdmin ? 'inline-flex' : 'none';
  document.getElementById('mNoticeDeleteBtn').style.display = isAdmin ? 'inline-flex' : 'none';

  openModal('modal-notice-detail');
  renderNotices();
}

// "공지 작성" 버튼(관리자만 보임)을 누르면 실행. 입력칸을 비워서
// 신규 등록 모드로 작성 모달을 연다. (editingNoticeId를 null로 두는 게 핵심)
// 🔧 백엔드 3단계 — 폼 여는 로직 자체는 그대로 유지(서버 호출 없음). (상세: [3])
function openCreateNoticeModal() {
  editingNoticeId = null;
  document.getElementById('noticeWriteModalTitle').innerText = '공지사항 신규 등록';
  document.getElementById('nWriteSubmitBtn').innerText = '등록하기';
  document.getElementById('nWriteTitle').value = '';
  document.getElementById('nWriteContent').value = '';
  document.getElementById('nWritePin').checked = false;
  openModal('modal-notice-write');
}

// 상세보기 모달의 "수정" 버튼(관리자만 보임)을 누르면 실행. 기존 값을
// 입력칸에 채워 넣고 editingNoticeId를 지정해 "수정 모드"로 작성 모달을 연다.
// 🔧 백엔드 3단계 — 초기값을 GET /notice/update/{id}(수정 폼) 응답으로 채운다. (상세: [3])
function openEditNoticeModal() {
  const notice = state.notices.find(n => n.id === activeNoticeId);
  if (!notice) return;

  editingNoticeId = notice.id;
  document.getElementById('noticeWriteModalTitle').innerText = '공지사항 수정';
  document.getElementById('nWriteSubmitBtn').innerText = '수정하기';
  document.getElementById('nWriteTitle').value = notice.title;
  document.getElementById('nWriteContent').value = notice.content;
  document.getElementById('nWritePin').checked = notice.pinned;
  openModal('modal-notice-write');
}

// 상세보기 모달의 "삭제" 버튼(관리자만 보임)을 누르면 실행.
// 브라우저 기본 확인창(confirm)으로 한 번 더 확인한 뒤 삭제한다.
// 🔧 백엔드 3단계 — POST /notice/delete/{id} 로 교체. confirm() 확인창은 유지 가능. (상세: [5])
function deleteNotice() {
  const notice = state.notices.find(n => n.id === activeNoticeId);
  if (!notice) return;
  if (!confirm(`[${notice.title}] 공지를 삭제하시겠습니까?`)) return;

  state.notices = state.notices.filter(n => n.id !== activeNoticeId);
  saveState();
  closeModal();
  renderNotices();
  showToast('공지사항이 삭제되었습니다.', 'danger');
}

// 작성/수정 모달의 폼 submit(등록하기·수정하기 버튼)에 연결되어 있다.
// editingNoticeId가 있으면 "수정", 없으면 "신규 등록"으로 분기해서 처리한다.
// 🔧 백엔드 3단계 — POST /notice/write(신규) 또는 /notice/update/{id}(수정)로 교체.
//    newId를 클라이언트에서 계산하는 부분(Math.max...)은 삭제(AUTO_INCREMENT). (상세: [4])
function submitNotice(event) {
  event.preventDefault(); // 폼 기본 제출(새로고침) 막기
  const title = document.getElementById('nWriteTitle').value.trim();
  const content = document.getElementById('nWriteContent').value.trim();
  const pinned = document.getElementById('nWritePin').checked;

  if (editingNoticeId) {
    const notice = state.notices.find(n => n.id === editingNoticeId);
    if (notice) {
      notice.title = title;
      notice.content = content;
      notice.pinned = pinned;
    }
    saveState();
    closeModal();
    renderNotices();
    showToast('공지사항이 성공적으로 수정되었습니다.', 'success');
    editingNoticeId = null;
    return;
  }

  // 신규 등록: 기존 id 중 가장 큰 값 + 1을 새 id로 사용 (DB의 auto-increment 흉내)
  const newId = state.notices.length ? Math.max(...state.notices.map(n=>n.id)) + 1 : 1;
  const today = new Date().toISOString().split('T')[0];

  state.notices.push({
    id: newId,
    title,
    content,
    writer: state.currentUser.name,
    date: today,
    views: 0,
    pinned
  });

  saveState();
  closeModal();
  renderNotices();
  showToast('신규 공지사항이 성공적으로 등록 배포되었습니다.', 'success');
}

// 초기화
window.addEventListener('DOMContentLoaded', () => {
  if (!initPage('notice')) return;
  renderNotices();
});
