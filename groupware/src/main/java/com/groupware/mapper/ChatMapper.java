package com.groupware.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.groupware.dto.ChatMessageDTO;
import com.groupware.dto.ChatRoomDTO;

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
}
