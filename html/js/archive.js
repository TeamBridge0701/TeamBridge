// ===================================================================
// archive.js - archive.html(자료실) 전용 로직
//
// 자료실 게시글은 "제목 + 본문 글 하나에 첨부파일이 1개 이상 딸린" 구조다.
// 좌측에서 폴더(전사 공용 / 부서 제한)를 고르면 그 폴더의 게시글만 표에 뜨고,
// 표의 한 줄을 클릭하면 상세 모달에서 본문과 첨부파일 목록을 볼 수 있다.
//
// ===================================================================
// 🔧 백엔드 작업 가이드 (순서 5 — docs/기획서.md 8장 5순위: 자료실, 파일 업로드 학습)
//   필요 테이블: REPOSITORY, ARCHIVE, ARCHIVE_FILE (docs/ERD_설계서.md 2-7~2-9)
//   필요 API:   GET /archive/list?repoId=, GET /archive/detail/{id},
//               GET|POST /archive/write(multipart), GET|POST /archive/update/{id},
//               POST /archive/delete/{id}, GET /archive/download/{fileId} (docs/기획서.md 5장)
//
// [1] switchFolder()의 'public'/'dept' 문자열 폴더 구분 → REPOSITORY 테이블의
//     REPO_ID로 교체. ERD 설계서 2-7에서 지적하듯, 지금처럼 "업로더의 현재 부서"로
//     암묵적 필터링하면 직원이 부서 이동 시 과거 글의 접근범위가 같이 바뀌는
//     버그가 생긴다 — REPOSITORY 생성 시점에 DEPT_ID를 고정해야 한다.
//     즉 화면 진입 시 먼저 GET으로 "현재 로그인 사용자가 볼 수 있는 REPOSITORY
//     목록"(전사공용 + 본인 부서 자료실)을 받아와 탭/폴더 목록을 그린다.
//
// [2] renderArchive() → GET /archive/list?repoId= 로 교체. 서버는 요청자가
//     그 REPO_ID에 접근 권한이 있는지(공용이거나 본인 부서인지) 반드시 재검증
//     해야 한다(기획서 4장 "부서 제한 자료실은 해당 부서만").
//
// [3] viewArchiveDetail() → GET /archive/detail/{id}. canDelete 판정(관리자
//     이거나 작성자 본인)은 화면단에서도 버튼 노출용으로 유지하되, 실제
//     삭제 요청은 서버가 WRITER_ID 비교로 다시 검증해야 한다(버튼 숨김은
//     보안이 아니라는 기획서 4장 원칙).
//
// [4] downloadFile() → GET /archive/download/{fileId} 로 실제 파일 스트림
//     다운로드로 교체. 여기서도 서버는 그 파일이 속한 REPOSITORY 접근 권한을
//     한번 더 확인해야 한다("파일 다운로드: 서버단 권한 재확인", 기획서 3.7).
//
// [5] openWriteModal()/handleArchiveFileSelect()/submitArchivePost() →
//     선택된 파일을 FormData(multipart/form-data)에 담아 POST /archive/write 로
//     전송하도록 교체(제목+본문+파일 여러 개를 한 번에). 서버는 파일을 로컬
//     저장소에 저장 후 ARCHIVE 1건 + ARCHIVE_FILE N건을 함께 INSERT한다
//     (한 트랜잭션으로 묶어야 "글은 저장됐는데 파일은 실패"한 상태가 안 생김).
//     newId를 클라이언트에서 계산하던 부분은 삭제 — ARCHIVE_ID는 AUTO_INCREMENT.
//
// [6] deleteArchivePost() → POST /archive/delete/{id}. 게시글 삭제 시
//     ARCHIVE_FILE도 함께 삭제(또는 서버 로컬 파일도 함께 정리)해야 한다.
// ===================================================================

let activeArchivePostId = null;  // 지금 상세 모달에 열려 있는 게시글 id
let selectedArchiveFiles = [];   // 글쓰기 모달에서 지금까지 선택해 둔 첨부파일 목록(아직 저장 전)

// 좌측 폴더 목록("전사 공용 자료실" / "부서 제한 자료실")을 클릭하면 호출된다.
// 선택된 폴더를 state에 기억해두고 표를 그 폴더 기준으로 다시 그린다.
// 🔧 백엔드 5단계 — 'public'/'dept' 문자열 대신 REPOSITORY.REPO_ID로 교체. 화면 진입 시
//    "내가 볼 수 있는 REPOSITORY 목록"을 먼저 서버에서 받아와 탭을 구성한다. (상세: [1])
function switchFolder(folderType) {
  state.activeFolder = folderType;
  document.getElementById('folder-public').classList.remove('active');
  document.getElementById('folder-dept').classList.remove('active');
  document.getElementById(`folder-${folderType}`).classList.add('active');

  document.getElementById('archiveFolderTitle').innerText =
    folderType === 'public' ? '전사 공용 자료실' : `${state.currentUser.dept} 전용 자료실`;

  renderArchive();
}

// 게시글 목록 표(#fileTableBody)를 현재 선택된 폴더(state.activeFolder) 기준으로 그린다.
// 🔧 백엔드 5단계 — GET /archive/list?repoId= 로 교체. 서버가 접근 권한(공용/본인 부서)을
//    재검증해야 한다. (상세: [2])
function renderArchive() {
  const filtered = state.archivePosts.filter(p => p.folder === state.activeFolder);

  const html = filtered.map(post => `
    <tr class="clickable" onclick="viewArchiveDetail(${post.id})">
      <td><i class="fa-solid fa-file-lines" style="color:var(--color-primary); margin-right:0.5rem;"></i> <strong>${post.title}</strong></td>
      <td style="text-align:center;">${post.files.length}개</td>
      <td>${post.uploader}</td>
      <td style="font-family:'Fira Code'; font-size:0.8rem;">${post.date}</td>
    </tr>
  `).join('');

  document.getElementById('fileTableBody').innerHTML = html.length ? html : `
    <tr>
      <td colspan="4" style="text-align:center; color:var(--text-muted); padding:2rem;">등록된 자료가 없습니다.</td>
    </tr>
  `;
}

// 목록에서 게시글 한 줄을 클릭하면 호출. 상세 모달에 제목/본문/첨부파일
// 목록을 채운다. 삭제 버튼은 "관리자이거나 내가 올린 글"일 때만 보여준다.
// 🔧 백엔드 5단계 — GET /archive/detail/{id} 로 교체. 삭제 요청은 서버가 WRITER_ID로
//    다시 검증(버튼 숨김은 보안이 아님). (상세: [3])
function viewArchiveDetail(id) {
  const post = state.archivePosts.find(p => p.id === id);
  if (!post) return;

  activeArchivePostId = id;
  const user = state.currentUser;
  const canDelete = user.role === 'admin' || post.uploader === user.name;

  document.getElementById('mArchiveTitle').innerText = post.title;
  document.getElementById('mArchiveWriter').innerText = post.uploader;
  document.getElementById('mArchiveDate').innerText = post.date;
  document.getElementById('mArchiveContent').innerText = post.content;

  document.getElementById('mArchiveFileList').innerHTML = post.files.map(f => `
    <button type="button" class="btn btn-secondary btn-sm" style="margin: 0.25rem 0.5rem 0 0;" onclick="downloadFile('${f.name}')">
      <i class="fa-solid fa-download"></i> ${f.name} (${f.size})
    </button>
  `).join('');

  document.getElementById('mArchiveDeleteBtn').style.display = canDelete ? 'inline-flex' : 'none';

  openModal('modal-archive-detail');
}

// 첨부파일 버튼을 클릭하면 호출. 실제 다운로드는 백엔드가 있어야
// 가능하므로, 지금은 토스트 알림만 보여주는 가짜(mock) 동작이다.
// 🔧 백엔드 5단계 — GET /archive/download/{fileId} 로 교체. 서버가 REPOSITORY 접근 권한을
//    한 번 더 확인한 뒤 파일 스트림을 내려준다. (상세: [4])
function downloadFile(name) {
  showToast(`[${name}] 파일 다운로드 스트림 요청을 처리 중입니다...`, 'success');
}

// 상세 모달의 "삭제" 버튼에 연결. 권한을 다시 한번 검사하고,
// 확인창을 거쳐 게시글(및 첨부파일 정보)을 통째로 지운다.
// 🔧 백엔드 5단계 — POST /archive/delete/{id} 로 교체. ARCHIVE_FILE·서버 로컬 파일도 함께 정리. (상세: [6])
function deleteArchivePost(id) {
  const post = state.archivePosts.find(p => p.id === id);
  if (!post) return;

  const user = state.currentUser;
  const canDelete = user.role === 'admin' || post.uploader === user.name;
  if (!canDelete) {
    showToast('삭제 권한이 없습니다.', 'danger');
    return;
  }

  if (!confirm(`[${post.title}] 게시글을 삭제하시겠습니까? 첨부파일 ${post.files.length}개도 함께 삭제됩니다.`)) return;

  state.archivePosts = state.archivePosts.filter(p => p.id !== id);
  saveState();
  closeModal();
  renderArchive();
  showToast('게시글이 삭제되었습니다.', 'danger');
}

// "글쓰기" 버튼을 누르면 실행. 새 글 작성을 위해 입력칸과 선택된
// 첨부파일 목록을 모두 비운 뒤 작성 모달을 연다.
// 🔧 백엔드 5단계 — 폼 여는 로직 자체는 그대로 유지(서버 호출 없음). (상세: [5])
function openWriteModal() {
  document.getElementById('aWriteTitle').value = '';
  document.getElementById('aWriteContent').value = '';
  selectedArchiveFiles = [];
  renderSelectedArchiveFiles();
  openModal('modal-archive-write');
}

// 파일 선택창(<input type="file" multiple>)에서 파일을 고르면 실행.
// 실제로 업로드하는 건 아니고, 파일명/용량만 selectedArchiveFiles
// 배열에 기억해 뒀다가 "등록" 버튼을 눌렀을 때 게시글에 함께 저장한다.
// 🔧 백엔드 5단계 — 선택 목록을 메모리에 쌓아두는 로직은 유지. 실제 전송은 submitArchivePost()에서. (상세: [5])
function handleArchiveFileSelect(input) {
  Array.from(input.files || []).forEach(file => {
    const sizeStr = file.size < 1024 * 1024
      ? (file.size / 1024).toFixed(1) + ' KB'
      : (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    selectedArchiveFiles.push({ name: file.name, size: sizeStr });
  });
  input.value = '';
  renderSelectedArchiveFiles();
}

// 작성 모달에서 선택된 첨부파일 옆의 x 버튼을 누르면, 아직 등록 전인
// 목록에서만 빼낸다(idx는 selectedArchiveFiles 배열 안의 위치).
function removeSelectedArchiveFile(idx) {
  selectedArchiveFiles.splice(idx, 1);
  renderSelectedArchiveFiles();
}

// 작성 모달 안의 "선택된 첨부파일" 미리보기 목록을 다시 그린다.
function renderSelectedArchiveFiles() {
  document.getElementById('aSelectedFileList').innerHTML = selectedArchiveFiles.map((f, idx) => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-tertiary); padding:0.4rem 0.75rem; border-radius:6px; font-size:0.8rem;">
      <span><i class="fa-solid fa-paperclip"></i> ${f.name} <span style="color:var(--text-muted);">(${f.size})</span></span>
      <button type="button" class="icon-btn" style="width:22px; height:22px;" onclick="removeSelectedArchiveFile(${idx})"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `).join('');
}

// 작성 모달의 폼 submit("등록" 버튼)에 연결. 첨부파일이 1개 이상
// 선택되어 있어야 하며, 현재 보고 있는 폴더(state.activeFolder)에
// 새 게시글로 등록된다.
// 🔧 백엔드 5단계 — FormData(multipart)로 POST /archive/write 교체. 파일+게시글 INSERT를
//    하나의 트랜잭션으로 묶는다. newId 클라이언트 계산은 삭제(AUTO_INCREMENT). (상세: [5])
function submitArchivePost(event) {
  event.preventDefault();
  const title = document.getElementById('aWriteTitle').value.trim();
  const content = document.getElementById('aWriteContent').value.trim();

  if (!selectedArchiveFiles.length) {
    showToast('첨부파일을 1개 이상 선택해주세요.', 'danger');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const newId = state.archivePosts.length ? Math.max(...state.archivePosts.map(p => p.id)) + 1 : 1;

  state.archivePosts.push({
    id: newId,
    title,
    content,
    uploader: state.currentUser.name,
    date: today,
    folder: state.activeFolder,
    files: [...selectedArchiveFiles]
  });

  saveState();
  closeModal();
  renderArchive();
  showToast('새 자료 게시글이 성공적으로 등록되었습니다.', 'success');
}

// 초기화
window.addEventListener('DOMContentLoaded', () => {
  if (!initPage('archive')) return;
  renderArchive();
});
