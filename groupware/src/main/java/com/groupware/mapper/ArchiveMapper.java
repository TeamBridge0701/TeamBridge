package com.groupware.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.groupware.dto.ArchiveDTO;

@Mapper
public interface ArchiveMapper {

	// 특정 자료실(REPO_ID)의 게시글 목록 - 제목/본문 검색(keyword) + 첨부파일 개수까지 함께 조회
	List<ArchiveDTO> findArchives(@Param("repoId") int repoId, @Param("keyword") String keyword,
			@Param("offset") int offset, @Param("size") int size);

	// 목록 페이징용 총 건수 - findArchives와 조건(WHERE) 동일하게 유지
	int countArchives(@Param("repoId") int repoId, @Param("keyword") String keyword);

	// 상세 조회 - 작성자 이름/부서명 조인 (첨부파일 목록은 ArchiveFileMapper에서 별도 조회)
	ArchiveDTO findArchiveDetail(@Param("archiveId") int archiveId);

	// 신규 등록 - ARCHIVE_ID는 AUTO_INCREMENT이므로 insert 후 파라미터 객체에 채워 받아야
	// 같은 트랜잭션에서 ARCHIVE_FILE에 FK로 사용할 수 있음
	int insertArchive(ArchiveDTO archive);

	// 수정 - 작성자(WRITER_ID)/자료실(REPO_ID)은 바뀌지 않음
	int updateArchive(@Param("archiveId") int archiveId, @Param("archiveTitle") String archiveTitle,
			@Param("archiveContent") String archiveContent);

	int deleteArchive(@Param("archiveId") int archiveId);
}
