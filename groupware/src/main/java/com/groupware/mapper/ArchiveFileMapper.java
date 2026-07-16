package com.groupware.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.groupware.dto.ArchiveFileDTO;

@Mapper
public interface ArchiveFileMapper {

	// 신규 첨부파일 등록 - 게시글 하나에 여러 개 있을 수 있어 ArchiveService에서 파일 수만큼 반복 호출
	int insertArchiveFile(ArchiveFileDTO file);

	// 게시글 상세 화면의 첨부파일 목록
	List<ArchiveFileDTO> findFilesByArchiveId(@Param("archiveId") int archiveId);

	// 다운로드 시 실제 저장 경로(FILE_PATH) 확인 + 그 파일이 속한 REPO_ID 접근 권한 재검증용
	ArchiveFileDTO findFileById(@Param("fileId") int fileId);

	// 게시글 삭제 시 첨부파일 행도 함께 삭제 (물리 파일 삭제는 Service에서 별도 처리)
	int deleteFilesByArchiveId(@Param("archiveId") int archiveId);
}
