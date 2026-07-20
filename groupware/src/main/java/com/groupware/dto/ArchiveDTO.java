package com.groupware.dto;

import java.util.List;

import lombok.Data;

@Data
public class ArchiveDTO {
	private int archiveId;
	private int repoId;
	private int writerId;
	private String archiveTitle;
	private String archiveContent;
	private String createdAt;
	private String updatedAt;

	// 목록/상세 화면 표시용 - NoticeDTO와 동일하게 조인 결과를 담는 필드(테이블 컬럼 아님)
	private String writerName;
	private String writerDeptName;
	private int fileCount;

	// 상세 조회(JSON) 응답에만 채워짐 - 목록 조회에서는 항상 null (ArchiveService.getArchiveDetail 참고)
	private List<ArchiveFileDTO> files;
}
