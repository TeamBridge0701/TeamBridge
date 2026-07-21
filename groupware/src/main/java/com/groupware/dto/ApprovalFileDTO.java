package com.groupware.dto;

import lombok.Data;

@Data
public class ApprovalFileDTO {
	private int fileId;
	private int approvalId;
	private String fileName;
	private String filePath;
	private long fileSize;
	private String uploadedAt;
}
