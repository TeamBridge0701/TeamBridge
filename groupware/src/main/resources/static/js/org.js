/*
 * 조직도 목록과 부서 선택은 Thymeleaf 서버 렌더링이 담당한다.
 * 이 파일은 원본 groupware org.html의 DOM 이름을 유지하며, 직원 상세 모달만 비동기 처리한다.
 */
const orgModal = document.getElementById('modalOverlay');
// HTML에서 id="modalOverlay"인 요소를 찾는다.
// 조직도에서 직원 상세 정보를 클릭했을 때 나타나는 모달의 전체 배경 영역.

const orgTableBody = document.getElementById('orgMemberTableBody');
// HTML에서 id="orgMemberTableBody"인 <tbody>를 가져온다.

// 조직도 직원 목록이 들어가는 표의 본문이다. 
// JS에서 직원 목록을 찾거나, 현재 로그인한 직원 번호를 확인할 때 사용함.

// 조직도 직원 목록이 들어가는 표의 본문이다. JS에서 직원 목록을 찾거나, 현재 로그인한 직원 번호를 확인할 때 사용함.


/** 원본 org.html의 modalOverlay와 modal-org-member를 닫는다. */
function closeModal() {
  orgModal.classList.remove('active');
  // classList는 HTML 요소의 class 속성 값을 조작할 때 사용하는 DOM API이다. 

  // DOM API - 브라우저가 HTML 문서를 객체화하여 자바스크립트가 웹 페이지의 구조, 스타일, 내용을 읽고 
  //           수정하거나 삭제할 수 있게 해주는 프로그래밍 인터페이스

  // - 여기서는 JS로 HTML 요소의 CSS 클래스를 추가·삭제·확인하는 기능으로 사용되는거 같다.
  // - 문자열을 다루는 className 대신 클래스를 안전하고 간편하게 추가, 삭제, 확인 및 교체할 수 있는 유용한 내장 함수들을 제공함.
  // remove(), add() 같은 함수를 활용한다.
  
  orgModal.setAttribute('aria-hidden', 'true');
  // aria-hidden은 스크린 리더 같은 보조기술에게 해당 영역을 읽을지 알려주는 접근성 속성이다.
  // true: 모달이 닫혀 있으므로 보조기술이 읽지 않음
  // false: 모달이 열려 있으므로 보조기술이 읽을 수 있음
  document.getElementById('modal-org-member').style.display = 'none';
}

/** 원본 org.html에서 사용하던 모달 열기 함수명과 DOM ID를 유지한다. */
function openModal(modalId) {
  orgModal.classList.add('active');
  orgModal.setAttribute('aria-hidden', 'false');
  // false: 모달이 열려 있으므로 보조기술이 읽을 수 있음
  document.getElementById(modalId).style.display = 'block';
}

/**
 * 목록 행에는 직원 ID만 있으므로, 클릭 시 /org/member/{employeeId}에서 최신 상세 정보를 조회한다.
 * 재직 상태가 ACTIVE일 때만 조회되므로 모달의 상태 문구도 실제 DB 상태를 기준으로 표시된다.
 */
async function viewOrgMemberDetail(employeeId) {
	// viewOrgMemberDetail은 비동기 함수.
	// async: 함수 안에서 await를 사용할 수 있게 함.(서버 응답을 기다리는 동안 화면 전체를 멈추지 않음.)

  const response = await fetch(`/org/member/${employeeId}`);
  // await: 서버 응답이 올 때까지 다음 줄 실행을 잠시 기다림.
  // fetch: 서버에 HTTP 요청
  
  // 서버에 직원 상세 정보를 요청.
  if (!response.ok) {
	// 	서버 응답이 정상인지 확인.
	// response.ok는 HTTP 상태 코드가 정상 범위인지를 나타낸다.
	// true: 200, 201 등 정상 응답
	// false: 404, 500 등 오류 응답
	
    alert('직원 정보를 불러오지 못했습니다.');
    return;
  }

  const employee = await response.json();
  // 서버 응답 본문을 JSON으로 변환한다.
  
  const position = employee.positionName || employee.employeeRole;
  // 직급명을 정한다. positionName이 있으면 사용 / positionName이 비어 있으면 employeeRole(ㅈEMPLOYEE 같은 역할 값) 사용
  // || : 좌우의 두 조건 중 하나라도 참이면 참을 반환하는 연산자.
  
  const department = employee.deptName || '관리자';
  document.getElementById('mOrgName').textContent = `${employee.employeeName} ${position}`;
  // HTML에서 id="mOrgName"인 요소를 찾고 직원 이름과 직급을 넣느다.
  
  document.getElementById('mOrgAvatar').textContent = employee.employeeName.charAt(0);
  // 직원 이름의 첫 글자를 가져와 프로필 아바타에 넣는다.
  // charAt(0)에서 0은 첫 번째 글자 의미함.
  
  document.getElementById('mOrgDept').textContent = `${department} · 사번 ${employee.employeeNo}`;
  document.getElementById('mOrgPhone').textContent = employee.employeePhone || '-';
  // 없으면 -를 표시.
  document.getElementById('mOrgEmail').textContent = employee.employeeEmail || '-';
  document.getElementById('mOrgStatus').textContent = employee.employeeStatus === 'ACTIVE'
    ? '재직 중' : (employee.employeeStatus || '-');

  const chatButton = document.getElementById('mOrgChatBtn');
  const currentEmployeeId = Number(orgTableBody.dataset.currentEmployeeId);
  // <tbody>에 저장해 둔 현재 로그인 직원 번호 가져온다.
  
  chatButton.style.display = employee.employeeId === currentEmployeeId ? 'none' : 'inline-flex';
  
  chatButton.onclick = async () => {
    // 조직도에서 상대를 누르면 서버가 기존 DM을 재사용하거나 새 DM을 만든다.
    const requestBody = new URLSearchParams();
    requestBody.append('employeeIds', employee.employeeId);

    try {
      const response = await fetch('/chat/room', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: requestBody.toString()
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || '채팅방을 만들지 못했습니다.');
      }

      window.location.href = `/chat/room/${result.roomId}`;
    } catch (error) {
      showToast(error.message, 'danger');
    }
  };

  openModal('modal-org-member');
}

// 원본 헤더가 사용하던 onclick 이름을 유지하면서 Spring Boot 경로로 이동한다.
function navigateTo(page) {
	// 페이지 이동 함수이다. -> ()안 적힌 페이지로 이동함.
  window.location.href = page === 'chat' ? '/chat' : `/${page}`;
  // window.location.href는 브라우저의 현재 주소를 변경해 페이지를 이동시키는 속성이다.
}

// 오버레이 클릭과 Escape 키도 원본 closeModal()을 사용한다.
// 오버레이 바깥 클릭으로 닫기
orgModal?.addEventListener('click', event => {
  if (event.target === orgModal) closeModal();
});

// // Esc 키로 닫기
document.addEventListener('keydown', event => {
	 if (event.key === 'Escape') closeModal();
});
