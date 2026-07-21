package com.groupware.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.groupware.dto.ApprovalFileDTO;

@Mapper
public interface ApprovalFileMapper {

	// 신규 첨부파일 등록 - 게시글 하나에 여러 개 있을 수 있어 ApprovalService에서 파일 수만큼 반복 호출
	int insertApprovalFile(ApprovalFileDTO file);

	// 결재 상세 화면의 첨부파일 목록
	List<ApprovalFileDTO> findFilesByApprovalId(@Param("approvalId") int approvalId);

	// 다운로드 시 실제 저장 경로(FILE_PATH) 확인 + 그 파일이 속한 문서의 열람 권한 재검증용
	ApprovalFileDTO findFileById(@Param("fileId") int fileId);
}
