// 여러 화면이 같이 쓰는 최소 공통 유틸 (토스트 알림 / 모달 열고닫기)
// mypage.js에 있던 showToast()가 admin.js에도 똑같이 필요해져서 이 시점에 분리함.
// 화면별 데이터 로딩/렌더링 로직은 여전히 각 페이지의 js 파일에 둔다.

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => toast.remove(), 3000);
}

// 모달 오버레이는 .active 클래스로, 그 안의 개별 모달(.modal-content)은
// style.display로 켜고 끈다 (css/style.css 7번 섹션 주석 참고)
function openModal(modalId) {
    document.querySelectorAll('#modalOverlay .modal-content').forEach(el => {
        el.style.display = 'none';
    });
    document.getElementById(modalId).style.display = 'block';
    document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}
