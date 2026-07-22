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

// -----------------------------------------------------------
// 결재선 규칙(2026-07-22 확정) - 서식 + "기안자 자신의 직급"에 따라 몇 단계인지,
// 각 단계가 어느 후보 목록(팀장/부서장/재무관리팀)에서 고르는지가 달라진다.
// ApprovalService.writeApproval()의 분기와 반드시 같은 기준이어야 한다(서버가 다시
// 검증하지만, 화면에 몇 개의 승인자 필드를 그릴지는 이 표 하나로 정해야 안 헷갈림).
// 반환값: [{ field: 'signer1', label, candidates }, (2단계면) { field: 'signer2', ... }]
// -----------------------------------------------------------
function getApprovalSteps(formTypeName, drafterPositionRank) {
  const RANK_DEPT_HEAD = 1;
  const RANK_TEAM_LEAD = 2;
  const drafterIsDeptHead = drafterPositionRank === RANK_DEPT_HEAD;
  const drafterIsTeamLead = drafterPositionRank === RANK_TEAM_LEAD;

  if (formTypeName === '연차휴가신청서') {
    // 부서장 본인이 기안하면 승인자 없이 참조자만 지정하고 바로 승인 완료 처리(2026-07-22
    // 팀 협의 확정) - 승인자 필드 자체를 안 보여준다(빈 배열).
    if (drafterIsDeptHead) {
      return [];
    }
    // 그 외(팀장/사원)는 항상 부서장 1인 승인 - 팀장한테 받는 게 아니라 부서장한테 받는다.
    return [{ field: 'signer1', label: '승인자 (부서장)', candidates: deptHeadCandidates }];
  }

  if (formTypeName === '지출결의서') {
    // 부서장이 기안하면 1차(부서장=본인)를 생략하고 바로 재무관리팀 1단계로 끝남
    if (drafterIsDeptHead) {
      return [{ field: 'signer1', label: '승인자 (재무관리팀)', candidates: financeCandidates }];
    }
    return [
      { field: 'signer1', label: '1차 승인자 (부서장)', candidates: deptHeadCandidates },
      { field: 'signer2', label: '2차 승인자 (재무관리팀)', candidates: financeCandidates }
    ];
  }

  // 프로젝트품의서: 기본 1차 팀장 → 2차 부서장. 팀장/부서장 본인이 기안하면 자기 자신이
  // 걸리는 단계를 생략하고 부서장 승인 1단계로 끝남(부서장이 기안하면 다른 부서장이 승인)
  if (drafterIsDeptHead || drafterIsTeamLead) {
    return [{ field: 'signer1', label: '승인자 (부서장)', candidates: deptHeadCandidates }];
  }
  return [
    { field: 'signer1', label: '1차 승인자 (팀장)', candidates: teamLeadCandidates },
    { field: 'signer2', label: '2차 승인자 (부서장)', candidates: deptHeadCandidates }
  ];
}

// -----------------------------------------------------------
// 승인자 선택 팝업 - 참조 대상 선택과 같은 조직도 스타일이지만 다중 선택이 아니라
// "행을 클릭하면 그 사람으로 바로 확정되고 모달이 닫히는" 단일 선택 방식이다.
// 부서 트리는 서버에서 새로 받아오지 않고, 이미 화면에 로드된 후보 목록 안에 실제로
// 있는 부서만 추려서 만든다 - 후보가 없는 부서까지 넣어봤자 클릭해도 후보가 안 나옴.
// -----------------------------------------------------------
let currentApprovalSteps = [];        // initApprovalForm이 채워둔 이번 서식의 단계 목록(getApprovalSteps 결과)
let approverPickerField = null;       // 지금 팝업이 채우는 필드('signer1' 또는 'signer2')
let approverPickerCandidates = [];    // 지금 팝업에서 고를 수 있는 후보 전체(부서 필터 전)
let approverPickerViewDeptId = null;  // 오른쪽 표를 좁혀서 보여줄 기준 부서 (null=전체)

// "조직도에서 선택" 버튼을 누르면 실행. field('signer1'/'signer2')에 맞는 후보 목록은
// currentApprovalSteps(이 서식+기안자 조합으로 이미 계산해 둔 값)에서 찾는다.
function openApproverPicker(field) {
  const step = currentApprovalSteps.find(s => s.field === field);
  if (!step) return;

  approverPickerField = field;
  approverPickerCandidates = step.candidates;
  approverPickerViewDeptId = null;

  document.getElementById('approverPickerTitle').innerText = step.label;

  renderApproverDeptTree();
  renderApproverMemberList();
  openModal('modal-approver-picker');
}

function renderApproverDeptTree() {
  // 후보 목록 안에서 중복 없이 부서 목록만 뽑아낸다(Map이라 deptId 기준으로 자동 중복 제거)
  const deptMap = new Map();
  approverPickerCandidates.forEach(c => {
    if (c.deptId) deptMap.set(c.deptId, c.deptName);
  });

  let html = `<li><a class="org-node ${approverPickerViewDeptId === null ? 'active' : ''}" onclick="filterApproverDeptView(null)"><i class="fa-solid fa-building"></i> 전체보기</a></li>`;
  deptMap.forEach((deptName, deptId) => {
    html += `<li><a class="org-node ${approverPickerViewDeptId === deptId ? 'active' : ''}" onclick="filterApproverDeptView(${deptId})">${deptName}</a></li>`;
  });
  document.getElementById('approverDeptTree').innerHTML = html;
}

function filterApproverDeptView(deptId) {
  approverPickerViewDeptId = deptId;
  renderApproverDeptTree();
  renderApproverMemberList();
}

function renderApproverMemberList() {
  const filtered = approverPickerViewDeptId === null
    ? approverPickerCandidates
    : approverPickerCandidates.filter(c => c.deptId === approverPickerViewDeptId);

  document.getElementById('approverMemberTableBody').innerHTML = filtered.length ? filtered.map(c => `
    <tr class="clickable" onclick="selectApprover(${c.employeeId}, '${c.employeeName}', '${(c.deptName || '').replace(/'/g, "\\'")}')">
      <td><strong>${c.employeeName}</strong></td>
      <td>${c.deptName || ''}</td>
      <td><span class="badge badge-primary">${c.positionName || ''}</span></td>
    </tr>
  `).join('') : `
    <tr><td colspan="3" style="text-align:center; padding:1.5rem; color:var(--text-muted);">해당 부서에 후보가 없습니다.</td></tr>
  `;
}

// 표에서 한 명을 클릭하면 실행 - 그 사람 employeeId를 hidden input에 채우고, 버튼 옆
// 요약 텍스트를 갱신한 뒤 바로 모달을 닫는다(참조 대상과 달리 "확인" 버튼이 따로 없음).
function selectApprover(employeeId, employeeName, deptName) {
  const fieldId = approverPickerField === 'signer1' ? 'draftSigner1' : 'draftSigner2';
  document.getElementById(fieldId).value = employeeId;
  document.getElementById(`${approverPickerField}Summary`).innerText = deptName ? `${employeeName} (${deptName})` : employeeName;
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
// 몇 단계인지/어느 후보 목록인지는 getApprovalSteps()가 서식명+기안자 직급으로 판단하므로
// 카드 클릭 시점엔 결재 단계 수를 따로 안 받는다.
function initApprovalForm(formTypeId, cardEl) {
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

  resetRefSelection();
  draftSelectedFiles = [];

  // 이 서식 + 기안자 자신의 직급 조합으로 몇 단계인지, 각 단계가 어느 후보 목록을 쓰는지
  // 결정한다(getApprovalSteps). openApproverPicker/submitDraft가 이 값을 그대로 참고함.
  currentApprovalSteps = getApprovalSteps(formTypeName, drafterPositionRank);
  const approverFieldHtml = step => `
    <div class="form-group">
      <label class="form-label">${step.label}</label>
      <div style="display:flex; align-items:center; gap:0.75rem;">
        <button type="button" class="btn btn-secondary btn-sm" onclick="openApproverPicker('${step.field}')"><i class="fa-solid fa-sitemap"></i> 조직도에서 선택</button>
        <span id="${step.field}Summary" style="font-size:0.85rem; color:var(--text-secondary);">선택된 승인자 없음</span>
      </div>
      <input type="hidden" id="draft${step.field === 'signer1' ? 'Signer1' : 'Signer2'}">
    </div>
  `;
  // 2단계면 1차/2차를 좌우로 나란히(grid-2), 1단계면 필드 하나만 그대로 둔다.
  const approverFieldsHtml = currentApprovalSteps.length === 2
    ? `<div class="grid-2">${currentApprovalSteps.map(approverFieldHtml).join('')}</div>`
    : currentApprovalSteps.map(approverFieldHtml).join('');

  container.innerHTML = `
    <h4 style="margin-bottom:1rem; color:var(--color-primary)">${formTypeName} 기안 서식 작성</h4>
    <form onsubmit="submitDraft(event, ${formTypeId})">
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

      ${approverFieldsHtml}

      <div class="form-group">
        <!-- 승인자가 없는 경우(부서장 본인 연차)는 참조 대상 지정이 필수 - 승인 절차가
             없는 대신 누군가는 볼 수 있어야 하므로 최소 1명/1부서를 강제한다. -->
        <label class="form-label">참조 대상 지정${currentApprovalSteps.length === 0 ? ' (필수 - 승인자 없음)' : ''}</label>
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
function submitDraft(event, formTypeId) {
  event.preventDefault();

  // 승인자는 <select>가 아니라 hidden input이라 브라우저가 자동으로 첫 값을 골라주지
  // 않는다 - "조직도에서 선택"을 안 누르면 그냥 비어 있으므로 직접 막아야 함.
  // 몇 개를 검증할지는 currentApprovalSteps(이번 서식+기안자 조합의 단계 수)를 따른다.
  // 승인자가 아예 없는 경우(부서장 본인 연차)는 대신 참조 대상이 최소 1개는 있어야 한다.
  const hasApprover = currentApprovalSteps.length > 0;
  let signer1Value = null;
  if (hasApprover) {
    signer1Value = document.getElementById('draftSigner1').value;
    if (!signer1Value) {
      showToast('승인자를 선택해주세요.', 'danger');
      return;
    }
  } else if (refSelectedDepts.size === 0 && refSelectedEmployees.size === 0) {
    showToast('승인자가 없는 문서라 참조 대상을 최소 1명 이상 지정해야 합니다.', 'danger');
    return;
  }
  const hasSecondStep = currentApprovalSteps.some(s => s.field === 'signer2');
  const signer2Value = hasSecondStep ? document.getElementById('draftSigner2').value : null;
  if (hasSecondStep && !signer2Value) {
    showToast('2차 승인자를 선택해주세요.', 'danger');
    return;
  }

  // 입력값 검증을 다 통과한 뒤에만 확인창을 띄운다 - 잘못 눌러서 바로 상신돼버리는 걸 방지
  if (!confirm('결재 상신하시겠습니까?')) {
    return;
  }

  const formData = new FormData();
  formData.append('formTypeId', formTypeId);
  formData.append('approvalTitle', document.getElementById('draftTitle').value.trim());
  formData.append('approvalContent', document.getElementById('draftContent').value.trim());
  if (hasApprover) {
    formData.append('signer1Id', signer1Value);
  }
  if (hasSecondStep) {
    formData.append('signer2Id', signer2Value);
  }

  if (document.getElementById('draftLeaveStart')) {
    formData.append('leaveStartDate', document.getElementById('draftLeaveStart').value);
    formData.append('leaveEndDate', document.getElementById('draftLeaveEnd').value);
  }
  if (document.getElementById('draftAmount')) {
    formData.append('amount', document.getElementById('draftAmount').value);
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
