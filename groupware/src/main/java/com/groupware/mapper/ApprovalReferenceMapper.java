package com.groupware.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.groupware.dto.ApprovalReferenceDTO;

@Mapper
public interface ApprovalReferenceMapper {

	// 참조 대상 1건 등록 - DEPT_ID 또는 EMPLOYEE_ID 중 정확히 하나만 채워서 호출
	// (선택된 부서/직원 개수만큼 반복 호출됨, ERD 2-13 CHECK 제약을 Service에서도 재검증)
	int insertReference(ApprovalReferenceDTO reference);

	// 상세 조회 권한 재검증용 - 이 문서에 지정된 참조 대상(부서/개인) 전체
	List<ApprovalReferenceDTO> findByApprovalId(@Param("approvalId") int approvalId);
}
