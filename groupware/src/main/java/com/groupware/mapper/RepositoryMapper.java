package com.groupware.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.groupware.dto.RepositoryDTO;

@Mapper
public interface RepositoryMapper {

	// 로그인 사용자가 볼 수 있는 자료실 목록 - 전사 공용(DEPT_ID NULL) + 본인 부서
	List<RepositoryDTO> findAccessibleRepositories(@Param("deptId") int deptId);

	// 관리자 전용 - 부서 제한 여부와 상관없이 전체 자료실 목록
	// (기획서.md 4장: "부서 제한 자료실 ... 관리자 ✅" - 관리자는 전체 접근)
	List<RepositoryDTO> findAllRepositories();

	// 특정 REPO_ID 하나 조회 - 게시글 조회/작성 시 접근 권한(공용인지, 본인 부서인지) 재검증용
	RepositoryDTO findRepositoryById(@Param("repoId") int repoId);
}
