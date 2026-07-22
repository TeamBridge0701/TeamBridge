package com.groupware.controller;

import java.security.Principal;
import java.util.HashMap;
import java.util.Map;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import com.groupware.dto.ChatMessageDTO;
import com.groupware.dto.EmployeeDTO;
import com.groupware.mapper.EmployeeMapper;
import com.groupware.service.ChatService;

import lombok.RequiredArgsConstructor;

@Controller
@RequiredArgsConstructor
public class ChatMessageController {

	private final EmployeeMapper employeeMapper;
	
    private final ChatService chatService;

    // 서버가 현재 방 참여자의 개인 WebSocket 주소로 이벤트를 보낼 때 사용한다.
    private final SimpMessagingTemplate messagingTemplate;

    /*
      브라우저가 /app/chat/3으로 보내면 실행된다.
      WebSocketConfig에는 아래 설정이 있다.
      -> registry.setApplicationDestinationPrefixes("/app");
      그래서 브라우저가 보낸 /app/chat/3에서 /app을 제외한
      /chat/3 부분이 아래 @MessageMapping과 비교된다.
     */
    @MessageMapping("/chat/{roomId}")
    // @MessageMapping - HTTP의 @PostMapping처럼 WebSocket 메시지를 받는 주소를 지정한다.
    
    public void sendMessage(
            @DestinationVariable("roomId") int roomId,
            // DestinationVariable - 웹소켓 및 STOMP 환경에서 메시징 경로에 포함된 동적 템플릿 변수 값을 
            // 						 메서드 매개변수에 바인딩할 때 사용하는 어노테이션이다.
            // 여기서는 = WebSocket 주소 안의 {roomId} 값을 받는다. HTTP의 @PathVariable과 비슷하다.

            // chat.js가 보낸 JSON 메시지에서 content만 받아 ChatMessageDTO에 담는다.
            @Payload ChatMessageDTO requestMessage,
            // @Payload - 전송되는 데이터나 요청의 본문에 담긴 실제 핵심 데이터를 지정할 때 사용
            // 여기서는 브라우저가 보낸 JSON 본문을 Java DTO로 바꿔 받는 용ㄷ도로 사용.

     
            
            
            Principal principal) {

        
    	
    	
    	
    	EmployeeDTO loginEmployee =
    	        employeeMapper.findByEmployeeNo(principal.getName());

    	// 로그인 정보가 없거나 정지된 계정이면 메시지를 처리하지 않는다.
    	if (loginEmployee == null
    	        || !"ACTIVE".equals(loginEmployee.getEmployeeStatus())) {
    	    throw new IllegalArgumentException("로그인 사용자 정보를 찾을 수 없습니다.");
    	}

    	// 브라우저가 보낸 senderId 대신 서버가 확인한 직원 번호를 사용한다.
    	int senderId = loginEmployee.getEmployeeId();


		//  재조회는 모두 Service에서 처리한다.
        ChatMessageDTO savedMessage = chatService.saveTextMessage(
                roomId,
                senderId,
                requestMessage.getContent());

        // 현재 DB 참여자에게만 개인 큐로 전달한다. 나간 사용자의 예전 구독에는 전달되지 않는다.
        notifyRoomMembers("/queue/rooms/" + roomId, roomId, savedMessage);

        notifyRoomListMembers("MESSAGE", roomId, savedMessage);
    }

 // 화면에 채팅방을 열어 둔 사용자가 "여기까지 읽었다"고 WebSocket으로 알릴 때 실행된다.
    @MessageMapping("/chat/{roomId}/read")
    public void readMessage(

            // WebSocket 주소의 {roomId} 값을 숫자로 받는다
            @DestinationVariable("roomId") int roomId,

            // 현재 WebSocket에 연결된 로그인 사용자 정보다.
            Principal principal) {

        // Principal에 저장된 로그인 사번을 사용해 DB에서 실제 직원 정보를 조회한다.
        // 브라우저가 보낸 직원 ID를 믿지 않기 위해 서버에서 다시 확인한다.
        EmployeeDTO loginEmployee =
                employeeMapper.findByEmployeeNo(principal.getName());

        // 로그인 사용자가 없거나, 재직 상태가 ACTIVE가 아니면 읽음 처리하지 않는다.
        if (loginEmployee == null
                || !"ACTIVE".equals(loginEmployee.getEmployeeStatus())) {
            throw new IllegalArgumentException("로그인 사용자 정보를 찾을 수 없습니다.");
        }

        // 해당 직원이 roomId 채팅방에서 최신 메시지까지 읽은 것으로 DB를 갱신한다.
        // 반환값에는 이전 읽음 위치와 새 읽음 위치가 들어 있다.
        Map<String, Integer> readEvent = chatService.markRoomAsRead(
                roomId,
                loginEmployee.getEmployeeId());

        // 메시지가 없거나 이미 최신 메시지까지 읽은 상태면 DB 변경이 없으므로
        // 다른 참여자에게 읽음 이벤트를 보낼 필요가 없다.
        if (readEvent == null) {
            return;
        }

        // 현재 참여자에게만 읽음 이벤트를 전달한다.
        notifyRoomMembers("/queue/rooms/" + roomId + "/read", roomId, readEvent);
    }


    // 입력 내용 자체는 저장하지 않고, 현재 입력 중이라는 상태만 같은 방에 잠시 알린다.
    @MessageMapping("/chat/{roomId}/typing")
    public void typingMessage(

            @DestinationVariable("roomId") int roomId,

            // 브라우저가 보낸 JSON 데이터를 Map으로 받는다.
            @Payload Map<String, Object> requestTyping,

            Principal principal) {

        EmployeeDTO loginEmployee =
                employeeMapper.findByEmployeeNo(principal.getName());

        // 다음 경우 입력 중 이벤트를 처리하지 않는다.
        // 1. 로그인 사용자를 찾지 못함
        // 2. 재직 상태가 ACTIVE가 아님
        // 3. 현재 사용자가 해당 채팅방 참여자가 아님
        if (loginEmployee == null
                || !"ACTIVE".equals(loginEmployee.getEmployeeStatus())
                || !chatService.isRoomMember(
                        roomId,
                        loginEmployee.getEmployeeId())) {
            throw new IllegalArgumentException("채팅방 참여자가 아닙니다.");
        }

        // 같은 방 참여자에게 보낼 입력 중 이벤트 데이터를 만든다.
        // DB DTO가 아니라 WebSocket 전송용 Map이다.
        Map<String, Object> typingEvent = new HashMap<>();

        // 어느 채팅방에서 입력 중인지 저장한다.
        typingEvent.put("roomId", roomId);

        // 누가 입력 중인지 저장한다.
        // 브라우저가 보낸 값이 아니라 서버 로그인 정보의 직원 ID를 사용한다.
        typingEvent.put("senderId", loginEmployee.getEmployeeId());

        // 화면에 "김철수님이 입력 중"처럼 표시하기 위한 직원 이름을 저장한다.
        typingEvent.put("senderName", loginEmployee.getEmployeeName());

        // 브라우저가 보낸 typing 값이 Boolean.TRUE일 때만 true로 저장한다.
        // 값이 없거나 false라면 false가 저장된다.
        typingEvent.put(
                "typing",
                Boolean.TRUE.equals(requestTyping.get("typing")));

        // 현재 참여자에게만 입력 중 이벤트를 전달한다.
        notifyRoomMembers("/queue/rooms/" + roomId + "/typing", roomId, typingEvent);
    }

    // 방의 현재 참여자에게만 동일한 이벤트를 보낸다.
    private void notifyRoomMembers(String destination, int roomId, Object payload) {
        for (String employeeNo : chatService.getRoomMemberEmployeeNos(roomId)) {
            messagingTemplate.convertAndSendToUser(employeeNo, destination, payload);
        }
    }


    // 새 메시지, 새 방 생성, 방 이름 변경 시 참여자 각자의 채팅방 목록을 갱신하라고 알린다.
    // 각 참여자는 자신의 /user/queue/chat-rooms만 구독하므로 다른 직원의 이벤트는 받지 않는다.
    private void notifyRoomListMembers(

            // 이벤트 종류
            String eventType,

            // 변경이 발생한 채팅방 번호
            int roomId,

            // 새 메시지 이벤트면 메시지 정보가 들어간다.
            // 새 방 생성·이름 변경 이벤트면 메시지가 없으므로 null일 수 있다.
            ChatMessageDTO message) {

        // 브라우저에 보낼 채팅방 목록 이벤트 데이터를 만든다.
        Map<String, Object> roomEvent = new HashMap<>();

        // 이벤트 종류를 저장한다.
        roomEvent.put("eventType", eventType);

        // 어떤 채팅방의 이벤트인지 저장한다.
        roomEvent.put("roomId", roomId);

        // 새 메시지 정보 또는 null을 저장한다.
        roomEvent.put("message", message);

        // 해당 채팅방 참여자들의 사번 목록을 조회한다.
        for (String employeeNo : chatService.getRoomMemberEmployeeNos(roomId)) {

            // 각 참여자의 개인 WebSocket 주소로 이벤트를 전송한다.
            // /user/queue/chat-rooms를 구독한 해당 직원만 이 이벤트를 받는다.
            messagingTemplate.convertAndSendToUser(
                    employeeNo,
                    "/queue/chat-rooms",
                    roomEvent);
        }
    }
}
