package com.groupware.service;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.groupware.dto.EmployeeDTO;
import com.groupware.mapper.EmployeeMapper;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class EmployeeService {

	private final EmployeeMapper employeeMapper;
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
	
}