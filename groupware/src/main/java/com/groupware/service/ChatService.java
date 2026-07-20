package com.groupware.service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.apache.ibatis.annotations.Param;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import com.groupware.dto.ChatAttachmentDTO;
import com.groupware.dto.ChatMessageDTO;
import com.groupware.dto.ChatRoomDTO;
import com.groupware.dto.EmployeeDTO;
import com.groupware.mapper.ChatMapper;
import com.groupware.mapper.EmployeeMapper;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Set;

import lombok.RequiredArgsConstructor;

	@Service
	@RequiredArgsConstructor
	public class ChatService {

	    private final ChatMapper chatMapper;

		    // 조직도에서 이미 쓰는 직원 조회 매퍼를 채팅 대상 검증에도 재사용한다.
		    private final EmployeeMapper employeeMapper;

            // application.properties의 채팅 전용 업로드 폴더를 사용한다.
            @Value("${groupware.chat.upload-dir}")
            private String chatUploadDir;

	    public List<ChatRoomDTO> getMyChatRooms(int employeeId) {
	        return chatMapper.findMyChatRooms(employeeId);
	    }
	    // 로그인한 사람의 대화방을 사번으로 찾아서 반환한다.

	    // 현재 로그인한 사람이 이 방의 참여자인지 확인할 때 사용.
		    public boolean isRoomMember(int roomId, int employeeId) {
	    	 // roomId 채팅방에 employeeId 사용자가 실제 참여 중인지 확인한다.
			 // URL에 다른 사람의 roomId를 직접 입력하거나,
			 // WebSocket 메시지를 다른 방으로 보내려는 접근을 막기 위한 서버 검증이다.
	    	
	        return chatMapper.findRoomByIdAndMember(roomId, employeeId) != null;
	    	// CHAT_ROOM과 CHAT_ROOM_MEMBER를 함께 조회한다.
	        // 방 번호와 직원 번호가 모두 일치하면 ChatRoomDTO가 반환되고,
	        // 참여자가 아니면 조회 결과가 없어서 null이 반환된다.
		    }

		    
		    // =================== 추가 구현함 ==============
		    
		    
            // 초대·개인 알림·읽음 처리에서 방의 실제 참여자 목록을 재사용한다.
            public List<Integer> getRoomMemberIds(int roomId) {
                return chatMapper.findRoomMemberIds(roomId);
            }

            public List<String> getRoomMemberEmployeeNos(int roomId) {
                return chatMapper.findRoomMemberEmployeeNos(roomId);
            }
	    
            // ==================여기까자=============== 밑에 하나 더 
            
            
            // ============= 교체함 ===============
            
	 // 현재 사용자가 참여한 방의 이전 메시지만 조회한다.
	    public List<ChatMessageDTO> getMessages(int roomId, int employeeId) {
	        if (!isRoomMember(roomId, employeeId)) {
	        	// 메시지는 반드시 방 참여자만 읽을 수 있다.
		        // 화면에서 버튼을 숨기는 것만으로는 막을 수 없어서,
		        // 서버 Service에서 반드시 다시 확인해야 한다.
	        	
	            throw new IllegalArgumentException("채팅방 참여자가 아닙니다.");
	        }

		        // 참여자 검증이 끝난 뒤에만 해당 방의 메시지 이력을 조회한다.
		        List<ChatMessageDTO> messages = chatMapper.findMessagesByRoomId(roomId);
		        String previousSentDateKey = null;

		        // 최초 화면은 JavaScript가 다시 가공하지 않도록 표시용 값까지 서버에서 준비한다.
		        for (ChatMessageDTO message : messages) {
		        	prepareMessageForDisplay(message);
		        	message.setShowDateDivider(
		        				StringUtils.hasText(message.getSentDateKey())
		        						&& !message.getSentDateKey().equals(previousSentDateKey));
		        	previousSentDateKey = message.getSentDateKey();
		        }

		        return messages;
		    }
	    
	    // ---------- 요걸로 교체 ============== 
	    

            // 읽음 커서 이동 전후 위치를 함께 반환해, 화면이 정확히 한 사람만 차감할 수 있게 한다.
            @Transactional
            // 이 메서드 안의 DB 작업을 하나의 작업 단위로 묶는다. 중간에 실패하면 DB 변경을 되돌림 
            public Map<String, Integer> markRoomAsRead(
                    int roomId,
                    int employeeId) {
            	// 특정 직원이 해당 방을 어디까지 읽었는지 갱신하고, WebSocket으로 보낼 읽음 정보를 반환.
                if (!isRoomMember(roomId, employeeId)) {
                    throw new IllegalArgumentException("채팅방 참여자가 아닙니다.");
                    // 읽음 처리도 반드시 방 참여자만 할 수 있다
                }

                Integer previousLastReadMessageId =
                        chatMapper.findLastReadMessageId(roomId, employeeId);
                // DB에 저장되어 있던 이전 읽음 위치를 가져온다. 처음 읽는 경우 null일 수 있다
                Integer latestMessageId = chatMapper.findLatestMessageId(roomId);
                // 현재 방의 가장 최신 메시지 번호를 가져온다.

                if (latestMessageId == null) {
                    return null;
                }

                int updatedCount = chatMapper.updateLastReadMessageId(
                		// 최신 메시지 번호로 갱신
                        roomId,
                        employeeId,
                        latestMessageId);

                // 이미 같은 위치까지 읽은 경우에는 다른 사람 화면의 숫자를 다시 줄이지 않는다.
                if (updatedCount == 0) {
                    return null;
                }
 
                // 읽음 정보를 WebSocket JSON으로 보낼 Map 객체
                Map<String, Integer> readEvent = new HashMap<>();
                readEvent.put("roomId", roomId);
                // 어느 채팅방에서 읽음이 발생했는지 저장
                readEvent.put("readerId", employeeId);
                // 누가 읽었는지 저장
                readEvent.put(
                        "previousLastReadMessageId",
                        previousLastReadMessageId == null
                                ? 0
                                : previousLastReadMessageId);
                // 이전 읽음 위치를 저장
                
                readEvent.put("lastReadMessageId", latestMessageId);
                // 이번에 새로 읽은 마지막 메시지 번호를 저장
                return readEvent;
            }
            
            
            // ================== 오늘 구현함 ---=============

            // 공통 헤더와 사이드바가 표시할 로그인 사용자의 전체 안 읽은 메시지 수다.
            public int getMyUnreadMessageCount(int employeeId) {
                return chatMapper.countMyUnreadMessages(employeeId);
            }
	    
	    
	    
	    
	    
	    @Transactional
	    // 메서드 안의 DB 작업을 하나의 묶음으로 처리한다는 뜻이다.
	    // 한쪽이 안되면 다시 되돌림. (IllegalArgumentException은 실행 중 예외이라 롤백 대상이 됨.)
	    
	    public int createOrFindDirectRoom(
	    // 상대와 1:1 방을 찾고 있으면 열고, 없으면 새 방으로 두 명을 참여자로 등록하는 기능이다.
	            int myEmployeeId,
	            int targetEmployeeId) { // 상대 사번.

	        // 조직도에서 자기 자신을 선택하더라도 서버에서 한 번 더 막는다.
	        if (myEmployeeId == targetEmployeeId) {
	            throw new IllegalArgumentException("본인과는 대화방을 만들 수 없습니다.");
	        }

	        // ACTIVE 계정만 채팅 대상으로 허용한다.
	        EmployeeDTO target = employeeMapper.findActiveEmployeeById(targetEmployeeId);
	        if (target == null) {
	            throw new IllegalArgumentException("대화 상대를 찾을 수 없습니다.");
	        }
	        ChatRoomDTO existingRoom = chatMapper.findExistingDirectRoom(
	                myEmployeeId,
	                targetEmployeeId);

	        // 기존 개인방이 있으면 방을 중복 생성하지 않는다.
	        if (existingRoom != null) {
	            return existingRoom.getRoomId();
	                   // DB에 있는 채팅방 
	        }

	        // 새로운 개인방 만들기 위한 준비와 DB 저장한다.
	        ChatRoomDTO newRoom = new ChatRoomDTO();
	        newRoom.setRoomType("DM"); // 이 기능을 구현시킬 채팅방의 유형을 정한다. 
	        newRoom.setRoomName(null); // 채팅방 이름은 따로 저장하지 않는다.
	        						   // - 이러는 이류 : 개인방은 상대방 이름이 나오게 정함.
	        
	        
	        chatMapper.insertChatRoom(newRoom);
	        // INSERT 쿼리를 실행해서 CHAT_ROOM 테이블에 새 방을 저장한다.

	        // DM 방은 나와 상대방, 정확히 두 명을 참여자로 저장한다.
	        chatMapper.insertChatRoomMember(newRoom.getRoomId(), myEmployeeId); // 나 
	        chatMapper.insertChatRoomMember(newRoom.getRoomId(), targetEmployeeId); // 상대방

	        return newRoom.getRoomId();
	    }
	    
	    
	    
	    
	    
	    
	    
	    
//	    ==== 그룹방 생성 기능 ====
	    
	    @Transactional
		    public int createGroupRoom(
	            int myEmployeeId,
	            List<Integer> targetEmployeeIds) {

	        // 선택 인원 목록 자체가 없으면 그룹방을 만들 수 없다.
	        if (targetEmployeeIds == null) {
	            throw new IllegalArgumentException("대화 상대를 선택해주세요.");
	        }

	        /*
	         * LinkedHashSet은 중복 직원 번호를 제거한다.
	         * 선택 순서는 유지하므로, 화면에서 먼저 선택한 직원 이름으로 기본 방 이름을 만든다.
	         */
	        Set<Integer> uniqueTargetIds =
	        		// Set - 같은 값을 중복 저장하지 않는 컬렉션.
	                new LinkedHashSet<>(targetEmployeeIds);
	        // 기존 targetEmployeeIds 목록을 LinkedHashSet으로 바꿔 새 객체를 만든다.

	        // 자기 자신을 선택한 요청은 서버에서 차단한다.
	        if (uniqueTargetIds.contains(myEmployeeId)) {
	            throw new IllegalArgumentException("본인은 대화 상대로 선택할 수 없습니다.");
	        }

	        /*
	         * 새 대화 모달에서 상대를 2명 이상 선택해야 그룹방이다.
	         * 나까지 포함하면 실제 그룹방 참여자는 최소 3명이다.
	         */
	        if (uniqueTargetIds.size() < 2) {
	            throw new IllegalArgumentException(
	                    "그룹 대화는 상대를 두 명 이상 선택해야 합니다.");
	        }

	        // ACTIVE 상태인지 검증한 실제 직원 정보를 저장할 목록이다.
	        List<EmployeeDTO> targets = new ArrayList<>();

	        for (Integer targetEmployeeId : uniqueTargetIds) {

	            // null 값은 정상적인 직원 번호가 아니다.
	            if (targetEmployeeId == null) {
	                throw new IllegalArgumentException("잘못된 직원 정보입니다.");
	            }

	            // 정지된 계정이나 존재하지 않는 직원은 그룹방에 넣지 않는다.
	            EmployeeDTO target =
	                    employeeMapper.findActiveEmployeeById(targetEmployeeId);

	            if (target == null) {
	                throw new IllegalArgumentException(
	                        "대화 상대를 찾을 수 없습니다.");
	            }

	            targets.add(target);
	        }

	        /*
	          그룹방 이름 변경 기능을 만들면 사용자가 나중에 바꿀 수 있다.
	         */
	        String roomName;
	        // 개인방 
	        if (targets.size() == 2) {
	            roomName = targets.get(0).getEmployeeName()
	            		// 목록의 첫번째 직원이다 - 자바는 0부터 시작 
	                    + ", "
	                    + targets.get(1).getEmployeeName();
	        // 그룹방 
	        } else {
	            roomName = targets.get(0).getEmployeeName()
	                    + ", "
	                    + targets.get(1).getEmployeeName()
	                    + " 외 "
	                    + (targets.size() - 2)
	                    // 첫 번째, 두 번째 직원 이름은 이미 표시했으므로 나머지 인원 수를 계산한다.
	                    // 이름 나타내기 위해 함. ( 누구 누구 외 n명 )
	                    + "명";
	        }

	        ChatRoomDTO newRoom = new ChatRoomDTO();
	        newRoom.setRoomType("GROUP");
	        newRoom.setRoomName(roomName);

	        // CHAT_ROOM에 GROUP 방을 먼저 저장한다.
	        chatMapper.insertChatRoom(newRoom);

	        // 방을 만든 현재 로그인 사용자도 참여자로 저장한다.
	        chatMapper.insertChatRoomMember(
	                newRoom.getRoomId(),
	                myEmployeeId);

	        // 선택한 ACTIVE 직원들을 모두 참여자로 저장한다.
	        for (EmployeeDTO target : targets) {
	            chatMapper.insertChatRoomMember(
	                    newRoom.getRoomId(), // 추가하면 방도 추가
	                    target.getEmployeeId()); // 추가할 사람
	        }

		        return newRoom.getRoomId();
		    }

            /*
             * 현재 방은 전혀 수정하지 않는다.
             * 기존 참여자와 새로 선택한 직원들을 모두 넣은 별도 GROUP 방을 만들고 그 번호를 반환한다.
             */
            @Transactional
            public int createInvitedGroupRoom(
            		// 기존 DM 또는 그룹방은 유지하고, 기존 참여자와 새 초대 인원으로 새 그룹방을 만드는 메서드
                    int sourceRoomId,
                    int inviterId,
                    List<Integer> invitedEmployeeIds) {

            	// 초대한 사람이 기존 방 참여자인지 검사
                if (!isRoomMember(sourceRoomId, inviterId)) {
                    throw new IllegalArgumentException("채팅방 참여자가 아닙니다.");
                }

                // 초대 목록이 없거나 비어 있으면 막는다. ||는 또는이다
                if (invitedEmployeeIds == null || invitedEmployeeIds.isEmpty()) {
                    throw new IllegalArgumentException("초대할 직원을 선택해주세요.");
                }

                // 기존 방의 참여자들을 가져와 중복 없는 LinkedHashSet에 넣는다
                Set<Integer> allMemberIds = new LinkedHashSet<>(
                        chatMapper.findRoomMemberIds(sourceRoomId));
                
                // 초대 전 참여자 수를 저장
                int memberCountBeforeInvite = allMemberIds.size();

                // 선택한 초대 대상 한 명씩 반복.
                for (Integer invitedEmployeeId : invitedEmployeeIds) {
                    if (invitedEmployeeId == null) {
                        throw new IllegalArgumentException("잘못된 직원 정보입니다.");
                    }
                    allMemberIds.add(invitedEmployeeId);
                    // 기존 참여자 목록에 초대 대상을 넣는다. 이미 있던 직원이면 Set이라 중복 저장되지 않음
                }

                if (allMemberIds.size() == memberCountBeforeInvite) {
                    throw new IllegalArgumentException("새로 초대할 직원을 선택해주세요.");
                }

                // createGroupRoom은 방을 만든 사람을 제외한 상대 목록을 받는다.
                allMemberIds.remove(inviterId);

                return createGroupRoom(
                        inviterId,
                        new ArrayList<>(allMemberIds));
                // Set을 ArrayList로 바꾼 뒤 기존 그룹방 생성 메서드를 재사용함. 새 그룹방 번호가 반환됨.
            }

            // GROUP 방 참여자만 이름을 변경할 수 있다. 개인방은 서버에서도 차단한다.
            @Transactional
            public void renameGroupRoom(
                    int roomId,
                    int employeeId,
                    String roomName) {

                ChatRoomDTO room = chatMapper.findRoomByIdAndMember(roomId, employeeId);
                // 방 정보와 현재 사용자의 참여 여부를 한 번에 조회.

                if (room == null) {
                    throw new IllegalArgumentException("채팅방 참여자가 아닙니다.");
                }

                if (!"GROUP".equals(room.getRoomType())) {
                    throw new IllegalArgumentException("개인 대화방은 이름을 변경할 수 없습니다.");
                }

                if (roomName == null || roomName.isBlank()) {
                    throw new IllegalArgumentException("대화방 이름을 입력해주세요.");
                }

                String trimmedRoomName = roomName.trim();

                if (trimmedRoomName.length() > 100) {
                    throw new IllegalArgumentException("대화방 이름은 100자 이하로 입력해주세요.");
                }

                chatMapper.updateGroupRoomName(roomId, trimmedRoomName);
                // 검증을 모두 통과한 경우에만 Mapper SQL로 DB 이름을 변경.
            }
	    
	    
	    
	    
	    
	    
	    
	    
	    // ======= 실시간 기능 추가험 ========
	    
	    @Transactional // 메서드 안 D 작업을 하나로 묶음 (하나 터지면 다 되돌림)
		    public ChatMessageDTO saveTextMessage(
	            int roomId,
	            int senderId,
	            String content) {

	        // WebSocket 주소를 조작해 다른 방에 메시지를 보내는 것을 막는다.
	        if (!isRoomMember(roomId, senderId)) {
	        	// 보내는 사람이 해당 채팅방의 참여자인지 확인한다.
	            throw new IllegalArgumentException("채팅방 참여자가 아닙니다.");
	        }

	        // 빈 메시지와 공백만 있는 메시지는 저장하지 않는다.
	        if (content == null || content.isBlank()) {
	            throw new IllegalArgumentException("메시지 내용을 입력해주세요.");
	        }

	        // CHAT_MESSAGE.CONTENT가 VARCHAR(1000)이므로 서버에서도 길이를 제한한다.
	        // 메시지 앞뒤의 불필요한 공백을 제거함.
	        String trimmedContent = content.trim();

	        if (trimmedContent.length() > 1000) {
	        	 // 앞 뒤 공백을 제가한 메세지가 1000자 이내인지 확인한다.
	        	
	            throw new IllegalArgumentException("메시지는 1000자 이하로 입력해주세요.");
	        }

	        ChatMessageDTO message = new ChatMessageDTO();
	        // DB에 담을 메세지를 저장할 DTO 객체 생성

	        // roomId와 senderId는 클라이언트가 아니라 서버가 확정한 값을 사용한다.
	        message.setRoomId(roomId);
	        message.setSenderId(senderId);

	        // 지금 단계는 일반 텍스트 메시지만 허용한다.
	        message.setMessageType("TEXT");
	        message.setContent(trimmedContent);

	        // INSERT 뒤 자동 생성된 MESSAGE_ID가 message 객체에 채워진다.
	        chatMapper.insertChatMessage(message);

		        // 시간, 보낸 사람 이름까지 포함한 완성된 메시지를 반환한다.
		        return prepareMessageForDisplay(
		        		chatMapper.findMessageById(message.getMessageId()));
		    }

	    
	    
	    
	    // ========== 추가 ========
	    
	    
            // 파일 하나를 파일 메시지 한 건으로 저장한다.
            @Transactional(rollbackFor = Exception.class)
            public ChatMessageDTO saveFileMessage(
                    int roomId,
                    int senderId,
                    MultipartFile file) throws IOException {

                if (!isRoomMember(roomId, senderId)) {
                    throw new IllegalArgumentException("채팅방 참여자가 아닙니다.");
                }

                if (file == null || file.isEmpty()) {
                    throw new IllegalArgumentException("전송할 파일을 선택해주세요.");
                }

                if (file.getSize() > 10L * 1024 * 1024) {
                	// 10L은 long 숫자이다. 파일 크기가 10MB보다 큰지 확인
                    throw new IllegalArgumentException("파일은 10MB 이하로 전송해주세요.");
                }

                // 브라우저가 보낸 원본 파일명을 가져옴
             // cleanPath()로 경로에 섞인 위험한 표현을 정리.
                String originalFileName = StringUtils.cleanPath(
                        Objects.requireNonNullElse(file.getOriginalFilename(), ""));
                // 파일명이 null이면 빈 문자열 ""로 바꿉니다

                
                // 빈 이름, ..이 포함된 경로 조작 시도, 300자 초과 파일명을 막는다
                if (originalFileName.isBlank()
                        || originalFileName.contains("..")
                        || originalFileName.length() > 300) {
                    throw new IllegalArgumentException("올바른 파일 이름이 아닙니다.");
                }

                // 설정 파일의 상대 경로 uploads/chat을 실제 절대 경로로 바꾸고 정리
                Path uploadRoot = Paths.get(chatUploadDir)
                        .toAbsolutePath()
                        .normalize();
                Files.createDirectories(uploadRoot);
                // 업로드 폴더가 없다면 만든다.

                // 원본 파일명에서 확장자를 추출한다. ex) report.pdf면 pdf 이다
                String extension = StringUtils.getFilenameExtension(originalFileName);
                // 실제 저장 파일명을 UUID로 만든다. 확장자가 있으면 붙이고, 없으면 UUID만 사용.
                String storedFileName = UUID.randomUUID()
                        + (StringUtils.hasText(extension) ? "." + extension : "");
                // 업로드 폴더와 UUID 파일명을 합쳐 실제 저장 위치를 만든다
                Path targetPath = uploadRoot.resolve(storedFileName).normalize();

                // 계산한 파일 경로가 업로드 폴더 밖으로 나가면 막는다
                if (!targetPath.startsWith(uploadRoot)) {
                    throw new IllegalArgumentException("올바르지 않은 파일 경로입니다.");
                }

                // 업로드 파일을 읽는 통로를 열고, try (...)가 끝나면 자동으로 닫는다
                try (InputStream inputStream = file.getInputStream()) {
                    Files.copy(inputStream, targetPath, StandardCopyOption.REPLACE_EXISTING);
                    // 브라우저 파일 내용을 실제 서버 폴더에 복사함
                }

                try {
                	// CHAT_MESSAGE에 저장할 FILE 메시지 객체
                    ChatMessageDTO message = new ChatMessageDTO();
                    message.setRoomId(roomId); 
                    message.setSenderId(senderId);
                    message.setMessageType("FILE"); // 타입은 FILE
                    message.setContent(null); // 본문은 null 
                    chatMapper.insertChatMessage(message);

                    ChatAttachmentDTO attachment = new ChatAttachmentDTO();
                    attachment.setMessageId(message.getMessageId());
                    attachment.setFileName(originalFileName);
                    attachment.setFilePath(storedFileName);
                    attachment.setFileSize(file.getSize());
                    chatMapper.insertChatAttachment(attachment);
                    // CHAT_MESSAGE에 FILE 메시지를 저장. 저장 후 자동 생성된 messageId가 DTO에 들어감

		            	return prepareMessageForDisplay(
		            				chatMapper.findMessageById(message.getMessageId()));
                } catch (RuntimeException exception) {
                    Files.deleteIfExists(targetPath);
                    throw exception;
                }
            }

            // Thymeleaf와 WebSocket이 같은 파일 크기 문자열을 사용하게 한다.
            private ChatMessageDTO prepareMessageForDisplay(ChatMessageDTO message) {
                if (message != null && message.getAttachment() != null) {
                    message.getAttachment().setDisplayFileSize(
                            formatFileSize(message.getAttachment().getFileSize()));
                }

                return message;
            }

            private String formatFileSize(long fileSize) {
                if (fileSize < 1024) {
                    return fileSize + " B";
                }

                if (fileSize < 1024L * 1024L) {
                    return String.format("%.1f KB", fileSize / 1024.0);
                }

                return String.format("%.1f MB", fileSize / (1024.0 * 1024.0));
            }

            // 다운로드 요청도 메시지 조회와 똑같이 방 참여자인지 먼저 검사한다.
            // 파일 다운로드에 필요한 첨부파일 정보를 반환하는 메서드
            public ChatAttachmentDTO getAttachmentForDownload(
                    int attachId,
                    int employeeId) {

            	// Mapper SQL로 attachId에 해당하는 파일 정보를 DB에서 조회. 이때 파일이 속한 roomId도 함께 가져와야 한다
                ChatAttachmentDTO attachment = chatMapper.findAttachmentById(attachId);

                //DB에 해당 파일이 없으면 attachment는 null
                if (attachment == null) {
                    throw new IllegalArgumentException("첨부파일을 찾을 수 없습니다.");
                }

                if (!isRoomMember(attachment.getRoomId(), employeeId)) {
                	// attachment.getRoomId(): 파일이 올라온 채팅방 번호
                	// isRoomMember(...): 현재 직원이 그 방 참여자인지 확인
                	// 파일 URL만 알아도 다른 사람이 받지 못하게 막는 핵심 권한 검사.
                    throw new IllegalArgumentException("첨부파일을 다운로드할 권한이 없습니다.");
                }

                return attachment;
            }

            // DB의 파일 정보를 받아 실제 서버 폴더의 파일 위치를 만드는 메서드
            public Path getAttachmentPath(ChatAttachmentDTO attachment) {
                Path uploadRoot = Paths.get(chatUploadDir) // 설정값 uploads/chat을 경로 객체로 만듦
                        .toAbsolutePath() // 실제 절대 경로로 변환
                        .normalize(); // 같은 불필요하거나 위험한 경로 표현을 정리
                Path filePath = uploadRoot
                		.resolve(attachment.getFilePath())
                		.normalize();
                // attachment.getFilePath(): DB에 저장한 UUID 파일명
                // .resolve(...): 업로드 폴더와 UUID 파일명을 합침
                // .normalize(): 합친 경로를 다시 안전하게 정리
                //ex) uploads/chat + 7aa1...-uuid.pdf -> /Users/.../uploads/chat/7aa1...-uuid.pdf로 됨 
                
                
                if (!filePath.startsWith(uploadRoot)) {
                	// 완성된 파일 경로가 반드시 업로드 폴더 내부에 있는지 확인
                    throw new IllegalArgumentException("올바르지 않은 파일 경로입니다.");
                }

                return filePath;
            }
	    


}
	
	
	
