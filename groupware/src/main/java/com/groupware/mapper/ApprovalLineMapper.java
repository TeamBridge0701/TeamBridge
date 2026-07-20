package com.groupware.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.groupware.dto.ApprovalLineDTO;

@Mapper
public interface ApprovalLineMapper {

	// 결재선 단계 1건 등록 - 서식의 APPROVAL_STEP_COUNT만큼 반복 호출됨(1~2회)
	int insertLine(ApprovalLineDTO line);

	// 결재 상세 모달의 스테퍼용 - 이 문서의 결재선 전체(승인자 이름/직급 포함), STEP_NO 순
	List<ApprovalLineDTO> findLinesByApprovalId(@Param("approvalId") int approvalId);

	// 승인/반려 처리 - 해당 단계의 상태·의견을 갱신하고 처리 시각(DECIDED_AT)을 NOW()로 기록
	int updateLineDecision(@Param("lineId") int lineId, @Param("lineStatus") String lineStatus,
			@Param("lineComment") String lineComment);

	// 이 문서에 아직 WAIT 상태로 남은 단계가 있는지 - 0이면 방금 처리한 단계가 마지막 단계였다는 뜻
	int countWaitingLines(@Param("approvalId") int approvalId);
}
