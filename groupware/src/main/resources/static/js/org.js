/*
 * 조직도 목록과 부서 선택은 Thymeleaf 서버 렌더링이 담당한다.
 * 이 파일은 원본 groupware org.html의 DOM 이름을 유지하며, 직원 상세 모달만 비동기 처리한다.
 */
const orgModal = document.getElementById('modalOverlay');
const orgTableBody = document.getElementById('orgMemberTableBody');

/** 원본 org.html의 modalOverlay와 modal-org-member를 닫는다. */
function closeModal() {
  orgModal.classList.remove('active');
  orgModal.setAttribute('aria-hidden', 'true');
  document.getElementById('modal-org-member').style.display = 'none';
}

/** 원본 org.html에서 사용하던 모달 열기 함수명과 DOM ID를 유지한다. */
function openModal(modalId) {
  orgModal.classList.add('active');
  orgModal.setAttribute('aria-hidden', 'false');
  document.getElementById(modalId).style.display = 'block';
}

/**
 * 목록 행에는 직원 ID만 있으므로, 클릭 시 /org/member/{employeeId}에서 최신 상세 정보를 조회한다.
 * 재직 상태가 ACTIVE일 때만 조회되므로 모달의 상태 문구도 실제 DB 상태를 기준으로 표시된다.
 */
async function viewOrgMemberDetail(employeeId) {
  const response = await fetch(`/org/member/${employeeId}`);
  if (!response.ok) {
    alert('직원 정보를 불러오지 못했습니다.');
    return;
  }

  const employee = await response.json();
  const position = employee.positionName || employee.employeeRole;
  const department = employee.deptName || '관리자';
  document.getElementById('mOrgName').textContent = `${employee.employeeName} ${position}`;
  document.getElementById('mOrgAvatar').textContent = employee.employeeName.charAt(0);
  document.getElementById('mOrgDept').textContent = `${department} · 사번 ${employee.employeeNo}`;
  document.getElementById('mOrgPhone').textContent = employee.employeePhone || '-';
  document.getElementById('mOrgEmail').textContent = employee.employeeEmail || '-';
  document.getElementById('mOrgStatus').textContent = employee.employeeStatus === 'ACTIVE'
    ? '재직 중'
    : (employee.employeeStatus || '-');

  const chatButton = document.getElementById('mOrgChatBtn');
  const currentEmployeeId = Number(orgTableBody.dataset.currentEmployeeId);
  chatButton.style.display = employee.employeeId === currentEmployeeId ? 'none' : 'inline-flex';
  chatButton.onclick = () => {
    window.location.href = `/chat?chatWith=${employee.employeeId}`;
  };

  openModal('modal-org-member');
}

// 원본 헤더가 사용하던 onclick 이름을 유지하면서 Spring Boot 경로로 이동한다.
function navigateTo(page) {
  window.location.href = page === 'chat' ? '/chat' : `/${page}`;
}

// 원본 로그아웃 버튼을 Spring Security의 POST /logout 요청으로 연결한다.
function doLogout() {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = '/logout';
  document.body.appendChild(form);
  form.submit();
}

// 오버레이 클릭과 Escape 키도 원본 closeModal()을 사용한다.
orgModal?.addEventListener('click', event => {
  if (event.target === orgModal) closeModal();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeModal();
});
