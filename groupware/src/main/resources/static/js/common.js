// ===================================================================
// common.js - 여러 화면이 공통으로 쓰는 순수 화면단 유틸리티
//
// mock 버전의 common.js(A~L섹션)와 달리, 목업 state/localStorage/로그인
// 관련 로직(A~C, K~L)은 전부 뺐다 - 백엔드(세션, Thymeleaf SSR)로
// 대체됐기 때문. 여기 남긴 건 백엔드 연동 여부와 무관한 "순수 화면단
// 유틸리티"(모달 열고 닫기, 토스트 알림)뿐이라, 다른 화면(js)도 그대로
// 재사용할 수 있다.
// ===================================================================

// modalId로 지정한 모달만 보이게 하고 나머지는 다시 숨긴다.
function openModal(modalId) {
  document.getElementById('modalOverlay').classList.add('active');
  document.querySelectorAll('.modal-content').forEach(content => {
    content.style.display = 'none';
  });
  document.getElementById(modalId).style.display = 'block';
}

// 배경 오버레이를 꺼서 모든 모달을 닫는다.
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

// 화면 우측 하단에 잠깐 나타났다 사라지는 알림 메시지.
// 사용 예: showToast('저장되었습니다.', 'success')
function showToast(message, type = 'primary') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = '<i class="fa-solid fa-circle-info"></i>';
  if (type === 'success') icon = '<i class="fa-solid fa-circle-check" style="color:var(--color-success)"></i>';
  else if (type === 'danger') icon = '<i class="fa-solid fa-circle-xmark" style="color:var(--color-danger)"></i>';
  else if (type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--color-warning)"></i>';

  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    });
  }, 3000);
}
