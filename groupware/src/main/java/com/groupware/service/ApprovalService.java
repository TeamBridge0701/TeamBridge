package com.groupware.service;

import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.groupware.dto.ApprovalDTO;
import com.groupware.dto.ApprovalFormTypeDTO;
import com.groupware.dto.ApprovalLineDTO;
import com.groupware.dto.ApprovalReferenceDTO;
import com.groupware.dto.DepartmentDTO;
import com.groupware.dto.EmployeeDTO;
import com.groupware.mapper.ApprovalFormTypeMapper;
import com.groupware.mapper.ApprovalLineMapper;
import com.groupware.mapper.ApprovalMapper;
import com.groupware.mapper.ApprovalReferenceMapper;
import com.groupware.mapper.AttendanceMapper;
import com.groupware.mapper.EmployeeMapper;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ApprovalService {

	// 결재선 후보 직급 서열 (schema.sql POSITION_RANK: 1=부서장, 2=팀장)
	private static final int RANK_DEPT_HEAD = 1;
	private static final int RANK_TEAM_LEAD = 2;

	// 휴가 기간을 받는 서식은 연차휴가신청서뿐 (ERD 2-11 - LEAVE_START/END_DATE는 이 서식 전용)
	private static final String LEAVE_FORM_NAME = "연차휴가신청서";

	private final ApprovalFormTypeMapper approvalFormTypeMapper;
	private final ApprovalMapper approvalMapper;
	private final ApprovalLineMapper approvalLineMapper;
	private final ApprovalReferenceMapper approvalReferenceMapper;
	private final EmployeeMapper employeeMapper;
	private final AttendanceMapper attendanceMapper;

	// 기안 작성 화면의 서식 카드(연차휴가신청서/지출결의서/프로젝트품의서)
	public List<ApprovalFormTypeDTO> getFormTypes() {
		return approvalFormTypeMapper.findAll();
	}

	// 결재선 후보 - 1차 승인자(팀장)/최종 승인자(부서장) select 옵션
	public List<EmployeeDTO> getTeamLeadCandidates() {
		return employeeMapper.findByPositionRank(RANK_TEAM_LEAD);
	}

	public List<EmployeeDTO> getDeptHeadCandidates() {
		return employeeMapper.findByPositionRank(RANK_DEPT_HEAD);
	}

	// 참조 대상 선택 모달 - 부서 트리는 조직도(GET /org)가 쓰는 것과 같은 조회를 재사용
	public List<DepartmentDTO> getRefDepartments() {
		return employeeMapper.findDepartments();
	}

	public List<EmployeeDTO> getRefEmployees(Integer deptId) {
		return employeeMapper.findActiveEmployeesByDepartment(deptId);
	}

	// 받은 결재함 - 지금 내 차례인 문서만 (ApprovalMapper.findInbox의 WHERE 조건 참고)
	public List<ApprovalDTO> getInbox(int employeeId) {
		return approvalMapper.findInbox(employeeId);
	}

	// 보낸 기안함 - 내가 기안한 문서 전체
	public List<ApprovalDTO> getOutbox(int drafterId) {
		return approvalMapper.findOutbox(drafterId);
	}

	// 참조 문서함 - 부서 참조/개인 참조/결재선 포함(기안자 제외) 셋 중 하나라도 해당하면 포함
	public List<ApprovalDTO> getReferenceBox(EmployeeDTO employee) {
		return approvalMapper.findReferenceBox(employee.getEmployeeId(), employee.getDeptId());
	}

	// 결재 상세 - 문서 정보 + 결재선 전체(스테퍼용)를 함께 채워서 반환
	public ApprovalDTO getApprovalDetail(int approvalId) {
		ApprovalDTO approval = approvalMapper.findDetail(approvalId);
		if (approval == null) {
			return null;
		}
		approval.setLines(approvalLineMapper.findLinesByApprovalId(approvalId));
		return approval;
	}

	// 상세 조회 권한 - 기안자 본인 / 결재선에 있는 사람(과거·현재·미래 단계 모두) /
	// 참조 대상(내 부서 전체 참조 또는 나 개인 참조)만 볼 수 있다. 관리자는 시스템 전반 관리
	// 목적으로 예외 허용 (다른 모듈의 관리자 전체 접근 패턴과 동일).
	// approval에는 이미 lines가 채워져 있어야 함(getApprovalDetail로 조회한 결과를 그대로 사용).
	public boolean canViewApproval(EmployeeDTO employee, ApprovalDTO approval) {
		if (employee == null || approval == null) {
			return false;
		}
		if ("ADMIN".equals(employee.getEmployeeRole())) {
			return true;
		}
		if (employee.getEmployeeId() == approval.getDrafterId()) {
			return true;
		}
		boolean isApprover = approval.getLines() != null && approval.getLines().stream()
				.anyMatch(line -> line.getApproverId() == employee.getEmployeeId());
		if (isApprover) {
			return true;
		}
		List<ApprovalReferenceDTO> refs = approvalReferenceMapper.findByApprovalId(approval.getApprovalId());
		return refs.stream().anyMatch(ref -> (ref.getEmployeeId() != null
				&& ref.getEmployeeId() == employee.getEmployeeId())
				|| (ref.getDeptId() != null && ref.getDeptId() == employee.getDeptId()));
	}

	// 승인/반려 가능 여부 - "지금 대기 중인 단계(currentStep)의 담당자가 나인가"만 확인한다.
	// currentStep이 NULL이면 이미 승인/반려로 끝난 문서라 false (버튼 숨김은 보안이 아니므로
	// 여기서 다시 검증 - approval.js가 계산한 값을 신뢰하지 않음).
	public boolean canDecideApproval(EmployeeDTO employee, ApprovalDTO approval) {
		if (employee == null || approval == null || approval.getCurrentStep() == null) {
			return false;
		}
		return approval.getLines() != null && approval.getLines().stream()
				.anyMatch(line -> line.getStepNo() == approval.getCurrentStep()
						&& line.getApproverId() == employee.getEmployeeId());
	}

	// 승인/반려 처리 - canDecideApproval로 이미 검증된 후 호출된다고 가정(대상 문서와 현재
	// 단계는 Controller가 미리 조회해서 넘겨줌 - notice/archive의 canModifyX 패턴과 동일).
	// 반려면 즉시 문서 상태를 REJECTED로, 승인이면 남은 WAIT 단계가 없을 때만(=마지막 단계)
	// 문서 상태를 APPROVED로 갱신하고, 연차휴가신청서면 그 기간을 ATTENDANCE에 반영한다.
	@Transactional
	public void decideApproval(ApprovalDTO approval, boolean approved, String comment) {
		ApprovalLineDTO currentLine = approval.getLines().stream()
				.filter(line -> line.getStepNo() == approval.getCurrentStep())
				.findFirst()
				.orElseThrow(() -> new IllegalStateException("결재선 정보를 찾을 수 없습니다."));

		approvalLineMapper.updateLineDecision(currentLine.getLineId(), approved ? "APPROVED" : "REJECTED", comment);

		if (!approved) {
			approvalMapper.updateApprovalStatus(approval.getApprovalId(), "REJECTED");
			return;
		}

		if (approvalLineMapper.countWaitingLines(approval.getApprovalId()) == 0) {
			approvalMapper.updateApprovalStatus(approval.getApprovalId(), "APPROVED");
			if (approval.getLeaveStartDate() != null && approval.getLeaveEndDate() != null) {
				reflectLeaveToAttendance(approval.getDrafterId(), approval.getLeaveStartDate(),
						approval.getLeaveEndDate());
			}
		}
	}

	// 연차휴가신청서 최종 승인 - 휴가 기간의 날짜 하나하나에 ATTENDANCE.LEAVE를 반영한다.
	// 이미 그 날짜에 출결 기록이 있으면 덮어씀(AttendanceMapper.insertLeaveRecord의
	// ON DUPLICATE KEY UPDATE - 2026-07-20 김우주 협의 완료, 우주님 판단에 맡김).
	// 트랜잭션은 decideApproval의 @Transactional을 그대로 물려받는다.
	private void reflectLeaveToAttendance(int employeeId, String leaveStartDate, String leaveEndDate) {
		LocalDate date = LocalDate.parse(leaveStartDate);
		LocalDate endDate = LocalDate.parse(leaveEndDate);
		while (!date.isAfter(endDate)) {
			attendanceMapper.insertLeaveRecord(employeeId, date);
			date = date.plusDays(1);
		}
	}

	// 기안 등록 - APPROVAL 1건 + 서식의 결재 단계 수만큼 APPROVAL_LINE +
	// 선택된 참조 대상 수만큼 APPROVAL_REFERENCE를 한 트랜잭션으로 저장한다.
	@Transactional
	public int writeApproval(int drafterId, int formTypeId, String approvalTitle, String approvalContent,
			String leaveStartDate, String leaveEndDate, int signer1Id, Integer signer2Id,
			List<Integer> refDeptIds, List<Integer> refEmployeeIds) {
		ApprovalFormTypeDTO formType = approvalFormTypeMapper.findById(formTypeId);
		if (formType == null) {
			throw new IllegalArgumentException("존재하지 않는 결재 서식입니다.");
		}
		boolean isLeaveForm = LEAVE_FORM_NAME.equals(formType.getFormTypeName());
		if (isLeaveForm) {
			validateLeavePeriod(leaveStartDate, leaveEndDate);
		}

		ApprovalDTO approval = new ApprovalDTO();
		approval.setDrafterId(drafterId);
		approval.setFormTypeId(formTypeId);
		approval.setApprovalTitle(approvalTitle);
		approval.setApprovalContent(approvalContent);
		approval.setLeaveStartDate(isLeaveForm ? leaveStartDate : null);
		approval.setLeaveEndDate(isLeaveForm ? leaveEndDate : null);
		approvalMapper.insertApproval(approval); // useGeneratedKeys - approval.approvalId가 채워짐

		insertLine(approval.getApprovalId(), 1, signer1Id);
		if (formType.getApprovalStepCount() == 2) {
			if (signer2Id == null) {
				throw new IllegalArgumentException("이 서식은 최종 승인자(2차) 지정이 필요합니다.");
			}
			insertLine(approval.getApprovalId(), 2, signer2Id);
		}

		insertReferences(approval.getApprovalId(), refDeptIds, refEmployeeIds);

		return approval.getApprovalId();
	}

	private void validateLeavePeriod(String leaveStartDate, String leaveEndDate) {
		if (leaveStartDate == null || leaveEndDate == null || leaveStartDate.isBlank()
				|| leaveEndDate.isBlank()) {
			throw new IllegalArgumentException("휴가 시작일/종료일을 입력해주세요.");
		}
		if (LocalDate.parse(leaveEndDate).isBefore(LocalDate.parse(leaveStartDate))) {
			throw new IllegalArgumentException("휴가 종료일은 시작일보다 빠를 수 없습니다.");
		}
	}

	private void insertLine(int approvalId, int stepNo, int approverId) {
		ApprovalLineDTO line = new ApprovalLineDTO();
		line.setApprovalId(approvalId);
		line.setStepNo(stepNo);
		line.setApproverId(approverId);
		approvalLineMapper.insertLine(line);
	}

	// DEPT_ID/EMPLOYEE_ID 중 정확히 하나만 채워서 저장 (ERD 2-13 CHECK 제약과 동일한 규칙을
	// 여기서도 지킴 - 부서 목록/직원 목록을 서로 다른 반복문으로 분리해서 자동으로 보장됨)
	private void insertReferences(int approvalId, List<Integer> refDeptIds, List<Integer> refEmployeeIds) {
		if (refDeptIds != null) {
			for (Integer deptId : refDeptIds) {
				ApprovalReferenceDTO ref = new ApprovalReferenceDTO();
				ref.setApprovalId(approvalId);
				ref.setDeptId(deptId);
				approvalReferenceMapper.insertReference(ref);
			}
		}
		if (refEmployeeIds != null) {
			for (Integer employeeId : refEmployeeIds) {
				ApprovalReferenceDTO ref = new ApprovalReferenceDTO();
				ref.setApprovalId(approvalId);
				ref.setEmployeeId(employeeId);
				approvalReferenceMapper.insertReference(ref);
			}
		}
	}
}
