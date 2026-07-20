package com.groupware.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import com.groupware.dto.ApprovalDTO;
import com.groupware.dto.DepartmentDTO;
import com.groupware.dto.EmployeeDTO;
import com.groupware.service.ApprovalService;

import lombok.RequiredArgsConstructor;

@Controller
@RequiredArgsConstructor
public class ApprovalController {

	private final ApprovalService approvalService;

	// 전자결재 메인 화면 - 지금은 "결재 상신(기안)" 탭만 SSR로 채운다.
	// 받은/보낸/참조 문서함은 역할구분.md 3-3 체크리스트 3번에서 fetch로 구현 예정.
	@GetMapping("/approval")
	public String approval(Model model) {
		model.addAttribute("formTypes", approvalService.getFormTypes());
		model.addAttribute("teamLeadCandidates", approvalService.getTeamLeadCandidates());
		model.addAttribute("deptHeadCandidates", approvalService.getDeptHeadCandidates());
		return "approval/approval";
	}

	// 참조 대상 선택 모달의 좌측 부서 트리 - 조직도(GET /org)가 쓰는 조회를 그대로 재사용
	@GetMapping("/approval/ref-departments")
	@ResponseBody
	public List<DepartmentDTO> refDepartments() {
		return approvalService.getRefDepartments();
	}

	// 참조 대상 선택 모달의 우측 직원 표 - deptId 없으면 전체, 있으면 그 부서만
	@GetMapping("/approval/ref-employees")
	@ResponseBody
	public List<EmployeeDTO> refEmployees(@RequestParam(value = "deptId", required = false) Integer deptId) {
		return approvalService.getRefEmployees(deptId);
	}

	// 기안 등록 - 작성 자체는 전 직원에게 열려있음(기획서 3.8 "결재 작성·상신 | 직원")
	@PostMapping("/approval/write")
	@ResponseBody
	public ResponseEntity<String> writeApproval(@ModelAttribute("employee") EmployeeDTO employee,
			@RequestParam("formTypeId") int formTypeId, @RequestParam("approvalTitle") String approvalTitle,
			@RequestParam("approvalContent") String approvalContent,
			@RequestParam(value = "leaveStartDate", required = false) String leaveStartDate,
			@RequestParam(value = "leaveEndDate", required = false) String leaveEndDate,
			@RequestParam("signer1Id") int signer1Id,
			@RequestParam(value = "signer2Id", required = false) Integer signer2Id,
			@RequestParam(value = "refDeptIds", required = false) List<Integer> refDeptIds,
			@RequestParam(value = "refEmployeeIds", required = false) List<Integer> refEmployeeIds) {
		try {
			approvalService.writeApproval(employee.getEmployeeId(), formTypeId, approvalTitle, approvalContent,
					leaveStartDate, leaveEndDate, signer1Id, signer2Id, refDeptIds, refEmployeeIds);
		} catch (IllegalArgumentException e) {
			return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(e.getMessage());
		}
		return ResponseEntity.ok("결재가 상신되었습니다.");
	}

	@GetMapping("/approval/inbox")
	@ResponseBody
	public List<ApprovalDTO> inbox(@ModelAttribute("employee") EmployeeDTO employee) {
		return approvalService.getInbox(employee.getEmployeeId());
	}

	@GetMapping("/approval/outbox")
	@ResponseBody
	public List<ApprovalDTO> outbox(@ModelAttribute("employee") EmployeeDTO employee) {
		return approvalService.getOutbox(employee.getEmployeeId());
	}

	@GetMapping("/approval/reference")
	@ResponseBody
	public List<ApprovalDTO> reference(@ModelAttribute("employee") EmployeeDTO employee) {
		return approvalService.getReferenceBox(employee);
	}

	// 결재 상세 - 어느 탭에서든 문서 한 줄을 클릭하면 모달이 fetch로 호출하는 JSON API.
	// 기안자 본인/결재선에 있는 사람/참조 대상만 열람 가능(canViewApproval) - 문서 번호를
	// 안다고 아무나 볼 수 있으면 안 되므로 서버에서 재검증한다.
	@GetMapping("/approval/detail/{id}")
	@ResponseBody
	public ResponseEntity<ApprovalDTO> approvalDetail(@ModelAttribute("employee") EmployeeDTO employee,
			@PathVariable("id") int id) {
		ApprovalDTO approval = approvalService.getApprovalDetail(id);
		if (approval == null) {
			return ResponseEntity.notFound().build();
		}
		if (!approvalService.canViewApproval(employee, approval)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}
		approval.setCanDecide(approvalService.canDecideApproval(employee, approval));
		return ResponseEntity.ok(approval);
	}

	// 승인 - 지금 대기 중인 단계 담당자만 가능(canDecideApproval). 의견은 선택 입력.
	@PostMapping("/approval/approve/{id}")
	@ResponseBody
	public ResponseEntity<String> approve(@ModelAttribute("employee") EmployeeDTO employee,
			@PathVariable("id") int id, @RequestParam(value = "comment", required = false) String comment) {
		ApprovalDTO approval = approvalService.getApprovalDetail(id);
		if (approval == null) {
			return ResponseEntity.notFound().build();
		}
		if (!approvalService.canDecideApproval(employee, approval)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).body("지금 결재할 차례가 아닙니다.");
		}
		approvalService.decideApproval(approval, true, comment);
		return ResponseEntity.ok("승인 처리했습니다.");
	}

	// 반려 - 지금 대기 중인 단계 담당자만 가능. 반려 사유(comment)는 필수.
	@PostMapping("/approval/reject/{id}")
	@ResponseBody
	public ResponseEntity<String> reject(@ModelAttribute("employee") EmployeeDTO employee,
			@PathVariable("id") int id, @RequestParam(value = "comment", required = false) String comment) {
		ApprovalDTO approval = approvalService.getApprovalDetail(id);
		if (approval == null) {
			return ResponseEntity.notFound().build();
		}
		if (!approvalService.canDecideApproval(employee, approval)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).body("지금 결재할 차례가 아닙니다.");
		}
		if (comment == null || comment.isBlank()) {
			return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("반려 사유를 입력해주세요.");
		}
		approvalService.decideApproval(approval, false, comment);
		return ResponseEntity.ok("반려 처리했습니다.");
	}
}
