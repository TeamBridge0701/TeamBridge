document.addEventListener('DOMContentLoaded', async () => {
    const btn = document.getElementById('btnCommute');
    
    // 1. 페이지 로드 시 현재 상태 조회
    try {
        const response = await fetch('/api/attendance/status');
        const data = await response.json();
        updateButtonUI(data.nextStatus);
      updateAttendanceDisplay(data);
    } catch (e) {
        console.error("상태 조회 실패", e);
    }

    // 2. 버튼에 클릭 이벤트 직접 연결 (HTML onclick 제거해도 됨)
    btn.addEventListener('click', commute);
});

async function commute() {
    const btn = document.getElementById('btnCommute');
    
    // 현재 버튼의 상태를 판단 (클래스 기반)
    let action = '';
    if (btn.classList.contains('btn-primary')) {
        action = 'checkIn';
    } else if (btn.classList.contains('btn-danger')) {
        action = 'checkOut';
    } else {
        return; // 이미 종료된 상태면 동작 안 함
    }

    try {
        // 주소에 /api/를 포함해야 합니다!
        const response = await fetch(`/api/attendance/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();

        if (result.success) {
            // 성공 시 서버가 준 nextStatus로 버튼 UI 갱신
            updateButtonUI(result.nextStatus);
         updateAttendanceDisplay(result);
		 const message=action === 'checkIn' ? '출근처리되었습니다':'퇴근처리되었습니다.';
           showToast(message, 'success'); // 기존 토스트 함수 유지
        }
    } catch (error) {
        console.error('통신 오류:', error);
        alert('서버 통신 중 오류가 발생했습니다.');
    }
}

function updateButtonUI(status) {
    const btn = document.getElementById('btnCommute');
    
    // 기존 클래스 제거
    btn.classList.remove('btn-primary', 'btn-danger', 'btn-secondary');
    
    if (status === 'NONE') {
        btn.innerText = '출근하기';
        btn.classList.add('btn', 'btn-primary');
        btn.disabled = false;
    } else if (status === 'WORKING') {
        btn.innerText = '퇴근하기';
        btn.classList.add('btn', 'btn-danger');
        btn.disabled = false;
    } else {
        btn.innerText = '업무 종료';
        btn.classList.add('btn', 'btn-secondary');
        btn.disabled = true;
    }
}

function updateAttendanceDisplay(data) {
    document.getElementById('dashCommuteStatus').innerText = `[${data.attendanceStatus}]`;
    document.getElementById('dashCheckinTime').innerText = data.checkInTime;
    document.getElementById('dashWorkTimer').innerText = data.checkOutTime;
}