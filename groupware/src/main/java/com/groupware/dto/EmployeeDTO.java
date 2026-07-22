package com.groupware.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;

import lombok.Data;

@Data
public class EmployeeDTO {
	private int employeeId;
	private String employeeNo; 		// 사번(로그인 ID 겸용)

	// 관리자 계정 목록(GET /admin/members)이 이 DTO를 그대로 JSON으로 내려주므로,
	// BCrypt 해시값이라도 브라우저로 나가면 안 됨 - 응답 JSON에서 항상 제외
	@JsonIgnore
	private String employeePwd;
	private String employeeName;
	private int deptId;
	private int positionId;
	private String employeeRole;	// EMPLOYEE / ADMIN
	private String employeePhone;
	private String employeeEmail;
	// 저장된 파일명만(예 : a1b2c3.jpg) - ArchiveFileDTO와 달리 전체 경로 아님.
	// /uploads/profileImg/ + 이 값으로 화면에서 URL 조립해서 씀(정적 리소스로 서빙)
	private String profileImg;  
	private String employeeStatus;	// ACTIVE / SUSPENDED
	private String hireDate;
	private String birthDate;		// 생년월일 - 계정 생성 시 미입력, 마이페이지에서 본인이 입력(NULL 가능)
	private String createdAt;
	
	// 마이페이지에 사용할 필드
	private String deptName;		// 부서명
	private String positionName;	// 직급명
	private int positionRank;		// 서열 (팀장/부서장 여부 판단용)
	private String roleText;		// 화면 표시용 (관리자/부서장/팀장/일반 임직원)
	// 조직도에서만 쓰는 오늘 근태 표시값 (WORKING / LEAVE / DONE / NONE)
	private String workStatus;
}
