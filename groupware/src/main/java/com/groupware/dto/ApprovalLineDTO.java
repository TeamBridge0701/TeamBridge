package com.groupware.dto;

import lombok.Data;

@Data
public class ApprovalLineDTO {
	private int lineId;
	private int approvalId;
	private int stepNo;
	private int approverId;
	private String lineStatus;
	private String lineComment;
	private String decidedAt;

	// 결재 상세 모달의 스테퍼 표시용 - 조인 결과(테이블 컬럼 아님)
	private String approverName;
	private String approverPositionName;
}
