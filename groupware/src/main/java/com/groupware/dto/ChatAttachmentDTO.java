package com.groupware.dto;

import lombok.Data;

@Data
public class ChatAttachmentDTO {
	private int attachId;
	private int messageId;
	// 첨부파일 다운로드 권한을 검사할 때 메시지가 속한 방 번호도 함께 조회한다.
	private int roomId;
	private String fileName;
	// 실제 저장 폴더 아래의 UUID 파일명만 저장한다. 외부에 전체 서버 경로를 노출하지 않는다.
	private String filePath;
	private long fileSize;
	// 파일 말풍선에서 그대로 출력할 사람이 읽기 쉬운 파일 크기다.
	private String displayFileSize;
}
