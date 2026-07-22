// approval.html 전용 로직

let activeApprovalId = null;  // 지금 상세 모달에 열려 있는 결재 문서 id
let activeApprovalTab = 'write'; // 승인/반려 처리 후 어느 탭을 다시 그릴지 기억
let draftSelectedFiles = []; // 기안 폼에서 선택해 둔 File 객체 목록 (등록 시 FormData로 그대로 전송)

function formatFileSize(bytes) {
  return bytes < 1024 * 1024
    ? (bytes / 1024).toFixed(1) + ' KB'
    : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 기안 폼 첨부파일 선택 - File 객체를 배열에 담아만 두고, 실제 업로드는 등록(submit) 시점에 한다
// (자료실 archive.js의 handleArchiveFileSelect와 동일한 패턴)
function handleDraftFileSelect(input) {
  Array.from(input.files || []).forEach(file => draftSelectedFiles.push(file));
  input.value = '';
  renderDraftSelectedFiles();
}

function removeDraftSelectedFile(idx) {
  draftSelectedFiles.splice(idx, 1);
  renderDraftSelectedFiles();
}

function renderDraftSelectedFiles() {
  document.getElementById('draftSelectedFileList').innerHTML = draftSelectedFiles.map((f, idx) => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-tertiary); padding:0.4rem 0.75rem; border-radius:6px; font-size:0.8rem;">
      <span><i class="fa-solid fa-paperclip"></i> ${f.name} <span style="color:var(--text-muted);">(${formatFileSize(f.size)})</span></span>
      <button type="button" class="icon-btn" style="width:22px; height:22px;" onclick="removeDraftSelectedFile(${idx})"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `).join('');
}

function statusBadge(status) {
  if (status === 'APPROVED') return '<span class="badge badge-success">승인 완료</span>';
  if (status === 'REJECTED') return '<span class="badge badge-danger">반려됨</span>';
  if (status === 'WITHDRAWN') return '<span class="badge badge-muted">회수됨</span>';
  return '<span class="badge badge-warning">진행중</span>';
}

function drafterLabel(a) {
  return a.drafterDeptName ? `${a.drafterName} (${a.drafterDeptName})` : a.drafterName;
}

// -----------------------------------------------------------
// 참조(CC) 대상 선택 팝업 - 조직도 스타일 (부서 단위 또는 개별 직원 단위)
// 부서 트리/직원 목록은 GET /approval/ref-departments, /approval/ref-employees로
// 조직도(GET /org)가 쓰는 것과 같은 조회를 재사용해서 받아온다 (하드코딩 폐기).
// -----------------------------------------------------------
let refSelectedDepts = new Map();   // 부서 단위로 참조 지정한 부서: deptId -> deptName
let refSelectedEmployees = new Map(); // 개별로 참조 지정한 직원: employeeId -> employeeName
let refViewDeptId = null;           // 모달 우측 표를 필터링할 기준 부서 (null=전체)
let refDeptListCache = [];          // 부서 트리를 다시 그릴 때 재사용

function resetRefSelection() {
  refSelectedDepts = new Map();
  refSelectedEmployees = new Map();
  refViewDeptId = null;
  updateRefSummary();
}

function updateRefSummary() {
  const summaryEl = document.getElementById('refSelectionSummary');
  if (!summaryEl) return;

  const parts = [];
  refSelectedDepts.forEach(name => parts.push(`${name}(부서)`));
  refSelectedEmployees.forEach(name => parts.push(name));

  summaryEl.innerText = parts.length ? `선택된 참조 대상: ${parts.join(', ')}` : '선택된 참조 대상 없음';
}

// "조직도에서 선택" 버튼을 누르면 실행. 부서 목록을 서버에서 받아와 트리를 그리고 모달을 연다.
function openRefPicker() {
  fetch('/approval/ref-departments')
    .then(res => res.json())
    .then(depts => {
      refDeptListCache = depts;
      renderRefDeptTree();
      renderRefMemberList();
      openModal('modal-ref-picker');
    })
    .catch(() => showToast('부서 목록을 불러오지 못했습니다.', 'danger'));
}

function renderRefDeptTree() {
  let html = `<li><a class="org-node ${refViewDeptId === null ? 'active' : ''}" onclick="filterRefDeptView(null)"><i class="fa-solid fa-building"></i> 전체보기</a></li>`;
  html += refDeptListCache.map(dept => `
    <li style="margin-left: 0.75rem; display:flex; align-items:center; gap:0.4rem;">
      <input type="checkbox" ${refSelectedDepts.has(dept.deptId) ? 'checked' : ''}
             onchange="toggleRefDept(${dept.deptId}, '${dept.deptName}', this.checked)">
      <a class="org-node ${refViewDeptId === dept.deptId ? 'active' : ''}" onclick="filterRefDeptView(${dept.deptId})" style="flex:1;">${dept.deptName}</a>
    </li>
  `).join('');
  document.getElementById('refDeptTree').innerHTML = html;
}

// 모달 좌측의 부서 이름(링크)을 클릭하면 실행. 우측 직원 표를 해당 부서 소속으로만 필터링한다.
// (부서 앞 체크박스와는 별개 - 체크박스는 "부서 전체를 참조로 지정"하는 것이고, 이 클릭은 "표시만" 필터링)
function filterRefDeptView(deptId) {
  refViewDeptId = deptId;
  renderRefDeptTree();
  renderRefMemberList();
}

function toggleRefDept(deptId, deptName, checked) {
  if (checked) refSelectedDepts.set(deptId, deptName);
  else refSelectedDepts.delete(deptId);
}

function toggleRefEmployee(employeeId, employeeName, checked) {
  if (checked) refSelectedEmployees.set(employeeId, employeeName);
  else refSelectedEmployees.delete(employeeId);
}

function renderRefMemberList() {
  const url = refViewDeptId === null ? '/approval/ref-employees' : `/approval/ref-employees?deptId=${refViewDeptId}`;
  fetch(url)
    .then(res => res.json())
    .then(employees => {
      const html = employees.map(e => `
        <tr>
          <td style="text-align:center;">
            <input type="checkbox" ${refSelectedEmployees.has(e.employeeId) ? 'checked' : ''}
                   onchange="toggleRefEmployee(${e.employeeId}, '${e.employeeName}', this.checked)">
          </td>
          <td><strong>${e.employeeName}</strong></td>
          <td>${e.deptName || ''}</td>
          <td><span class="badge badge-primary">${e.positionName || ''}</span></td>
        </tr>
      `).join('');
      document.getElementById('refMemberTableBody').innerHTML = html;
    })
    .catch(() => showToast('직원 목록을 불러오지 못했습니다.', 'danger'));
}

function confirmRefPicker() {
  updateRefSummary();
  closeModal();
}

// 좌측 메뉴의 4개 탭 전환. inbox/outbox/ref는 탭을 열 때마다 서버에서 새로 받아온다
// (mock의 switchApprovalTab과 동일하게 - 다른 사람이 승인/기안한 내용이 바로 반영되도록).
function switchApprovalTab(tab) {
  activeApprovalTab = tab;
  document.querySelectorAll('[id^="appTab-"]').forEach(item => item.classList.remove('active'));
  document.getElementById(`appTab-${tab}`).classList.add('active');

  document.querySelectorAll('.approval-tab-content').forEach(content => content.style.display = 'none');
  document.getElementById(`approval-view-${tab}`).style.display = 'block';

  if (tab === 'inbox') renderInbox(1);
  if (tab === 'outbox') renderOutbox(1);
  if (tab === 'ref') renderReferenceBox(1);
}

// 자료실(archive.html)과 같은 모양(5개 그룹 + ‹ ›)의 페이지 번호를 그린다. 다만 자료실은
// <a href>로 화면 이동을 하지만, 전자결재는 탭 전체가 이미 fetch로 그려지는 구조라
// 페이지 버튼도 이동 없이 renderFnName(페이지번호)를 다시 호출하는 버튼으로 만든다.
function buildApprovalPaginationHtml(pageData, renderFnName) {
  if (pageData.totalPages <= 1) return '';

  let html = '<div style="display:flex; justify-content:center; align-items:center; gap:0.4rem; margin-top:1rem;">';
  if (pageData.groupStart > 1) {
    html += `<button type="button" class="btn btn-sm btn-secondary" style="min-width:2.2rem;" onclick="${renderFnName}(${pageData.groupStart - 1})">‹</button>`;
  }
  for (let p = pageData.groupStart; p <= pageData.groupEnd; p++) {
    const activeClass = p === pageData.currentPage ? 'btn-primary' : 'btn-secondary';
    html += `<button type="button" class="btn btn-sm ${activeClass}" style="min-width:2.2rem;" onclick="${renderFnName}(${p})">${p}</button>`;
  }
  if (pageData.groupEnd < pageData.totalPages) {
    html += `<button type="button" class="btn btn-sm btn-secondary" style="min-width:2.2rem;" onclick="${renderFnName}(${pageData.groupEnd + 1})">›</button>`;
  }
  html += '</div>';
  return html;
}

// "받은 결재함" 탭 - GET /approval/inbox (지금 내 차례인 문서만 서버가 이미 걸러서 내려줌)
function renderInbox(page) {
  fetch(`/approval/inbox?page=${page || 1}`)
    .then(res => res.json())
    .then(pageData => {
      const list = pageData.content;
      const html = list.map(a => `
        <tr class="clickable" onclick="viewApprovalDetail(${a.approvalId})">
          <td>#${a.approvalId}</td>
          <td><span class="badge badge-primary">${a.formTypeName}</span></td>
          <td><strong>${drafterLabel(a)}</strong></td>
          <td>${a.approvalTitle}</td>
          <td style="font-family:'Fira Code'; font-size:0.8rem;">${a.createdAt ? a.createdAt.substring(0, 10) : ''}</td>
          <td><span class="badge badge-warning">${a.currentStep}차 승인대기</span></td>
        </tr>
      `).join('');
      document.getElementById('inboxTableBody').innerHTML = html.length ? html : `
        <tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">수신된 결재 요청 문서가 없습니다.</td></tr>
      `;
      document.getElementById('inboxPagination').innerHTML = buildApprovalPaginationHtml(pageData, 'renderInbox');
    })
    .catch(() => showToast('받은 결재함을 불러오지 못했습니다.', 'danger'));
}

// "보낸 기안함" 탭 - GET /approval/outbox (내가 기안한 문서 전체)
function renderOutbox(page) {
  fetch(`/approval/outbox?page=${page || 1}`)
    .then(res => res.json())
    .then(pageData => {
      const list = pageData.content;
      const html = list.map(a => `
        <tr class="clickable" onclick="viewApprovalDetail(${a.approvalId})">
          <td>#${a.approvalId}</td>
          <td><span class="badge badge-primary">${a.formTypeName}</span></td>
          <td><strong>${a.approvalTitle}</strong></td>
          <td style="font-family:'Fira Code'; font-size:0.8rem;">${a.createdAt ? a.createdAt.substring(0, 10) : ''}</td>
          <td>${statusBadge(a.approvalStatus)}</td>
        </tr>
      `).join('');
      document.getElementById('outboxTableBody').innerHTML = html.length ? html : `
        <tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">보낸 기안 문서가 없습니다.</td></tr>
      `;
      document.getElementById('outboxPagination').innerHTML = buildApprovalPaginationHtml(pageData, 'renderOutbox');
    })
    .catch(() => showToast('보낸 기안함을 불러오지 못했습니다.', 'danger'));
}

// "참조 문서함" 탭 - GET /approval/reference (부서 참조/개인 참조/결재선 포함 중 하나라도 해당)
function renderReferenceBox(page) {
  fetch(`/approval/reference?page=${page || 1}`)
    .then(res => res.json())
    .then(pageData => {
      const list = pageData.content;
      const html = list.map(a => `
        <tr class="clickable" onclick="viewApprovalDetail(${a.approvalId})">
          <td>#${a.approvalId}</td>
          <td><span class="badge badge-primary">${a.formTypeName}</span></td>
          <td>${drafterLabel(a)}</td>
          <td><strong>${a.approvalTitle}</strong></td>
          <td style="font-family:'Fira Code'; font-size:0.8rem;">${a.createdAt ? a.createdAt.substring(0, 10) : ''}</td>
          <td>${statusBadge(a.approvalStatus)}</td>
        </tr>
      `).join('');
      document.getElementById('refTableBody').innerHTML = html.length ? html : `
        <tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">참조 수신된 결재 문서가 없습니다.</td></tr>
      `;
      document.getElementById('refPagination').innerHTML = buildApprovalPaginationHtml(pageData, 'renderReferenceBox');
    })
    .catch(() => showToast('참조 문서함을 불러오지 못했습니다.', 'danger'));
}

// 어느 탭에서든 문서 한 줄을 클릭하면 실행. GET /approval/detail/{id}로 결재선 전체를 받아
// "기안 → 1차 → 2차" 스테퍼를 그린다. 기안 단계는 DB에 없는 단계라 화면단에서 0번째로 합성한다.
function viewApprovalDetail(id) {
  fetch(`/approval/detail/${id}`)
    .then(res => {
      if (res.status === 403) throw new Error('열람 권한이 없는 문서입니다.');
      if (!res.ok) throw new Error('문서를 불러오지 못했습니다.');
      return res.json();
    })
    .then(a => {
      activeApprovalId = id;
      document.getElementById('mAppFormName').innerText = `${a.formTypeName} 상세 보기`;
      document.getElementById('mAppDrafter').innerText = drafterLabel(a) + (a.drafterPositionName ? ` ${a.drafterPositionName}` : '');
      document.getElementById('mAppTitle').innerText = a.approvalTitle;
      document.getElementById('mAppDate').innerText = a.createdAt ? a.createdAt.substring(0, 10) : '';
      document.getElementById('mAppContent').innerText = a.approvalContent;

      // 휴가 기간 - 연차휴가신청서만 값이 있음
      const leaveRow = document.getElementById('mAppLeaveRow');
      if (a.leaveStartDate && a.leaveEndDate) {
        leaveRow.style.display = 'block';
        document.getElementById('mAppLeavePeriod').innerText = `${a.leaveStartDate} ~ ${a.leaveEndDate}`;
      } else {
        leaveRow.style.display = 'none';
      }

      // 금액 - 지출결의서만 값이 있음
      const amountRow = document.getElementById('mAppAmountRow');
      if (a.amount != null) {
        amountRow.style.display = 'block';
        document.getElementById('mAppAmount').innerText = Number(a.amount).toLocaleString() + '원';
      } else {
        amountRow.style.display = 'none';
      }

      // 첨부파일 - 있을 때만 섹션을 보여준다
      const fileSection = document.getElementById('mAppFileSection');
      const files = a.files || [];
      if (files.length) {
        fileSection.style.display = 'block';
        document.getElementById('mAppFileList').innerHTML = files.map(f => `
          <button type="button" class="btn btn-secondary btn-sm" style="margin: 0.25rem 0.5rem 0 0;" onclick="downloadApprovalFile(${f.fileId})">
            <i class="fa-solid fa-download"></i> ${f.fileName} (${formatFileSize(f.fileSize)})
          </button>
        `).join('');
      } else {
        fileSection.style.display = 'none';
      }

      let stepperHtml = `
        <div class="flow-step active"><i class="fa-solid fa-circle-check" style="color:var(--color-success)"></i> 기안: ${drafterLabel(a)}</div>
        <div class="flow-arrow"><i class="fa-solid fa-chevron-right"></i></div>
      `;
      (a.lines || []).forEach((line, index) => {
        let icon = '<i class="fa-solid fa-circle-notch"></i>';
        let stepClass = 'flow-step';
        if (line.lineStatus === 'APPROVED') {
          icon = '<i class="fa-solid fa-circle-check" style="color:var(--color-success)"></i>';
          stepClass += ' active';
        } else if (line.lineStatus === 'REJECTED') {
          icon = '<i class="fa-solid fa-circle-xmark" style="color:var(--color-danger)"></i>';
          stepClass += ' active';
        } else if (a.approvalStatus === 'PROGRESS' && a.currentStep === line.stepNo) {
          icon = '<i class="fa-solid fa-spinner fa-spin" style="color:var(--color-primary)"></i>';
          stepClass += ' active';
        }
        stepperHtml += `<div class="${stepClass}">${icon} ${line.stepNo}차: ${line.approverName} ${line.approverPositionName || ''}</div>`;
        if (index < a.lines.length - 1) {
          stepperHtml += `<div class="flow-arrow"><i class="fa-solid fa-chevron-right"></i></div>`;
        }
      });
      document.getElementById('mAppStepper').innerHTML = stepperHtml;

      // 반려 사유 - REJECTED 문서만. 반려한 단계의 LINE_COMMENT를 찾아서 보여준다.
      const rejectBox = document.getElementById('mAppRejectBox');
      if (a.approvalStatus === 'REJECTED') {
        rejectBox.style.display = 'block';
        const rejectedLine = (a.lines || []).find(line => line.lineStatus === 'REJECTED');
        document.getElementById('mAppRejectReason').innerText = rejectedLine && rejectedLine.lineComment
          ? rejectedLine.lineComment : '기재된 사유 없음';
      } else {
        rejectBox.style.display = 'none';
      }

      // 액션 패널 - 서버가 계산해 내려준 canDecide/canWithdraw만 신뢰한다(버튼 숨김은 보안이
      // 아니라 실제 승인/반려/회수 요청은 서버가 다시 검증하지만, 노출 여부는 이 값으로 충분함)
      const actionBox = document.getElementById('mAppActionBox');
      const actionBtns = document.getElementById('mAppActionButtons');
      const withdrawBtn = document.getElementById('mAppWithdrawBtn');
      const closeBtn = document.getElementById('mAppCloseBtn');
      if (a.canDecide) {
        actionBox.style.display = 'block';
        actionBtns.style.display = 'flex';
        withdrawBtn.style.display = 'none';
        closeBtn.style.display = 'none';
        document.getElementById('appActionComment').value = '';
      } else if (a.canWithdraw) {
        actionBox.style.display = 'none';
        actionBtns.style.display = 'none';
        withdrawBtn.style.display = 'block';
        closeBtn.style.display = 'block';
      } else {
        actionBox.style.display = 'none';
        actionBtns.style.display = 'none';
        withdrawBtn.style.display = 'none';
        closeBtn.style.display = 'block';
      }

      openModal('modal-approval-detail');
    })
    .catch(err => showToast(err.message, 'danger'));
}

// 다운로드 - 자료실과 동일하게 URL로 바로 이동시키면 Content-Disposition 헤더로 브라우저가 알아서 받는다
function downloadApprovalFile(fileId) {
  window.location.href = `/approval/download/${fileId}`;
}

// 상세 모달의 "승인하기"/"반려하기" 버튼에 연결 (approved: true=승인, false=반려).
// 반려는 사유 입력이 필수(서버도 다시 검증하지만, 여기서 먼저 확인해 왕복을 줄인다).
function doApprovalDecision(approved) {
  const comment = document.getElementById('appActionComment').value.trim();
  if (!approved && !comment) {
    showToast('반려 처리 시에는 반드시 반려 사유를 입력하셔야 합니다.', 'danger');
    return;
  }

  const url = `/approval/${approved ? 'approve' : 'reject'}/${activeApprovalId}`;
  const params = new URLSearchParams();
  if (comment) params.append('comment', comment);

  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params })
    .then(res => res.text().then(text => {
      if (!res.ok) throw new Error(text);
      return text;
    }))
    .then(message => {
      showToast(message, approved ? 'success' : 'danger');
      closeModal();
      if (activeApprovalTab === 'inbox') renderInbox();
      if (activeApprovalTab === 'outbox') renderOutbox();
      if (activeApprovalTab === 'ref') renderReferenceBox();
    })
    .catch(err => showToast(err.message, 'danger'));
}

// 상세 모달의 "기안 회수하기" 버튼에 연결. 사유 입력 없이 확인창만 띄운다(반려와 달리
// 회수는 "내가 실수해서 취소"하는 성격이라 사유가 크게 의미 없다는 판단 - 2026-07-21 협의).
function doWithdrawApproval() {
  if (!confirm('정말 이 기안을 회수하시겠습니까?')) return;

  fetch(`/approval/withdraw/${activeApprovalId}`, { method: 'POST' })
    .then(res => res.text().then(text => {
      if (!res.ok) throw new Error(text);
      return text;
    }))
    .then(message => {
      showToast(message, 'success');
      closeModal();
      if (activeApprovalTab === 'outbox') renderOutbox();
    })
    .catch(err => showToast(err.message, 'danger'));
}

// 서식 카드(연차휴가신청서/지출결의서/프로젝트품의서)를 클릭하면 실행.
// 서식명은 문자열이라 onclick에 직접 끼워넣지 않고 카드의 data-form-name 속성(cardEl)에서 읽는다.
// 서식별 결재 단계 수(stepCount)에 맞춰 1차/최종 승인자 select를 다르게 보여준다.
function initApprovalForm(formTypeId, cardEl, stepCount) {
  const formTypeName = cardEl.dataset.formName;
  const container = document.getElementById('approvalFormContainer');
  container.style.display = 'block';

  const isLeaveForm = formTypeName === '연차휴가신청서';
  const leaveDateHtml = isLeaveForm ? `
    <div class="grid-2">
      <div class="form-group">
        <label class="form-label" for="draftLeaveStart">휴가 시작일</label>
        <input type="date" id="draftLeaveStart" class="form-control" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="draftLeaveEnd">휴가 종료일</label>
        <input type="date" id="draftLeaveEnd" class="form-control" required>
      </div>
    </div>
  ` : '';

  const isExpenseForm = formTypeName === '지출결의서';
  const amountHtml = isExpenseForm ? `
    <div class="form-group">
      <label class="form-label" for="draftAmount">금액</label>
      <input type="number" id="draftAmount" class="form-control" required placeholder="예: 120000">
    </div>
  ` : '';

  // 휴가 신청서는 증빙 서류 개념이 없어서 첨부파일 UI 자체를 안 보여준다 (지출결의서/프로젝트품의서만)
  const fileAttachHtml = !isLeaveForm ? `
    <div class="form-group">
      <label class="form-label">첨부파일 (선택 안 해도 됨)</label>
      <div style="border: 2px dashed var(--border-color); border-radius: 8px; padding: 1.25rem; text-align: center; cursor: pointer; color: var(--text-secondary);" onclick="document.getElementById('draftFileInput').click()">
        <i class="fa-solid fa-cloud-arrow-up" style="font-size: 1.3rem; color: var(--color-primary); margin-bottom: 0.4rem;"></i>
        <div style="font-size:0.85rem;">클릭해서 파일 선택 (영수증/증빙 등)</div>
        <input type="file" id="draftFileInput" multiple style="display:none;" onchange="handleDraftFileSelect(this)">
      </div>
      <div id="draftSelectedFileList" style="margin-top: 0.5rem; display:flex; flex-direction:column; gap:0.35rem;"></div>
    </div>
  ` : '';

  const signer1Options = teamLeadCandidates
    .map(c => `<option value="${c.employeeId}">${c.employeeName} 팀장 (${c.deptName || ''})</option>`).join('');

  const signer2FieldHtml = stepCount === 2 ? `
    <div class="form-group">
      <label class="form-label" for="draftSigner2">최종 승인자 (부서장)</label>
      <select id="draftSigner2" class="form-control">
        ${deptHeadCandidates.map(c => `<option value="${c.employeeId}">${c.employeeName} 부서장 (${c.deptName || ''})</option>`).join('')}
      </select>
    </div>
  ` : '';

  resetRefSelection();
  draftSelectedFiles = [];

  container.innerHTML = `
    <h4 style="margin-bottom:1rem; color:var(--color-primary)">${formTypeName} 기안 서식 작성</h4>
    <form onsubmit="submitDraft(event, ${formTypeId}, ${stepCount})">
      <div class="form-group">
        <label class="form-label" for="draftTitle">기안문 제목</label>
        <input type="text" id="draftTitle" class="form-control" required value="[기안] ${formTypeName} 상신 건">
      </div>
      <div class="form-group">
        <label class="form-label" for="draftContent">상세 기안 사유 및 내역</label>
        <textarea id="draftContent" class="form-control" required></textarea>
      </div>

      ${leaveDateHtml}
      ${amountHtml}
      ${fileAttachHtml}

      <div class="grid-2">
        <div class="form-group">
          <label class="form-label" for="draftSigner1">1차 승인자 (팀장)</label>
          <select id="draftSigner1" class="form-control">
            ${signer1Options}
          </select>
        </div>
        ${signer2FieldHtml}
      </div>

      <div class="form-group">
        <label class="form-label">참조 대상 지정</label>
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="openRefPicker()"><i class="fa-solid fa-sitemap"></i> 조직도에서 선택</button>
          <span id="refSelectionSummary" style="font-size:0.85rem; color:var(--text-secondary);">선택된 참조 대상 없음</span>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1.5rem;">
        <button type="button" class="btn btn-secondary" onclick="document.getElementById('approvalFormContainer').style.display='none'">작성 취소</button>
        <button type="submit" class="btn btn-primary">결재 상신</button>
      </div>
    </form>
  `;
}

// 기안 폼의 "결재 상신" 버튼(submit)에 연결. 첨부파일이 있을 수 있어 FormData(multipart)로
// POST /approval/write에 전송한다 (자료실 submitArchivePost와 동일한 방식).
function submitDraft(event, formTypeId, stepCount) {
  event.preventDefault();

  const formData = new FormData();
  formData.append('formTypeId', formTypeId);
  formData.append('approvalTitle', document.getElementById('draftTitle').value.trim());
  formData.append('approvalContent', document.getElementById('draftContent').value.trim());
  formData.append('signer1Id', document.getElementById('draftSigner1').value);

  if (document.getElementById('draftLeaveStart')) {
    formData.append('leaveStartDate', document.getElementById('draftLeaveStart').value);
    formData.append('leaveEndDate', document.getElementById('draftLeaveEnd').value);
  }
  if (document.getElementById('draftAmount')) {
    formData.append('amount', document.getElementById('draftAmount').value);
  }
  if (stepCount === 2) {
    formData.append('signer2Id', document.getElementById('draftSigner2').value);
  }
  refSelectedDepts.forEach((name, deptId) => formData.append('refDeptIds', deptId));
  refSelectedEmployees.forEach((name, employeeId) => formData.append('refEmployeeIds', employeeId));
  draftSelectedFiles.forEach(file => formData.append('files', file));

  fetch('/approval/write', { method: 'POST', body: formData })
    .then(res => res.text().then(text => {
      if (!res.ok) throw new Error(text);
      return text;
    }))
    .then(message => {
      showToast(message, 'success');
      document.getElementById('approvalFormContainer').style.display = 'none';
      document.getElementById('approvalFormContainer').innerHTML = '';
    })
    .catch(err => showToast(err.message, 'danger'));
}
