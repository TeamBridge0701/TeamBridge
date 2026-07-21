// 현재 WebSocket 연결 객체를 저장한다.
let stompClient = null;

// 현재 화면에서 선택한 채팅방 번호다.
let currentRoomId = null;

// 현재 로그인한 직원 번호다.
// 내 메시지와 상대 메시지를 좌우로 구분할 때 사용한다.
let currentEmployeeId = null;

// DM/GROUP에 따라 메시지 옆 읽음 표시 규칙이 달라진다.
let currentRoomType = null;

// 입력 중 알림은 짧은 시간만 유지한다. 직원별 타이머를 따로 두어 여러 명도 처리한다.
const typingRemoveTimers = new Map();
let typingStopTimer = null;
let lastTypingSentAt = 0;

// 방 목록 검색어와 DM/GROUP 필터 상태를 함께 관리한다.
const roomFilterState = {
  keyword: "",
  type: "all"
};


// 채팅 목록 시간 변경 

function formatRelativeRoomTime(sentAt) {
  if (!sentAt) {
    return "";
  }

  // MySQL 시간 문자열 "2026-07-21 14:30:00"을
  // JavaScript가 읽기 쉬운 "2026-07-21T14:30:00"으로 바꾼다.
  const sentDate = new Date(sentAt.replace(" ", "T"));

  if (Number.isNaN(sentDate.getTime())) {
    return "";
  }

  const now = new Date();

  // 시간 차이가 아니라 날짜 차이로 계산.
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const sentDayStart = new Date(
    sentDate.getFullYear(),
    sentDate.getMonth(),
    sentDate.getDate()
  );

  // 오늘 날짜와 메시지를 보낸 날짜의 일수 차이를 계산하는 코드.
  const dayDiff = Math.floor( // 소수점이 생겨도 버리고 정수만 남김
    (todayStart - sentDayStart) / (1000 * 60 * 60 * 24) 
	// 오늘 날짜와 메시지를 보낸 날짜의 일수 차이를 계산하는 코드
  );

  // 오늘 보낸 메시지면 시:분만 표시한다.
  if (dayDiff <= 0) {
    const hour = String(sentDate.getHours()).padStart(2, "0");
	// 숫자 9를 문자열 "9"로 바꿈
	// 문자열 길이가 2보다 짧으면 앞에 "0"을 붙임   --> 09시 14시 이렇게 
    const minute = String(sentDate.getMinutes()).padStart(2, "0");

    return `${hour}:${minute}`;
  }

  // 하루 전이면 어제라고 표시한다.
  if (dayDiff === 1) {
    return "어제";
  }

  // 2일 전부터 7일 전까지는 N일전으로 표시한다.
  if (dayDiff <= 7) {
    return `${dayDiff}일전`;
  }

  // 8일 전부터는 N주전으로 표시한다.
  return `${Math.floor(dayDiff / 7)}주전`;
}



// 페이지가 HTML을 모두 읽은 뒤 한 번 실행한다.
document.addEventListener("DOMContentLoaded", () => {
	// HTML 문서가 전부 만들어진 뒤에 안쪽 코드를 실행 
	
  const chatMain = document.getElementById("chatMain");
  // HTML에서 id="chatMain"인 요소를 찾아서 chatMain 변수에 저장

  // /chat으로 들어온 경우 chatMain은 있어도 roomId는 비어 있다.
  if (chatMain) {
	// html 요소 
	// 채팅방이 선택되지 않았거나 해당 요소가 없을 때 오류가 나는 것을 막는다
	
    const roomIdValue = chatMain.dataset.currentRoomId;
    currentRoomId = roomIdValue ? Number(roomIdValue) : null;

    currentEmployeeId = Number(
      chatMain.dataset.currentEmployeeId
	  // html에서 값을 가져와 data-current-employee-id="1001" 이렇게 숫자로 변경 
    );
    currentRoomType = chatMain.dataset.currentRoomType || null;  // 앞의 값 없으면 null 사용
  }


  
  // 채팅방을 열었을 때 채팅방 목록을 상대 시간으로 바꾸는 코드 
  document.querySelectorAll(".chat-room-time[data-sent-at]")
    .forEach(timeElement => {
      timeElement.textContent = formatRelativeRoomTime(
        timeElement.dataset.sentAt
      );
    });
  

  // 읽지 않은 개수 표시하는 뱃지 새로 고침
  refreshUnreadBadges();
  

  // 채팅방 목록도 실시간으로 갱신해야 하므로 /chat 첫 화면에서도 연결한다.
  connectWebSocket();

  // 기존 메시지는 Thymeleaf가 이미 날짜·시간까지 출력한다.
  
  // 현재 선택한 채팅방 있는지 확인 
  if (currentRoomId) {
    scrollMessagesToBottom(); // 메세지 가장 아래로 내림 -> 채팅방 들어왔을 때 가장 최신 메세지가 보이게 함
  }

  // 새 대화와 초대 모달은 같은 부서별 직원 필터를 사용한다.
  // 첫 번째 인수는 부서 목록 ul의 id, 두 번째 인수는 직원 행 tbody의 id다.
  setupMemberPicker("newChatDeptTree", "newChatMemberTableBody");
  setupMemberPicker("inviteChatDeptTree", "inviteChatMemberTableBody");
  setupTypingInput();
});

// SockJS로 서버의 /ws-stomp에 연결하고 현재 방을 구독한다. 
// 쓰는 이유  ---> 브라우저나 네트워크 환경에서 일반 WebSocket 연결이 안 될 때도 대체 방식으로 연결을 유지하기 위해
function connectWebSocket() {
  // SockJS 또는 Stomp CDN 파일을 읽지 못했으면 연결하지 않는다.
  if (typeof SockJS === "undefined" || typeof Stomp === "undefined") {
    showToast("실시간 채팅 라이브러리를 불러오지 못했습니다.", "danger");
    return;
  }

  // WebSocketConfig의 registerStompEndpoints()에 등록한 주소다.
  const socket = new SockJS("/ws-stomp");

  // SockJS 연결을 STOMP 방식으로 사용한다.
  stompClient = Stomp.over(socket);
  
  // SockJS 
  // → 서버와 연결을 만든다
  // → WebSocket이 안 되는 환경도 대응한다

  // STOMP
  // → 연결된 상태에서 메시지를 어디로 보내고,
  //   어떤 주소를 구독할지 관리한다 (목적지 구분)
  
  

  // 브라우저 콘솔에 STOMP 통신 로그가 너무 많이 쌓이지 않게 한다.
  stompClient.debug = null;

  stompClient.connect(
    {},

    // 서버 연결 성공 시 실행된다.
    () => {
		
	  // 내 채팅방 목록이 변경됐다는 실시간 알림을 받는 구독 코드
      stompClient.subscribe("/user/queue/chat-rooms", (frame) => {
	  // STOMP WebSocket에서 특정 주소를 구독하겠다는 뜻
        updateChatRoomList(JSON.parse(frame.body));
		// frame.body의 JSON 문자열을 자바 스크립트 객체로 바꾼 뒤, 채팅방 목록을 갱신
        refreshUnreadBadges();
		// 안읽은 메세지 뱃지 갱신
      });

      // 현재 선택한 방이 있을 때만 메시지와 읽음 이벤트를 구독한다.
      if (currentRoomId) {
        const topic = `/topic/room/${currentRoomId}`;

        stompClient.subscribe(topic, (frame) => {
          // ChatMessageController가 방송한 JSON 문자열을 객체로 바꾼다.
          const message = JSON.parse(frame.body);
		  // 서버에서 받은 JSON 문자열을 JavaScript 객체로 바꾼다
          appendMessage(message);
		  // 받은 메시지를 현재 대화창에 추가하는 함수이다. 
        });

		// 현재 채팅방의 읽음 이벤트 주소를 구독한다.
        stompClient.subscribe(`${topic}/read`, (frame) => {
			
		// 서버가 보낸 읽음 정보를 JavaScript 객체로 바꾼 뒤 applyReadEvent()를 실행.
          applyReadEvent(JSON.parse(frame.body));
        });

		// 현재 채팅방의 입력 중 이벤트 주소를 구독.
        stompClient.subscribe(`${topic}/typing`, (frame) => {
		
		// 서버가 보낸 입력 중 정보를 객체로 바꾼 뒤 applyTypingEvent()를 실행함 
          applyTypingEvent(JSON.parse(frame.body));
        });

        // 화면에 이미 출력된 메시지까지 읽은 것으로 서버에 반영한다.
        sendReadMessage();
      }
    },

    // 연결 실패 시 실행된다.
    () => {
      showToast("실시간 채팅 연결에 실패했습니다.", "danger");
    }
  );
}

// 입력창에서 전송 버튼 또는 Enter로 호출된다.
// chat.html의 onsubmit="sendChatMessage(event)"와 연결된다.
// 사용자가 메시지 전송 버튼을 누르거나 입력 폼을 제출했을 때 실행됨 
function sendChatMessage(event) {
	
	// 폼의 기본동작 (새로고침)을 막는다 - 채팅은 새로고침이 아닌 websocket으로 보내야 하므로 막아야 한다.
  event.preventDefault();

  const input = document.getElementById("chatMessageInput");

  if (!input || !currentRoomId) { // 두 값 중 하나라도 없으면 함수를 끝낸다
    return;
  }

  const content = input.value.trim();

  if (!content) { // 비었는지 확인, 자바는 빈 문자열 ""를 거짓으로 처리한다 
    showToast("메시지 내용을 입력해주세요.", "warning");
    input.focus(); // 메시지 입력창에 다시 커서를 둔다 
    return;
  }

  // 서버에 아직 연결되지 않았으면 메시지를 보내지 않는다.
  if (!stompClient || !stompClient.connected) {
    showToast("실시간 채팅 서버에 연결되지 않았습니다.", "danger");
    return;
  }

  // WebSocket 메시지에는 내용만 보낸다.
  // roomId는 주소에서, senderId는 로그인 정보에서 서버가 직접 결정한다.
  stompClient.send(
    `/app/chat/${currentRoomId}`,
    {}, 
	// 	STOMP 헤더 정보 자리.
	// 지금은 추가로 보낼 헤더가 없어서 빈 객체를 넣는다 
	
	// 메시지 내용을 JSON 문자열로 바꿔서 보냄
    JSON.stringify({
      content: content
    })
  );

  // 화면에는 직접 말풍선을 추가하지 않는다.
  // 서버가 DB 저장 후 방송하면 subscribe()가 appendMessage()를 호출한다.
  input.value = "";
  // 메시지 전송 요청을 보낸 뒤 입력창을 비운다 
  
  sendTypingState(false); // ----> 님이 입력 중이라는 문구를 삭제하는 코드 
}

// 입력창에 글자가 들어올 때만 제한된 간격으로 입력 중 상태를 보낸다.
function setupTypingInput() {
  const input = document.getElementById("chatMessageInput");

  if (!input) {
    return;
  }

  // 메시지 입력창의 값이 바뀔 때마다 안쪽 코드를 실행
  input.addEventListener("input", () => {
    if (!input.value.trim()) {
      sendTypingState(false); // 입력 중 아님 보냄 
      return;
    }

    const now = Date.now(); 
	// 현재 시간을 밀리초 숫자로 가져온다 

    if (now - lastTypingSentAt > 600) {
		// 마지막으로 입력 중 이벤트를 보낸 시점에서 600밀리초 (0.6초) 가 지났는지 확인
      sendTypingState(true); // 상대에게 지금 입력 중 이라고 보냄 
      lastTypingSentAt = now; // 방금 입력 중 이벤트를 보낸 시간을 저장함 
	  // 다음 0.6초 동안은 typing : true를 보내지 않는다 
    }

    clearTimeout(typingStopTimer);
	// 기존에 예약되어 있던 입력 중 해제 타이머를 취소.
	// 사용자가 계속 입력 중이라면, 이전 타이머가 먼저 실행되어 입력 중 표시가 사라지면 안 되기 때문에 넣음.
    typingStopTimer = setTimeout(() => sendTypingState(false), 1200);
	// (1200) 1.2초 동안 추가 작업이 없으면 sendTypingState(false) 를 실행하도록 예약함.
  });
}

// true/false 상태만 보내며 실제 입력 내용은 WebSocket으로 보내지 않는다.
// 상대방은 “입력 중”이라는 사실만 알고, 전송 전 메시지 내용은 볼 수 없다.
function sendTypingState(typing) {
  if (!currentRoomId || !stompClient || !stompClient.connected) {
	// 선택된 채팅방 	   	 웹소켓 객체		 웹소켓 서버 연결
    return;
  }

  // STOMP WebSocket으로 서버에 입력 중 상태를 보냄 
  stompClient.send(
    `/app/chat/${currentRoomId}/typing`,
    {},
    JSON.stringify({ typing: typing })
  );
}

// 파일은 WebSocket JSON이 아니라 HTTP multipart로 서버에 올린다.
// 파일 전송 함수
async function sendChatFile(fileInput) {
// async - 서버 응답을 기다리는 await를 사용할 수 있게 해 주는 문법.
  const file = fileInput.files[0];
// 사용자가 선택한 첫번째 파일
  
  if (!file || !currentRoomId) {
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    showToast("파일은 10MB 이하로 전송해주세요.", "warning");
    fileInput.value = ""; // 선택된 파일을 지운다
						  // 같은 파일을 다시 선택해도 change 이벤트가 다시 발생하게 하려는 목적도 있음
						  // change 이벤트 - 파일 선택 시 input이 변경됨 
    return;
  }

  // 파일을 서버로 전송할 수 있는 FormData 객체를 만든다
  const formData = new FormData();
  // file 이라는 이름으로 formdata에 넣는다
  formData.append("file", file);

  try {
	// 현재 채팅방의 파일 업로드 주소로 POST 요청을 보냄 
    const response = await fetch(`/chat/room/${currentRoomId}/file`, {
      method: "POST",
      body: formData
	  // 업로드할 파일을 요청 본문에 담는다는 뜻
    });
    const result = await response.json();
	// 서버의 응답 JSON을 JavaScript 객체로 바꿈 
	// (성공하면 저장된 파일 메시지 정보가 오고, 실패하면 오류 메시지가 올 수 있다 )
	
	// HTTP 응답 상태가 성공 범위인지 확인.
    if (!response.ok) {		
      throw new Error(result.message || "파일을 전송하지 못했습니다.");
    }

    // 말풍선은 HTTP 응답으로 직접 넣지 않고 서버 broadcast를 받아 추가한다.
    fileInput.value = "";
  } catch (error) {
    showToast(error.message, "danger");
    fileInput.value = "";
	// 오류가 나도 선택된 파일 값을 지워서, 다시 파일을 선택해 재시도할 수 있게 한다
  }
}

// 현재 방의 마지막 메시지까지 읽었다는 STOMP 이벤트를 서버로 보낸다.
// 읽음 처리 요청을 보내는 함수 
function sendReadMessage() {
  if (!currentRoomId || !stompClient || !stompClient.connected) {
    return;
  }

  // 현재 채팅방의 읽음 처리 주소로 WebSocket 메시지를 보냄 
  stompClient.send(`/app/chat/${currentRoomId}/read`, {}, "{}");
}

// 다른 참여자가 이번에 새로 읽은 구간만 내 메시지의 안 읽은 인원 수에서 한 명씩 뺀다.
// 다른 참여자의 읽음 이벤트를 받았을 때 화면에 반영하는 함수.
// readEvent에는 서버가 보낸 읽음 정보가 들어 있다 
function applyReadEvent(readEvent) {
  if (Number(readEvent.readerId) === currentEmployeeId) {
	// 읽음 이벤트를 발생시킨 사람이 나 자신인지 확인.
    refreshUnreadBadges();
    return;
  }

  // 상대방이 이전에 마지막으로 읽었던 메시지 번호를 숫자로 저장
  const previousLastReadMessageId = Number(
	// 	값이 없으면 0을 사용하라는 뜻.
	//  ex) 처음 읽는 사람이라 이전 값이 없으면 : 0
    readEvent.previousLastReadMessageId || 0
  );
  
  // 상대방이 이번에 새로 읽은 마지막 메시지 번호를 숫자로 저장.
  const lastReadMessageId = Number(readEvent.lastReadMessageId);

  // 화면에서 회원이 보낸 메시지 행을 모두 찾음 
  document.querySelectorAll(".chat-row.out[data-message-id]")
    .forEach(row => { // 찾은 메세지 행을 하나씩 반복 처리 
      const messageId = Number(row.dataset.messageId);
	  // 현재 메세지 행의 dataset-message-Id) 값을 가져와서 숫자로 바꾼다

      if (messageId <= previousLastReadMessageId
		// 이미 이전에 읽었던 메시지 -> 다시 줄이면 안 됨
          || messageId > lastReadMessageId) {
		// 이번에도 아직 읽지 않은 메시지 -> 줄이면 안 됨
        return;
      }

	  // 해당 메시지의 안 읽은 참여자 수에서 한 명을 뺀다
      const unreadMemberCount = Math.max(
        0,
        Number(row.dataset.unreadMemberCount || 0) - 1
				// HTML에 저장된 안 읽은 참여자 수
      );

      row.dataset.unreadMemberCount = String(unreadMemberCount);
	  								// HTML dataset 값은 문자열로 저장되므로 String()으로 바꾼다
      renderReadStatus(row, unreadMemberCount);
	  // 새 숫자를 화면에 표시함 
    });
}

// 채팅 화면 헤더와 좌측 메뉴에 로그인 사용자의 전체 안 읽은 메시지 수를 표시한다.
async function refreshUnreadBadges() {
  try {
    const response = await fetch("/chat/unread-count");

    if (!response.ok) {
      return;
    }

    const result = await response.json();
	// 서버에서 받은 안 읽은 메시지 개수를 숫자로 바꿔 unreadCount에 저장.
	// 서버 값이 없으면 0을 사용.
    const unreadCount = Number(result.unreadCount || 0);
	// 화면에 보여줄 안 읽은 개수를 만드는 코드
    const displayCount = unreadCount > 99 ? "99+" : String(unreadCount);
	

    [
      document.getElementById("headerChatBadge"),
      document.getElementById("sidebarChatBadge")
    ].forEach(badge => {
      if (!badge) {
        return;
      }

      badge.textContent = displayCount;
      badge.style.display = unreadCount > 0 ? "inline-flex" : "none";
    });
  } catch (error) {
    // 배지 조회 실패가 채팅 본문 사용을 막지는 않도록 조용히 끝낸다.
  }
}

// 개인방은 1 또는 읽음, 그룹방은 읽지 않은 참여자 수만 표시한다.
// 메시지 한 줄인 row와, 아직 읽지 않은 참여자 수 unreadMemberCount를 받아서 읽음 표시를 갱신
function renderReadStatus(row, unreadMemberCount) {
	// 현재 메시지 행 안에서 시간 표시가 있는 영역을 찾아 timeColumn에 저장.
  const timeColumn = row.querySelector(".chat-bubble-meta > div:last-child");
										// chat-bubble-meta 안의
  										// 바로 아래 div 중
  										// 마지막 div
										// 보통 메시지 시간과 읽음 숫자를 표시하는 위치.
  if (!timeColumn) {
    return;
  }

  // 이미 화면에 읽음 표시용 요소가 있는지 찾는다. 
  // <span class="chat-bubble-read">1</span> 이게 있으면 readLabel에 저장되고, 없으면 null이 들어간다
  let readLabel = timeColumn.querySelector(".chat-bubble-read");
  
  const statusText = currentRoomType === "DM" 
    ? (unreadMemberCount > 0 ? "1" : "읽음") // 개인 채팅에서의 읽음 표시 
    : (unreadMemberCount > 0 ? String(unreadMemberCount) : ""); // 그룹 채팅에서의 읽음 표시

  if (!statusText) {
    readLabel?.remove();  // 다 읽은 경우 라벨을 없앤다.
    return;
  }

  // 기존 읽음 표시 요소가 없으면 새로 만들겠다는 뜻
  if (!readLabel) {
    readLabel = document.createElement("span");
    readLabel.className = "chat-bubble-read";
    timeColumn.prepend(readLabel);// 읽음 표시를 시간 영역의 맨 앞에 넣음
  }

  readLabel.textContent = statusText;
  // 마지막으로 만든 요소 또는 기존 요소 안에 실제 읽음 글자를 넣는다
}



// 다른 참여자가 입력 중이라는 WebSocket 이벤트를 받으면 실행된다.
function applyTypingEvent(typingEvent) {

  // 이벤트를 보낸 사람이 현재 로그인한 나 자신인지 확인
  // 내 입력 중 이벤트는 내 화면에 표시할 필요가 없으므로 종료
  if (Number(typingEvent.senderId) === currentEmployeeId) {
    return;
  }

  // 직원마다 고유한 입력 중 표시 ID를 만든다.
  const indicatorId = `chatTyping-${typingEvent.senderId}`;

  // 이 직원의 입력 중 표시가 화면에 있는지 찾고 없으면 null.
  const currentIndicator = document.getElementById(indicatorId);

  // typing 값이 false이면 상대가 입력을 멈췄다는 뜻.
  if (!typingEvent.typing) {

    // 입력 중 표시가 존재하면 화면에서 제거한
    // ?.는 요소가 null이어도 오류 없이 넘어가게 하는 문법임
    currentIndicator?.remove();
    clearTimeout(typingRemoveTimers.get(typingEvent.senderId));

    // 해당 직원의 타이머 정보를 Map에서 삭제
    typingRemoveTimers.delete(typingEvent.senderId);

    return;
  }

  // typing이 true일 때 사용할 입력 중 표시 요소
  let indicator = currentIndicator;

  // 아직 화면에 입력 중 표시가 없을 때만 새 HTML 요소 만듦
  if (!indicator) {
    indicator = document.createElement("div");
    // 나중에 해당 직원의 표시를 찾고 제거할 수 있도록 고유 ID를 설정한다.
    indicator.id = indicatorId;

    // 상대방이 보낸 메시지처럼 보이도록 CSS 클래스를 넣는다.
    // in: 상대방 메시지 방향
    // chat-typing-row: 입력 중 표시 전용 스타일
    indicator.className = "chat-row in chat-typing-row";

    // 상대방 아바타 영역
    const avatar = document.createElement("div");

    // 기존 채팅방 아바타 스타일을 적용.
    avatar.className = "chat-room-avatar";

    // 상대방 이름이 있으면 이름의 첫 글자를 아바타에 표시한다.
    avatar.textContent = typingEvent.senderName
      ? typingEvent.senderName.charAt(0)
      : "입";

    // 이름과 입력 중 점 애니메이션을 묶을 영역을 만든다.
    const bubbleColumn = document.createElement("div");

    // 메시지 말풍선 세로 배치용 CSS 클래스를 적용
    bubbleColumn.className = "chat-bubble-col";

    // 상대방 이름과 입력 중 문구를 표시할 span
    const senderName = document.createElement("span");

    // 보낸 사람 이름 스타일을 적용
    senderName.className = "chat-sender-name";

    // 상대방 이름이 없으면 “상대방님이 입력 중”으로 표시
    senderName.textContent =
      `${typingEvent.senderName || "상대방"}님이 입력 중`;

    // 점 세 개 표시할 말풍선 div
    const bubble = document.createElement("div");

    // CSS에서 점 애니메이션 스타일을 적용하는 클래스.
    bubble.className = "chat-typing";

    // 입력 중 점 세 개를 만든다.
    bubble.innerHTML = "<span></span><span></span><span></span>";

    // 이름 문구를 말풍선 영역에 넣는다.
    bubbleColumn.appendChild(senderName);
    bubbleColumn.appendChild(bubble);

    // 전체 입력 중 행에 아바타를 넣는다.
    indicator.appendChild(avatar);
    indicator.appendChild(bubbleColumn);

    // 실제 메시지 목록 맨 아래에 입력 중 표시를 추가한다.
    // chatMessageList가 없으면 ?. 때문에 오류 없이 넘어감
    document.getElementById("chatMessageList")
      ?.appendChild(indicator);

    scrollMessagesToBottom();
  }

  // 상대방이 계속 입력하면 기존 자동 제거 타이머를 취소한다.
  clearTimeout(typingRemoveTimers.get(typingEvent.senderId));

  // 1.6초 동안 새 입력 중 이벤트가 없으면 표시를 자동으로 제거하도록 예약.
  typingRemoveTimers.set(
    typingEvent.senderId,
    setTimeout(() => {

      // 해당 직원의 입력 중 표시가 아직 있으면 제거한다.
      document.getElementById(indicatorId)?.remove();
      typingRemoveTimers.delete(typingEvent.senderId);

    }, 1600)
  );
}

// WebSocket으로 받은 채팅방 목록 이벤트를 보고, 어떻게 화면을 갱신할지 결정하는 시작 부분
function updateChatRoomList(roomEvent) {
  if (roomEvent.eventType !== "MESSAGE" || !roomEvent.message) { // 또는 메시지 데이터가 없는지 확인
    // 현재 페이지 새로고침
    window.location.reload();
    return;
  }

  // WebSocket 이벤트 안에 들어 있는 새 메시지 정보를 message 변수에 저장
  const message = roomEvent.message;
  // 새 메시지가 도착한 채팅방의 목록 항목을 화면에서 찾음
  const roomItem = document.querySelector(
    `.chat-room-item[data-room-id="${roomEvent.roomId}"]`
  );

  if (!roomItem) {
    // 현재 목록에 없던 새 방이면 Thymeleaf가 만든 최신 목록을 다시 받는다.
    window.location.reload();
    return;
  }

  // 찾은 채팅방 항목 안에서 마지막 메시지 미리보기 영역을 찾는다 
  const preview = roomItem.querySelector(".chat-room-preview");
  // 채팅방 항목 안에서 메시지 시간을 보여주는 영역을 찾음 
  const time = roomItem.querySelector(".chat-room-time");

  // 메시지 미리보기 영역을 정상적으로 찾았을 때만 안쪽 코드를 실행
  if (preview) {
    preview.textContent = message.messageType === "FILE"
	// 미리보기 영역의 글자를 새 메시지 내용으로 바꾼다 
	// 새 메시지가 파일 메시지인지 확인.
      ? `[파일] ${message.attachment?.fileName || "파일"}`
	  // 파일 메시지라면 미리보기를 회의자료.pdf 이런 식으로 만든다
	  // 첨부파일 정보와 파일명이 있을 때 파일명을 가져옴.
	  // ?.는 첨부파일 정보가 없어도 오류가 나지 않게 해.
	  // 파일명이 없으면 기본 글자인 파일을 사용
      : message.content;
	  // 파일 메세지가 아니라면 일반 텍스트 메세지 내용을 그대로 미리보기에 표시
  }

  // 채팅방 목록에서 시간 표시 영역을 찾았을 때만 실행
  if (time) {
    time.dataset.sentAt = message.sentAt || "";
    time.textContent = formatRelativeRoomTime(message.sentAt);
  }

  // 현재 열지 않은 방에서 상대가 보낸 메시지일 때만 목록 뱃지를 하나 올린다.
  if (Number(roomEvent.roomId) !== currentRoomId // 새 메시지가 온 방이 현재 내가 보고 있는 방이 아닌지 확인
      && Number(message.senderId) !== currentEmployeeId) { // 내가 아닌지 확인 - 내가 보낸거라면 안 읽은거로 세면 안되니 배지를 올리지 않음.
		// 현재 채팅방 목록 항목 안에서 안 읽은 숫자 배지를 찾아.
    let unread = roomItem.querySelector(".chat-room-unread");

	// 아직 안 읽은 메시지 배지가 화면에 없으면 실행.
    if (!unread) {
      unread = document.createElement("span"); // 스판 태그 만든다 
      unread.className = "chat-room-unread"; // 안 읽은 메시지 배지 스타일을 적용할 CSS 클래스 이름을 넣는다
      roomItem.querySelector(".chat-room-preview-row")?.appendChild(unread);
	  // 채팅방 목록에서 마지막 메시지 미리보기 영역을 찾아서, 방금 만든 배지를 그 안에 추가.
    }

    unread.textContent = String(Number(unread.textContent || 0) + 1);
	// 현재 배지 숫자에 1을 더함
  }
	// 새 메시지가 온 채팅방 항목을 채팅방 목록의 맨 위로 이동시킴
  document.getElementById("chatRoomList")?.prepend(roomItem);
  //   prepend() - 요소를 부모 영역의 맨 앞에 넣는 함수야.
}

// WebSocket으로 받은 메시지 한 건을 현재 대화창에 추가하는 함수야.
function appendMessage(message) {
	// HTML에서 실제 메시지들이 표시되는 영역을 찾아 messageList에 저장.
  const messageList = document.getElementById("chatMessageList");

  // 메시지 목록 영역을 찾지 못하면 오류를 막기 위해 함수를 끝냄
  if (!messageList) {
    return;
  }

// 메시지 목록 안에 비어 있을 때 보여주는 안내 문구가 있으면 삭제.
  messageList.querySelector(".empty-state")?.remove();

// 새 메시지 날짜가 이전 메시지 날짜와 다르면 날짜 구분선을 추가하는 함수
  appendDateDividerIfNeeded(messageList, message);

  // SYSTEM은 사용자 말풍선·아바타 없이 날짜 구분선과 같은 중앙 위치에 출력한다.
  if (message.messageType === "SYSTEM") {
    const systemRow = document.createElement("div"); // 시스템 메시지를 담을 새 <div> 태그를 만든다
    systemRow.className = "chat-row chat-system-message";
    systemRow.dataset.messageId = message.messageId;
    systemRow.dataset.sentAt = message.sentAt;
    // dataset.sentDateKey는 HTML의 data-sent-date-key 속성이 된다.
    // 실시간 다음 메시지가 왔을 때 날짜가 바뀌었는지 비교하기 위한 화면 내부 데이터다.
    systemRow.dataset.sentDateKey = message.sentDateKey || "";

    const systemText = document.createElement("span");
    systemText.textContent = message.content || "시스템 메시지";

    systemRow.appendChild(systemText);
    messageList.appendChild(systemRow);
    sendReadMessage();
    scrollMessagesToBottom();
    return;
  }

  // 현재 메시지를 보낸 사람이 나인지 확인.
  const isMine = Number(message.senderId) === currentEmployeeId;
  				// 문자열일 수 있는 보낸 사람 ID를 숫자로 바꾼다.

  const row = document.createElement("div");
  row.className = `chat-row ${isMine ? "out" : "in"}`;
  // isMine이 true
  //  → chat-row out
  //  → 내 메시지, 보통 오른쪽 표시

  // isMine이 false
  // → chat-row in
  // → 상대방 메시지, 보통 왼쪽 표시
  
  row.dataset.messageId = message.messageId;
  row.dataset.sentAt = message.sentAt;
  // 서버 SQL이 만든 YYYY-MM-DD 값을 DOM 행에 보관한다.
  row.dataset.sentDateKey = message.sentDateKey || "";
  // 날짜 비교용 값을 data-sent-date-key 속성에 저장.
  // 이 값은 다음 메시지가 도착했을 때 날짜가 바뀌었는지 확인하고 날짜 구분선을 표시하는 데 사용.
  row.dataset.unreadMemberCount = message.unreadMemberCount || 0;
  // 현재 메시지를 아직 읽지 않은 참여자 수를 HTML 속성에 저장.

  // 상대방 메시지일 때만 왼쪽 아바타를 만든다.
  if (!isMine) {
    const avatar = document.createElement("div");
    avatar.className = "chat-room-avatar";
    avatar.textContent = message.senderName
      ? message.senderName.charAt(0)
      : "시"; // 이름이 없으면 기본 글자인 "시"를 표시.

    row.appendChild(avatar); // 만든 아바타를 메시지 행에 추가
  }

  const bubbleColumn = document.createElement("div");
  bubbleColumn.className = "chat-bubble-col";

  // 상대방 메시지일 때만 발신자 이름을 표시한다.
  if (!isMine) {
    const senderName = document.createElement("span");
    senderName.className = "chat-sender-name";
    senderName.textContent = message.senderName || "시스템";

    bubbleColumn.appendChild(senderName);
  }

  const bubbleMeta = document.createElement("div");
  bubbleMeta.className = "chat-bubble-meta";

  const bubble = createMessageBubble(message);

  const timeColumn = document.createElement("div");
  timeColumn.style.display = "flex";
  timeColumn.style.flexDirection = "column";
  timeColumn.style.gap = "0.15rem";
  timeColumn.style.alignItems = isMine
    ? "flex-end"
    : "flex-start";

  const time = document.createElement("span");
  time.className = "chat-bubble-time";
  // Thymeleaf의 기존 메시지와 같은 서버 표시 시간을 새 실시간 메시지에도 사용한다.
  time.textContent = message.displaySentTime || message.sentAt || "";

  timeColumn.appendChild(time);
  bubbleMeta.appendChild(bubble);
  bubbleMeta.appendChild(timeColumn);
  bubbleColumn.appendChild(bubbleMeta);
  row.appendChild(bubbleColumn);

  if (isMine) {
    renderReadStatus(row, Number(message.unreadMemberCount || 0));
  }

  messageList.appendChild(row);

  // 내가 현재 열어 둔 방에서 받은 상대 메시지는 바로 읽음 처리한다.
  if (!isMine) {
    sendReadMessage();
  }

  scrollMessagesToBottom();
}

// TEXT는 말풍선, FILE은 다운로드 링크가 있는 파일 말풍선을 만든다.
function createMessageBubble(message) {
  if (message.messageType === "FILE" && message.attachment) {
    const fileBubble = document.createElement("a");
    fileBubble.className = "chat-bubble-file";
    fileBubble.href = `/chat/attachment/${message.attachment.attachId}`;

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-file-arrow-down";
    icon.style.color = "var(--color-primary)";

    const fileInfo = document.createElement("div");
    const fileName = document.createElement("div");
    fileName.style.fontWeight = "600";
    fileName.textContent = message.attachment.fileName;

    const fileSize = document.createElement("div");
    fileSize.style.color = "var(--text-muted)";
    fileSize.style.fontSize = "0.75rem";
    // 파일 크기 변환은 Service가 끝냈으므로 JS는 문자열을 그대로 출력만 한다.
    fileSize.textContent = message.attachment.displayFileSize || "";

    fileInfo.appendChild(fileName);
    fileInfo.appendChild(fileSize);
    fileBubble.appendChild(icon);
    fileBubble.appendChild(fileInfo);
    return fileBubble;
  }

  const textBubble = document.createElement("div");
  textBubble.className = "chat-bubble";

  // innerHTML 대신 textContent를 사용해 스크립트 문자열 삽입을 막는다.
  textBubble.textContent = message.content;
  return textBubble;
}

// 새 실시간 메시지가 이전 메시지와 다른 날짜면 그 앞에 날짜 구분선을 추가한다.
function appendDateDividerIfNeeded(messageList, message) {
  // querySelectorAll()은 조건에 맞는 DOM 요소들을 NodeList로 반환한다.
  const messageRows = messageList.querySelectorAll(".chat-row");
  // 배열처럼 [길이 - 1]을 사용해 마지막 메시지 행을 가져온다.
  const lastRow = messageRows[messageRows.length - 1];
  // 삼항 연산자 ? : 는 조건이 참이면 앞 값, 거짓이면 뒤 값을 선택한다.
  // 아직 메시지 행이 없으면 비교할 이전 날짜가 없으므로 null을 넣는다.
  const previousDateKey = lastRow
    ? lastRow.dataset.sentDateKey
    : null;
  // 새로 받은 메시지의 날짜 키도 서버가 SQL에서 만든 값이다.
  const currentDateKey = message.sentDateKey;

  // 날짜 키가 있고 이전 날짜와 다를 때만 날짜 구분선을 DOM에 추가한다.
  if (currentDateKey && currentDateKey !== previousDateKey) {
    messageList.appendChild(createDateDivider(message));
  }
}

// 날짜 구분선 DOM 요소를 만든다. 예: 2026년 7월 19일 일요일
function createDateDivider(message) {
  // document.createElement()는 아직 화면에 붙지 않은 새 HTML 요소를 만든다.
  const divider = document.createElement("div");
  divider.className = "chat-date-divider";

  const label = document.createElement("span");
  // 서버의 한글 날짜 문자열을 사용한다. 값이 없을 때는 빈 문자열을 출력한다.
  label.textContent = message.displaySentDate || "";

  divider.appendChild(label);
  return divider;
}

// 메시지 목록을 항상 가장 마지막 메시지 위치로 내린다.
function scrollMessagesToBottom() {
  const messageList = document.getElementById("chatMessageList");

  if (messageList) {
    messageList.scrollTop = messageList.scrollHeight;
  }
}

// 새 대화·초대 모달 모두에서 부서를 누르면 같은 부서 직원만 보이게 한다.
function setupMemberPicker(departmentTreeId, memberTableBodyId) {
  // 매개변수로 받은 id 문자열로 DOM 요소를 한 번만 찾는다.
  const departmentTree = document.getElementById(departmentTreeId);

  if (!departmentTree) {
    // /chat 화면처럼 모달이 없거나 id가 없으면 이후 코드를 실행하지 않는다.
    return;
  }

  departmentTree.addEventListener("click", (event) => {
    // event.target은 실제 클릭된 아이콘·글자일 수 있다.
    // closest()는 그 요소에서 가장 가까운 .org-node 부모 a 태그를 찾는다.
    const departmentNode = event.target.closest(".org-node");

    if (!departmentNode) {
      return;
    }

    // a 태그의 기본 페이지 이동을 막는다.
    event.preventDefault();

    // 백틱(`)은 템플릿 문자열이다. ${...} 자리에 전달받은 id 값이 들어간다.
    document.querySelectorAll(`#${departmentTreeId} .org-node`)
      // forEach()는 찾은 모든 부서 노드를 하나씩 돌며 active 클래스를 지운다.
      .forEach(node => node.classList.remove("active"));

    departmentNode.classList.add("active");
    // 클릭한 부서 id를 다음 함수에 넘겨 같은 부서 직원만 보이게 한다.
    filterMemberPicker(memberTableBodyId, departmentNode.dataset.deptId);
  });
}

// 선택한 부서와 같은 직원 행만 보이게 한다.
function filterMemberPicker(memberTableBodyId, deptId) {
  // tbody 안의 직원 tr을 전부 찾아 부서 조건에 따라 보이거나 숨긴다.
  document.querySelectorAll(`#${memberTableBodyId} tr`)
    .forEach(row => {
      // !deptId는 빈 문자열일 때 true가 되어 전체보기를 뜻한다.
      const isAllDepartments = !deptId;
      const isSameDepartment = row.dataset.deptId === deptId;

      // 조건 ? "" : "none"은 display 값을 선택한다. ""은 원래 CSS 표시 방식이다.
      row.style.display = isAllDepartments || isSameDepartment
        ? ""
        : "none";
    });
}

// 모달을 열기 전 선택 상태를 비우고 전체 직원 목록으로 되돌린다.
function resetMemberPicker(departmentTreeId, memberTableBodyId, checkboxClass) {
  // .${checkboxClass}는 전달받은 클래스로 checkbox 선택자를 동적으로 만든다.
  document.querySelectorAll(`.${checkboxClass}`)
    .forEach(checkbox => {
      // 모달을 다시 열 때 이전 선택이 남지 않도록 체크를 해제한다.
      checkbox.checked = false;
    });

  document.querySelectorAll(`#${departmentTreeId} .org-node`)
    .forEach(node => {
      // classList.toggle(클래스, 조건)은 조건이 true면 클래스를 넣고 false면 뺀다.
      // data-dept-id가 빈 전체보기 노드만 active 상태로 만든다.
      node.classList.toggle("active", node.dataset.deptId === "");
    });

  // 전체보기이므로 빈 부서 id를 넘겨 모든 직원 행을 다시 보이게 한다.
  filterMemberPicker(memberTableBodyId, "");
}

// 새 대화 모달을 연다.
function openNewChatModal() {
  // 새 대화 모달에 맞는 id와 checkbox 클래스를 공통 초기화 함수로 전달한다.
  resetMemberPicker(
    "newChatDeptTree",
    "newChatMemberTableBody",
    "new-chat-member-checkbox"
  );

  // common.js에 있는 공통 모달 함수다.
  openModal("modal-new-chat");
}

// 현재 방에 인원을 더하면 기존 방을 수정하지 않고, 기존 참여자와 초대 인원이 포함된 새 GROUP 방으로 이동한다.
function openInviteChatModal() {
  // 초대 모달도 같은 공통 함수에 초대 모달 전용 id만 전달한다.
  resetMemberPicker(
    "inviteChatDeptTree",
    "inviteChatMemberTableBody",
    "invite-chat-member-checkbox"
  );
  openModal("modal-invite-chat");
}

// 선택한 초대 대상만 서버에 보내고, 서버가 만든 새 GROUP 방으로 이동한다.
async function confirmInviteChat() {
  // 초대는 현재 열려 있는 방을 기준으로 하므로 방 번호가 없으면 요청할 수 없다.
  if (!currentRoomId) {
    return;
  }

  // :checked 선택자는 체크된 checkbox만 찾고, ...은 NodeList를 일반 배열로 펼친다.
  const checkedMembers = [
    ...document.querySelectorAll(".invite-chat-member-checkbox:checked")
  ];

  if (checkedMembers.length === 0) {
    showToast("초대할 직원을 한 명 이상 선택해주세요.", "warning");
    return;
  }

  // URLSearchParams는 employeeIds=3&employeeIds=8 같은 form 전송 본문을 만든다.
  const requestBody = new URLSearchParams();

  checkedMembers.forEach(checkbox => {
    // 같은 키를 여러 번 append하면 Spring의 List<Integer> @RequestParam으로 받을 수 있다.
    requestBody.append("employeeIds", checkbox.value);
  });

  try {
    // await는 fetch 응답이 올 때까지 이 async 함수 안에서 다음 줄 실행을 기다린다.
    const response = await fetch(`/chat/room/${currentRoomId}/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: requestBody.toString()
    });
    // Controller가 반환한 JSON의 roomId 또는 오류 message를 JavaScript 객체로 읽는다.
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "초대할 수 없습니다.");
    }

    closeModal();
    // 초대는 기존 방을 수정하지 않고 새 GROUP 방을 만들므로 반환된 방 번호로 이동한다.
    window.location.href = `/chat/room/${result.roomId}`;
  } catch (error) {
    showToast(error.message, "danger");
  }
}

// GROUP 방에서만 이름 변경 모달을 연다. 버튼 자체도 GROUP일 때만 HTML에 출력된다.
function openRenameChatModal() {
  const roomNameInput = document.getElementById("chatRoomNameInput");
  const title = document.getElementById("chatThreadName");

  if (!roomNameInput) {
    return;
  }

  // 삼항 연산자 ? : 로 현재 제목이 있으면 공백을 제거해 input의 초기값으로 넣는다.
  roomNameInput.value = title ? title.textContent.trim() : "";
  openModal("modal-rename-chat");
  roomNameInput.focus();
}

// 방 이름은 서버에서도 GROUP 여부와 참여 권한을 다시 확인한 뒤 저장한다.
async function renameChatRoom(event) {
  // form submit의 기본 새로고침을 막고 fetch 방식으로 처리한다.
  event.preventDefault();

  if (!currentRoomId) {
    return;
  }

  const roomNameInput = document.getElementById("chatRoomNameInput");
  const roomName = roomNameInput ? roomNameInput.value.trim() : "";

  if (!roomName) {
    showToast("대화방 이름을 입력해주세요.", "warning");
    roomNameInput?.focus();
    return;
  }

  // 서버 @RequestParam("roomName")과 같은 키로 전송할 form 본문이다.
  const requestBody = new URLSearchParams();
  requestBody.append("roomName", roomName);

  try {
    const response = await fetch(`/chat/room/${currentRoomId}/name`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: requestBody.toString()
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "대화방 이름을 변경하지 못했습니다.");
    }

    closeModal();
    // 서버가 공백을 제거해 저장한 실제 이름으로 현재 헤더 글자도 즉시 갱신한다.
    document.getElementById("chatThreadName").textContent = result.roomName;
    showToast("대화방 이름을 변경했습니다.", "success");
  } catch (error) {
    showToast(error.message, "danger");
  }
}

// 선택한 직원 번호들을 POST /chat/room으로 보낸다.
async function confirmNewChat() {
  // 새 대화 모달에서 체크한 상대 직원 checkbox만 배열로 만든다.
  const checkedMembers = [
    ...document.querySelectorAll(
      ".new-chat-member-checkbox:checked"
    )
  ];

  if (checkedMembers.length === 0) {
    showToast("대화 상대를 한 명 이상 선택해주세요.", "warning");
    return;
  }

  // 여러 employeeIds 값을 보낼 수 있는 application/x-www-form-urlencoded 본문이다.
  const requestBody = new URLSearchParams();

  checkedMembers.forEach(checkbox => {
    // employeeIds=5&employeeIds=8 형태로 전송된다.
    requestBody.append("employeeIds", checkbox.value);
  });

  try {
    // 상대가 한 명이면 DM을 재사용/생성하고, 둘 이상이면 GROUP 방을 생성하는 Controller 요청이다.
    const response = await fetch("/chat/room", {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: requestBody.toString()
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.message || "채팅방을 만들지 못했습니다."
      );
    }

    closeModal();

    // ChatController가 반환한 roomId의 채팅방 화면으로 이동한다.
    window.location.href = `/chat/room/${result.roomId}`;

  } catch (error) {
    showToast(error.message, "danger");
  }
}

// 방 이름 검색과 DM/GROUP 탭을 함께 반영해 목록을 다시 그린다.
function renderChatRoomList() {
  // 이미 Thymeleaf가 출력한 모든 방 항목을 찾아 검색어와 탭 필터만 적용한다.
  const roomItems = document.querySelectorAll(".chat-room-item");

  roomItems.forEach(roomItem => {
    // data-room-type은 HTML의 data-room-type 속성 값(DM 또는 GROUP)을 읽는다.
    const roomType = roomItem.dataset.roomType;
    // textContent 전체를 소문자로 바꿔 이름·미리보기 모두에서 대소문자 구분 없이 검색한다.
    const roomText = roomItem.textContent.toLowerCase();

    const matchesKeyword = roomText.includes(
      roomFilterState.keyword
    );

    // 전체 탭이거나 현재 방 유형과 선택 탭 유형이 같을 때만 true다.
    const matchesType =
      roomFilterState.type === "all"
      || roomType === roomFilterState.type;

    roomItem.style.display = matchesKeyword && matchesType
      ? ""
      : "none";
  });
}

// 검색 입력창의 onkeyup과 연결된다.
function searchChatRooms(keyword) {
  // trim()은 앞뒤 공백을 제거하고 toLowerCase()는 대소문자 차이를 없앤다.
  roomFilterState.keyword = keyword.trim().toLowerCase();
  renderChatRoomList();
}

// 개인/그룹/전체 탭 클릭과 연결된다.
function switchChatFilter(type) {
  // 화면에서 쓰는 all/dm/group 값을 DB 방 유형 all/DM/GROUP 값으로 변환한다.
  roomFilterState.type = type === "dm"
    ? "DM"
    : type === "group"
      ? "GROUP"
      : "all";

  // 기존 탭의 active 표시를 전부 지운 뒤, 방금 누른 탭 하나에만 붙인다.
  document.querySelectorAll(".chat-filter-tab")
    .forEach(tab => {
      tab.classList.remove("active");
    });

  // ?.는 해당 탭 요소가 없을 때 오류 없이 호출을 건너뛰는 optional chaining 문법이다.
  document.getElementById(`chatFilter-${type}`)
    ?.classList.add("active");

  renderChatRoomList();
}
