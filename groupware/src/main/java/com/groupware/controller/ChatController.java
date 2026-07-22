package com.groupware.controller;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;

import com.groupware.dto.ChatAttachmentDTO;
import com.groupware.dto.ChatMessageDTO;
import com.groupware.dto.ChatRoomDTO;
import com.groupware.dto.EmployeeDTO;
import com.groupware.mapper.EmployeeMapper;
import com.groupware.security.CustomUserDetails;
import com.groupware.service.ChatService;

import lombok.RequiredArgsConstructor;

@Controller
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    // 새 대화 시작 모달의 부서, 직원 목록을 조회할 때 사용한다.
    // 이미 조직도에서 사용하는 조회 Mapper이므로 읽기 기능만 재사용한다.
    private final EmployeeMapper employeeMapper;

    // HTTP 파일 업로드가 끝난 뒤에도 기존 텍스트 메시지와 같은 topic으로 방송한다.
    private final SimpMessagingTemplate messagingTemplate;

    // 채팅방 목록 화면을 연다.
    @GetMapping("/chat")
    public String chatList(
            @AuthenticationPrincipal CustomUserDetails principal,
            // Spring Security가 현재 로그인한 사용자 정보를 principal에 넣어준다.
            // @AuthenticationPrincipal - Spring Security에서 현재 인증된 사용자의 정보를 
            // 							  컨트롤러 메서드의 파라미터로 직접 주입받을 수 있게 해주는 어노테이션
            
            Model model) {

        int employeeId = principal.getEmployeeDTO().getEmployeeId();

        // 로그인한 직원이 참여 중인 채팅방 목록을 조회해서 Thymeleaf 화면에 전달한다.
        model.addAttribute(
                "rooms",
                chatService.getMyChatRooms(employeeId));
        		// 먼저 서비스가 employeeId를 사용해서 DB에서 내 채팅방 목록을 조회한다.
        		// 그 결과를 rooms라는 이름으로 model에 담는다.
        
        // 아직 선택한 방이 없는 /chat 첫 화면용 빈 데이터다.
        model.addAttribute("currentRoom", null);
        model.addAttribute("messages", List.of());
        model.addAttribute("currentMemberIds", List.of());
        model.addAttribute("canSendMessage", false);
        

        addNewChatModalData(model);
        // 새 채팅방을 만들 때 필요한 직원 목록 같은 데이터를 model에 추가하는 메서드
        // 새 대화 모달에서 선택할 부서와 직원 목록을 준비하는 코드로 이해.(내일)
        // 채팅방 목록 화면

        // 현재 프로젝트의 채팅 화면 파일이다.
        return "chat/chat";
    }

    // 특정 채팅방에 입장하고, 이전 메시지를 함께 출력한다.
    @GetMapping("/chat/room/{roomId}")
    public String chatRoom(
            @PathVariable("roomId") int roomId,
            @AuthenticationPrincipal CustomUserDetails principal,
            Model model) {

        int employeeId = principal.getEmployeeDTO().getEmployeeId();

        // URL에 다른 직원의 방 번호를 직접 입력한 접근을 서버에서 차단한다.
        if (!chatService.isRoomMember(roomId, employeeId)) {
        				 // 현재 로그인한 사람이 이 방의 참여자인지 확인할 때 사용.
        	
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "채팅방 참여자가 아닙니다.");
        }

        // 메시지별 안 읽은 인원을 조회한 뒤 읽음 커서를 갱신하고, 최신 방 목록을 다시 조회한다.
        List<ChatMessageDTO> messages =
                chatService.getMessages(roomId, employeeId);
        notifyRoomRead(chatService.markRoomAsRead(roomId, employeeId));

        List<ChatRoomDTO> rooms =
                chatService.getMyChatRooms(employeeId);
        					// 로그인한 사람의 대화방을 사번으로 찾아서 반환한다.

        // 왼쪽 목록과 오른쪽 채팅 영역이 같은 방을 표시하도록 선택된 방을 찾는다.
        ChatRoomDTO currentRoom = rooms.stream()
        		// lamda 함수 
        		// stream()은 컬렉션(List, Set 등)의 데이터를 선언형(함수형)으로 처리하기 위한 스트림 파이프라인의 시작점이다.
        		
                .filter(room -> room.getRoomId() == roomId)
                // filter(Predicate): 조건에 맞는 요소만 추출합니다.
                // (x -> x > 10) = (list에서 x를 하나씩 꺼내서, x가 10보다 크다라는 조건이 참인 데이터만 남김)
                
                .findFirst()
                // // 조건에 맞는 방 하나만 가져옴. 
                
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "채팅방을 찾을 수 없습니다."));

        model.addAttribute("rooms", rooms);
        model.addAttribute("currentRoom", currentRoom);

        // 초대 모달에서 이미 이 방에 들어와 있는 직원을 다시 선택하지 않도록 사용한다.
        List<Integer> currentMemberIds = chatService.getRoomMemberIds(roomId);
        model.addAttribute("currentMemberIds", currentMemberIds);
        model.addAttribute(
                "canSendMessage",
                // 데이터나 정보가 끊임없이 '흐르는' 연속적인 통로 또는 이를 처리하기 위한 API
                currentMemberIds.stream()
                // .anyMatch() - Stream() 요소 중 단 하나라도 주어진 조건을 만족하는지 검사하는 메서드
                        .anyMatch(memberId -> memberId != employeeId));

        // Service에서 참여자 검증 후 조회한 이전 메시지를 화면에 전달한다.
        model.addAttribute(
                "messages",
                messages);
        					// 현재 사용자가 참여한 방의 이전 메시지만 조회한다.

        addNewChatModalData(model);
        // 새 대화 모달에서 선택할 부서와 직원 목록을 준비하는 코드이ㅏㄷ.
        // 채팅방을 연 화면(세부적)
        // 이 두 번째 호출을 빼면 /chat/room/roomId 에서는 화면은 열리지만 모달에 필요한 부서·직원 데이터가 없을 수 있다.
        // 모달을 여는게 아님. 모달 안에서 사용할 데이터를 준비하는 코드.
        return "chat/chat";
    }
    
    
    
    

    /*
     * 새 대화 모달에서 선택한 직원 목록을 받는다.
     * 1명 선택이면 기존 DM을 찾거나 새로 만들고,
     * 2명 이상 선택이면 새 GROUP 방을 만든다.
     */
    @PostMapping("/chat/room")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> createChatRoom(
    		// 브라우저 또는 chat.js에 HTTP 응답을 보낼 때 쓰는 객체.
    		// 상태 코드도 함께 보낼 수 있다.
    		// <Map<String, Object> - JSON 형태로 돌려줄 데이터를 담는 구조.
    							   // 키는 문자열, 값은 어떤 타입이든 가능하다.
            @RequestParam("employeeIds") List<Integer> employeeIds,
            // @RequestParam("employeeIds") - JS가 보낸 요청 파라미터 이름 employeeIds를 받는다는 뜻
            @AuthenticationPrincipal CustomUserDetails principal) {

        int myEmployeeId =
                principal.getEmployeeDTO().getEmployeeId();
        // employeeId - 화면에서선택한 대화 상대들
        // principal -  현재 로그인한 나 

        try {
        	// 안에서 오류가 발생할 수 있는 코드를 실행. - 서비스가 오류 발생시킴
        	
            int roomId;

            // 선택한 상대가 한 명이면 기존 1:1 방을 재사용하거나 새로 만든다.
            if (employeeIds.size() == 1) {
                roomId = chatService.createOrFindDirectRoom(
                        myEmployeeId,
                        employeeIds.get(0));

            // 상대가 두 명 이상이면 새 그룹방을 만든다.
            } else {
                roomId = chatService.createGroupRoom(
                        myEmployeeId,
                        employeeIds);
            }

            // chat.js가 이 roomId로 /chat/room/{roomId} 주소로 이동한다.
            notifyRoomListMembers("ROOM_CREATED", roomId, null);
            return ResponseEntity.ok(
                    Map.<String, Object>of("roomId", roomId));

        } catch (IllegalArgumentException e) {
            // 잘못된 선택, 본인 선택, 정지 직원 선택은 400으로 
            return ResponseEntity.badRequest().body(
                    Map.<String, Object>of(
                            "message",
                            e.getMessage()));
        }
    }
    
    
    
    
    

    // chat.js가 필요할 때 이전 메시지만 비동기로 다시 가져오는 JSON API다.
    @GetMapping("/chat/room/{roomId}/messages")
    @ResponseBody
    public ResponseEntity<List<ChatMessageDTO>> getMessages(
    		// 메시지 여러 개를 List<ChatMessageDTO> 형태로 반환해.
    		
            @PathVariable("roomId") int roomId,
            @AuthenticationPrincipal CustomUserDetails principal) {

        int employeeId = principal.getEmployeeDTO().getEmployeeId();

        // JSON API도 화면 진입과 동일하게 참여자 권한을 검사한다.
        if (!chatService.isRoomMember(roomId, employeeId)) {
        	// 현재 사용자가 해당 채팅방의 참여자인지 검사함.
        	
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            // 403 반환 - 로그인은 했지만 이 채팅방을 볼 권한은 없다 (주소창에 다른 주소 ID쳐도 못들어가게)
        }

        List<ChatMessageDTO> messages =
                chatService.getMessages(roomId, employeeId);
        // 가장 최근 메세지까지 읽었다고 DB에 저장
        notifyRoomRead(chatService.markRoomAsRead(roomId, employeeId));
        // 그 정보를 WebSocket으로 같은 채팅방 사용자들에게 보낸다
        // ( 읽음정보 ) 를 말한다

        return ResponseEntity.ok(messages);
        // 참여자가 맞으면 해당 방의 메시지를 조회해서 JSON으로 반환.
    }

    // 목록 버튼을 누를 때마다 현재 방의 참여자를 다시 조회한다.
    // 화면을 처음 열 때 목록을 고정하지 않아, 누군가 나간 뒤에도 최신 참여자를 받을 수 있다.
    @GetMapping("/chat/room/{roomId}/members")
    @ResponseBody
    public ResponseEntity<List<EmployeeDTO>> getRoomMembers(
            // URL의 /chat/room/18/members에서 18을 roomId로 받는다.
            @PathVariable("roomId") int roomId,
            // 로그인 사용자 정보에서 직원 번호를 가져와 Service 권한 검사에 사용한다.
            @AuthenticationPrincipal CustomUserDetails principal) {

        try {
            // ResponseEntity.ok(...)는 HTTP 200과 EmployeeDTO 목록을 JSON으로 반환한다.
            return ResponseEntity.ok(chatService.getRoomMembers(
                    roomId,
                    principal.getEmployeeDTO().getEmployeeId()));
        } catch (IllegalArgumentException exception) {
            // 방 참여자가 아니면 직원 목록을 주지 않고 HTTP 403(FORBIDDEN)만 반환한다.
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
    }

    // 공통 헤더·사이드바가 로그인 사용자의 전체 안 읽은 메시지 수를 가져오는 채팅 전용 API다.
    @GetMapping("/chat/unread-count")
    @ResponseBody
    public ResponseEntity<Map<String, Integer>> getUnreadMessageCount(
    		
            @AuthenticationPrincipal CustomUserDetails principal) {

        int unreadCount = chatService.getMyUnreadMessageCount(
                principal.getEmployeeDTO().getEmployeeId());

        return ResponseEntity.ok(Map.of("unreadCount", unreadCount));
        							//  키 				값  
    }

    // 기존 개인방 또는 그룹방의 참여자와 새 인원을 묶어 별도 그룹방을 만든다.
    @PostMapping("/chat/room/{roomId}/invite")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> inviteToNewGroupRoom(
    		
            @PathVariable("roomId") int roomId,
            @RequestParam("employeeIds") List<Integer> employeeIds, 
            @AuthenticationPrincipal CustomUserDetails principal) {

        try {
            int newRoomId = chatService.createInvitedGroupRoom(
                    roomId,
                    principal.getEmployeeDTO().getEmployeeId(),
                    employeeIds);

            // 그룹방이 개설되었다는걸 websocket으로 참여자들에게 알리는 코드 
            notifyRoomListMembers("ROOM_CREATED", newRoomId, null);
            // 382번 줄에 정의된 이 기능은 아래처럼 구성되어 있다
            // private void notifyRoomListMembers(
            // 		String eventType,
            // 		int roomId,
            // 		ChatMessageDTO message) {
            // 여기서는 이름만 바꿨기 때문에 메세지가 들어올 자리에는 null이 들어온다

            return ResponseEntity.ok(
            		// 정상 응답인 HTTP 200 을 보냄 
                    Map.<String, Object>of("roomId", newRoomId));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(
                    Map.<String, Object>of(
                            "message",
                            exception.getMessage()));
        }
    }

    // 그룹방 참여자만 이름을 바꿀 수 있다. 개인방 요청은 Service가 거부한다.
    @PostMapping("/chat/room/{roomId}/name")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> renameGroupRoom(
            @PathVariable("roomId") int roomId,
            @RequestParam("roomName") String roomName,
            @AuthenticationPrincipal CustomUserDetails principal) {

        try {
            chatService.renameGroupRoom(
                    roomId,
                    principal.getEmployeeDTO().getEmployeeId(),
                    roomName);

            // 그룹방 이름이 바뀌었다 걸 webscoket으로 참여자들에게 알리는 코드
            notifyRoomListMembers("ROOM_UPDATED", roomId, null);

            return ResponseEntity.ok(
                    Map.<String, Object>of("roomName", roomName.trim())); // 변경한 이름을 앞 뒤 공백 잘라서 값만 나오게 함
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(
                    Map.<String, Object>of(
                            "message",
                            exception.getMessage()));
        }
    }

    // POST는 서버의 참여자 데이터를 실제로 삭제하는 요청에 사용한다.
    @PostMapping("/chat/room/{roomId}/leave")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> leaveChatRoom(
            // {roomId} 자리의 숫자를 int roomId로 받는 Spring MVC 문법이다.
            @PathVariable("roomId") int roomId,
            // 브라우저가 보낸 직원 번호를 믿지 않고 로그인한 사용자 정보에서 직원 번호를 가져온다.
            @AuthenticationPrincipal CustomUserDetails principal) {

        try {
            ChatMessageDTO systemMessage = chatService.leaveRoom(
                    roomId,
                    principal.getEmployeeDTO().getEmployeeId());

            // 마지막 참여자가 아니면 Service가 만든 SYSTEM 메시지를 같은 방 구독자에게 실시간 방송한다.
            if (systemMessage != null) {
                notifyRoomMembers("/queue/rooms/" + roomId, roomId, systemMessage);
                // 남은 참여자들의 왼쪽 채팅방 목록에도 마지막 메시지가 반영되도록 개인 알림을 보낸다.
                notifyRoomListMembers("MESSAGE", roomId, systemMessage);
            }

            // JavaScript가 나가기 성공 후 어디로 이동할지 알 수 있게 JSON으로 주소를 반환한다.
            return ResponseEntity.ok(Map.of("redirectUrl", "/chat"));
        } catch (IllegalArgumentException exception) {
            // 참여자가 아니거나 삭제에 실패한 경우에는 HTTP 400과 오류 문구를 JSON으로 반환한다.
            return ResponseEntity.badRequest().body(
                    Map.<String, Object>of("message", exception.getMessage()));
        }
    }

    // 파일 본문은 HTTP multipart로 받고, 저장 성공 후에는 STOMP로 방 구독자에게 방송한다.
    @PostMapping(
            path = "/chat/room/{roomId}/file",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    		// 일반 JSON이 아니라 파일이 포된 요청 형식만 받겠다는 뜻이다 
    @ResponseBody
    // 파일 업로드을 처리하는 메서드 
    public ResponseEntity<?> uploadChatFile(
    		// ?는 반환할 데이터의 자료형이 한 가지로 고정되지 않았다는 뜻이다
            @PathVariable("roomId") int roomId,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal CustomUserDetails principal) {

        try {
            int employeeId = principal.getEmployeeDTO().getEmployeeId();
            ChatMessageDTO savedMessage = chatService.saveFileMessage(
                    roomId,
                    employeeId,
                    file);

            notifyRoomMembers("/queue/rooms/" + roomId, roomId, savedMessage);
            notifyRoomListMembers("MESSAGE", roomId, savedMessage);

            return ResponseEntity.ok(savedMessage);
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(
                    Map.<String, Object>of(
                            "message",
                            exception.getMessage()));
        } catch (Exception exception) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(
                    Map.<String, Object>of(
                            "message",
                            "파일을 저장하지 못했습니다."));
        }
    }

    // 파일 URL을 아는 것만으로 다운로드할 수 없도록, 다시 방 참여자 여부를 검사한다.
    @GetMapping("/chat/attachment/{attachId}")
    public ResponseEntity<?> downloadChatAttachment(
            @PathVariable("attachId") int attachId,
            @AuthenticationPrincipal CustomUserDetails principal) {

        try {
            ChatAttachmentDTO attachment = chatService.getAttachmentForDownload(
            										// 파일 다운로드에 필요한 첨부파일 정보를 반환하는 메서드.
            		attachId,
                    principal.getEmployeeDTO().getEmployeeId());
            Path filePath = chatService.getAttachmentPath(attachment);

            if (!Files.exists(filePath)) {
                return ResponseEntity.notFound().build();
            }

            // 실제 파일 경로를 다운로드 응답에 담을 수 있는 Resource 객체로 바꾼다
            Resource resource = new UrlResource(filePath.toUri());
            // filePath - 서버의 파일 위치,
            // filePath.toUri() - 그 위치를 파일 URL 형식으로 바꾼다
            
            
            // 브라우저에게 이 파일은 화면에 바로 보여주기보다 다운로드 파일로 처리하라고 설정하라고 함
            ContentDisposition contentDisposition = ContentDisposition.attachment()
                    .filename(attachment.getFileName(), StandardCharsets.UTF_8)
                    .build(); // 지금까지 한것을 contentDisposition에 저장

            return ResponseEntity.ok()
            		// 헤더에 다운로드 설정 추가
                    .header(HttpHeaders.CONTENT_DISPOSITION, contentDisposition.toString())
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    // 응답 데이터가 일반적인 바이너리 파일이라는 뜻  
                    // application/octet-stream - 브라우저가 파일을 웹페이지에 표시하려 하기보다 다운로드로 처리하게 됨
                    
                    .contentLength(Files.size(filePath))
                    // 실제 파일 크
                    .body(resource); 
            		// 브라우저로 전송 할 파일을 resource에 넣어서 보냄
            
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(
                    Map.<String, Object>of("message", exception.getMessage()));
        } catch (Exception exception) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    // 파일 업로드, 새 방 생성, 이름 변경도 로그인 사용자별 방 목록 갱신 대상으로 보낸다.
    private void notifyRoomListMembers(
            String eventType,
            int roomId,
            ChatMessageDTO message) {

        // 방 목록 갱신은 DB DTO가 아닌 WebSocket JSON 데이터라 Map으로 보낸다.  ----- DTO 추가하면 처리 단축 가능
        Map<String, Object> roomEvent = new HashMap<>();
        // HashMap<>: 실제 Map 객체 생성
        roomEvent.put("eventType", eventType);
        // 브라우저 chat.js는 이 값으로 마지막 메시지가 바뀐 것인지, 새 방이 생긴 것인지 판단함
        roomEvent.put("roomId", roomId);
        roomEvent.put("message", message);

        // 채팅방에 참여한 사람들의 사번을 하나씩 반복한다
        for (String employeeNo : chatService.getRoomMemberEmployeeNos(roomId)) {
        	
        	// 특정 로그인 사용자 한 명에게만 WebSocket 메시지를 보낼 때 쓰는 메서드
            messagingTemplate.convertAndSendToUser(
                    employeeNo, // 이번에 메시지를 받을 참여자의 사번. Spring Security 로그인 사용자명과 같아야 함.
                    "/queue/chat-rooms", // 개인별 방 목록 갱신 메시지를 받는 주소
                    roomEvent); // 위에서 만든 Map 데이터를 JSON으로 바꿔 해당 참여자에게 전송.
        }
    }

    // 읽음 처리 사실을 WebSocket으로 알리는 기능
    private void notifyRoomRead(Map<String, Integer> readEvent) {
        if (readEvent == null) {
            return;
        }

        notifyRoomMembers(
                "/queue/rooms/" + readEvent.get("roomId") + "/read",
                readEvent.get("roomId"),
                readEvent);
    }

    // DB에 아직 참여자로 남아 있는 사용자에게만 방 이벤트를 보낸다.
    private void notifyRoomMembers(
            String destination,
            int roomId,
            Object payload) {
        for (String employeeNo : chatService.getRoomMemberEmployeeNos(roomId)) {
            messagingTemplate.convertAndSendToUser(
                    employeeNo,
                    destination,
                    payload);
        }
    }

    // 새 대화 모달에 공통으로 필요한 조직 데이터를 Model에 담는다.
    private void addNewChatModalData(Model model) {
    	// 컨트롤러 내부에서만 사용하는 보조 메서드.
        model.addAttribute(
                "departments",
                employeeMapper.findDepartments());
        // 부서 목록을 Mapper로 조회 후 departments라는 이름으로 Model에 담아 Thymeleaf로 보낸다.
        
        model.addAttribute(
                "employees",
                employeeMapper.findActiveEmployeesByDepartment(null));
        // null은 특정 부서로 제한하지 않고 전체 부서의 직원을 가져온다는 의미이다.
    }
}
