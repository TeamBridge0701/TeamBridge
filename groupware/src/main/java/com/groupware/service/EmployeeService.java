package com.groupware.service;

import java.time.LocalDate;
import java.util.List;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.groupware.dto.DepartmentDTO;
import com.groupware.dto.EmployeeDTO;
import com.groupware.dto.PositionDTO;
import com.groupware.mapper.DepartmentMapper;
import com.groupware.mapper.EmployeeMapper;
import com.groupware.mapper.PositionMapper;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class EmployeeService {

	private final EmployeeMapper employeeMapper;
	private final DepartmentMapper departmentMapper;
	private final PositionMapper positionMapper;
	private final PasswordEncoder passwordEncoder;

	// roleText는 저장 안 하고 매번 계산 (POSITION 바뀌면 어긋날 수 있어서)
	public EmployeeDTO getMyPageInfo(int employeeId) {
		EmployeeDTO employeeDTO = employeeMapper.findMyPageInfo(employeeId);

		// ADMIN 먼저 체크 - positionRank가 null→0이라 안 그러면 "일반 임직원"으로 잘못 나옴
		if ("ADMIN".equals(employeeDTO.getEmployeeRole())) {
			employeeDTO.setRoleText("관리자");
		} else if (employeeDTO.getPositionRank() == 1) {
			employeeDTO.setRoleText("부서장");
		} else if (employeeDTO.getPositionRank() == 2) {
			employeeDTO.setRoleText("팀장");
		} else {
			employeeDTO.setRoleText("일반 임직원");
		}

		return employeeDTO;
	}

	public boolean changePassword(int employeeId, String currentPassword, String newPassword) {
		EmployeeDTO employee = employeeMapper.findMyPageInfo(employeeId);

		// matches(): Spring Security 라이브러리 함수 - 해시를 복원하는 게 아니라
		// currentPassword를 다시 해싱해서 저장된 해시와 같은지만 비교(단방향이라 복원 불가)
		if (!passwordEncoder.matches(currentPassword, employee.getEmployeePwd())) {
			return false;
		}

		// newPassword(평문) → 여기서 BCrypt로 해싱 (SecurityConfig는 도구만 등록, 실행은 여기)
		// 해시된 값만 Mapper로 넘겨서 저장 (평문은 저장 안 함)
		employeeMapper.updatePassword(employeeId, passwordEncoder.encode(newPassword));
		return true;
	}

	public void updateContact(int employeeId, String employeePhone, String employeeEmail) {
		employeeMapper.updateContact(employeeId, employeePhone, employeeEmail);
	}
	
	// 관리자: 계정 목록 조회 (keyword 없으면 전체)
	public List<EmployeeDTO> getAllEmployees(String keyword) {
		return employeeMapper.findAll(keyword);
	}

	// 관리자: 등록/수정 모달 부서 드롭다운
	public List<DepartmentDTO> getDepartments() {
		return departmentMapper.findAll();
	}

	// 관리자: 등록/수정 모달 직급 드롭다운
	public List<PositionDTO> getPositions() {
		return positionMapper.findAll();
	}

	// 관리자: 인사정보 수정 (이름/부서/직급/연락처)
	public void updateEmployeeInfo(EmployeeDTO employeeDTO) {
		employeeMapper.updateInfo(employeeDTO);
	}

	// 관리자: 신규 사원 등록
	// 사번 규칙(팀 확정) = 입사연도 4자리 + 그 해 입사 순번 3자리 (예: 2026년 첫 입사자 → 2026001)
	// 초기 비밀번호는 PW 리셋과 동일하게 "사번과 같음" 정책을 그대로 적용
	// 입사일은 화면에 입력란이 없어 등록일(오늘)로 채움
	public EmployeeDTO createEmployee(EmployeeDTO employeeDTO) {
		String employeeNo = generateEmployeeNo();
		employeeDTO.setEmployeeNo(employeeNo);
		employeeDTO.setEmployeePwd(passwordEncoder.encode(employeeNo));
		employeeDTO.setHireDate(LocalDate.now().toString());
		employeeMapper.insert(employeeDTO);
		return employeeDTO;
	}

	// 올해 마지막 순번 다음 값을 3자리 0채움으로 반환 (예: 2026001, 2026002 ...)
	// 999명을 넘어가는 해는 현재 로직에서 다루지 않음 - 필요해지면 자리수부터 다시 논의
	private String generateEmployeeNo() {
		String year = String.valueOf(LocalDate.now().getYear());
		String maxNo = employeeMapper.findMaxEmployeeNoByYear(year);

		int nextSeq = 1;
		if (maxNo != null) {
			nextSeq = Integer.parseInt(maxNo.substring(year.length())) + 1;
		}

		return year + String.format("%03d", nextSeq);
	}

	// 관리자: 재직 상태 변경 - ACTIVE/SUSPENDED 외 값은 거부 (서버 재검증, 화면 select 값만 믿지 않음)
	public boolean updateEmployeeStatus(int employeeId, String employeeStatus) {
		if (!"ACTIVE".equals(employeeStatus) && !"SUSPENDED".equals(employeeStatus)) {
			return false;
		}
		employeeMapper.updateStatus(employeeId, employeeStatus);
		return true;
	}

	// 관리자: 비밀번호 초기화 - 임시 비밀번호는 본인 사번으로 통일해서 안내 없이도 재로그인 가능하게 함
	// (직원이 로그인 후 마이페이지에서 바로 바꾸는 걸 전제. 팀에서 다른 규칙 정하면 이 메서드만 바꾸면 됨)
	public void resetPassword(int employeeId) {
		EmployeeDTO employee = employeeMapper.findMyPageInfo(employeeId);
		employeeMapper.updatePassword(employeeId, passwordEncoder.encode(employee.getEmployeeNo()));
	}

}