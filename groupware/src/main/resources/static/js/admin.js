// admin.html("계정·인사정보 관리") 전용 로직
// /admin/**은 SecurityConfig가 ROLE_ADMIN만 통과시키므로 로그인/권한 체크는
// 여기서 따로 하지 않는다.

let currentMembers = [];       // 최근 GET /admin/members 응답 캐시 - 수정 모달 채울 때 재사용
let editingEmployeeId = null;  // 수정 모드로 연 대상 사원 id (null이면 신규 등록 모드)
let searchDebounceTimer = null;

// 부서/직급 드롭다운을 서버 목록으로 채움 (등록/수정 모달에서 공용으로 씀)
function loadDropdowns() {
    Promise.all([
        fetch('/admin/department').then(res => res.json()),
        fetch('/admin/position').then(res => res.json())
    ]).then(([departments, positions]) => {
        const deptSelect = document.getElementById('adminUserDept');
        deptSelect.innerHTML = departments.map(d => `<option value="${d.deptId}">${d.deptName}</option>`).join('');

        const posSelect = document.getElementById('adminUserPos');
        posSelect.innerHTML = positions.map(p => `<option value="${p.positionId}">${p.positionName}</option>`).join('');
    });
}

// 이름 검색창(keyup)에 연결. 타이핑마다 서버로 재조회하되, 너무 자주 보내지
// 않도록 살짝 디바운스한다.
function searchAdminUsers(keyword) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => loadMembers(keyword), 250);
}

// GET /admin/members?keyword= 로 목록을 받아와 표를 다시 그림
function loadMembers(keyword = '') {
    const url = keyword ? `/admin/members?keyword=${encodeURIComponent(keyword)}` : '/admin/members';
    fetch(url)
        .then(res => res.json())
        .then(members => {
            currentMembers = members;
            renderAdminTable(members);
        });
}

function renderAdminTable(members) {
    const html = members.map(m => {
        const isSuspended = m.employeeStatus === 'SUSPENDED';
        const actionBtn = isSuspended
            ? `<button class="btn btn-success btn-sm" onclick="toggleUserStatus(${m.employeeId}, false)">정지 복구</button>`
            : `<button class="btn btn-danger btn-sm" onclick="toggleUserStatus(${m.employeeId}, true)">계정 정지</button>`;

        return `
      <tr>
        <td style="font-family:'Fira Code'; font-size:0.85rem;">${m.employeeNo}</td>
        <td><strong>${m.employeeName}</strong></td>
        <td>${m.deptName ?? '-'}</td>
        <td><span class="badge badge-primary">${m.positionName ?? '-'}</span></td>
        <td style="font-family:'Fira Code'; font-size:0.85rem;">${m.employeePhone ?? '-'}</td>
        <td>
          ${isSuspended
            ? '<span class="badge badge-danger">정지됨</span>'
            : '<span class="badge badge-success">재직</span>'}
        </td>
        <td style="text-align:center;">
          <div style="display:flex; gap:0.25rem; justify-content:center;">
            <button class="btn btn-secondary btn-sm" onclick="openEditUserModal(${m.employeeId})">수정</button>
            ${actionBtn}
            <button class="btn btn-secondary btn-sm" onclick="resetUserPassword(${m.employeeId})">PW 리셋</button>
          </div>
        </td>
      </tr>
    `;
    }).join('');

    document.getElementById('adminUserTableBody').innerHTML = html.length ? html : `
    <tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">검색 결과가 없습니다.</td></tr>
  `;
}

// "계정 정지"/"정지 복구" 버튼에 연결
function toggleUserStatus(employeeId, suspend) {
    const url = suspend ? `/admin/member/suspend/${employeeId}` : `/admin/member/restore/${employeeId}`;
    fetch(url, { method: 'POST' })
        .then(res => res.text().then(message => {
            showToast(message, res.ok ? 'success' : 'danger');
            if (res.ok) loadMembers(document.getElementById('adminUserSearch').value);
        }));
}

// "PW 리셋" 버튼에 연결 - 초기 비밀번호는 서버에서 사번과 동일하게 재해시됨
function resetUserPassword(employeeId) {
    if (!confirm('비밀번호를 초기화(사번과 동일한 값)하시겠습니까?')) return;

    fetch(`/admin/member/reset/${employeeId}`, { method: 'POST' })
        .then(res => res.text().then(message => showToast(message, res.ok ? 'success' : 'danger')));
}

// "신규 사원 등록" 버튼에 연결
function openCreateUserModal() {
    editingEmployeeId = null;
    document.getElementById('adminModalTitle').innerText = '신규 사원 등록';
    document.getElementById('adminSubmitBtn').innerText = '등록하기';
    document.getElementById('adminUserName').value = '';
    document.getElementById('adminUserPhone').value = '010-';
    openModal('modal-admin-user');
}

// 표의 "수정" 버튼에 연결 - 직전 목록 조회 캐시(currentMembers)에서 채워 넣음
function openEditUserModal(employeeId) {
    const member = currentMembers.find(m => m.employeeId === employeeId);
    if (!member) return;

    editingEmployeeId = employeeId;
    document.getElementById('adminModalTitle').innerText = '인사정보 수정';
    document.getElementById('adminSubmitBtn').innerText = '저장하기';
    document.getElementById('adminUserName').value = member.employeeName;
    document.getElementById('adminUserDept').value = member.deptId;
    document.getElementById('adminUserPos').value = member.positionId;
    document.getElementById('adminUserPhone').value = member.employeePhone ?? '';
    openModal('modal-admin-user');
}

// 등록/수정 모달의 폼 submit에 연결 - editingEmployeeId 유무로 신규/수정 분기
function submitAdminUserForm(event) {
    event.preventDefault();

    const formData = new FormData();
    formData.append('employeeName', document.getElementById('adminUserName').value.trim());
    formData.append('deptId', document.getElementById('adminUserDept').value);
    formData.append('positionId', document.getElementById('adminUserPos').value);
    formData.append('employeePhone', document.getElementById('adminUserPhone').value.trim());

    const url = editingEmployeeId
        ? `/admin/member/update/${editingEmployeeId}`
        : '/admin/member/create';

    fetch(url, { method: 'POST', body: formData })
        .then(res => {
            if (editingEmployeeId) {
                return res.text().then(message => ({ ok: res.ok, message }));
            }
            // 신규 등록은 서버가 채번한 사번이 포함된 EmployeeDTO를 JSON으로 응답
            return res.json().then(created => ({
                ok: res.ok,
                message: res.ok ? `신규 사원 [${created.employeeName}] 계정이 등록되었습니다. (부여사번: ${created.employeeNo})` : '등록에 실패했습니다.'
            }));
        })
        .then(({ ok, message }) => {
            showToast(message, ok ? 'success' : 'danger');
            if (ok) {
                closeModal();
                loadMembers(document.getElementById('adminUserSearch').value);
            }
        });
}

window.addEventListener('DOMContentLoaded', () => {
    loadDropdowns();
    loadMembers();
});
