package com.groupware.dto;

import lombok.Data;

@Data
public class NoticeDTO {
	private int noticeId;
	private int writerId;
	private String noticeTitle;
	private String noticeContent;
	private boolean isPinned;
	private int viewCount;
	private String createdAt;
	private String updatedAt;

	// 작성자 이름 + 소속 부서명(admin 계정은 부서가 없어 null 가능) - 목록 조회 시 조인해서 채움
	private String writerName;
	private String writerDeptName;
}
