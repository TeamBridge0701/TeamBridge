package com.groupware.dto;

import java.util.List;

import lombok.Data;

@Data
public class ApprovalDTO {
	private int approvalId;
	private int drafterId;
	private int formTypeId;
	private String approvalTitle;
	private String approvalContent;
	// 휴가 신청서가 아니면 NULL -> Integer가 아니라 String이라 그대로 null 담을 수 있음
	private String leaveStartDate;
	private String leaveEndDate;
	private String approvalStatus;
	private String createdAt;

	// 목록/상세 화면 표시용 - 조인 결과를 담는 필드(테이블 컬럼 아님, NoticeDTO/ArchiveDTO와 동일한 패턴)
	private String formTypeName;
	private String drafterName;
	private String drafterDeptName;
	private String drafterPositionName;

	// 지금 결재 대기 중인 단계 번호 - MIN(STEP_NO) WHERE LINE_STATUS='WAIT'로 계산.
	// 이미 승인/반려로 끝난 문서면 대기 중인 단계가 없어 NULL (완료 표시로 사용)
	private Integer currentStep;

	// 상세 조회(JSON) 응답에만 채워짐 - 목록 조회에서는 항상 null
	private List<ApprovalLineDTO> lines;

	// 상세 조회(JSON) 응답에만 채워짐 - 승인/반려 버튼 노출 여부(ApprovalController가
	// canDecideApproval 결과를 그대로 채워줌). 실제 승인/반려 요청은 서버가 다시 검증하므로
	// 이 값은 화면단 버튼 숨김용일 뿐 보안 경계가 아니다.
	private boolean canDecide;
}
