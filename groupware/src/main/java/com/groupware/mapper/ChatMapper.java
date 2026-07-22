package com.groupware.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.groupware.dto.ChatAttachmentDTO;
import com.groupware.dto.ChatMessageDTO;
import com.groupware.dto.ChatRoomDTO;
import com.groupware.dto.EmployeeDTO;

@Mapper
public interface ChatMapper {

	// 현재 로그인한 사람이 참여한 채팅방만 조회한다.
	List<ChatRoomDTO> findMyChatRooms(
			@Param("employeeId") int employeeId);
	
	// 방 번호와 현재 로그인 직원을 함께 확인한다.
    // null이면 방이 없거나, 해당 직원이 참여자가 아님.
	ChatRoomDTO findRoomByIdAndMember(
            @Param("roomId") int roomId,
            @Param("employeeId") int employeeId);
	
	// 방에 저장된 이전 메시지를 오래된 순서대로 조회한다.
    List<ChatMessageDTO> findMessagesByRoomId(@Param("roomId") int roomId);
    
 // 두 사람이 정확히 참여 중인 기존 DM 방을 찾는다.
    ChatRoomDTO findExistingDirectRoom(
            @Param("myEmployeeId") int myEmployeeId,
            						// 내 사번 
            @Param("targetEmployeeId") int targetEmployeeId);
    								// 상대방 사번 

    // useGeneratedKeys가 생성된 ROOM_ID를 ChatRoomDTO.roomId에 채운다.
    // useGeneratedKeys - DB에 새 메시지를 저장할 때 자동으로 생성된 ID를 DB로부터 다시 받아오는 기능
    int insertChatRoom(ChatRoomDTO chatRoom);

    // 새 채팅방에 직원 한 명을 참여자로 저장한다.
    int insertChatRoomMember(
            @Param("roomId") int roomId,
            @Param("employeeId") int employeeId);

    // CHAT_ROOM_MEMBER의 참여 연결 한 건을 삭제한다.
    // @Param("...")은 XML의 #{roomId}, #{employeeId}와 Java 매개변수 이름을 연결한다.
    // int 반환값은 실제로 삭제된 행 수이며, Service가 1인지 확인해 실패를 판단한다.
    int deleteChatRoomMember(
            @Param("roomId") int roomId,
            @Param("employeeId") int employeeId);

    
    // ========================= 0719에 추가함 =======================
    
    
    // 방에 참여한 직원 번호와 WebSocket 개인 알림용 사번을 각각 조회한다.
    
    // 특정 채팅방에 참여한 직원들의 ID 목록을 조회한다.
    // 직원 아이디가 여러개여서 list로 반환 
    List<Integer> findRoomMemberIds(@Param("roomId") int roomId);
    								// XML에서 이 값을 #{roomId}라는 이름으로 사용하기 위한 설정이다

    // 참여자 목록 모달에 표시할 직원 정보를 조회한다.
    // List<EmployeeDTO>는 한 방에 참여자가 여러 명일 수 있어 EmployeeDTO를 여러 건 반환한다.
    // @Param("roomId")의 값은 XML SQL의 #{roomId}에 전달된다.
    List<EmployeeDTO> findRoomMembers(@Param("roomId") int roomId);

    // 특정 채팅방 참여자들의 사번 목록을 조회한다.
    List<String> findRoomMemberEmployeeNos(@Param("roomId") int roomId);

    
    
    // 특정 채팅방에서 가장 최근 메시지의 ID를 조회.
    Integer findLatestMessageId(@Param("roomId") int roomId);

    // 특정 직원이 특정 채팅방에서 마지막으로 읽은 메시지 ID를 조회한다.
    Integer findLastReadMessageId(
            @Param("roomId") int roomId,
            @Param("employeeId") int employeeId);
    // ex) 채팅방 3번에서 직원 1001이 마지막으로 읽은 메시지 ID = 20 로 찾음

    // 현재 읽지 않은 메시지의 전체 개수를 조회.
    int countMyUnreadMessages(@Param("employeeId") int employeeId);

    // 특정 채팅방을 어디까지 읽었는지 갱신함.
    int updateLastReadMessageId(
            @Param("roomId") int roomId,
            @Param("employeeId") int employeeId,
            @Param("messageId") int messageId);

    // 갠방은 이름이 없으므로 그룹방만 이 SQL을 통해 이름을 바꿈.
    int updateGroupRoomName(
    // 반환되는 int는 수정된 행의 개수이다. 
    		
            @Param("roomId") int roomId,
            @Param("roomName") String roomName);

    
    
    
    
    // =========== 실시간 채팅 추가 =============
    
    // 새 텍스트 메시지를 CHAT_MESSAGE에 저장한다.
    // INSERT 후 생성된 MESSAGE_ID는 ChatMessageDTO.messageId에 담긴다.
    int insertChatMessage(ChatMessageDTO chatMessage);

    // INSERT 직후 메시지 시간, 발신자 이름, 프로필까지 포함한 한 건을 다시 조회한다.
    ChatMessageDTO findMessageById(
            @Param("messageId") int messageId);

    // 파일 메시지와 연결되는 첨부파일 한 건을 저장,조회한다.
    int insertChatAttachment(ChatAttachmentDTO attachment);
    											// 파일 정보가 담긴 DTO

    // 첨부파일 ID로 첨부파일 정보를 하나 조회.
    ChatAttachmentDTO findAttachmentById(@Param("attachId") int attachId);
    // attachId - 첨부파일 번호
    // 첨부파일 다운로드나 파일 정보 표시 전에 사용할 수 있다. 
    
    
    
    
    
}
