// showToast()는 admin.js도 쓰게 되면서 common.js로 옮김 (이 파일보다 먼저 로드됨)

// 프로필 이미지 추가/변경 시 사용
let selectedProfileImgFile = null;

// 비밀번호 변경 폼 제출 - 새로고침 없이 fetch로 POST /mypage/password 호출 후 결과를 토스트로 표시
function changeMyPassword(event) {
    event.preventDefault();

    const currentPassword = document.getElementById('currentPw').value;
    const newPassword = document.getElementById('newPw').value;

    const formData = new FormData();
    formData.append('currentPassword', currentPassword);
    formData.append('newPassword', newPassword);

    fetch('/mypage/password', {
        method: 'POST',
        body: formData
    })
        .then(response => response.text().then(message => {
            showToast(message, response.ok ? 'success' : 'danger');
            if (response.ok) {
                document.getElementById('currentPw').value = '';
                document.getElementById('newPw').value = '';
            }
        }));
}

// 파일 선택창에서 사진을 고르면 즉시 미리보기로 반영 + saveMyInfo()가 나중에 쓸 수 있게 보관
function handleProfilePhotoSelect(inputElement) {
    const file = inputElement.files[0];
    if (!file) {
        return;
    }
    selectedProfileImgFile = file;

    const preview = document.createElement('img');
    preview.id = 'myAvatar';
    preview.className = document.getElementById('myAvatar').className;
    preview.style.cssText = 'width: 100px; height: 100px; object-fit: cover; border-radius: 50%;';
    preview.src = URL.createObjectURL(file);
    document.getElementById('myAvatar').replaceWith(preview);
}

// 개인정보(전화번호/이메일/프로필 사진) 저장 - 새로고침 없이 fetch로 POST /mypage/update 호출
function saveMyInfo(event) {
    event.preventDefault();

    const formData = new FormData();
    formData.append('employeePhone', document.getElementById('myPhone').value);
    formData.append('employeeEmail', document.getElementById('myEmail').value);
    formData.append('birthDate', document.getElementById('myBirthDate').value);
    if (selectedProfileImgFile) {
        formData.append('profileImg', selectedProfileImgFile);
    }

    fetch('/mypage/update', {
        method: 'POST',
        body: formData
    })
        .then(response => response.text().then(message => {
            showToast(message, response.ok ? 'success' : 'danger');
            if (response.ok) {
                selectedProfileImgFile = null;
            }
        }));
}
