package com.groupware.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import com.groupware.dto.DepartmentDTO;
import com.groupware.dto.EmployeeDTO;
import com.groupware.dto.PositionDTO;
import com.groupware.service.EmployeeService;

import lombok.RequiredArgsConstructor;

// /admin/** 은 SecurityConfig에서 ROLE_ADMIN만 접근 가능하도록 이미 막아뒀으므로,
// 여기서는 로그인/권한 여부를 따로 체크하지 않아도 된다.
@Controller
@RequiredArgsConstructor
public class AdminController {

	private final EmployeeService employeeService;

	// 관리자 화면(계정·인사정보 관리) 진입. 표 데이터는 화면 로드 후 JS가
	// GET /admin/member를 호출해서 채운다 (검색어 입력 시 재호출하는 구조라 SSR 대신 AJAX로 감).
	@GetMapping("/admin")
	public String admin() {
		return "admin/admin";
	}

	// 계정 목록 조회 (keyword 없으면 전체) - 검색창 onkeyup에서 반복 호출됨
	// 경로가 복수형(members)인 이유: 역할구분.md 1-4에 이미 이 이름으로 명시돼 있음
	@GetMapping("/admin/members")
	@ResponseBody
	public List<EmployeeDTO> getMembers(@RequestParam(value = "keyword", required = false) String keyword) {
		return employeeService.getAllEmployees(keyword);
	}

	// 등록/수정 모달의 부서 드롭다운 - 역할구분.md API 목록엔 없지만, 모달이 DEPT_ID를
	// 실제 값으로 받으려면 DB 조회가 있어야 해서 추가함 (admin.html의 하드코딩된
	// <option> 대신 실제 DEPARTMENT 테이블 값을 쓰는 걸 전제로 함 - 다르게 갈 거면 알려주세요)
	@GetMapping("/admin/department")
	@ResponseBody
	public List<DepartmentDTO> getDepartments() {
		return employeeService.getDepartments();
	}

	// 등록/수정 모달의 직급 드롭다운 (부서와 동일한 이유)
	@GetMapping("/admin/position")
	@ResponseBody
	public List<PositionDTO> getPositions() {
		return employeeService.getPositions();
	}

	// 신규 사원 등록 - 사번은 서버가 채번하므로 화면에서 넘어온 값이 있어도 무시됨
	@PostMapping("/admin/member/create")
	@ResponseBody
	public ResponseEntity<EmployeeDTO> createMember(@ModelAttribute EmployeeDTO employeeDTO) {
		return ResponseEntity.ok(employeeService.createEmployee(employeeDTO));
	}

	// 인사정보 수정 (이름/부서/직급/연락처) - 필드가 여러 개라 개별 @RequestParam 대신 DTO로 받음
	@PostMapping("/admin/member/update/{employeeId}")
	@ResponseBody
	public ResponseEntity<String> updateMember(@PathVariable("employeeId") int employeeId,
			@ModelAttribute EmployeeDTO employeeDTO) {
		employeeDTO.setEmployeeId(employeeId);
		employeeService.updateEmployeeInfo(employeeDTO);
		return ResponseEntity.ok("수정되었습니다.");
	}

	// 계정 정지
	@PostMapping("/admin/member/suspend/{employeeId}")
	@ResponseBody
	public ResponseEntity<String> suspendMember(@PathVariable("employeeId") int employeeId) {
		employeeService.updateEmployeeStatus(employeeId, "SUSPENDED");
		return ResponseEntity.ok("계정이 정지되었습니다.");
	}

	// 계정 정지 해제 (재직 복귀)
	@PostMapping("/admin/member/restore/{employeeId}")
	@ResponseBody
	public ResponseEntity<String> restoreMember(@PathVariable("employeeId") int employeeId) {
		employeeService.updateEmployeeStatus(employeeId, "ACTIVE");
		return ResponseEntity.ok("계정이 복구되었습니다.");
	}

	// 비밀번호 초기화 (임시 비밀번호 = 본인 사번)
	@PostMapping("/admin/member/reset/{employeeId}")
	@ResponseBody
	public ResponseEntity<String> resetPassword(@PathVariable("employeeId") int employeeId) {
		employeeService.resetPassword(employeeId);
		return ResponseEntity.ok("비밀번호가 초기화되었습니다.");
	}
}
