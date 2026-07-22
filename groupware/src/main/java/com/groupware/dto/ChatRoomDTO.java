package com.groupware.dto;

import lombok.Data;

@Data
public class ChatRoomDTO {
	private int roomId;
	// 채팅방 번호 
	
	private String roomType;
	// GROUP 방만 값이 있고 DM 방은 NULL
	private String roomName;
	// 채팅방 이름 
	private String createdAt;
	// 채팅방 개설된 시간 
	
    // DM은 상대방 이름, GROUP은 ROOM_NAME을 화면에 표시한다.
    private String displayName;
    // DM 상대방의 프로필 사진 파일명이다. GROUP 방은 아바타를 "단"으로 고정한다.
    private String displayProfileImg;
    // ChatMapper의 DISPLAY_WORK_STATUS 값을 받는다.
    // GROUP은 "단" 아바타에 점을 표시하지 않으므로 null이고, DM 상대만 WORKING/OFFLINE 값을 가진다.
    private String displayWorkStatus;

    // CHAT_MESSAGE 조회 결과로 채팅방 목록에 표시한다.
    private String lastMessage;
    // 마지막 메세지 
    
    private String lastMessageType;
    // 마지막 메세지 유형 (텍스트/ 파일)
    
    private String lastSentAt;
    // 마지막으로 메세지가 전송된 시간

    // CHAT_ROOM_MEMBER.LAST_READ_MESSAGE_ID를 기준으로 계산한다.
    private int unreadCount;
    // 안읽음 개수 
}
