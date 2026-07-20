// archive.html 전용 로직
// 목록/폴더 이동은 GET /archive/list 재요청(SSR)이라 여기 없다. 상세/작성/수정/삭제만
// fetch로 처리하고, 저장 후에는 목록이 SSR이라 페이지를 새로고침해야 반영된다. (notice.js와 동일 구조)

let activeArchiveId = null;   // 지금 상세 모달에 열려 있는 게시글 id (수정 모달을 열 때 필요)
let editingArchiveId = null;  // 작성/수정 모달이 "수정 모드"일 때의 대상 id (null이면 신규 등록)
let selectedArchiveFiles = []; // 작성 모달에서 지금까지 선택해 둔 File 객체 목록(등록 전, 수정 모드에선 사용 안 함)

function formatFileSize(bytes) {
  return bytes < 1024 * 1024
    ? (bytes / 1024).toFixed(1) + ' KB'
    : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 목록에서 게시글 한 줄을 클릭하면 호출. GET /archive/detail/{id}로 본문+첨부파일을 받아 채운다.
function viewArchiveDetail(archiveId) {
  fetch(`/archive/detail/${archiveId}`)
    .then(res => {
      if (!res.ok) throw new Error('자료를 불러오지 못했습니다.');
      return res.json();
    })
    .then(archive => {
      activeArchiveId = archiveId;
      document.getElementById('mArchiveTitle').innerText = archive.archiveTitle;
      document.getElementById('mArchiveWriter').innerText = archive.writerDeptName
        ? `${archive.writerName} (${archive.writerDeptName})`
        : archive.writerName;
      document.getElementById('mArchiveDate').innerText = archive.createdAt ? archive.createdAt.substring(0, 10) : '';
      document.getElementById('mArchiveContent').innerText = archive.archiveContent;

      const files = archive.files || [];
      document.getElementById('mArchiveFileList').innerHTML = files.length
        ? files.map(f => `
            <button type="button" class="btn btn-secondary btn-sm" style="margin: 0.25rem 0.5rem 0 0;" onclick="downloadFile(${f.fileId})">
              <i class="fa-solid fa-download"></i> ${f.fileName} (${formatFileSize(f.fileSize)})
            </button>
          `).join('')
        : '<span style="color:var(--text-muted); font-size:0.85rem;">첨부파일이 없습니다.</span>';

      // 수정/삭제는 "관리자이거나 작성자 본인"일 때만 노출 (실제 처리는 서버가 다시 검증)
      const canModifyThis = isAdmin || currentEmployeeId === archive.writerId;
      document.getElementById('mArchiveEditBtn').style.display = canModifyThis ? 'inline-flex' : 'none';
      document.getElementById('mArchiveDeleteBtn').style.display = canModifyThis ? 'inline-flex' : 'none';

      openModal('modal-archive-detail');
    })
    .catch(err => showToast(err.message, 'danger'));
}

// "글쓰기" 버튼을 누르면 실행. 신규 등록 모드로 작성 모달을 연다.
function openWriteModal() {
  editingArchiveId = null;
  document.getElementById('archiveWriteModalTitle').innerText = '자료 게시글 등록';
  document.getElementById('aWriteSubmitBtn').innerText = '등록';
  document.getElementById('aWriteTitle').value = '';
  document.getElementById('aWriteContent').value = '';
  document.getElementById('aFileUploadSection').style.display = '';
  selectedArchiveFiles = [];
  renderSelectedArchiveFiles();
  openModal('modal-archive-write');
}

// 상세 모달의 "수정" 버튼을 누르면 실행. GET /archive/update/{id}(권한 재검증 포함)로
// 기존 값을 받아와 채우고 수정 모드로 연다. 첨부파일 교체는 지원하지 않아 파일 영역은 숨긴다.
function openEditArchiveModal() {
  fetch(`/archive/update/${activeArchiveId}`)
    .then(res => {
      if (!res.ok) throw new Error('수정 권한이 없거나 자료를 찾을 수 없습니다.');
      return res.json();
    })
    .then(archive => {
      editingArchiveId = activeArchiveId;
      document.getElementById('archiveWriteModalTitle').innerText = '자료 게시글 수정';
      document.getElementById('aWriteSubmitBtn').innerText = '수정하기';
      document.getElementById('aWriteTitle').value = archive.archiveTitle;
      document.getElementById('aWriteContent').value = archive.archiveContent;
      document.getElementById('aFileUploadSection').style.display = 'none';
      openModal('modal-archive-write');
    })
    .catch(err => showToast(err.message, 'danger'));
}

// 상세 모달의 "삭제" 버튼을 누르면 실행. confirm()으로 한 번 더 확인한 뒤 삭제하고 새로고침한다.
function deleteArchive() {
  if (!confirm('이 자료를 삭제하시겠습니까? 첨부파일도 함께 삭제됩니다.')) return;

  fetch(`/archive/delete/${activeArchiveId}`, { method: 'POST' })
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

// 파일 선택창에서 파일을 고르면 실행. File 객체 자체를 배열에 담아만 둔다
// (이름/용량 표시 + 등록 시점에 FormData로 그대로 재사용).
function handleArchiveFileSelect(input) {
  Array.from(input.files || []).forEach(file => selectedArchiveFiles.push(file));
  input.value = '';
  renderSelectedArchiveFiles();
}

function removeSelectedArchiveFile(idx) {
  selectedArchiveFiles.splice(idx, 1);
  renderSelectedArchiveFiles();
}

function renderSelectedArchiveFiles() {
  document.getElementById('aSelectedFileList').innerHTML = selectedArchiveFiles.map((f, idx) => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-tertiary); padding:0.4rem 0.75rem; border-radius:6px; font-size:0.8rem;">
      <span><i class="fa-solid fa-paperclip"></i> ${f.name} <span style="color:var(--text-muted);">(${formatFileSize(f.size)})</span></span>
      <button type="button" class="icon-btn" style="width:22px; height:22px;" onclick="removeSelectedArchiveFile(${idx})"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `).join('');
}

// 작성/수정 모달 폼 submit에 연결. editingArchiveId 유무로 등록/수정을 분기한다.
// 등록은 파일이 있을 수 있어 FormData(multipart), 수정은 제목/본문만 바꾸므로 폼 인코딩으로 충분하다.
function submitArchivePost(event) {
  event.preventDefault();
  const archiveTitle = document.getElementById('aWriteTitle').value.trim();
  const archiveContent = document.getElementById('aWriteContent').value.trim();

  const request = editingArchiveId
    ? fetch(`/archive/update/${editingArchiveId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ archiveTitle, archiveContent })
      })
    : (() => {
        const formData = new FormData();
        formData.append('repoId', currentRepoId);
        formData.append('archiveTitle', archiveTitle);
        formData.append('archiveContent', archiveContent);
        selectedArchiveFiles.forEach(file => formData.append('files', file));
        return fetch('/archive/write', { method: 'POST', body: formData });
      })();

  request
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

// 다운로드 - GET /archive/download/{fileId}로 직접 이동시키면 브라우저가
// Content-Disposition: attachment 헤더를 보고 알아서 다운로드 창을 띄운다 (fetch 불필요)
function downloadFile(fileId) {
  window.location.href = `/archive/download/${fileId}`;
}
