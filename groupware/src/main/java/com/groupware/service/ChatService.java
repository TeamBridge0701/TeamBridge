package com.groupware.service;

	import java.util.List;

	import org.springframework.stereotype.Service;
	import org.springframework.transaction.annotation.Transactional;

	import com.groupware.dto.ChatMessageDTO;
	import com.groupware.dto.ChatRoomDTO;
	import com.groupware.dto.EmployeeDTO;
	import com.groupware.mapper.ChatMapper;
	import com.groupware.mapper.EmployeeMapper;

	import lombok.RequiredArgsConstructor;

	@Service
	@RequiredArgsConstructor
	public class ChatService {

	    private final ChatMapper chatMapper;

	    // 조직도에서 이미 쓰는 직원 조회 매퍼를 채팅 대상 검증에도 재사용한다.
	    private final EmployeeMapper employeeMapper;

	    public List<ChatRoomDTO> getMyChatRooms(int employeeId) {
	        return chatMapper.findMyChatRooms(employeeId);
	    }
	    // ChatRoomDTO 목록에서 로그인한 멤버 

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
	    
	 // 현재 사용자가 참여한 방의 이전 메시지만 조회한다.
	    public List<ChatMessageDTO> getMessages(int roomId, int employeeId) {
	        if (!isRoomMember(roomId, employeeId)) {
	        	// 메시지는 반드시 방 참여자만 읽을 수 있다.
		        // 화면에서 버튼을 숨기는 것만으로는 막을 수 없어서,
		        // 서버 Service에서 반드시 다시 확인해야 한다.
	        	
	            throw new IllegalArgumentException("채팅방 참여자가 아닙니다.");
	        }

	        // 참여자 검증이 끝난 뒤에만 해당 방의 메시지 이력을 조회한다.
	        return chatMapper.findMessagesByRoomId(roomId);
	    }
}
	
	
	
