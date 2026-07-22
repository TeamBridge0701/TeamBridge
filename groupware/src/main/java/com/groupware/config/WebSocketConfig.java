package com.groupware.config;

import java.security.Principal;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import com.groupware.dto.EmployeeDTO;
import com.groupware.mapper.EmployeeMapper;
import com.groupware.service.ChatService;

import lombok.RequiredArgsConstructor;

// 여긴 websocke 접속 규칙을 정해주는 공간이다.


@Configuration
// Spring 설정 클래스 등록.

@RequiredArgsConstructor

@EnableWebSocketMessageBroker
// STOMP 기반 실시간 메시지 기능 활성화.

// STOMP - 웹소켓 위에서 동작하는 메시징 서브 프로토콜. 
// Pub/Sub 구조를 제공해 특정 주제를 구독하고 메시지를 발행하여, 
// 채팅이나 알림 같은 실시간 양방향 통신을 효율적으로 구현할 수 있게 돕는 기능이다.

public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    // 이전 topic 주소와 현재 개인 큐 주소 모두에서 방 참여자·ACTIVE 상태를 검사한다.
    private static final Pattern ROOM_DESTINATION_PATTERN =
            Pattern.compile("^/(?:topic/room|user/queue/rooms)/(\\d+)(?:/(?:read|typing))?$");

    private final ChatService chatService;
    private final EmployeeMapper employeeMapper;
	// WebSocket 설정 인터페이스를 구현한다는 뜻이다.
	// 이 인터페이스 안에 있는 설정용 메서드를 필요한 만큼 재정의할 수 있다.

    // 브라우저가 WebSocket 서버에 처음 연결할 주소를 등록한다.
	
    @Override
    // 메서드 이름이나 파라미터가 틀리면 컴파일 단계에서 알려주는 어노테이션.
    
    public void registerStompEndpoints(
    		// 최초 접속 주소를 설정한다
            StompEndpointRegistry registry) {
        	// STOMP 접속 주소를 등록하는 도구 객체다.

        registry.addEndpoint("/ws-stomp")
        // WebSocket 최초 접속 주소를 등록한다.
        // 브라우저는 나중에 이 주소로 접속한다.
        
        
       // /ws-stomp - 방 번호나 메시지를 보내는 주소가 아님.
       // 	          브라우저와 서버가 실시간 연결을 시작하는 입구 주소다.
        

                // 현재 프로젝트 서버 주소에서만 연결을 허용한다. (어느 사이트만 웹소켓 연결할 수 있는지 나타낸거.)
                // 서버 포트는 application.properties의 8810이다.
                .setAllowedOriginPatterns(
                        "http://localhost:8810",
                        "http://127.0.0.1:8810")

                // 브라우저가 WebSocket을 지원하지 않아도 SockJS 방식으로 연결한다.
                .withSockJS();
        		// 브라우저가 WebSocket을 지원하지 않는 경우 SockJS 방식으로 연결할 수 있게 한다.
        
// SockJS - 웹소켓(WebSocket) 프로토콜을 지원하지 않는 브라우저나 환경에서도 
// 애플리케이션 코드 변경 없이 양방향 실시간 통신을 가능하게 해주는 브라우저 자바스크립트 라이브러리이다. (기획서에 이런 구성으로 하라함.ㄴ)
        

    }

    // STOMP 메시지가 들어오고 나가는 주소 규칙을 등록한다.
    @Override
    public void configureMessageBroker(
    		// 메시지 전송과 구독 주소 규칙을 설정하는 메서드다.
    		// 연결된 뒤 메시지를 어디로 보내고 받을지를 설정함.
            MessageBrokerRegistry registry) {
    	// registry는 Spring이 넣어주는 WebSocket 주소 설정 도구다.
    	// 이 안에서 주소를 topic과 app으로 나눈다.
    	
    	// - /app   : 브라우저가 서버에게 메시지를 보낼 때
    	// - /topic : 서버가 채팅방 구독자들에게 메시지를 뿌릴 때

    	
    	
    	
        // 서버가 같은 채팅방을 구독 중인 사람들에게 메시지를 방송하는 주소다.
    	// 서버가 브라우저 여러 명에게 메시지를 방송할 주소는 /topic으로 시작해야 한다.
        // 예: /topic/room/3
    	// Spring 내부의 간단한 메시지 브로커를 켠다.
    	// 서버 → 채팅방 구독자들에게 메시지를 보내는 길로 이해하면 될거 같다. 
        registry.enableSimpleBroker("/topic", "/queue");

        // 서버가 특정 로그인 사용자에게만 목록 갱신 이벤트를 보낼 때 쓰는 공통 주소다.
        registry.setUserDestinationPrefix("/user");

        // 브라우저가 서버의 @MessageMapping 메서드로 메시지를 보낼 때 사용하는 공통 앞부분이다.
        // 예: /app/chat/3
        // 브라우저 → 서버로 메시지를 보내는 길 이갓도 이렇게 이해하자
        registry.setApplicationDestinationPrefixes("/app");
    }

    /*
     * 메시지 발신은 ChatService에서 채팅방 참여자인지 검사한다.
     *
     * 하지만 WebSocket 구독은 simple broker로 바로 전달될 수 있다.
     * 그래서 이 검사가 없으면 다른 직원이 /topic/room/3 같은 주소를 추측해
     * 자신이 참여하지 않은 채팅방의 메시지를 받을 위험이 있다.
     */
    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {

        // 클라이언트에서 서버로 들어오는 WebSocket 메시지 채널에
        // 인터셉터(중간 검사기)를 등록한다.
        registration.interceptors(new ChannelInterceptor() {

            @Override
            public Message<?> preSend(
                    Message<?> message,
                    MessageChannel channel) {

                // 들어온 WebSocket 메시지를 STOMP 형식으로 해석할 수 있게 감싸는 코드.
                // STOMP 명령, 목적지 주소, 로그인 사용자 등을 가져올 수 있다.
                StompHeaderAccessor accessor =
                        StompHeaderAccessor.wrap(message);

                // 현재 메시지가 특ㅈ정주소를 구독한다는 요청인지 확인한다.
                // SEND, CONNECT 등의 다른 WebSocket 요청은 여기서 검사하지 않고 통과시킨다.
                if (!StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
                    return message;
                }

                // 사용자가 구독하려는 WebSocket 목적지 주소를 가져온다.
                // 예: /topic/room/3
                // 예: /topic/room/3/read
                String destination = accessor.getDestination();

                // ROOM_DESTINATION_PATTERN 정규표현식으로 현재 주소가 채팅방 메시지 주소인지 확인한다.
                //
                // destination이 null이면 빈 문자열을 넣어 Matcher 오류를 막는다.
                Matcher matcher = ROOM_DESTINATION_PATTERN.matcher(
                        destination == null ? "" : destination);

                // 방 번호가 없는 목록 큐는 아래 로그인 직원 상태만 검사한다.
                if (!matcher.matches()) {
					if ("/user/queue/chat-rooms".equals(destination)) {
						Principal listPrincipal = accessor.getUser();
						EmployeeDTO listEmployee = listPrincipal == null
								? null
								: employeeMapper.findByEmployeeNo(listPrincipal.getName());

						if (listEmployee == null
								|| !"ACTIVE".equals(listEmployee.getEmployeeStatus())) {
							throw new AccessDeniedException("활성 계정만 채팅을 구독할 수 있습니다.");
						}
					}
                    return message;
                }

                // WebSocket에 연결한 현재 로그인 사용자를 가져온다.
                Principal principal = accessor.getUser();

                // 로그인 사용자 정보가 없으면 구독을 막는다.
                if (principal == null) {
                    throw new AccessDeniedException("로그인 정보가 없습니다.");
                }

                // Principal에 들어 있는 로그인 사번으로 실제 직원 정보를 DB에서 찾는다.
                // 브라우저가 임의의 직원 ID를 보내는 것이 아니라,
                // 서버가 가진 로그인 정보를 기준으로 확인한다.
                EmployeeDTO employee =
                        employeeMapper.findByEmployeeNo(principal.getName());

                // 정규표현식에서 추출한 채팅방 번호를 숫자로 변환한다.
                //
                // 예: /topic/room/3
                // matcher.group(1) = "3"
                // roomId = 3
                int roomId = Integer.parseInt(matcher.group(1));

                // 다음 경우 채팅방 구독을 거부한다.
                // 1. DB에서 로그인 직원을 찾지 못함
                // 2. 해당 직원이 roomId 채팅방의 참여자가 아님
                if (employee == null
                        || !chatService.isRoomMember(
                                roomId,
                                employee.getEmployeeId())) {
                    throw new AccessDeniedException("채팅방 참여자가 아닙니다.");
                }

                // 참여자가 맞으면 원래 WebSocket 구독 요청을 그대로 다음 단계로 넘긴다.
                // 이후 사용자는 해당 채팅방 topic을 정상적으로 구독할 수 있다.
                return message;
            }
        });
    }
    
    // 흐름 ====> 
    // /app/chat/방 번호 -> ChatMessageController -> ChatService + CHAT_MESSAGE INSERT
    // -> savedMessage 객체 -> /topic/room/방 번호 -> 방번호 방 구독자 화면들
    
    
    
    
}
