package com.groupware.controller;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.multipart.MultipartFile;

import com.groupware.dto.ApprovalDTO;
import com.groupware.dto.ApprovalFileDTO;
import com.groupware.dto.ApprovalPageDTO;
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
	// 승인자 후보(팀장/부서장/재무관리팀)는 기안자 본인을 제외해서 내려준다(자기 자신을
	// 승인자로 못 고르게). drafterPositionRank는 서식별로 몇 단계·어느 후보 목록을 쓸지
	// approval.js(getApprovalSteps)가 판단하는 데 쓴다(2026-07-22 확정 규칙 참고).
	@GetMapping("/approval")
	public String approval(@ModelAttribute("employee") EmployeeDTO employee, Model model) {
		model.addAttribute("formTypes", approvalService.getFormTypes());
		model.addAttribute("teamLeadCandidates", approvalService.getTeamLeadCandidates(employee.getEmployeeId()));
		model.addAttribute("deptHeadCandidates", approvalService.getDeptHeadCandidates(employee.getEmployeeId()));
		model.addAttribute("financeCandidates", approvalService.getFinanceApproverCandidates(employee.getEmployeeId()));
		model.addAttribute("drafterPositionRank", employee.getPositionRank());
		return "approval/approval";
	}

	// 참조 대상 선택 모달의 좌측 부서 트리 - 조직도(GET /org)가 쓰는 조회를 그대로 재사용
	@GetMapping("/approval/ref-departments")
	@ResponseBody
	public List<DepartmentDTO> refDepartments() {
		return approvalService.getRefDepartments();
	}

	// 참조 대상 선택 모달의 우측 직원 표 - deptId 없으면 전체, 있으면 그 부서만.
	// 기안자 본인은 참조 후보에서 제외한다(자기 문서를 자기가 참조할 이유가 없음).
	@GetMapping("/approval/ref-employees")
	@ResponseBody
	public List<EmployeeDTO> refEmployees(@ModelAttribute("employee") EmployeeDTO employee,
			@RequestParam(value = "deptId", required = false) Integer deptId) {
		return approvalService.getRefEmployees(deptId, employee.getEmployeeId());
	}

	// 기안 등록 - 작성 자체는 전 직원에게 열려있음(기획서 3.8 "결재 작성·상신 | 직원").
	// 첨부파일이 있을 수 있어 multipart/form-data로 받는다(자료실 작성과 동일한 방식).
	@PostMapping("/approval/write")
	@ResponseBody
	public ResponseEntity<String> writeApproval(@ModelAttribute("employee") EmployeeDTO employee,
			@RequestParam("formTypeId") int formTypeId, @RequestParam("approvalTitle") String approvalTitle,
			@RequestParam("approvalContent") String approvalContent,
			@RequestParam(value = "leaveStartDate", required = false) String leaveStartDate,
			@RequestParam(value = "leaveEndDate", required = false) String leaveEndDate,
			@RequestParam(value = "amount", required = false) Long amount,
			@RequestParam(value = "signer1Id", required = false) Integer signer1Id,
			@RequestParam(value = "signer2Id", required = false) Integer signer2Id,
			@RequestParam(value = "refDeptIds", required = false) List<Integer> refDeptIds,
			@RequestParam(value = "refEmployeeIds", required = false) List<Integer> refEmployeeIds,
			@RequestParam(value = "files", required = false) List<MultipartFile> files) {
		try {
			approvalService.writeApproval(employee.getEmployeeId(), employee.getPositionRank(), formTypeId,
					approvalTitle, approvalContent, leaveStartDate, leaveEndDate, amount, signer1Id, signer2Id,
					refDeptIds, refEmployeeIds, files);
		} catch (IllegalArgumentException e) {
			return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(e.getMessage());
		}
		return ResponseEntity.ok("결재가 상신되었습니다.");
	}

	// page 파라미터 기본값 1 - 탭을 처음 열 때나 다른 탭에서 넘어올 때는 항상 1페이지부터.
	// 페이지 번호 버튼을 누르면 approval.js가 이 값만 바꿔서 다시 fetch한다(화면 이동 없음).
	@GetMapping("/approval/inbox")
	@ResponseBody
	public ApprovalPageDTO inbox(@ModelAttribute("employee") EmployeeDTO employee,
			@RequestParam(value = "page", defaultValue = "1") int page) {
		return approvalService.getInbox(employee.getEmployeeId(), page);
	}

	@GetMapping("/approval/outbox")
	@ResponseBody
	public ApprovalPageDTO outbox(@ModelAttribute("employee") EmployeeDTO employee,
			@RequestParam(value = "page", defaultValue = "1") int page) {
		return approvalService.getOutbox(employee.getEmployeeId(), page);
	}

	@GetMapping("/approval/reference")
	@ResponseBody
	public ApprovalPageDTO reference(@ModelAttribute("employee") EmployeeDTO employee,
			@RequestParam(value = "page", defaultValue = "1") int page) {
		return approvalService.getReferenceBox(employee, page);
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
		approval.setCanWithdraw(approvalService.canWithdrawApproval(employee, approval));
		return ResponseEntity.ok(approval);
	}

	// 기안 회수 - 기안자 본인이 아직 아무도 결재하지 않은 문서만 회수 가능(canWithdrawApproval).
	// 버튼 숨김은 보안이 아니므로 서버가 다시 검증한다.
	@PostMapping("/approval/withdraw/{id}")
	@ResponseBody
	public ResponseEntity<String> withdraw(@ModelAttribute("employee") EmployeeDTO employee,
			@PathVariable("id") int id) {
		ApprovalDTO approval = approvalService.getApprovalDetail(id);
		if (approval == null) {
			return ResponseEntity.notFound().build();
		}
		if (!approvalService.canWithdrawApproval(employee, approval)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).body("회수할 수 없는 문서입니다.");
		}
		approvalService.withdrawApproval(id);
		return ResponseEntity.ok("결재가 회수되었습니다.");
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

	// 다운로드 - 파일이 속한 결재 문서의 열람 권한(canViewApproval)으로 재검증한다
	// (자료실 다운로드와 동일한 패턴 - 파일 하나만 보고 바로 안 내려줌).
	@GetMapping("/approval/download/{fileId}")
	public ResponseEntity<Resource> downloadFile(@ModelAttribute("employee") EmployeeDTO employee,
			@PathVariable("fileId") int fileId) throws IOException {
		ApprovalFileDTO file = approvalService.getApprovalFile(fileId);
		if (file == null) {
			return ResponseEntity.notFound().build();
		}
		ApprovalDTO approval = approvalService.getApprovalDetail(file.getApprovalId());
		if (approval == null || !approvalService.canViewApproval(employee, approval)) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
		}

		Path path = Paths.get(file.getFilePath());
		Resource resource = new FileSystemResource(path);
		if (!resource.exists()) {
			return ResponseEntity.notFound().build();
		}

		String encodedName = URLEncoder.encode(file.getFileName(), StandardCharsets.UTF_8).replace("+", "%20");
		return ResponseEntity.ok()
				.header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodedName)
				.contentType(MediaType.APPLICATION_OCTET_STREAM)
				.body(resource);
	}
}
