package com.groupware.dto;

import lombok.Data;

@Data
public class ChatMessageDTO {
	private int messageId;
	private int roomId;
	// 시스템 메시지는 보낸 사람이 없어서 NULL
	// -> int(기본형)는 null을 못 담아서 Integer 사용
	private Integer senderId;
	private String messageType;
	private String content;
	private String sentAt;
	// 최초 화면과 실시간 수신 화면이 같은 날짜·시간 표현을 쓰도록 DB 조회 결과를 담는다.
	private String sentDateKey;
	private String displaySentDate;
	private String displaySentTime;
	// Thymeleaf가 기존 메시지 앞에 날짜 구분선을 출력할지 판단하는 값이다.
	private boolean showDateDivider;
	// 내가 보낸 메시지를 아직 읽지 않은 다른 참여자 수다.
	private int unreadMemberCount;
	
    // EMPLOYEE와 LEFT JOIN해 메시지 말풍선에 표시한다.
    private String senderName;
    // 발신자 이름 
	private String senderProfileImg;
	// 발신자 프로필 이미지 
    // FILE 메시지일 때만 채워지는 첨부파일 정보다.
    private ChatAttachmentDTO attachment;
    
}
