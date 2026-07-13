// ===================================================================
// approval.js - approval.html(전자결재) 전용 로직
//
// 화면은 좌측 메뉴 탭 4개로 구성된다: 기안(작성) / 받은 결재함 / 보낸
// 기안함 / 참조 문서함. switchApprovalTab()이 탭 전환을, initApprovalForm()이
// 기안서 작성 폼을, viewApprovalDetail()+doApprovalDecision()이 결재
// 승인/반려 처리를 담당한다.
//
// 결재선(누가 승인하는지) 데이터 구조:
//   signers: [승인자1의 id, 승인자2의 id, ...] 순서대로 결재
//   step: 지금 몇 번째 승인자 차례인지 가리키는 인덱스 (0부터 시작)
//   lineStatuses: signers와 같은 길이의 배열, 각 단계의 '대기'/'승인'/'반려' 상태
//
// ===================================================================
// 🔧 백엔드 작업 가이드 (순서 7 — docs/기획서.md 8장 7순위: 전자결재, 가장 복잡 → 시간 확보)
//   필요 테이블: APPROVAL_FORM_TYPE, APPROVAL, APPROVAL_LINE, APPROVAL_REFERENCE
//               (docs/ERD_설계서.md 2-10~2-13)
//   필요 API:   GET|POST /approval/write, GET /approval/inbox|outbox|reference,
//               GET /approval/detail/{id}, POST /approval/approve|reject/{id},
//               POST /approval/cancel/{id} (docs/기획서.md 5장)
//
// ⚠️ 이 화면이 가장 많이 갈아엎힐 파일이다. signers[]/lineStatuses[]/comments[]
//    처럼 배열 인덱스로 서로 다른 정보를 암묵적으로 짝짓는 지금 구조는
//    ERD 설계서 2-12가 "관계형 모델이 아닌 안티패턴"이라고 명시한 부분이라
//    APPROVAL_LINE 1:N 테이블 구조로 반드시 다시 짜야 한다. 아래는 그 대응표.
//
// [1] signers[0]=기안자 포함 구조 → 폐기. 서버 모델은 기안자를
//     APPROVAL.DRAFTER_ID/CREATED_AT에 두고, APPROVAL_LINE은 STEP_NO=1(1차
//     승인자)부터 시작하는 "실제 승인권자만" 담는다. 화면에서 "기안 → 1차
//     승인 → 최종 승인" 스테퍼를 그릴 때 기안 단계는 화면단에서 합성해야 함
//     (viewApprovalDetail()의 stepperHtml 생성 로직 참고).
//
// [2] app.step(현재 단계 인덱스) → 폐기. 서버 조회 시점에
//     `SELECT MIN(STEP_NO) FROM APPROVAL_LINE WHERE APPROVAL_ID=? AND LINE_STATUS='WAIT'`
//     로 계산한다(캐시 컬럼 두지 않기로 한 결정, ERD 설계서 2-11 참고). 즉
//     "지금 내 차례인지" 판정(app.signers[app.step] === user.id 형태로 여러
//     곳에 흩어진 로직: renderDashboard, renderApproval, renderInbox,
//     viewApprovalDetail)은 전부 서버 쿼리 결과(JSON에 담긴 "현재 결재 단계
//     담당자 id")를 그대로 신뢰하는 방식으로 교체.
//
// [3] openRefPicker()~confirmRefPicker() (참조 대상 선택) → REF_DEPTS 하드코딩
//     대신 GET /org 부서 목록을 재사용. 선택 결과(refSelectedDepts/
//     refSelectedUserIds)는 submitDraft()에서 APPROVAL_REFERENCE 테이블에
//     "부서 참조면 DEPT_ID만, 개인 참조면 EMPLOYEE_ID만" 행으로 저장된다
//     (둘 다 채우면 안 됨 — ERD 설계서 2-13 CHECK 제약, 서버 검증 필수).
//
// [4] initApprovalForm() → 결재선 후보(팀장/부서장) select 옵션을
//     state.users.filter(position==='팀장') 처럼 클라이언트에서 거르지 말고,
//     서버가 조직도 조회 API로 팀장/부서장 후보를 내려주게 한다.
//
// [5] submitDraft() → POST /approval/write 로 교체. FORM_TYPE_ID로 서식을
//     지정하고, 서버가 그 서식의 APPROVAL_STEP_COUNT(1 또는 2)에 맞춰
//     APPROVAL_LINE STEP_NO 1..N 행을 생성한다. 연차휴가신청서만
//     LEAVE_START_DATE/LEAVE_END_DATE를 채우고, 그 외 서식은 NULL.
//
// [6] renderInbox()/renderOutbox()/renderReferenceBox() → 각각
//     GET /approval/inbox, /approval/outbox, /approval/reference 로 교체.
//     특히 inbox는 "APPROVER_ID=나 AND LINE_STATUS='WAIT' AND STEP_NO=현재단계"
//     조건을 서버 쿼리로 처리(기획서 5장 주석 공식 참고).
//
// [7] viewApprovalDetail()/doApprovalDecision() → 상세 조회는
//     GET /approval/detail/{id}, 승인/반려는 POST /approval/approve/{id} 또는
//     /approval/reject/{id}(JSON, AJAX). 서버 처리 시 반드시:
//       - 요청자가 정말 "현재 단계 담당자(APPROVER_ID)"인지 재검증(버튼 숨김은
//         보안이 아님, 기획서 4장)
//       - 반려는 LINE_COMMENT(사유) 필수 검증
//       - 마지막 단계 승인이면 APPROVAL.APPROVAL_STATUS='APPROVED'로 갱신 +
//         연차휴가신청서면 LEAVE_START_DATE~LEAVE_END_DATE 구간을 ATTENDANCE에
//         STATUS='LEAVE'로 upsert — 이 두 갱신은 반드시 하나의 트랜잭션으로 묶는다
//         (ERD 설계서 2-11: "승인은 됐는데 휴가는 반영 안 된" 상태 방지).
//
// [8] "회수"(기획서 3.8 추가기능, 첫 승인 전 상신 취소) → 이 프로토타입에는
//     아직 버튼이 없다. POST /approval/cancel/{id} 신설 필요(백엔드 작업 시
//     화면에도 버튼 추가 논의 필요 — 아래 질문 목록 참고).
// ===================================================================

let activeApprovalId = null; // 지금 상세 모달에 열려 있는 결재 문서 id

// -----------------------------------------------------------
// 참조(CC) 대상 선택 팝업 - 조직도 스타일 (부서 단위 또는 개별 직원 단위)
// 기안서 작성 화면에서 "조직도에서 선택" 버튼을 누르면 뜨는 모달 전용 상태.
// -----------------------------------------------------------
let refSelectedDepts = new Set();   // 부서 단위로 통째로 참조 지정한 부서명들
let refSelectedUserIds = new Set(); // 개별로 참조 지정한 사용자 id들
let refViewDept = 'all';            // 모달 우측 표를 필터링할 기준 부서 ('all'=전체)

const REF_DEPTS = ['인사팀', '기획팀', '개발팀', '디자인팀', '총무팀'];

// 참조 선택 모달을 열기 전, 이전에 골랐던 선택 내용을 모두 초기화한다.
function resetRefSelection() {
  refSelectedDepts = new Set();
  refSelectedUserIds = new Set();
  refViewDept = 'all';
  updateRefSummary();
}

// 기안서 작성 화면의 "선택된 참조 대상: ..." 문구를 현재 선택 상태로 갱신한다.
function updateRefSummary() {
  const summaryEl = document.getElementById('refSelectionSummary');
  if (!summaryEl) return;

  const parts = [];
  refSelectedDepts.forEach(d => parts.push(`${d}(부서)`));
  refSelectedUserIds.forEach(id => {
    const u = state.users.find(user => user.id === id);
    if (u) parts.push(`${u.name} ${u.position}`);
  });

  summaryEl.innerText = parts.length ? `선택된 참조 대상: ${parts.join(', ')}` : '선택된 참조 대상 없음';
}

// "조직도에서 선택" 버튼을 누르면 실행. 부서 트리(좌측)와 직원 표(우측)를
// 그려서 참조 대상 선택 모달(#modal-ref-picker)을 연다.
// 🔧 백엔드 7단계 — 여기부터 confirmRefPicker()까지, REF_DEPTS 하드코딩을 GET /org
//    부서 목록 재사용으로 교체. 선택 결과는 submitDraft()에서 APPROVAL_REFERENCE로 저장. (상세: [3])
function openRefPicker() {
  let deptListHtml = `<li><a class="org-node ${refViewDept === 'all' ? 'active' : ''}" id="refDeptNode-all" onclick="filterRefDeptView('all')"><i class="fa-solid fa-building"></i> 전체보기</a></li>`;
  deptListHtml += REF_DEPTS.map(dept => `
    <li style="margin-left: 0.75rem; display:flex; align-items:center; gap:0.4rem;">
      <input type="checkbox" id="refDeptCheck-${dept}" ${refSelectedDepts.has(dept) ? 'checked' : ''} onchange="toggleRefDept('${dept}', this.checked)">
      <a class="org-node ${refViewDept === dept ? 'active' : ''}" id="refDeptNode-${dept}" onclick="filterRefDeptView('${dept}')" style="flex:1;">${dept}</a>
    </li>
  `).join('');

  document.getElementById('refDeptTree').innerHTML = deptListHtml;
  renderRefMemberList();
  openModal('modal-ref-picker');
}

// 모달 좌측의 부서 이름(링크)을 클릭하면 실행. 우측 직원 표를 해당
// 부서 소속으로만 필터링한다. (부서 앞 체크박스와는 별개 - 체크박스는
// "부서 전체를 참조로 지정"하는 것이고, 이 클릭은 "표시만" 필터링한다)
function filterRefDeptView(dept) {
  refViewDept = dept;
  document.querySelectorAll('#refDeptTree .org-node').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(`refDeptNode-${dept}`);
  if (target) target.classList.add('active');
  renderRefMemberList();
}

// 부서 앞 체크박스 클릭 시: 그 부서 전체를 참조 대상 Set에 추가/제거한다.
function toggleRefDept(dept, checked) {
  if (checked) refSelectedDepts.add(dept);
  else refSelectedDepts.delete(dept);
}

// 직원 표의 개별 체크박스 클릭 시: 해당 직원 한 명을 참조 대상 Set에 추가/제거한다.
function toggleRefUser(userId, checked) {
  if (checked) refSelectedUserIds.add(userId);
  else refSelectedUserIds.delete(userId);
}

// 모달 우측의 직원 표(#refMemberTableBody)를 refViewDept 필터 기준으로 그린다.
function renderRefMemberList() {
  const filtered = refViewDept === 'all' ? state.users : state.users.filter(u => u.dept === refViewDept);

  const html = filtered.map(u => `
    <tr>
      <td style="text-align:center;"><input type="checkbox" ${refSelectedUserIds.has(u.id) ? 'checked' : ''} onchange="toggleRefUser('${u.id}', this.checked)"></td>
      <td><strong>${u.name}</strong></td>
      <td>${u.dept}</td>
      <td><span class="badge badge-primary">${u.position}</span></td>
    </tr>
  `).join('');

  document.getElementById('refMemberTableBody').innerHTML = html;
}

// 참조 선택 모달의 "확인" 버튼. 지금까지 고른 내용을 요약 문구에 반영하고 모달을 닫는다.
// (실제 기안 데이터에는 submitDraft()가 호출될 때 반영된다)
function confirmRefPicker() {
  updateRefSummary();
  closeModal();
}

// 좌측 메뉴의 4개 탭(기안/받은결재함/보낸기안함/참조문서함) 전환.
// 선택된 탭만 보이게 하고, inbox/outbox/ref 탭은 전환 시점에 매번 새로 그린다.
function switchApprovalTab(tab) {
  state.activeAppTab = tab;
  document.querySelectorAll('[id^="appTab-"]').forEach(item => item.classList.remove('active'));
  document.getElementById(`appTab-${tab}`).classList.add('active');

  document.querySelectorAll('.approval-tab-content').forEach(content => content.style.display = 'none');
  document.getElementById(`approval-view-${tab}`).style.display = 'block';

  if (tab === 'inbox') renderInbox();
  if (tab === 'outbox') renderOutbox();
  if (tab === 'ref') renderReferenceBox();
}

// 페이지가 열릴 때 항상 실행되는 함수(탭과 무관). 사이드바 옆 "받은 결재함"
// 뱃지에 표시할, 지금 내가 승인해야 할 문서 개수만 계산해서 넣어준다.
// 🔧 백엔드 7단계 — app.signers[app.step] 판정을 서버가 계산해주는 값으로 교체
//    (MIN(STEP_NO) WHERE LINE_STATUS='WAIT' 공식). (상세: [2])
function renderApproval() {
  const user = state.currentUser;
  const pendingInboxCount = state.approvals.filter(a => {
    return a.status === '진행중' && a.signers[a.step] === user.id;
  }).length;

  const inboxBadge = document.getElementById('inboxCountBadge');
  if (pendingInboxCount > 0) {
    inboxBadge.style.display = 'inline-flex';
    inboxBadge.innerText = pendingInboxCount;
  } else {
    inboxBadge.style.display = 'none';
  }
}

// "결재 상신" 화면 상단의 3개 서식 카드(연차휴가신청서/지출결의서/
// 프로젝트품의서) 중 하나를 클릭하면 실행. 서식 종류에 맞는 예시 내용과
// 승인자 선택 셀렉트박스를 채운 기안 폼 전체를 HTML 문자열로 만들어
// approvalFormContainer 안에 그린다.
// 🔧 백엔드 7단계 — 결재선 후보(팀장/부서장) select 옵션을 클라이언트 필터 대신
//    서버 조직도 조회 API로 채운다. (상세: [4])
function initApprovalForm(formType) {
  const container = document.getElementById('approvalFormContainer');
  container.style.display = 'block';

  let templateContent = '';
  if (formType === '연차휴가신청서') {
    templateContent = '하반기 개인 휴가 연차 사용을 기안합니다.\n사유: \n업무 대행자: ';
  } else if (formType === '지출결의서') {
    templateContent = '부서 회식 영수증 정산 및 청구\n내용: 기획팀 상반기 마감 기념 회식비 정산\n금액: 120,000원\n첨부: 결제 영수증 이미지 첨부';
  } else {
    templateContent = '제목: 신규 서비스 런칭 서버 증설 구매 의뢰\n구체 사양:\n- AWS EC2 t3.xlarge 인스턴스 2대\n- SSD Storage 500GB\n소요 월 예산: 350,000원 상당';
  }

  // 결재선 셀렉트박스 옵션 - 직급으로 "이 사람이 팀장/부서장이다"를 판단해서
  // 자동으로 후보 목록을 만든다 (실제로는 조직도 구조를 따로 관리해야 하지만
  // 지금은 프로토타입이라 직급 문자열로 단순화했다)
  const intermediateOptions = state.users
    .filter(u => u.position === '팀장')
    .map(u => `<option value="${u.id}">${u.name} 팀장 (${u.dept})</option>`).join('');

  const finalOptions = state.users
    .filter(u => u.position === '부서장')
    .map(u => `<option value="${u.id}">${u.name} 부서장 (${u.dept})</option>`).join('');

  // 연차휴가신청서만 휴가 시작/종료일 선택 필드를 넣는다. 최종 승인 시
  // 이 범위의 날짜가 기안자의 출결 기록에 휴가로 자동 반영된다.
  let leaveDateHtml = '';
  if (formType === '연차휴가신청서') {
    let dayOptions = '';
    for (let d = 1; d <= 30; d++) dayOptions += `<option value="${d}">6월 ${d}일</option>`;
    leaveDateHtml = `
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label" for="draftLeaveStart">휴가 시작일</label>
          <select id="draftLeaveStart" class="form-control">${dayOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label" for="draftLeaveEnd">휴가 종료일</label>
          <select id="draftLeaveEnd" class="form-control">${dayOptions}</select>
        </div>
      </div>
    `;
  }

  resetRefSelection();

  container.innerHTML = `
    <h4 style="margin-bottom:1rem; color:var(--color-primary)">${formType} 기안 서식 작성</h4>
    <form onsubmit="submitDraft(event, '${formType}')">
      <div class="form-group">
        <label class="form-label" for="draftTitle">기안문 제목</label>
        <input type="text" id="draftTitle" class="form-control" required value="[기안] ${formType} 상신 건">
      </div>
      <div class="form-group">
        <label class="form-label" for="draftContent">상세 기안 사유 및 내역</label>
        <textarea id="draftContent" class="form-control" required>${templateContent}</textarea>
      </div>

      ${leaveDateHtml}

      <div class="grid-2">
        <div class="form-group">
          <label class="form-label" for="draftSigner1">1차 승인자 (팀장)</label>
          <select id="draftSigner1" class="form-control">
            ${intermediateOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="draftSigner2">최종 승인자 (부서장)</label>
          <select id="draftSigner2" class="form-control">
            ${finalOptions}
          </select>
        </div>
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

// 기안 폼의 "결재 상신" 버튼(submit)에 연결. 새 결재 문서를 만들어
// state.approvals에 추가한다. 결재선은 [기안자 본인, 1차 승인자, 2차 승인자]
// 순서로 저장되고, 맨 처음 상태는 항상 "진행중"·"대기"로 시작한다.
// 🔧 백엔드 7단계 — POST /approval/write 로 교체. signers[]/lineStatuses[] 배열 대신
//    서버가 APPROVAL + APPROVAL_LINE(STEP_NO 1..N) + APPROVAL_REFERENCE를 생성한다. (상세: [1][5])
function submitDraft(event, formType) {
  event.preventDefault();
  const title = document.getElementById('draftTitle').value.trim();
  const content = document.getElementById('draftContent').value.trim();
  const signer1 = document.getElementById('draftSigner1').value;
  const signer2 = document.getElementById('draftSigner2').value;

  let leaveStartDay = null;
  let leaveEndDay = null;
  if (formType === '연차휴가신청서') {
    leaveStartDay = parseInt(document.getElementById('draftLeaveStart').value);
    leaveEndDay = parseInt(document.getElementById('draftLeaveEnd').value);
    if (leaveEndDay < leaveStartDay) {
      showToast('휴가 종료일은 시작일보다 빠를 수 없습니다.', 'danger');
      return;
    }
  }

  const today = new Date().toISOString().split('T')[0];
  const newId = state.approvals.length ? Math.max(...state.approvals.map(a=>a.id)) + 1 : 1001;

  state.approvals.push({
    id: newId,
    title,
    drafterId: state.currentUser.id,
    type: formType,
    content,
    date: today,
    status: '진행중',
    step: 1, // signers[0]은 기안자 본인(이미 '승인'으로 취급)이라 1차 승인자부터 대기
    signers: [state.currentUser.id, signer1, signer2],
    lineStatuses: ['승인', '대기', '대기'],
    comments: ['', '', ''],
    refDepts: Array.from(refSelectedDepts),
    refUserIds: Array.from(refSelectedUserIds),
    leaveStartDay,
    leaveEndDay
  });

  saveState();
  showToast(`기안문 [${title}]이 성공적으로 상신 결재선에 등록되었습니다.`, 'success');

  resetRefSelection();
  document.getElementById('approvalFormContainer').style.display = 'none';
  switchApprovalTab('outbox');
  renderApproval();
}

// "받은 결재함" 탭: 지금 로그인한 사용자가 결재선상 "바로 지금 차례"인
// 진행중 문서만 골라서 보여준다.
// 🔧 백엔드 7단계 — GET /approval/inbox 로 교체. "APPROVER_ID=나 AND LINE_STATUS='WAIT'
//    AND STEP_NO=현재단계" 조건을 서버 쿼리로 처리. (상세: [6])
function renderInbox() {
  const user = state.currentUser;
  const inboxList = state.approvals.filter(a => {
    return a.status === '진행중' && a.signers[a.step] === user.id;
  });

  const html = inboxList.map(a => {
    const drafter = state.users.find(u => u.id === a.drafterId) || { name: '알수없음', position: '' };
    return `
      <tr class="clickable" onclick="viewApprovalDetail(${a.id})">
        <td>#${a.id}</td>
        <td><span class="badge badge-primary">${a.type}</span></td>
        <td><strong>${drafter.name} ${drafter.position}</strong></td>
        <td>${a.title}</td>
        <td style="font-family:'Fira Code'; font-size:0.8rem;">${a.date}</td>
        <td><span class="badge badge-warning">${a.step}차 승인대기</span></td>
      </tr>
    `;
  }).join('');

  document.getElementById('inboxTableBody').innerHTML = html.length ? html : `
    <tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">수신된 결재 요청 문서가 없습니다.</td></tr>
  `;
}

// "보낸 기안함" 탭: 내가 직접 기안한 문서 전체(진행중/승인/반려 모두 포함)를 보여준다.
// 🔧 백엔드 7단계 — GET /approval/outbox 로 교체. (상세: [6])
function renderOutbox() {
  const user = state.currentUser;
  const outboxList = state.approvals.filter(a => a.drafterId === user.id);

  const html = outboxList.map(a => {
    let statusBadge = `<span class="badge badge-warning">진행중</span>`;
    if (a.status === '승인') statusBadge = `<span class="badge badge-success">승인 완료</span>`;
    if (a.status === '반려') statusBadge = `<span class="badge badge-danger">반려됨</span>`;

    return `
      <tr class="clickable" onclick="viewApprovalDetail(${a.id})">
        <td>#${a.id}</td>
        <td><span class="badge badge-primary">${a.type}</span></td>
        <td><strong>${a.title}</strong></td>
        <td style="font-family:'Fira Code'; font-size:0.8rem;">${a.date}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('outboxTableBody').innerHTML = html.length ? html : `
    <tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">보낸 기안 문서가 없습니다.</td></tr>
  `;
}

// "참조 문서함" 탭: 내가 기안자는 아니지만 참고할 필요가 있는 문서들.
// 1) 내 부서 전체가 참조로 지정됨, 2) 나 개인이 참조로 지정됨,
// 3) 내가 결재선에는 있지만 기안자는 아닌 경우(=결재 순서를 기다리는 게
//    아니라 이미 지나갔거나 앞으로 올 다른 사람 차례를 지켜보는 경우) 를 모두 포함한다.
// 🔧 백엔드 7단계 — GET /approval/reference 로 교체. (상세: [6])
function renderReferenceBox() {
  const user = state.currentUser;
  const refList = state.approvals.filter(a => {
    return (a.refDepts && a.refDepts.includes(user.dept))
      || (a.refUserIds && a.refUserIds.includes(user.id))
      || (a.signers.includes(user.id) && a.drafterId !== user.id);
  });

  const html = refList.map(a => {
    const drafter = state.users.find(u => u.id === a.drafterId) || { name: '알수없음', position: '' };
    let statusBadge = `<span class="badge badge-warning">진행중</span>`;
    if (a.status === '승인') statusBadge = `<span class="badge badge-success">승인</span>`;
    if (a.status === '반려') statusBadge = `<span class="badge badge-danger">반려</span>`;

    return `
      <tr class="clickable" onclick="viewApprovalDetail(${a.id})">
        <td>#${a.id}</td>
        <td><span class="badge badge-primary">${a.type}</span></td>
        <td>${drafter.name} ${drafter.position}</td>
        <td><strong>${a.title}</strong></td>
        <td style="font-family:'Fira Code'; font-size:0.8rem;">${a.date}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('refTableBody').innerHTML = html.length ? html : `
    <tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">참조 수신된 결재 문서가 없습니다.</td></tr>
  `;
}

// 어느 탭에서든 문서 한 줄을 클릭하면 실행되는 상세 모달. 결재선 진행
// 상황을 단계별 아이콘(flow-stepper)으로 그려주고, "지금 내가 승인/반려할
// 차례인지"를 판단해서 그럴 때만 의견 입력창과 승인/반려 버튼을 보여준다.
// 🔧 백엔드 7단계 — GET /approval/detail/{id} 로 교체. 기안 단계는 APPROVAL.DRAFTER_ID를
//    화면단에서 스테퍼 0번째로 합성. (상세: [1][7])
function viewApprovalDetail(id) {
  const app = state.approvals.find(a => a.id === id);
  if (!app) return;

  activeApprovalId = id;
  
  const drafter = state.users.find(u => u.id === app.drafterId) || { name: '알수없음', position: '', dept: '' };
  
  document.getElementById('mAppFormName').innerText = `${app.type} 상세 보기`;
  document.getElementById('mAppDrafter').innerText = `${drafter.name} ${drafter.position} (${drafter.dept})`;
  document.getElementById('mAppTitle').innerText = app.title;
  document.getElementById('mAppDate').innerText = app.date;
  document.getElementById('mAppContent').innerText = app.content;

  // 단계 표시(Stepper) 구성
  let stepperHtml = '';
  app.signers.forEach((signerId, index) => {
    const signer = state.users.find(u => u.id === signerId) || { name: '알수없음', position: '' };
    let stepStatus = app.lineStatuses[index];
    
    let icon = '<i class="fa-solid fa-circle-notch"></i>';
    let stepClass = 'flow-step';
    
    if (stepStatus === '승인') {
      icon = '<i class="fa-solid fa-circle-check" style="color:var(--color-success)"></i>';
      stepClass += ' active';
    } else if (stepStatus === '반려') {
      icon = '<i class="fa-solid fa-circle-xmark" style="color:var(--color-danger)"></i>';
      stepClass += ' active';
    } else if (app.status === '진행중' && app.step === index) {
      icon = '<i class="fa-solid fa-spinner fa-spin" style="color:var(--color-primary)"></i>';
      stepClass += ' active';
    }
    
    stepperHtml += `
      <div class="${stepClass}">
        ${icon} ${index === 0 ? '기안' : index + '차'}: ${signer.name} ${signer.position} (${stepStatus})
      </div>
    `;
    if (index < app.signers.length - 1) {
      stepperHtml += `<div class="flow-arrow"><i class="fa-solid fa-chevron-right"></i></div>`;
    }
  });
  document.getElementById('mAppStepper').innerHTML = stepperHtml;

  // 반려 사유
  const rejectBox = document.getElementById('mAppRejectBox');
  if (app.status === '반려') {
    rejectBox.style.display = 'block';
    const rejectComment = app.comments.find(c => c && c.length) || '기재 사유 없음';
    document.getElementById('mAppRejectReason').innerText = rejectComment;
  } else {
    rejectBox.style.display = 'none';
  }

  // 액션 패널
  const user = state.currentUser;
  const isReviewer = (app.status === '진행중' && app.signers[app.step] === user.id);
  
  const actionBox = document.getElementById('mAppActionBox');
  const actionBtns = document.getElementById('mAppActionButtons');
  const closeBtn = document.getElementById('mAppCloseBtn');

  if (isReviewer) {
    actionBox.style.display = 'block';
    actionBtns.style.display = 'flex';
    closeBtn.style.display = 'none';
    document.getElementById('appActionComment').value = '';
  } else {
    actionBox.style.display = 'none';
    actionBtns.style.display = 'none';
    closeBtn.style.display = 'block';
  }

  openModal('modal-approval-detail');
}

// 상세 모달의 "승인하기"/"반려하기" 버튼에 연결 (approved: true=승인, false=반려).
// 반려는 사유 입력이 필수이며, 승인이면 결재선의 다음 단계로 넘어가거나
// (마지막 단계면) 문서 자체를 최종 승인 처리한다.
// 🔧 백엔드 7단계 — POST /approval/approve/{id} 또는 /approval/reject/{id}로 교체.
//    서버가 현재 단계 담당자 재검증 + 최종승인 시 휴가기간→ATTENDANCE 반영을
//    하나의 트랜잭션으로 처리. (상세: [7])
function doApprovalDecision(approved) {
  const comment = document.getElementById('appActionComment').value.trim();
  const app = state.approvals.find(a => a.id === activeApprovalId);
  if (!app) return;

  if (!approved && !comment) {
    showToast('반려 처리 시에는 반드시 반려 사유를 입력하셔야 합니다.', 'danger');
    return;
  }

  const stepIdx = app.step;

  if (approved) {
    app.lineStatuses[stepIdx] = '승인';
    app.comments[stepIdx] = comment || '승인함';

    if (stepIdx < app.signers.length - 1) {
      app.step++;
    } else {
      app.status = '승인';
      // 연차휴가신청서가 결재선 끝까지 최종 승인되면 그 기간을
      // 기안자의 출결 기록에 휴가로 자동 반영한다.
      if (app.type === '연차휴가신청서' && app.leaveStartDay && app.leaveEndDay) {
        for (let d = app.leaveStartDay; d <= app.leaveEndDay; d++) {
          upsertAttendanceRecord(app.drafterId, d, { checkin: null, checkout: null, status: '휴가' });
        }
      }
    }
    showToast('기안문서에 최종 승인 처리했습니다.', 'success');
  } else {
    app.lineStatuses[stepIdx] = '반려';
    app.comments[stepIdx] = comment;
    app.status = '반려';
    showToast('기안문서를 반려 조치했습니다.', 'danger');
  }

  saveState();
  closeModal();
  
  if (state.activeAppTab === 'inbox') renderInbox();
  if (state.activeAppTab === 'outbox') renderOutbox();
  renderApproval();
}

// 초기화
window.addEventListener('DOMContentLoaded', () => {
  if (!initPage('approval')) return;
  renderApproval();
});
