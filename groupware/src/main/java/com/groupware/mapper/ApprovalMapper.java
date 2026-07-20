package com.groupware.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.groupware.dto.ApprovalDTO;

@Mapper
public interface ApprovalMapper {

	// 신규 기안 등록 - APPROVAL_ID는 AUTO_INCREMENT이므로 insert 후 파라미터 객체에 채워 받아야
	// 같은 트랜잭션에서 APPROVAL_LINE/APPROVAL_REFERENCE에 FK로 사용할 수 있음
	int insertApproval(ApprovalDTO approval);

	// 받은 결재함 - 나에게 배정된 단계이면서, 그 문서의 "지금 차례"(MIN(STEP_NO) WHERE WAIT)인 것만
	List<ApprovalDTO> findInbox(@Param("employeeId") int employeeId);

	// 보낸 기안함 - 내가 기안한 문서 전체(진행중/승인/반려 모두 포함)
	List<ApprovalDTO> findOutbox(@Param("drafterId") int drafterId);

	// 참조 문서함 - 내 부서 전체 참조 지정 OR 나 개인 참조 지정 OR 내가 결재선에 있지만
	// 기안자는 아닌 문서 (Service에서 세 조건을 UNION으로 묶어 넘겨줌)
	List<ApprovalDTO> findReferenceBox(@Param("employeeId") int employeeId, @Param("deptId") int deptId);

	// 결재 상세 - 서식명/기안자 이름·부서·직급 조인 + 현재 대기 단계(currentStep) 계산
	ApprovalDTO findDetail(@Param("approvalId") int approvalId);

	// 승인/반려 처리 - 반려 즉시, 또는 마지막 단계 승인 시 문서 전체 상태 갱신
	int updateApprovalStatus(@Param("approvalId") int approvalId, @Param("approvalStatus") String approvalStatus);
}
