package com.groupware.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.groupware.dto.EmployeeDTO;
import com.groupware.dto.RepositoryDTO;
import com.groupware.mapper.RepositoryMapper;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class RepositoryService {

	private final RepositoryMapper repositoryMapper;

	// 로그인 사용자가 볼 수 있는 자료실(전사 공용 + 본인 부서) 목록 - 좌측 폴더 탭에 사용
	// 관리자는 부서 제한과 무관하게 전체 자료실을 봐야 함 (canAccessRepository와 기준을 맞춤)
	public List<RepositoryDTO> getAccessibleRepositories(EmployeeDTO employee) {
		if ("ADMIN".equals(employee.getEmployeeRole())) {
			return repositoryMapper.findAllRepositories();
		}
		return repositoryMapper.findAccessibleRepositories(employee.getDeptId());
	}

	// 접근 권한 재검증 - 공용(DEPT_ID NULL)이거나, 관리자이거나, 본인 부서 자료실인지
	// (기획서.md 4장: "부서 제한 자료실 | 해당 부서만 | ... | 관리자 ✅" - 관리자는 전체 접근)
	public boolean canAccessRepository(EmployeeDTO employee, int repoId) {
		RepositoryDTO repo = repositoryMapper.findRepositoryById(repoId);
		if (repo == null) {
			return false;
		}
		if (repo.getDeptId() == null) {
			return true;
		}
		if ("ADMIN".equals(employee.getEmployeeRole())) {
			return true;
		}
		return repo.getDeptId() == employee.getDeptId();
	}
}
