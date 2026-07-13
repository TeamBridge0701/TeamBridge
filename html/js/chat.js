// ===================================================================
// chat.js - chat.html(실시간 채팅) 전용 로직
// (실제 구현은 WebSocket(STOMP)+SockJS로 대체될 부분을 localStorage 목업으로 시뮬레이션)
//
// 이 파일은 크게 4부분으로 나뉜다:
//   1) 유틸리티 - 채팅방/메시지를 찾고 화면에 표시할 문자열로 가공하는 함수들
//   2) 좌측 대화방 목록 렌더링
//   3) 우측 메시지 스레드(대화 내용) 렌더링 + 방 이름 변경 + 메시지 전송
//   4) 새 대화 시작 모달 / 대화 초대 모달 (둘 다 "부서 선택 → 직원 선택"
//      조직도 스타일 피커를 쓰는데, 거의 같은 코드를 new/invite 접두사로
//      나란히 갖고 있다)
//
// ===================================================================
// 🔧 백엔드 작업 가이드 (순서 8 — docs/기획서.md 8장 8순위: 실시간 채팅,
//   WebSocket(STOMP) 학습 필요·1:1부터 구현. 개발 우선순위상 가장 마지막이지만
//   난이도와 학습량 때문에 가장 먼저 일정을 잡아 익혀두는 걸 권장)
//   필요 테이블: CHAT_ROOM, CHAT_ROOM_MEMBER, CHAT_MESSAGE, CHAT_ATTACHMENT
//               (docs/ERD_설계서.md 2-14~2-17)
//   필요 API(HTTP):  GET /chat, GET /chat/room/{roomId}, POST /chat/room,
//               GET /chat/room/{roomId}/messages (docs/기획서.md 5장)
//   필요 엔드포인트(WebSocket, STOMP): 연결 WS /ws-stomp(SockJS),
//               구독 /topic/room/{roomId}, 발행 /app/chat/{roomId}
//
// ⚠️ 이 화면은 유일하게 HTTP(REST)가 아니라 WebSocket 상시 연결을 쓴다.
//   방 목록·이전 메시지 로드는 HTTP로, "지금 이 순간의 메시지 송수신"만
//   WebSocket으로 분리해서 작업 순서를 잡는 게 좋다(아래 [1]~[2] 먼저 끝내고
//   그 다음 실시간 부분 [3]으로 넘어가는 순서 권장).
//
// [1] 방 목록(getChatRoom/getChatMessages/getChatLastMessage/getChatUnreadCount/
//     renderChatRoomList) → GET /chat 호출 1번으로 "내가 속한 방 목록 + 방별
//     마지막 메시지 + 안읽음 수"를 서버가 계산해 내려주는 응답으로 교체.
//     안읽음 수는 지금처럼 메시지 배열을 매번 전량 순회하지 말고, ERD 설계서
//     2-15의 "읽음 커서" 방식(CHAT_ROOM_MEMBER.LAST_READ_MESSAGE_ID 보다 뒤에
//     온 메시지 개수)으로 서버가 집계한다.
//
// [2] openChatRoom()/renderChatMessages() → GET /chat/room/{roomId}/messages
//     (페이징)로 이전 대화 내역을 불러온다. "진입 시 상대 메시지 전부 읽음
//     처리"하던 부분(각 메시지의 readBy 배열에 추가하던 지금 로직)은 폐기하고,
//     대신 방 입장 시 서버에 "내 LAST_READ_MESSAGE_ID를 이 방의 최신 메시지
//     id로 갱신해줘" 요청 1번만 보내면 된다(메시지별 읽음 배열 방식은
//     메시지가 많아지면 감당이 안 된다는 ERD 설계서 2-15 설명 참고).
//     isReadByAll()로 그리던 "읽음" 표시도 이 커서 값을 기준으로 재계산.
//
// [3] sendChatMessage()/handleChatFileSelect() → 지금처럼 state.chatMessages에
//     직접 push하는 게 아니라, STOMP 클라이언트(stomp.js)로 /app/chat/{roomId}에
//     publish한다. 서버(@MessageMapping)가 메시지를 CHAT_MESSAGE에 INSERT한 뒤
//     /topic/room/{roomId} 구독자 전원에게 broadcast하면, 이 방을 보고 있는
//     모든 클라이언트(나 자신 포함)가 그 broadcast를 받아서만 화면에 그린다
//     (지금처럼 "내가 보낸 즉시 로컬에 그리고 저장"하는 낙관적 렌더링 방식이
//     아니라 "서버가 확인해준 것만 그린다" 방식으로 바뀜 — 순서 보장·다른
//     브라우저 탭과의 동기화에 중요). 파일 전송은 먼저 REST로 파일 업로드 후
//     CHAT_ATTACHMENT를 만들고, 그 메시지 자체는 WebSocket으로 알리는 2단계
//     조합이 일반적이다.
//
// [4] isUserOnline() → 기획서 3.4/9장에 따르면 "온라인 상태는 근태 기록
//     (출근중/퇴근) 기반으로 표시"하기로 확정됐으므로, 지금처럼
//     getAttendanceRecord()로 판단하는 로직 자체는 그대로 유지 가능 —
//     다만 데이터 출처만 서버 API 응답으로 바뀐다.
//
// [5] startDirectChat()/createGroupChat() → POST /chat/room (body: 참여자
//     id 목록)으로 교체. 서버는 "1명이면 기존 DM방 재사용(없으면 생성),
//     2명 이상이면 새 GROUP방 생성"을 판단해서 ROOM_ID를 응답한다(지금
//     클라이언트의 find-or-create 로직을 서버로 그대로 옮기면 됨).
//
// [6] openInviteChatModal()~createInvitedGroupChat() (대화 초대로 새 그룹방
//     개설) → 기획서 5장 URL 목록에는 별도 엔드포인트가 없다 — POST /chat/room
//     재사용(참여자 목록에 기존 방 멤버 + 신규 초대자를 합쳐서 요청)으로 처리
//     가능한지, 아니면 "기존 방에 인원 추가" API를 새로 만들지 팀 논의 필요
//     (아래 질문 목록 참고). 시스템 메시지("OOO님이 초대되어...")는 서버가
//     방 생성 시 CHAT_MESSAGE(MESSAGE_TYPE='SYSTEM', SENDER_ID=NULL)로 직접 생성.
//
// [7] startRenameChatRoom()/saveRenamedChatRoom() (그룹방 이름 변경) →
//     기획서 5장에도 전용 엔드포인트가 없다. PATCH/POST /chat/room/{roomId}
//     같은 엔드포인트 신설이 필요하다(아래 질문 목록 참고).
//
// [8] chat.js 진입 시 "?chatWith=" 쿼리 처리 → org.js의 채팅하기 버튼과
//     짝을 이루는 부분. startDirectChat()이 서버 API 기반으로 바뀌면 그대로
//     동작하므로 이 URL 파라미터 읽는 로직 자체는 유지 가능.
// ===================================================================

let chatSearchQuery = '';                    // 좌측 검색창에 입력한 검색어
const CHAT_DEPTS = ['인사팀', '기획팀', '개발팀', '디자인팀', '총무팀'];
let newChatViewDept = 'all';                 // [새 대화 모달] 좌측에서 선택 중인 부서 필터
let newChatSelectedUserIds = new Set();      // [새 대화 모달] 체크한 상대방 id들
let inviteViewDept = 'all';                  // [초대 모달] 좌측에서 선택 중인 부서 필터
let inviteSelectedUserIds = new Set();       // [초대 모달] 체크한 초대 대상 id들

// -----------------------------------------------------------
// 유틸리티
// -----------------------------------------------------------

// id로 채팅방 객체 하나를 찾는다.
function getChatRoom(roomId) {
  return state.chatRooms.find(r => r.id === roomId);
}

// 특정 방의 메시지를 전부 가져와 오래된 순(id 오름차순)으로 정렬한다.
function getChatMessages(roomId) {
  return state.chatMessages.filter(m => m.roomId === roomId).sort((a, b) => a.id - b.id);
}

// 좌측 목록의 미리보기 문구에 쓸 "가장 최근 메시지" 1건을 가져온다.
// system 메시지(예: "OOO님이 초대되었습니다")는 미리보기에서 제외한다.
function getChatLastMessage(roomId) {
  const msgs = getChatMessages(roomId).filter(m => m.type !== 'system');
  return msgs.length ? msgs[msgs.length - 1] : null;
}

// 이 방에서 "남이 보낸 메시지 중 내가 아직 안 읽은 것"의 개수.
// 좌측 목록의 빨간 안읽음 뱃지 숫자로 쓰인다.
function getChatUnreadCount(roomId) {
  const user = state.currentUser;
  return state.chatMessages.filter(m =>
    m.roomId === roomId && m.senderId && m.senderId !== user.id && !(m.readBy || []).includes(user.id)
  ).length;
}

// 오늘(6월 30일 seed 기준) 근태 기록이 "출근했고 아직 퇴근 전"이면 접속 중으로 간주
// 🔧 백엔드 8단계 — 판단 로직 자체는 그대로 유지(온라인=근태 기반으로 이미 확정).
//    getAttendanceRecord()가 서버 API 기반으로 바뀌면 이 함수는 그대로 동작. (상세: [4])
function isUserOnline(userId) {
  const rec = getAttendanceRecord(userId, 30);
  return !!(rec && rec.checkin && !rec.checkout);
}

// 채팅방 하나를 화면에 어떻게 표시할지(제목/아바타 이니셜/그룹 여부)를
// 계산해 반환한다. 1:1(dm) 방은 "상대방" 기준으로, 그룹방은 방 이름과
// 인원수 기준으로 표시 문구가 달라진다.
function getChatRoomDisplay(room) {
  const user = state.currentUser;
  if (room.type === 'group') {
    return {
      title: `${room.name} (${room.memberIds.length})`,
      avatarLabel: room.name.charAt(0),
      isGroup: true
    };
  }
  const otherId = room.memberIds.find(id => id !== user.id);
  const other = state.users.find(u => u.id === otherId) || { name: '알수없음', position: '', dept: '' };
  return {
    title: `${other.name} ${other.position}`,
    avatarLabel: other.name.charAt(0),
    isGroup: false,
    other
  };
}

// 메시지의 time 값("2026-07-01 14:32")에서 시간 부분만 꺼내
// "오후 2:32" 같은 한국식 12시간제 표기로 바꾼다.
function formatChatTime(dateTimeStr) {
  const timePart = dateTimeStr.split(' ')[1];
  if (!timePart) return '';
  const [h, m] = timePart.split(':').map(Number);
  const period = h < 12 ? '오전' : '오후';
  const h12 = (h % 12) || 12;
  return `${period} ${h12}:${String(m).padStart(2, '0')}`;
}

// 메시지 목록 중간에 나오는 "2026년 7월 1일 수요일" 같은 날짜 구분선 문구를 만든다.
function formatChatDateDivider(dateStr) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
}

// -----------------------------------------------------------
// 채팅방 목록 (좌측 패널)
// -----------------------------------------------------------

// 상단 "전체/개인/그룹" 탭을 클릭하면 실행. 목록 필터 기준을 바꾸고 다시 그린다.
function switchChatFilter(type) {
  state.activeChatFilter = type;
  document.querySelectorAll('.chat-filter-tab').forEach(el => el.classList.remove('active'));
  document.getElementById(`chatFilter-${type}`).classList.add('active');
  renderChatRoomList();
}

// 검색창(대화 상대 또는 대화방 검색)의 keyup에 연결. 입력할 때마다 실시간으로 목록을 필터링한다.
function searchChatRooms(val) {
  chatSearchQuery = val;
  renderChatRoomList();
}

// 좌측 대화방 목록(#chatRoomList)을 그린다. 내가 속한 방만, 선택된
// 탭(전체/개인/그룹)과 검색어로 필터링한 뒤, 최근 메시지가 있는 순서로 정렬한다.
// 🔧 백엔드 8단계 — GET /chat 응답(방 목록+마지막 메시지+안읽음 수 포함)을 그대로
//    그린다. getChatUnreadCount()의 전량 순회는 삭제, 서버가 읽음 커서로 집계. (상세: [1])
function renderChatRoomList() {
  const user = state.currentUser;
  let rooms = state.chatRooms.filter(r => r.memberIds.includes(user.id));

  if (state.activeChatFilter === 'dm') rooms = rooms.filter(r => r.type === 'dm');
  if (state.activeChatFilter === 'group') rooms = rooms.filter(r => r.type === 'group');

  if (chatSearchQuery) {
    rooms = rooms.filter(r => getChatRoomDisplay(r).title.toLowerCase().includes(chatSearchQuery.toLowerCase()));
  }

  rooms = [...rooms].sort((a, b) => {
    const at = getChatLastMessage(a.id);
    const bt = getChatLastMessage(b.id);
    return (bt ? bt.time : '').localeCompare(at ? at.time : '');
  });

  const html = rooms.map(r => {
    const info = getChatRoomDisplay(r);
    const last = getChatLastMessage(r.id);
    const unread = getChatUnreadCount(r.id);
    const online = !info.isGroup && isUserOnline(info.other.id);

    let previewText = '대화를 시작해보세요';
    if (last) {
      const sender = state.users.find(u => u.id === last.senderId);
      const senderPrefix = (r.type === 'group' && sender) ? `${sender.name}: ` : '';
      previewText = senderPrefix + (last.type === 'file' ? `[파일] ${last.fileName}` : last.content);
    }

    return `
      <div class="chat-room-item ${r.id === state.activeChatRoomId ? 'active' : ''}" onclick="openChatRoom(${r.id})">
        <div class="chat-room-avatar ${info.isGroup ? 'group' : ''}">
          ${info.avatarLabel}
          ${online ? '<span class="chat-online-dot"></span>' : ''}
        </div>
        <div class="chat-room-info">
          <div class="chat-room-name-row">
            <span class="chat-room-name">${info.title}</span>
            <span class="chat-room-time">${last ? formatChatTime(last.time) : ''}</span>
          </div>
          <div class="chat-room-preview-row">
            <span class="chat-room-preview">${previewText}</span>
            ${unread > 0 ? `<span class="chat-room-unread">${unread}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('chatRoomList').innerHTML = html || `
    <div style="text-align:center; color:var(--text-muted); padding:2rem; font-size:0.85rem;">대화방이 없습니다.</div>
  `;
}

// -----------------------------------------------------------
// 채팅방 진입 및 메시지 스레드 (우측 패널)
// -----------------------------------------------------------

// 좌측 목록에서 방을 클릭(혹은 페이지 진입 시 기본 방)하면 실행.
// 이 방을 "현재 보고 있는 방"으로 기억하고, 상대가 보낸 메시지를 전부
// 읽음 처리한 뒤, 헤더/메시지 목록을 다시 그린다.
// 🔧 백엔드 8단계 — GET /chat/room/{roomId}/messages(페이징)로 이전 메시지를 불러온다.
//    메시지별 readBy 추가 로직은 삭제, 대신 "내 LAST_READ_MESSAGE_ID 갱신" 요청 1번. (상세: [2])
function openChatRoom(roomId) {
  const room = getChatRoom(roomId);
  if (!room) return;

  state.activeChatRoomId = roomId;

  // 진입 시 상대가 보낸 메시지를 모두 읽음 처리 (실제 구현에서는 방마다
  // "마지막으로 읽은 메시지 id" 커서 1개만 갱신하면 되지만, 목업에서는
  // 메시지별 readBy 배열에 추가한다)
  getChatMessages(roomId).forEach(m => {
    if (m.senderId && m.senderId !== state.currentUser.id) {
      m.readBy = m.readBy || [];
      if (!m.readBy.includes(state.currentUser.id)) m.readBy.push(state.currentUser.id);
    }
  });
  saveState();

  renderChatRoomList();
  renderChatThreadHeader(room);
  renderChatMessages(room);
  initApplicationHeader();

  document.getElementById('chatMessageInput').focus();
}

// 우측 상단 헤더(상대방/방 이름, 아바타, 접속상태)를 그린다.
// 그룹방일 때만 이름을 클릭해 수정할 수 있게 커서/onclick을 걸어준다.
function renderChatThreadHeader(room) {
  const info = getChatRoomDisplay(room);
  document.getElementById('chatThreadAvatar').innerHTML = `
    ${info.avatarLabel}
    ${(!info.isGroup && isUserOnline(info.other.id)) ? '<span class="chat-online-dot"></span>' : ''}
  `;
  document.getElementById('chatThreadAvatar').className = `chat-room-avatar ${info.isGroup ? 'group' : ''}`;

  const nameEl = document.getElementById('chatThreadName');
  nameEl.innerText = info.title;
  if (info.isGroup) {
    nameEl.style.cursor = 'pointer';
    nameEl.title = '클릭하여 대화방 이름 변경';
    nameEl.onclick = () => startRenameChatRoom(room.id);
  } else {
    nameEl.style.cursor = '';
    nameEl.title = '';
    nameEl.onclick = null;
  }

  document.getElementById('chatThreadStatus').innerText = info.isGroup
    ? `참여자 ${room.memberIds.length}명`
    : `${info.other.dept} · ${isUserOnline(info.other.id) ? '접속 중' : '오프라인'}`;
}

// 그룹 대화방 이름 변경 - 이름을 클릭하면 입력창으로 전환된다
// 🔧 백엔드 8단계 — 입력창 전환 UI는 그대로 유지. 저장은 saveRenamedChatRoom()에서 처리. (상세: [7])
function startRenameChatRoom(roomId) {
  const room = getChatRoom(roomId);
  if (!room || room.type !== 'group') return;

  const nameEl = document.getElementById('chatThreadName');
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'chatThreadNameInput';
  input.className = 'form-control';
  input.style.cssText = 'display:inline-block; width:auto; max-width:260px; font-weight:700; padding:0.2rem 0.5rem;';
  input.value = room.name;

  nameEl.replaceWith(input);
  input.focus();
  input.select();

  // renderChatThreadHeader()는 #chatThreadName의 존재를 전제로 하므로,
  // 저장/취소 전에 입력창을 원래의 div#chatThreadName으로 되돌려 놓아야 한다
  const restoreNameEl = () => {
    const div = document.createElement('div');
    div.id = 'chatThreadName';
    div.style.fontWeight = '700';
    input.replaceWith(div);
  };

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    restoreNameEl();
    saveRenamedChatRoom(roomId, input.value);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish();
    } else if (e.key === 'Escape') {
      finished = true;
      restoreNameEl();
      renderChatThreadHeader(room);
    }
  });
  input.addEventListener('blur', finish);
}

// 🔧 백엔드 8단계 — POST /chat/room/{roomId}/name 으로 교체(참여자 본인만 가능하도록 서버 재검증). (상세: [7])
function saveRenamedChatRoom(roomId, newName) {
  const room = getChatRoom(roomId);
  const trimmed = newName.trim();

  if (!trimmed) {
    showToast('대화방 이름을 입력해주세요.', 'danger');
    renderChatThreadHeader(room);
    return;
  }

  room.name = trimmed;
  saveState();
  renderChatThreadHeader(room);
  renderChatRoomList();
  showToast('대화방 이름이 변경되었습니다.', 'success');
}

// 우측 메시지 목록(#chatMessageList) 전체를 다시 그린다. 날짜가 바뀔
// 때마다 구분선을 넣고, 내가 보낸 말풍선은 오른쪽(chat-row out)에,
// 상대가 보낸 말풍선은 왼쪽(chat-row in)에 배치한다.
// 🔧 백엔드 8단계 — 서버가 내려준 메시지 목록(HTTP 초기 로드분 + WebSocket 실시간 수신분)을
//    그대로 그린다. isReadByAll() 판정도 커서 값 기준으로 재계산. (상세: [2][3])
function renderChatMessages(room) {
  const user = state.currentUser;
  const msgs = getChatMessages(room.id);

  let html = '';
  let lastDate = null;

  msgs.forEach(m => {
    const dateStr = m.time.split(' ')[0];
    if (dateStr !== lastDate) {
      html += `<div class="chat-date-divider"><span>${formatChatDateDivider(dateStr)}</span></div>`;
      lastDate = dateStr;
    }

    if (m.type === 'system') {
      html += `<div class="chat-system-message">— ${m.content} —</div>`;
      return;
    }

    const isMine = m.senderId === user.id;
    const sender = state.users.find(u => u.id === m.senderId) || { name: '알수없음', position: '' };
    const rowClass = isMine ? 'chat-row out' : 'chat-row in';

    // 그룹방에서 내가 보낸 메시지는 "전체 읽음"일 때만 읽음 표시,
    // 1:1방은 상대 한 명만 읽으면 바로 읽음 표시
    const otherMemberIds = room.memberIds.filter(id => id !== m.senderId);
    const isReadByAll = otherMemberIds.length > 0 && otherMemberIds.every(id => (m.readBy || []).includes(id));

    const bubbleInner = m.type === 'file'
      ? `<div class="chat-bubble-file"><i class="fa-solid fa-file-arrow-down" style="color:var(--color-primary);"></i> <div><div style="font-weight:600;">${m.fileName}</div><div style="color:var(--text-muted); font-size:0.75rem;">${m.fileSize}</div></div></div>`
      : `<div class="chat-bubble">${m.content}</div>`;

    html += `
      <div class="${rowClass}">
        <div class="chat-room-avatar">${sender.name.charAt(0)}</div>
        <div class="chat-bubble-col">
          ${!isMine ? `<span class="chat-sender-name">${sender.name} ${sender.position}</span>` : ''}
          <div class="chat-bubble-meta">
            ${bubbleInner}
            <div style="display:flex; flex-direction:column; align-items:${isMine ? 'flex-end' : 'flex-start'}; gap:0.15rem;">
              ${isMine && isReadByAll ? '<span class="chat-bubble-read">읽음</span>' : ''}
              <span class="chat-bubble-time">${formatChatTime(m.time)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  });

  // 데모용 타이핑 인디케이터: 1번 방(김우주 팀장 DM)을 열었을 때만 보여준다.
  if (room.id === 1) {
    const other = state.users.find(u => u.id === room.memberIds.find(id => id !== user.id));
    html += `
      <div class="chat-row in">
        <div class="chat-room-avatar">${other.name.charAt(0)}</div>
        <div class="chat-bubble-col">
          <span class="chat-sender-name">${other.name} ${other.position}</span>
          <div class="chat-typing"><span></span><span></span><span></span></div>
        </div>
      </div>
    `;
  }

  const container = document.getElementById('chatMessageList');
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

// 하단 메시지 입력창의 폼 submit(전송 버튼/Enter)에 연결.
// 텍스트 메시지 1건을 현재 방에 추가한다.
// 🔧 백엔드 8단계 — state.chatMessages.push() 삭제. STOMP로 /app/chat/{roomId}에 publish하고,
//    /topic/room/{roomId} broadcast를 받은 뒤에만 화면에 그린다(낙관적 렌더링 금지). (상세: [3])
function sendChatMessage(event) {
  event.preventDefault();
  const input = document.getElementById('chatMessageInput');
  const content = input.value.trim();
  if (!content) return;

  const room = getChatRoom(state.activeChatRoomId);
  const newId = state.chatMessages.length ? Math.max(...state.chatMessages.map(m => m.id)) + 1 : 1;
  const now = new Date();
  const timeStr = now.toISOString().split('T')[0] + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  state.chatMessages.push({
    id: newId,
    roomId: room.id,
    senderId: state.currentUser.id,
    type: 'text',
    content,
    time: timeStr,
    readBy: []
  });

  input.value = '';
  saveState();
  renderChatRoomList();
  renderChatMessages(room);
}

// 파일 첨부 버튼(클립 아이콘) → 숨겨진 <input type=file>에서 파일을
// 고르면 실행. 실제 업로드는 없고, 파일명/용량 정보만 'file' 타입
// 메시지로 저장하는 가짜(mock) 동작이다.
// 🔧 백엔드 8단계 — REST로 파일 먼저 업로드(CHAT_ATTACHMENT 생성) 후, 메시지 자체는
//    WebSocket으로 알리는 2단계 조합으로 교체. (상세: [3])
function handleChatFileSelect(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const room = getChatRoom(state.activeChatRoomId);
  const newId = state.chatMessages.length ? Math.max(...state.chatMessages.map(m => m.id)) + 1 : 1;
  const now = new Date();
  const timeStr = now.toISOString().split('T')[0] + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const sizeStr = file.size < 1024 * 1024
    ? (file.size / 1024).toFixed(1) + ' KB'
    : (file.size / (1024 * 1024)).toFixed(1) + ' MB';

  state.chatMessages.push({
    id: newId,
    roomId: room.id,
    senderId: state.currentUser.id,
    type: 'file',
    content: null,
    fileName: file.name,
    fileSize: sizeStr,
    time: timeStr,
    readBy: []
  });

  input.value = '';
  saveState();
  renderChatRoomList();
  renderChatMessages(room);
}

// -----------------------------------------------------------
// 새 대화 시작 - 부서 선택 후 직원 선택 (org.js / approval.js의 조직도 피커와 동일한 패턴)
// 좌측 상단 연필 아이콘 버튼을 누르면 이 모달이 열린다.
// 1명만 체크하면 1:1 대화, 2명 이상 체크하면 그룹 대화로 시작된다.
// -----------------------------------------------------------

// 모달을 열면서 이전 선택 상태를 초기화하고 부서 트리/직원 표를 그린다.
function openNewChatModal() {
  newChatViewDept = 'all';
  newChatSelectedUserIds = new Set();
  renderNewChatDeptTree();
  renderNewChatMemberList();
  openModal('modal-new-chat');
}

// 모달 좌측의 부서 트리(전체보기 + 부서 목록)를 그린다.
function renderNewChatDeptTree() {
  let html = `<li><a class="org-node ${newChatViewDept === 'all' ? 'active' : ''}" id="newChatDeptNode-all" onclick="filterNewChatDept('all')"><i class="fa-solid fa-building"></i> 전체보기</a></li>`;
  html += CHAT_DEPTS.map(dept => `
    <li style="margin-left: 0.75rem;">
      <a class="org-node ${newChatViewDept === dept ? 'active' : ''}" id="newChatDeptNode-${dept}" onclick="filterNewChatDept('${dept}')">${dept}</a>
    </li>
  `).join('');
  document.getElementById('newChatDeptTree').innerHTML = html;
}

// 부서 트리에서 부서를 클릭하면 실행. 우측 직원 표를 그 부서 기준으로 필터링한다.
function filterNewChatDept(dept) {
  newChatViewDept = dept;
  renderNewChatDeptTree();
  renderNewChatMemberList();
}

// 직원 표의 체크박스를 클릭하면 실행. 선택된 대화 상대 목록(Set)에 추가/제거한다.
function toggleNewChatUser(userId, checked) {
  if (checked) newChatSelectedUserIds.add(userId);
  else newChatSelectedUserIds.delete(userId);
}

// 모달 우측의 직원 표를 그린다. 나 자신과 정지된 계정은 목록에서 제외한다.
function renderNewChatMemberList() {
  const user = state.currentUser;
  const filtered = state.users
    .filter(u => u.id !== user.id && u.status === '정상')
    .filter(u => newChatViewDept === 'all' || u.dept === newChatViewDept);

  const html = filtered.map(u => `
    <tr>
      <td style="text-align:center;"><input type="checkbox" ${newChatSelectedUserIds.has(u.id) ? 'checked' : ''} onchange="toggleNewChatUser('${u.id}', this.checked)"></td>
      <td><strong>${u.name}</strong></td>
      <td>${u.dept}</td>
      <td><span class="badge badge-primary">${u.position}</span></td>
      <td>${isUserOnline(u.id) ? '<span class="badge badge-success">접속 중</span>' : '<span class="badge badge-muted">오프라인</span>'}</td>
    </tr>
  `).join('');

  document.getElementById('newChatMemberTableBody').innerHTML = html.length ? html : `
    <tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">해당 부서에 직원이 없습니다.</td></tr>
  `;
}

// "대화 시작" 버튼을 누르면 실행. 체크한 인원 수에 따라 1:1 또는 그룹 대화로 분기한다.
function confirmNewChat() {
  const ids = Array.from(newChatSelectedUserIds);
  if (!ids.length) {
    showToast('대화 상대를 한 명 이상 선택해주세요.', 'danger');
    return;
  }

  if (ids.length === 1) {
    startDirectChat(ids[0]);
  } else {
    createGroupChat(ids);
  }
}

// 상대방 1명과의 1:1(dm) 방을 연다. 이미 그 상대와의 방이 있으면 재사용하고,
// 없을 때만 새로 만든다(같은 상대와 방이 여러 개 생기지 않도록).
// 🔧 백엔드 8단계 — POST /chat/room(참여자 1명)으로 교체. find-or-create 판단은 서버로 이동. (상세: [5])
function startDirectChat(userId) {
  const user = state.currentUser;
  let room = state.chatRooms.find(r =>
    r.type === 'dm' && r.memberIds.includes(user.id) && r.memberIds.includes(userId)
  );

  if (!room) {
    const newId = state.chatRooms.length ? Math.max(...state.chatRooms.map(r => r.id)) + 1 : 1;
    room = { id: newId, type: 'dm', name: null, memberIds: [user.id, userId] };
    state.chatRooms.push(room);
    saveState();
  }

  closeModal();
  openChatRoom(room.id);
}

// 2명 이상을 선택했을 때 실행. 나 + 선택한 인원 전체로 새 그룹방을 만든다.
// 방 이름은 "이름1, 이름2 외 N명 그룹" 형태로 자동 생성한다.
// 🔧 백엔드 8단계 — POST /chat/room(참여자 2명 이상)으로 교체. 방 이름 자동생성 규칙은
//    서버에서 그대로 재사용 가능. (상세: [5])
function createGroupChat(userIds) {
  const user = state.currentUser;
  const memberNames = userIds
    .map(id => state.users.find(u => u.id === id))
    .filter(Boolean)
    .map(u => u.name);

  const newId = state.chatRooms.length ? Math.max(...state.chatRooms.map(r => r.id)) + 1 : 1;
  const room = {
    id: newId,
    type: 'group',
    name: `${memberNames.slice(0, 2).join(', ')} 외 ${Math.max(userIds.length - 2, 0)}명 그룹`.replace(' 외 0명', ''),
    memberIds: [user.id, ...userIds]
  };

  state.chatRooms.push(room);
  saveState();
  closeModal();
  openChatRoom(room.id);
  showToast('새 그룹 대화방이 생성되었습니다.', 'success');
}

// -----------------------------------------------------------
// 대화 초대 - 현재 대화방(1:1 또는 그룹) 참여자 + 신규 초대 인원으로
// 별도의 새 그룹 대화방을 개설한다. 기존 대화방은 그대로 유지된다.
// -----------------------------------------------------------
// 우측 상단 초대 버튼을 누르면 실행. 현재 열려 있는 방(activeChatRoomId)
// 기준으로 모달을 열고 초기화한다.
// 🔧 백엔드 8단계 — 모달 여는 로직 자체는 유지. 실제 생성은 createInvitedGroupChat()에서. (상세: [6])
function openInviteChatModal() {
  const room = getChatRoom(state.activeChatRoomId);
  if (!room) return;

  inviteViewDept = 'all';
  inviteSelectedUserIds = new Set();
  renderInviteDeptTree();
  renderInviteMemberList();
  openModal('modal-invite-chat');
}

function renderInviteDeptTree() {
  let html = `<li><a class="org-node ${inviteViewDept === 'all' ? 'active' : ''}" id="inviteDeptNode-all" onclick="filterInviteDept('all')"><i class="fa-solid fa-building"></i> 전체보기</a></li>`;
  html += CHAT_DEPTS.map(dept => `
    <li style="margin-left: 0.75rem;">
      <a class="org-node ${inviteViewDept === dept ? 'active' : ''}" id="inviteDeptNode-${dept}" onclick="filterInviteDept('${dept}')">${dept}</a>
    </li>
  `).join('');
  document.getElementById('inviteChatDeptTree').innerHTML = html;
}

function filterInviteDept(dept) {
  inviteViewDept = dept;
  renderInviteDeptTree();
  renderInviteMemberList();
}

function toggleInviteUser(userId, checked) {
  if (checked) inviteSelectedUserIds.add(userId);
  else inviteSelectedUserIds.delete(userId);
}

// 모달 우측의 직원 표를 그린다. 이미 이 방에 있는 사람은 또 초대할
// 필요가 없으므로 목록에서 제외한다.
function renderInviteMemberList() {
  const room = getChatRoom(state.activeChatRoomId);
  const filtered = state.users
    .filter(u => !room.memberIds.includes(u.id) && u.status === '정상')
    .filter(u => inviteViewDept === 'all' || u.dept === inviteViewDept);

  const html = filtered.map(u => `
    <tr>
      <td style="text-align:center;"><input type="checkbox" ${inviteSelectedUserIds.has(u.id) ? 'checked' : ''} onchange="toggleInviteUser('${u.id}', this.checked)"></td>
      <td><strong>${u.name}</strong></td>
      <td>${u.dept}</td>
      <td><span class="badge badge-primary">${u.position}</span></td>
      <td>${isUserOnline(u.id) ? '<span class="badge badge-success">접속 중</span>' : '<span class="badge badge-muted">오프라인</span>'}</td>
    </tr>
  `).join('');

  document.getElementById('inviteChatMemberTableBody').innerHTML = html.length ? html : `
    <tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">초대할 수 있는 직원이 없습니다.</td></tr>
  `;
}

// "초대하기" 버튼을 누르면 실행.
function confirmInviteChat() {
  const room = getChatRoom(state.activeChatRoomId);
  const inviteIds = Array.from(inviteSelectedUserIds);

  if (!inviteIds.length) {
    showToast('초대할 사원을 한 명 이상 선택해주세요.', 'danger');
    return;
  }

  createInvitedGroupChat(room, inviteIds);
}

// 실제로 새 그룹방을 만드는 함수. sourceRoom(초대를 시작한 원래 방)의
// 멤버 전체 + 새로 초대한 인원을 합쳐 그룹방을 개설하고, "OOO님이
// 초대되어 대화방이 개설되었습니다" 시스템 메시지를 첫 메시지로 남긴다.
// 주의: sourceRoom 자체는 건드리지 않는다 - 원래 대화방은 그대로 유지된다.
// 🔧 백엔드 8단계 — POST /chat/room/{roomId}/invite 로 교체(기존 방 유지 + 새 그룹방 생성).
//    시스템 메시지는 서버가 방 생성 시 CHAT_MESSAGE(SYSTEM)로 직접 넣는다. (상세: [6])
function createInvitedGroupChat(sourceRoom, inviteIds) {
  const allMemberIds = Array.from(new Set([...sourceRoom.memberIds, ...inviteIds]));
  const memberNames = allMemberIds
    .map(id => state.users.find(u => u.id === id))
    .filter(Boolean)
    .map(u => u.name);

  const newId = state.chatRooms.length ? Math.max(...state.chatRooms.map(r => r.id)) + 1 : 1;
  const room = {
    id: newId,
    type: 'group',
    name: `${memberNames.slice(0, 2).join(', ')} 외 ${Math.max(memberNames.length - 2, 0)}명 그룹`.replace(' 외 0명', ''),
    memberIds: allMemberIds
  };
  state.chatRooms.push(room);

  const inviteeNames = inviteIds
    .map(id => state.users.find(u => u.id === id))
    .filter(Boolean)
    .map(u => u.name);

  const newMsgId = state.chatMessages.length ? Math.max(...state.chatMessages.map(m => m.id)) + 1 : 1;
  const now = new Date();
  const timeStr = now.toISOString().split('T')[0] + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  state.chatMessages.push({
    id: newMsgId,
    roomId: room.id,
    senderId: null,
    type: 'system',
    content: `${inviteeNames.join(', ')}님이 초대되어 대화방이 개설되었습니다.`,
    time: timeStr,
    readBy: []
  });

  saveState();
  closeModal();
  openChatRoom(room.id);
  showToast('새 그룹 대화방이 개설되었습니다.', 'success');
}

// 초기화 - 채팅 화면이 열리면 실행된다.
// 🔧 백엔드 8단계 — ?chatWith= 쿼리 읽는 로직은 그대로 유지, startDirectChat()이
//    서버 API 기반으로 바뀌면 자동으로 함께 동작한다. (상세: [8])
window.addEventListener('DOMContentLoaded', () => {
  if (!initPage('chat')) return;

  switchChatFilter('all');

  // org.html의 "채팅 보내기"는 ?chatWith=<userId> 로 상대를 넘겨준다.
  // 이 값이 있으면 그 사람과의 1:1 대화방을 바로 열어준다.
  const chatWith = new URLSearchParams(window.location.search).get('chatWith');
  if (chatWith) {
    startDirectChat(chatWith);
    return;
  }

  // 그 외에는 마지막으로 보고 있던 방(activeChatRoomId), 없으면 첫 번째 방을 연다.
  openChatRoom(state.activeChatRoomId || state.chatRooms[0].id);
});
