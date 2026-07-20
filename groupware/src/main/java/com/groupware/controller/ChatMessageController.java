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

    // 서버가 특정 /topic 주소를 구독한 WebSocket 브라우저들에게 메시지를 방송할 때 사용한다.
    // ex) /topic/room/3 같은 주소에 메시지를 방송한다.
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

        /*
          DB 저장이 성공한 메시지만 해당 방을 구독한 전원에게 방송한다.
          topic이므로 서버에서 채팅 구독자에게 메세지 전달해줌.
          예: roomId가 3이면 /topic/room/3으로 방송한다.
         */
        messagingTemplate.convertAndSend(
        		// convertAndSend(주소, 데이터) - 해당 주소를 구독한 모든 브라우저에게 데이터를 전송한다.
                "/topic/room/" + roomId,
                savedMessage);

        notifyRoomListMembers("MESSAGE", roomId, savedMessage);
    }

    // 화면에 방이 열려 있는 사용자가 어디까지 읽었는지 서버에 알린다.
    @MessageMapping("/chat/{roomId}/read")
    public void readMessage(
            @DestinationVariable("roomId") int roomId,
            Principal principal) {

        EmployeeDTO loginEmployee =
                employeeMapper.findByEmployeeNo(principal.getName());

        if (loginEmployee == null
                || !"ACTIVE".equals(loginEmployee.getEmployeeStatus())) {
            throw new IllegalArgumentException("로그인 사용자 정보를 찾을 수 없습니다.");
        }

        Map<String, Integer> readEvent = chatService.markRoomAsRead(
                roomId,
                loginEmployee.getEmployeeId());

        if (readEvent == null) {
            return;
        }

        messagingTemplate.convertAndSend(
                "/topic/room/" + roomId + "/read",
                (Object) readEvent);
    }

    // 입력 내용 자체는 저장하지 않고, 현재 입력 중이라는 상태만 같은 방에 잠시 알린다.
    @MessageMapping("/chat/{roomId}/typing")
    public void typingMessage(
            @DestinationVariable("roomId") int roomId,
            @Payload Map<String, Object> requestTyping,
            Principal principal) {

        EmployeeDTO loginEmployee =
                employeeMapper.findByEmployeeNo(principal.getName());

        if (loginEmployee == null
                || !"ACTIVE".equals(loginEmployee.getEmployeeStatus())
                || !chatService.isRoomMember(
                        roomId,
                        loginEmployee.getEmployeeId())) {
            throw new IllegalArgumentException("채팅방 참여자가 아닙니다.");
        }

        // senderId와 senderName은 브라우저 값이 아니라 로그인 정보에서만 만든다.
        Map<String, Object> typingEvent = new HashMap<>();
        typingEvent.put("roomId", roomId);
        typingEvent.put("senderId", loginEmployee.getEmployeeId());
        typingEvent.put("senderName", loginEmployee.getEmployeeName());
        typingEvent.put(
                "typing",
                Boolean.TRUE.equals(requestTyping.get("typing")));

        messagingTemplate.convertAndSend(
                "/topic/room/" + roomId + "/typing",
                (Object) typingEvent);
    }

    // 각 참여자는 자신의 /user/queue/chat-rooms만 구독하므로 다른 직원 목록은 받지 않는다.
    private void notifyRoomListMembers(
            String eventType,
            int roomId,
            ChatMessageDTO message) {

        Map<String, Object> roomEvent = new HashMap<>();
        roomEvent.put("eventType", eventType);
        roomEvent.put("roomId", roomId);
        roomEvent.put("message", message);

        for (String employeeNo : chatService.getRoomMemberEmployeeNos(roomId)) {
            messagingTemplate.convertAndSendToUser(
                    employeeNo,
                    "/queue/chat-rooms",
                    roomEvent);
        }
    }
}
